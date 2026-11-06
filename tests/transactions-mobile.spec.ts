import { expect, test } from "./helpers/appTest";
import { backupFixture } from "./helpers/backupFixture";
import { rawLocal, seedLocal } from "./helpers/localData";

test.use({ reducedMotion: "reduce" });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
  await page.goto("/favicon.svg");
});

for (const theme of ["dark", "light"] as const) {
  test(`mobile cards expose all fields without overflow and retain the desktop table in ${theme}`, async ({
    page,
  }, info) => {
    const fixture = backupFixture();
    fixture.settings.accounts[0].name = "Conta".repeat(12);
    fixture.settings.categories[0].name = "Categoria".repeat(6);
    fixture.transactions[0].description = "Receita".repeat(14);
    fixture.transactions[0].amount = 999999999;
    fixture.transactions[1].recurring = true;
    fixture.transactions[1].source = "demo";
    await seedLocal(page, { ...fixture, present: true });
    await page.goto("/#/transacoes");
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const panel = page.locator(".transactions-page");
    const list = panel.locator(".transaction-cards");
    const rows = list.locator("tbody tr");
    const expense = rows.filter({ hasText: "Gasto restaurado" });
    const income = rows.filter({
      hasText: fixture.transactions[0].description,
    });
    const transfer = rows.filter({ hasText: "Transferência restaurada" });
    const before = await rawLocal(page);
    for (const width of [320, 375, 639, 640, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(rows).toHaveCount(3);
      await expect(list.getByRole("table")).toHaveCount(1);
      await expect(list.getByRole("columnheader")).toHaveCount(6);
      await expect(list.locator("table")).toHaveCSS(
        "display",
        width < 640 ? "block" : "table",
      );
      await expect(rows.first()).toHaveCSS(
        "display",
        width < 640 ? "grid" : "table-row",
      );
      await expect
        .poll(
          () =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          { message: `No page overflow at ${width}px in ${theme}` },
        )
        .toBe(true);
      if (width < 640) {
        expect(
          await list.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ).toBe(true);
        await expect(expense.locator(".transaction-card-status")).toHaveText(
          "Status: Recorrente · Demonstração",
        );
        await expect(income.locator(".transaction-card-status")).toBeVisible();
        await expect(income.locator(".transaction-card-status")).toHaveText(
          "Status: Lançamento único",
        );
        await expect(expense.locator('[data-label="Categoria"]')).toContainText(
          fixture.settings.categories[0].name,
        );
        await expect(expense.locator('[data-label="Conta"]')).toContainText(
          fixture.settings.accounts[0].name,
        );
        await expect(expense.locator('[data-label="Data"]')).toContainText(
          /10.*set.*2026/,
        );
        await expect(expense.locator(".transaction-value")).toContainText(
          /−R\$\s*500,00/,
        );
        await expect(income.locator(".transaction-value")).toContainText(
          /\+R\$\s*999\.999\.999,00/,
        );
        await expect(transfer.locator('[data-label="Conta"]')).toContainText(
          "→ Reserva pessoal",
        );
        await expect(
          transfer.locator('[data-label="Categoria"]'),
        ).toContainText("Transferência");
        for (const button of await list.getByRole("button").all()) {
          const bounds = (await button.boundingBox())!;
          expect(bounds.height).toBeGreaterThanOrEqual(44);
          expect(bounds.width).toBeGreaterThanOrEqual(44);
          expect(bounds.x).toBeGreaterThanOrEqual(0);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        }
        await expect(expense).toHaveCSS(
          "background-color",
          theme === "dark" ? "rgb(23, 23, 23)" : "rgb(255, 255, 255)",
        );
        if (width === 375)
          await expense.screenshot({
            path: info.outputPath(`transaction-card-${theme}.png`),
          });
      } else {
        await expect(expense.locator(".transaction-card-status")).toBeHidden();
        await expect(
          expense
            .getByRole("button", {
              name: "Editar Gasto restaurado",
              exact: true,
            })
            .locator("span"),
        ).toBeHidden();
        await expect(list.locator("table")).toHaveCSS(
          "min-width",
          width <= 700 ? "700px" : "900px",
        );
      }
    }
    expect(await rawLocal(page)).toEqual(before);
  });

  test(`mobile keyboard editing, deletion, filters and reload preserve records in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seedLocal(page, { ...backupFixture(), present: true });
    await page.goto("/#/transacoes");
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const panel = page.locator(".transactions-page");
    const before = await rawLocal(page);
    const edit = panel.getByRole("button", {
      name: "Editar Gasto restaurado",
      exact: true,
    });
    await edit.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(edit).toBeFocused();
    await expect(edit).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(edit).toBeFocused();
    await page.keyboard.press("Enter");
    await dialog
      .getByLabel("Descrição", { exact: true })
      .fill("Gasto revisado mobile");
    await dialog.getByLabel("Valor (R$)", { exact: true }).fill("625,15");
    await dialog
      .getByRole("button", { name: "Salvar transação", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    const revised = panel
      .locator("tbody tr")
      .filter({ hasText: "Gasto revisado mobile" });
    await expect(revised.locator(".transaction-value")).toContainText(
      /−R\$\s*625,15/,
    );
    await page.reload();
    await expect(revised).toHaveCount(1);
    const afterEdit = await rawLocal(page);
    expect(afterEdit.transactions).toEqual(
      before.transactions.map((row) => {
        const transaction = row as { id: string };
        return transaction.id === "a-expense"
          ? {
              ...transaction,
              description: "Gasto revisado mobile",
              amount: 625.15,
            }
          : transaction;
      }),
    );
    await panel.getByLabel("Mês", { exact: true }).fill("2026-09");
    await panel
      .getByRole("combobox", { name: /^Tipo\b/ })
      .selectOption("expense");
    await panel
      .getByRole("combobox", { name: /^Conta\b/ })
      .selectOption("principal");
    await panel
      .getByRole("combobox", { name: /^Categoria\b/ })
      .selectOption("food");
    await panel.getByLabel("Buscar descrição").fill(" REVISADO MOBILE ");
    await expect(panel.locator("tbody tr")).toHaveCount(1);
    await expect(panel.locator(".filter-summary")).toContainText(
      /Saídas R\$\s*625,15/,
    );
    const remove = panel.getByRole("button", {
      name: "Excluir Gasto revisado mobile",
      exact: true,
    });
    await remove.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(remove).toBeFocused();
    expect(await rawLocal(page)).toEqual(afterEdit);
    await page.keyboard.press("Enter");
    await dialog
      .getByRole("button", { name: "Confirmar exclusão", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(panel.locator("tbody tr")).toHaveCount(0);
    await expect(panel.locator(".empty-state")).toContainText(
      "Nenhum lançamento encontrado.",
    );
    await expect(
      panel.getByRole("button", { name: "Exportar CSV", exact: true }),
    ).toBeDisabled();
    await page.reload();
    await expect(panel.locator("tbody tr")).toHaveCount(2);
    expect((await rawLocal(page)).transactions).toEqual(
      afterEdit.transactions.filter(
        (row) => (row as { id: string }).id !== "a-expense",
      ),
    );
  });
}

test("mobile pagination shares records and filter state with the desktop table", async ({
  page,
}) => {
  const fixture = backupFixture();
  const expense = fixture.transactions[1];
  fixture.transactions = Array.from({ length: 25 }, (_, index) => ({
    ...expense,
    id: `mobile-${index}`,
    description: `Movimento ${String(index).padStart(2, "0")}`,
  }));
  await seedLocal(page, { ...fixture, present: true });
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto("/#/transacoes");
  const panel = page.locator(".transactions-page");
  await expect(panel.locator("tbody tr")).toHaveCount(20);
  await panel.getByRole("button", { name: "Próxima", exact: true }).click();
  await expect(panel.locator("tbody tr")).toHaveCount(5);
  await expect(panel.locator(".pagination")).toContainText("Página 2 de 2");
  const secondPage = await panel
    .locator("tbody tr .transaction-description")
    .allTextContents();
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(
    await panel.locator("tbody tr .transaction-description").allTextContents(),
  ).toEqual(secondPage);
  await page.setViewportSize({ width: 320, height: 812 });
  await panel.getByLabel("Buscar descrição").fill("Movimento 00");
  await expect(panel.locator("tbody tr")).toHaveCount(1);
  await expect(panel.locator(".pagination")).toContainText("Página 1 de 1");
  await expect(
    panel.getByRole("button", { name: "Anterior", exact: true }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("button", { name: "Próxima", exact: true }),
  ).toBeDisabled();
  await panel.getByLabel("Buscar descrição").fill("Sem correspondência");
  await expect(panel.locator(".empty-state")).toBeVisible();
  await expect(panel.locator(".transaction-cards")).toHaveCount(0);
});
