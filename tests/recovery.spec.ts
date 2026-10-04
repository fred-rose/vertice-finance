import { expect, test, type Page } from "@playwright/test";
import { backupFixture } from "./helpers/backupFixture";
import { rawLocal, seedLocal } from "./helpers/localData";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
  await page.goto("/favicon.svg");
});

async function expectRecovery(page: Page) {
  await expect(
    page.getByRole("region", { name: "Recuperação de dados locais" }),
  ).toBeVisible();
  await expect(
    page.locator(
      ".summary, .metric-card, .recharts-wrapper, .transaction-table",
    ),
  ).toHaveCount(0);
  await expect(
    page.getByText("Salvo neste navegador", { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Restaurar backup JSON", exact: true }),
  ).toBeVisible();
  await expect(page.locator("input, select, textarea")).toHaveCount(0);
}

for (const route of ["/", "/#/transacoes", "/#/configuracoes"]) {
  for (const corruption of ["missing", "null", "empty", "transaction"]) {
    test(`${route} ${corruption}: recovery sem métricas nem formulários`, async ({
      page,
    }) => {
      const fixture = backupFixture();
      if (corruption === "transaction") fixture.transactions[0].amount = -1;
      await seedLocal(page, {
        ...fixture,
        settings:
          corruption === "empty"
            ? {}
            : corruption === "null"
              ? null
              : fixture.settings,
        present: corruption !== "missing",
      });
      const before = await rawLocal(page);
      await page.goto(route);
      await expectRecovery(page);
      await expect(page.getByRole("alert")).toContainText(
        "Seus registros foram preservados",
      );
      await page
        .getByText("Como recuperar preservando os dados atuais", {
          exact: true,
        })
        .click();
      await expect(page.getByText(/Sem um backup válido/)).toBeVisible();
      expect(await rawLocal(page)).toEqual(before);
    });
  }
}

test("recovery abre preview; safety bloqueia; cancelar preserva toda a origem", async ({
  page,
}) => {
  const fixture = backupFixture();
  await seedLocal(page, { ...fixture, present: false });
  const before = await rawLocal(page);
  await page.goto("/");
  await expectRecovery(page);
  // Observe actual writes, not just the absence of a success notification.
  await page.evaluate(() => {
    const writes: string[] = [];
    Object.assign(window, { recoveryWrites: writes });
    for (const name of ["clear", "add", "put", "delete"] as const) {
      const native = IDBObjectStore.prototype[name];
      Object.defineProperty(IDBObjectStore.prototype, name, {
        configurable: true,
        value: function (this: IDBObjectStore, ...args: unknown[]) {
          writes.push(name);
          return Reflect.apply(native, this, args);
        },
      });
    }
  });
  const trigger = page.getByRole("button", {
    name: "Restaurar backup JSON",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Arquivo de backup JSON v2")).toBeFocused();
  await dialog.getByLabel("Arquivo de backup JSON v2").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Restaurar este backup", exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("Arquivo de backup JSON v2").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect(
    dialog.getByRole("region", { name: "Prévia do backup" }),
  ).toContainText("3 transações");
  await dialog
    .getByRole("button", { name: "Baixar backup de segurança" })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "A restauração está bloqueada",
  );
  await expect(
    dialog.getByRole("button", { name: "Restaurar este backup", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByText("Como recuperar preservando os dados atuais", { exact: true })
    .click();
  await expect(dialog.getByText(/outro perfil de navegador/)).toBeVisible();
  await expect(
    dialog.getByText(/não mescla dados nem recupera alterações/),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await dialog.getByRole("button", { name: "Descartar e fechar" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { recoveryWrites: string[] }).recoveryWrites,
    ),
  ).toEqual([]);
  expect(await rawLocal(page)).toEqual(before);
});

test("retry após estado legível retorna ao app e permite o fluxo A1 completo", async ({
  page,
}) => {
  const fixture = backupFixture();
  await seedLocal(page, { ...fixture, present: false });
  await page.goto("/");
  await expectRecovery(page);
  // External correction is fixture setup; the recovery UI never repairs data.
  await seedLocal(page, { ...fixture, present: true });
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.locator(".summary")).toBeVisible();
  await expect(
    page.getByText("Salvo neste navegador", { exact: false }),
  ).toBeVisible();
  await page.goto("/#/configuracoes");
  await page
    .getByRole("button", { name: "Restaurar backup JSON", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const restored = backupFixture();
  restored.settings.plannedIncome = 4321;
  await dialog.getByLabel("Arquivo de backup JSON v2").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(restored)),
  });
  const download = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Baixar backup de segurança" })
    .click();
  await download;
  await dialog
    .getByRole("button", { name: "Restaurar este backup", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect((await rawLocal(page)).settings).toContainEqual(restored.settings);
});

test("falha de refresh oculta snapshot anterior e desmonta formulário aberto", async ({
  page,
}) => {
  const fixture = backupFixture();
  await seedLocal(page, { ...fixture, present: true });
  await page.goto("/");
  await expect(page.locator(".summary")).toBeVisible();
  await page
    .getByRole("button", { name: "Adicionar transação", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await seedLocal(page, { ...fixture, present: false });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expectRecovery(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await seedLocal(page, { ...fixture, present: true });
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.locator(".summary")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("storage transitório usa mensagem segura e retry sem loading infinito", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const native = IDBDatabase.prototype.transaction;
    let fail = true;
    Object.defineProperty(IDBDatabase.prototype, "transaction", {
      configurable: true,
      value: function (this: IDBDatabase, ...args: unknown[]) {
        if (fail)
          throw new DOMException("native technical payload", "NotFoundError");
        return Reflect.apply(native, this, args);
      },
    });
    Object.assign(window, {
      allowRead: () => {
        fail = false;
      },
    });
  });
  await page.goto("/");
  await expectRecovery(page);
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível acessar",
  );
  await expect(page.getByRole("alert")).not.toContainText("native technical");
  await page.evaluate(() =>
    (window as unknown as { allowRead: () => void }).allowRead(),
  );
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(
    page.getByRole("region", { name: "Recuperação de dados locais" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Salvo neste navegador", { exact: false }),
  ).toBeVisible();
});

test("backup recuperado em contexto novo mantém a origem inválida intacta", async ({
  page,
  browser,
  baseURL,
}) => {
  const fixture = backupFixture();
  await seedLocal(page, { ...fixture, present: false });
  await page.goto("/");
  await expectRecovery(page);
  const before = await rawLocal(page);
  const destination = await browser.newContext();
  try {
    const target = await destination.newPage();
    await target.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
    await target.goto(`${baseURL}/#/configuracoes`);
    await target
      .getByRole("button", { name: "Restaurar backup JSON", exact: true })
      .click();
    await target.getByLabel("Arquivo de backup JSON v2").setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
    const download = target.waitForEvent("download");
    await target
      .getByRole("button", { name: "Baixar backup de segurança" })
      .click();
    await download;
    await target
      .getByRole("button", { name: "Restaurar este backup", exact: true })
      .click();
    await expect(target.getByRole("dialog")).toHaveCount(0);
    expect((await rawLocal(target)).settings).toEqual([
      { protocol: 1, revision: 1 },
      fixture.settings,
    ]);
    expect(await rawLocal(page)).toEqual(before);
  } finally {
    await destination.close();
  }
});
