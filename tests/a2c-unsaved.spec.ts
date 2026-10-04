import { expect, test, type Page } from "@playwright/test";
import { backupFixture } from "./helpers/backupFixture";
import { rawLocal, repositoryBundle, seedLocal } from "./helpers/localData";

let bundle: string;
test.beforeAll(async () => {
  bundle = await repositoryBundle();
});
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
  await page.goto("/favicon.svg");
  await seedLocal(page, { ...backupFixture(), present: true });
});
async function newTransaction(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Adicionar transação", exact: true })
    .filter({ visible: true })
    .click();
}
async function unloadBlocked(page: Page) {
  return page.evaluate(
    () =>
      !window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  );
}
for (const mode of ["create", "edit"] as const)
  for (const close of ["X", "Escape", "backdrop"] as const) {
    test(`${mode}: ${close} confirma descarte, Escape cancela, DB intacto`, async ({
      page,
    }) => {
      if (mode === "create") await newTransaction(page);
      else {
        await page.goto("/#/transacoes");
        await page
          .getByRole("button", { name: "Editar Gasto restaurado", exact: true })
          .click();
      }
      const before = await rawLocal(page);
      await page
        .getByLabel("Descrição", { exact: true })
        .fill("Conteúdo protegido");
      expect(await unloadBlocked(page)).toBe(true);
      if (close === "X")
        await page.getByRole("button", { name: "Fechar", exact: true }).click();
      else if (close === "Escape") await page.keyboard.press("Escape");
      else await page.mouse.click(2, 2);
      await expect(
        page.getByRole("group", { name: "Confirmar descarte" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByLabel("Descrição", { exact: true })).toHaveValue(
        "Conteúdo protegido",
      );
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "Descartar e fechar", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(await unloadBlocked(page)).toBe(false);
      expect(await rawLocal(page)).toEqual(before);
    });
  }
test("untouched e editar/desfazer são clean; tipo, destino e checkbox entram no guard", async ({
  page,
}) => {
  await newTransaction(page);
  expect(await unloadBlocked(page)).toBe(false);
  await page.getByLabel("Valor (R$)", { exact: true }).fill("0");
  expect(await unloadBlocked(page)).toBe(true);
  await page.getByLabel("Valor (R$)", { exact: true }).fill("");
  expect(await unloadBlocked(page)).toBe(false);
  await page
    .getByRole("button", { name: "Transferência", exact: true })
    .click();
  expect(await unloadBlocked(page)).toBe(true);
  await page.getByRole("button", { name: "Gasto", exact: true }).click();
  expect(await unloadBlocked(page)).toBe(false);
  await page.getByLabel("Transação recorrente", { exact: true }).check();
  expect(await unloadBlocked(page)).toBe(true);
  await page.getByLabel("Transação recorrente", { exact: true }).uncheck();
  expect(await unloadBlocked(page)).toBe(false);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
for (const route of ["link", "hash", "back", "forward"] as const) {
  test(`Settings navegação ${route}: cancelar preserva, confirmar descarta uma vez`, async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("link", { name: "Configurações", exact: true })
      .click();
    if (route === "forward") {
      await page
        .getByRole("link", { name: "Visão Geral", exact: true })
        .click();
      await page.goBack();
    }
    const name = page.getByLabel("Nome da conta", { exact: true }).first();
    await name.fill("Edição antes da rota");
    const before = await rawLocal(page);
    const navigate = async () => {
      if (route === "link")
        await page
          .getByRole("link", { name: "Visão Geral", exact: true })
          .click();
      if (route === "hash")
        await page.evaluate(() => {
          location.hash = "#/transacoes";
        });
      if (route === "back") await page.goBack();
      if (route === "forward") await page.goForward();
    };
    await navigate();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("button", { name: "Continuar editando", exact: true })
      .click();
    await expect(name).toHaveValue("Edição antes da rota");
    expect(new URL(page.url()).hash).toBe("#/configuracoes");
    // Known link after cancellation must not loop, irrespective of history direction.
    await page.getByRole("link", { name: "Visão Geral", exact: true }).click();
    await page
      .getByRole("button", { name: "Descartar e sair", exact: true })
      .click();
    await expect(page.locator(".primary-metric h2")).toBeVisible();
    await page
      .getByRole("link", { name: "Configurações", exact: true })
      .click();
    await expect(name).toHaveValue("Conta principal");
    expect(await rawLocal(page)).toEqual(before);
  });
}
test("Settings save libera guard; falha de validação mantém edição", async ({
  page,
}) => {
  await page.goto("/#/configuracoes");
  const name = page.getByLabel("Nome da conta", { exact: true }).first();
  expect(await unloadBlocked(page)).toBe(false);
  await name.fill("Nome salvo");
  await page.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(
    page.getByText("Configurações salvas. Seus cálculos foram atualizados."),
  ).toBeVisible();
  expect(await unloadBlocked(page)).toBe(false);
  await name.fill("");
  await page.getByRole("button", { name: "Salvar configurações" }).click();
  expect(await unloadBlocked(page)).toBe(true);
});
test("reload nativo pode ser cancelado; aceito não recupera draft", async ({
  page,
}) => {
  await page.goto("/#/configuracoes");
  await page
    .getByLabel("Nome da conta", { exact: true })
    .first()
    .fill("Não salvo");
  const prompted = page.waitForEvent("dialog");
  await page.evaluate(() => {
    setTimeout(() => location.reload(), 0);
  });
  const prompt = await prompted;
  expect(prompt.type()).toBe("beforeunload");
  await prompt.dismiss();
  await expect(
    page.getByLabel("Nome da conta", { exact: true }).first(),
  ).toHaveValue("Não salvo");
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.reload();
  await expect(
    page.getByLabel("Nome da conta", { exact: true }).first(),
  ).toHaveValue("Conta principal");
});
for (const invalid of [false, true])
  test(`import ${invalid ? "inválido" : "preparado"} protege fechamento e reload`, async ({
    page,
  }) => {
    await page.goto("/#/transacoes");
    await page.getByRole("button", { name: "Importar", exact: true }).click();
    const before = await rawLocal(page);
    await page.getByLabel("Arquivo", { exact: true }).setInputFiles({
      name: "draft.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        invalid ? "inválido" : "Descrição;Valor;Data\nDraft;-12;10/09/2026",
      ),
    });
    if (invalid) await expect(page.getByRole("alert")).toBeVisible();
    else
      await expect(
        page.getByRole("button", { name: "Importar 1 transações" }),
      ).toBeEnabled();
    expect(await unloadBlocked(page)).toBe(true);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Continuar editando" }).click();
    await expect(page.getByLabel("Arquivo", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Descartar e fechar" }).click();
    expect(await unloadBlocked(page)).toBe(false);
    expect(await rawLocal(page)).toEqual(before);
  });
for (const kind of ["settings", "transaction", "import"] as const)
  for (const event of ["restore", "recovery"] as const) {
    test(`${event}: ${kind} preserva consulta e retry não reativa`, async ({
      page,
      context,
    }) => {
      if (kind === "settings") {
        await page.goto("/#/configuracoes");
        await page
          .getByLabel("Nome da conta", { exact: true })
          .first()
          .fill("Texto preservado");
      }
      if (kind === "transaction") {
        await newTransaction(page);
        await page
          .getByLabel("Descrição", { exact: true })
          .fill("Texto preservado");
        await page.getByLabel("Valor (R$)", { exact: true }).fill("12,30");
      }
      if (kind === "import") {
        await page.goto("/#/transacoes");
        await page
          .getByRole("button", { name: "Importar", exact: true })
          .click();
        await page.getByLabel("Arquivo", { exact: true }).setInputFiles({
          name: "draft.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(
            "Descrição;Valor;Data\nTexto preservado;-12;10/09/2026",
          ),
        });
        await expect(
          page.getByRole("button", { name: "Importar 1 transações" }),
        ).toBeEnabled();
      }
      const other = await context.newPage();
      await other.goto("/favicon.svg");
      await other.evaluate((code) => (0, eval)(code), bundle);
      if (event === "restore")
        await other.evaluate(async () => {
          const r = window.financeAudit.transactionRepository;
          const current = await r.readForBackup();
          await r.restore(current.snapshot, current);
          const b = new BroadcastChannel("vertice-updates");
          b.postMessage("restored");
          b.close();
        });
      else {
        await seedLocal(other, { ...backupFixture(), present: false });
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      }
      const text = page.getByRole("textbox", { name: /Conteúdo não salvo:/ });
      await expect(text).toContainText("Texto preservado");
      await expect(text).toHaveAttribute("readonly", "");
      await expect(
        page.getByRole("button", {
          name: /^Salvar (transação|configurações)$/,
        }),
      ).toHaveCount(0);
      const before = await rawLocal(other);
      if (event === "recovery") {
        await expect(
          page.getByRole("button", { name: "Tentar novamente" }),
        ).toBeVisible();
        await seedLocal(other, { ...backupFixture(), present: true });
        await page.getByRole("button", { name: "Tentar novamente" }).click();
        await expect(
          page.getByRole("button", { name: "Tentar novamente" }),
        ).toHaveCount(0);
        await expect(text).toContainText("Texto preservado");
        await expect(
          page.getByRole("button", {
            name: /^Salvar (transação|configurações)$/,
          }),
        ).toHaveCount(0);
      } else expect(await rawLocal(other)).toEqual(before);
    });
  }
test("restore local exige descarte do Settings e preview exige confirmação ao cancelar", async ({
  page,
}) => {
  await page.goto("/#/configuracoes");
  const name = page.getByLabel("Nome da conta", { exact: true }).first();
  await name.fill("Draft antes de restore");
  const before = await rawLocal(page);
  await page
    .getByRole("button", { name: "Restaurar backup JSON", exact: true })
    .click();
  await page.getByRole("button", { name: "Continuar editando" }).click();
  await expect(name).toHaveValue("Draft antes de restore");
  await page
    .getByRole("button", { name: "Restaurar backup JSON", exact: true })
    .click();
  await page.getByRole("button", { name: "Descartar e continuar" }).click();
  await page.getByLabel("Arquivo de backup JSON v2").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backupFixture())),
  });
  await expect(
    page.getByRole("region", { name: "Prévia do backup" }),
  ).toBeVisible();
  expect(await unloadBlocked(page)).toBe(true);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Descartar e fechar" }).click();
  expect(await rawLocal(page)).toEqual(before);
});

test("safety anterior é descartada após restore externo e exige novo download", async ({
  page,
  context,
}) => {
  await page.goto("/#/configuracoes");
  await page
    .getByRole("button", { name: "Restaurar backup JSON", exact: true })
    .click();
  await page.getByLabel("Arquivo de backup JSON v2").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backupFixture())),
  });
  await expect(
    page.getByRole("region", { name: "Prévia do backup" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Baixar backup de segurança" })
    .click();
  const restore = page.getByRole("button", {
    name: "Restaurar este backup",
    exact: true,
  });
  await expect(restore).toBeEnabled();
  const other = await context.newPage();
  await other.goto("/favicon.svg");
  await other.evaluate((code) => (0, eval)(code), bundle);
  await other.evaluate(async () => {
    const r = window.financeAudit.transactionRepository;
    const current = await r.readForBackup();
    await r.restore(current.snapshot, current);
    const bus = new BroadcastChannel("vertice-updates");
    bus.postMessage("restored");
    bus.close();
  });
  await expect(restore).toBeDisabled();
  const before = await rawLocal(other);
  await restore.evaluate((el) => (el as HTMLButtonElement).click());
  expect(await rawLocal(other)).toEqual(before);
  await page
    .getByRole("button", { name: "Baixar backup de segurança" })
    .click();
  await expect(restore).toBeEnabled();
});

test("recovery: iniciar restore também confirma descarte da consulta invalidada", async ({
  page,
  context,
}) => {
  await newTransaction(page);
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("Preservar até decidir");
  const other = await context.newPage();
  await other.goto("/favicon.svg");
  await seedLocal(other, { ...backupFixture(), present: false });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const text = page.getByRole("textbox", {
    name: "Conteúdo não salvo: Transação",
  });
  await expect(text).toContainText("Preservar até decidir");
  await page
    .getByRole("button", { name: "Restaurar backup JSON", exact: true })
    .click();
  await page.getByRole("button", { name: "Continuar editando" }).click();
  await expect(text).toContainText("Preservar até decidir");
  await page
    .getByRole("button", { name: "Restaurar backup JSON", exact: true })
    .click();
  await page.getByRole("button", { name: "Descartar e continuar" }).click();
  await expect(page.getByLabel("Arquivo de backup JSON v2")).toBeVisible();
  await expect(text).toHaveCount(0);
});
