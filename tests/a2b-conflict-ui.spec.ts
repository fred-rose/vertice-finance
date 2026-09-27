import { expect, test } from "@playwright/test";
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

test("Settings sucesso seguido de conflito remove confirmação anterior e preserva revision", async ({
  page,
  context,
}) => {
  await page.goto("/#/configuracoes");
  const name = page.getByLabel("Nome da conta", { exact: true }).first();
  await expect(name).toHaveValue("Conta principal");
  const other = await context.newPage();
  await other.goto("/favicon.svg");
  await other.evaluate((code) => (0, eval)(code), bundle);
  const initial = await other.evaluate(() =>
    window.financeAudit.transactionRepository.load(),
  );
  expect(initial.revision).toBe(0);

  await name.fill("Salvo por A");
  const save = page.getByRole("button", { name: "Salvar configurações" });
  const success = page.locator(".settings-save").getByRole("status");
  await save.click();
  await expect(success).toContainText("Configurações salvas");
  await expect(save).toBeEnabled();
  const afterA = await other.evaluate(() =>
    window.financeAudit.transactionRepository.load(),
  );
  expect(afterA.revision).toBe(initial.revision + 1);
  expect(afterA.snapshot.settings.accounts[0].name).toBe("Salvo por A");

  // B explicitly rereads after A's commit to create a valid new intention.
  const receipt = await other.evaluate(async (read) => {
    const settings = structuredClone(read.snapshot.settings);
    settings.accounts[0].name = "Mais recente de B";
    const receipt =
      await window.financeAudit.transactionRepository.saveSettings(
        settings,
        read.revision,
      );
    const bus = new BroadcastChannel("vertice-updates");
    bus.postMessage("changed");
    bus.close();
    return receipt;
  }, afterA);
  expect(receipt.revision).toBe(2);
  const beforeConflict = await rawLocal(page);
  expect(
    beforeConflict.settings[
      beforeConflict.keys.indexOf("__vertice_local_concurrency__")
    ],
  ).toEqual({ protocol: 1, revision: 2 });
  expect(
    (
      beforeConflict.settings[
        beforeConflict.keys.indexOf("personal")
      ] as typeof initial.snapshot.settings
    ).accounts[0].name,
  ).toBe("Mais recente de B");

  // Do not edit A's fields: change() would clear saved and hide the regression.
  await expect(name).toHaveValue("Salvo por A");
  await save.click();
  await expect(page.getByRole("alert")).toHaveText(
    "Os dados mudaram desde o início desta edição. Sua alteração não foi salva. Atualize os dados e revise antes de tentar novamente.",
  );
  await expect(success).toHaveCount(0);
  await expect(
    page.getByText("Configurações salvas", { exact: false }),
  ).toHaveCount(0);
  await expect(save).toBeDisabled();
  await expect(name).toHaveValue("Salvo por A");
  expect(await rawLocal(page)).toEqual(beforeConflict);
  const conflict = await other.evaluate(async (read) => {
    try {
      await window.financeAudit.transactionRepository.saveSettings(
        read.snapshot.settings,
        read.revision,
      );
      return { name: "accepted", code: "accepted" };
    } catch (cause) {
      const error = cause as Error & { code: string };
      return { name: error.name, code: error.code };
    }
  }, afterA);
  expect(conflict).toEqual({ name: "LocalConflictError", code: "stale-state" });
  expect(await rawLocal(page)).toEqual(beforeConflict);
});

for (const refresh of ["broadcast", "focus", "suppressed"] as const) {
  test(`Settings draft antigo com ${refresh}: conflito, refresh sem retry e descarte explícito`, async ({
    page,
    context,
  }) => {
    await page.addInitScript((suppress) => {
      if (suppress)
        Object.defineProperty(window, "BroadcastChannel", { value: undefined });
      const native = IDBDatabase.prototype.transaction;
      Object.assign(window, { completedReads: 0 });
      IDBDatabase.prototype.transaction = function (
        ...args: Parameters<typeof native>
      ) {
        const tx = native.apply(this, args);
        if (tx.mode === "readonly")
          tx.addEventListener("complete", () => {
            (window as unknown as { completedReads: number }).completedReads++;
          });
        return tx;
      };
    }, refresh !== "broadcast");
    await page.goto("/#/configuracoes");
    const name = page.getByLabel("Nome da conta", { exact: true }).first();
    await name.fill("Draft antigo");
    const reads = await page.evaluate(
      () => (window as unknown as { completedReads: number }).completedReads,
    );
    const other = await context.newPage();
    await other.goto("/favicon.svg");
    await other.evaluate((code) => (0, eval)(code), bundle);
    await other.evaluate(async (notify) => {
      const r = window.financeAudit.transactionRepository,
        read = await r.load();
      read.snapshot.settings.accounts[0].name = "Conta nova";
      await r.saveSettings(read.snapshot.settings, read.revision);
      if (notify) {
        const bus = new BroadcastChannel("vertice-updates");
        bus.postMessage("changed");
        bus.close();
      }
    }, refresh === "broadcast");
    if (refresh === "focus")
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    if (refresh !== "suppressed")
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as unknown as { completedReads: number }).completedReads,
          ),
        )
        .toBeGreaterThan(reads);
    await expect(name).toHaveValue("Draft antigo");
    const before = await rawLocal(page);
    const save = page.getByRole("button", { name: "Salvar configurações" });
    await save.click();
    await expect(page.getByRole("alert")).toContainText(
      "Sua alteração não foi salva",
    );
    await expect(save).toBeDisabled();
    await expect(name).toHaveValue("Draft antigo");
    await expect(
      page.getByText("Configurações salvas.", { exact: false }),
    ).toHaveCount(0);
    expect(await rawLocal(page)).toEqual(before);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { completedReads: number }).completedReads,
        ),
      )
      .toBeGreaterThan(reads);
    await page.getByRole("button", { name: "Atualizar edição" }).click();
    await expect(name).toHaveValue("Conta nova");
    await name.fill("Revisado");
    await save.click();
    await expect(page.getByRole("status")).toContainText(
      "Configurações salvas",
    );
    // A second successful save must use the receipt of the first, not the mount token.
    await name.fill("Revisado de novo");
    await save.click();
    await expect(save).toBeEnabled();
    const final = await rawLocal(page);
    expect(final.settings[0]).toEqual({ protocol: 1, revision: 3 });
    expect(
      (
        final.settings[final.keys.indexOf("personal")] as ReturnType<
          typeof backupFixture
        >["settings"]
      ).accounts[0].name,
    ).toBe("Revisado de novo");
  });
}

for (const intent of ["create", "edit", "delete", "import", "demo"] as const) {
  test(`${intent}: confirmação usa token de abertura e permite fechar após conflito`, async ({
    page,
    context,
  }) => {
    if (intent === "demo") {
      const fixture = backupFixture();
      fixture.transactions[0].source = "demo";
      await seedLocal(page, { ...fixture, present: true });
    }
    await page.goto(intent === "demo" ? "/" : "/#/transacoes");
    if (intent === "create")
      await page
        .getByRole("button", { name: "Adicionar transação", exact: true })
        .filter({ visible: true })
        .click();
    if (intent === "edit")
      await page
        .getByRole("button", { name: "Editar Gasto restaurado", exact: true })
        .click();
    if (intent === "delete")
      await page
        .getByRole("button", { name: "Excluir Gasto restaurado", exact: true })
        .click();
    if (intent === "import") {
      await page.getByRole("button", { name: "Importar", exact: true }).click();
      await page.getByLabel("Arquivo", { exact: true }).setInputFiles({
        name: "stale.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "Descrição;Valor;Data\nDraft importado;-12;10/09/2026",
        ),
      });
      await expect(
        page.getByRole("button", { name: "Importar 1 transações" }),
      ).toBeEnabled();
    }
    if (intent === "demo")
      await page
        .getByRole("button", { name: "Remover demonstração", exact: true })
        .click();
    const dialog = page.getByRole("dialog");
    if (intent === "create" || intent === "edit") {
      await dialog.getByLabel("Valor (R$)", { exact: true }).fill("88");
      await dialog
        .getByLabel("Descrição", { exact: true })
        .fill("Draft antigo");
    }
    const other = await context.newPage();
    await other.goto("/favicon.svg");
    await other.evaluate((code) => (0, eval)(code), bundle);
    await other.evaluate(async () => {
      const r = window.financeAudit.transactionRepository,
        read = await r.load();
      await r.saveSettings(read.snapshot.settings, read.revision);
      const bus = new BroadcastChannel("vertice-updates");
      bus.postMessage("changed");
      bus.close();
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const before = await rawLocal(page);
    const submit = dialog.getByRole("button", {
      name:
        intent === "delete"
          ? "Confirmar exclusão"
          : intent === "demo"
            ? "Remover demonstração"
            : intent === "import"
              ? "Importar 1 transações"
              : "Salvar transação",
      exact: true,
    });
    await submit.click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Sua alteração não foi salva",
    );
    await expect(submit).toBeDisabled();
    expect(await rawLocal(page)).toEqual(before);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
}
