import { expect, test } from "./helpers/appTest";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
});

const csv =
  "Descrição;Valor;Data\nReceita registrada;1500,25;13/09/2026\nMercado registrado;-100,05;12/09/2026\nTransporte anterior;-30,15;10/08/2026";

async function importCSV(page: Page, content = csv, count = 3) {
  await page
    .locator(".transactions-page")
    .getByRole("button", { name: "Importar", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Arquivo", { exact: true }).setInputFiles({
    name: "registros.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(content),
  });
  await dialog
    .getByRole("button", { name: `Importar ${count} transações`, exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    `${count} transações importadas`,
  );
  await dialog.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test("empty Transactions keeps accessible filters and route-scoped neutral dialogs", async ({
  page,
}) => {
  await page.goto("/#/transacoes");
  const panel = page.locator(".transactions-page");
  await expect(panel).toHaveCSS("background-color", "rgb(23, 23, 23)");
  await expect(panel).toHaveCSS("border-radius", "28px");
  await expect(panel).toContainText("Nenhum lançamento encontrado.");
  await expect(
    panel.getByRole("button", { name: "Exportar CSV" }),
  ).toBeDisabled();
  await panel.getByLabel("Buscar descrição").focus();
  await expect(panel.getByLabel("Buscar descrição")).toHaveCSS(
    "outline-color",
    "rgb(177, 230, 197)",
  );
  await panel.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCSS(
    "background-color",
    "rgb(23, 23, 23)",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("search, all filters, CSV export, editing and deletion preserve actual records", async ({
  page,
}) => {
  await page.goto("/#/transacoes");
  await importCSV(page);
  const panel = page.locator(".transactions-page");
  await expect(panel.locator("tbody tr")).toHaveCount(3);
  await expect(panel.locator(".filter-summary")).toContainText(
    /Resultado R\$\s*1\.370,05/,
  );
  await panel.getByLabel("Mês", { exact: true }).fill("2026-09");
  await expect(panel.locator("tbody tr")).toHaveCount(2);
  await panel
    .getByRole("combobox", { name: /^Tipo\b/ })
    .selectOption("expense");
  await panel
    .getByRole("combobox", { name: /^Conta\b/ })
    .selectOption("principal");
  await panel
    .getByRole("combobox", { name: /^Categoria\b/ })
    .selectOption("food");
  await panel.getByLabel("Buscar descrição").fill(" MERCADO ");
  await expect(panel.locator("tbody tr")).toHaveCount(1);
  await expect(panel.locator("tbody tr")).toContainText("Mercado registrado");
  const downloadPromise = page.waitForEvent("download");
  await panel
    .getByRole("button", { name: "Exportar CSV", exact: true })
    .click();
  const download = await downloadPromise;
  const exported = await readFile((await download.path())!, "utf8");
  expect(exported).toContain("Mercado registrado");
  expect(exported).not.toContain("Receita registrada");
  expect(exported).not.toContain("Transporte anterior");
  await panel.getByLabel("Buscar descrição").fill("Sem correspondência");
  await expect(
    panel.getByRole("button", { name: "Exportar CSV" }),
  ).toBeDisabled();
  await expect(panel).toContainText("Nenhum lançamento encontrado.");
  await panel.getByLabel("Buscar descrição").fill("Mercado");
  await panel
    .getByRole("button", { name: "Editar Mercado registrado", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Descrição", { exact: true })
    .fill("Mercado revisado");
  await dialog.getByLabel("Valor (R$)", { exact: true }).fill("125,55");
  await dialog
    .getByRole("button", { name: "Salvar transação", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(panel.locator(".filter-summary")).toContainText(
    /Saídas R\$\s*125,55/,
  );
  await panel
    .getByRole("button", { name: "Excluir Mercado revisado", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar exclusão", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(panel.locator("tbody tr")).toHaveCount(0);
  await page.reload();
  await expect(panel.locator("tbody tr")).toHaveCount(2);
  await expect(panel).not.toContainText("Mercado revisado");
});

test("pagination still displays every imported record and resets after searching", async ({
  page,
}) => {
  await page.goto("/#/transacoes");
  const rows = Array.from(
    { length: 25 },
    (_, i) => `Movimento ${String(i + 1).padStart(2, "0")};-1,25;10/09/2026`,
  );
  await importCSV(page, "Descrição;Valor;Data\n" + rows.join("\n"), 25);
  const panel = page.locator(".transactions-page");
  await expect(panel.locator("tbody tr")).toHaveCount(20);
  await expect(panel.locator(".pagination")).toContainText("Página 1 de 2");
  await panel.getByRole("button", { name: "Próxima", exact: true }).click();
  await expect(panel.locator("tbody tr")).toHaveCount(5);
  await expect(panel.locator(".pagination")).toContainText("Página 2 de 2");
  await panel.getByLabel("Buscar descrição").fill("Movimento 01");
  await expect(panel.locator("tbody tr")).toHaveCount(1);
  await expect(panel.locator(".pagination")).toContainText("Página 1 de 1");
  await expect(
    panel.getByRole("button", { name: "Anterior", exact: true }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("button", { name: "Próxima", exact: true }),
  ).toBeDisabled();
});

test("responsive neutral surfaces and light/dark themes preserve table actions", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#/transacoes");
  await importCSV(page);
  const panel = page.locator(".transactions-page");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.mouse.move(1400, 10);
  await panel.screenshot({
    path: info.outputPath("transactions-dark-desktop.png"),
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await expect(panel.getByLabel("Buscar descrição")).toBeVisible();
    const filtersToggle = panel.getByRole("button", { name: /^Filtros/ });
    if (
      width < 640 &&
      (await filtersToggle.getAttribute("aria-expanded")) === "false"
    ) {
      await filtersToggle.click();
    }
    await expect(
      panel.getByRole("combobox", { name: /^Categoria\b/ }),
    ).toBeVisible();
  }
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await expect(panel).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(panel.locator(".transaction-value.text-mint")).toHaveCSS(
    "color",
    "rgb(40, 116, 81)",
  );
  await expect(panel.getByLabel("Buscar descrição")).toHaveCSS(
    "transition-property",
    "none",
  );
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(panel.getByRole("table")).toHaveCount(1);
  await expect(panel.locator("thead th")).toHaveCount(6);
  await panel.locator(".table-scroll").evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await panel
    .getByRole("button", { name: "Editar Mercado registrado", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await panel.locator(".table-scroll").evaluate((element) => {
    element.scrollLeft = 0;
  });
  await page.mouse.move(365, 10);
  await panel.screenshot({
    path: info.outputPath("transactions-light-mobile.png"),
  });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await expect(panel).toHaveCSS("background-color", "rgb(23, 23, 23)");
  expect(errors).toEqual([]);
});
