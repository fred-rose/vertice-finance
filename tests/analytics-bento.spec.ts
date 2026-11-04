import { expect, test } from "./helpers/appTest";
import type { Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
});

async function add(
  page: Page,
  description: string,
  amount: string,
  type: "Gasto" | "Receita",
  date: string,
) {
  await page
    .getByRole("button", { name: "Adicionar transação", exact: true })
    .filter({ visible: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: type, exact: true }).click();
  await dialog.getByLabel("Valor (R$)", { exact: true }).fill(amount);
  await dialog.getByLabel("Descrição", { exact: true }).fill(description);
  await dialog.getByLabel("Data", { exact: true }).fill(date);
  await dialog.getByRole("button", { name: "Salvar transação" }).click();
  await expect(dialog).toHaveCount(0);
}

test("empty and single-record states have exact cents and finite chart geometry", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".ab-root")).toHaveCount(0);
  await expect(page.locator(".welcome-panel")).toBeVisible();
  await add(page, "Receita real", "1,05", "Receita", "2026-09-01");
  const revenue = page.getByRole("region", {
    name: "Receitas registradas",
    exact: true,
  });
  await expect(revenue.locator('[data-amount="1.05"]')).toHaveText(
    /R\$\s*1,05/,
  );
  const expenses = page.getByRole("region", {
    name: "Despesas registradas",
    exact: true,
  });
  await expect(expenses.locator('[data-amount="0"]')).toHaveText(/R\$\s*0,00/);
  await expect(
    page.getByText("Sem despesas registradas neste período.", { exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator(".ab-root svg")
      .evaluateAll((elements) =>
        elements.every((svg) => !/NaN|Infinity/.test(svg.outerHTML)),
      ),
  ).toBe(true);
  await page.getByRole("button", { name: "Mês anterior", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nenhum lançamento neste mês" }),
  ).toBeVisible();
  await expect(revenue).toContainText("Sem registros");
  await expect(revenue.locator("[data-amount]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("real transactions drive values, negative deltas, treemap periods, radar and persistence", async ({
  page,
}, info) => {
  await page.goto("/");
  await add(page, "Receita anterior", "2000,55", "Receita", "2026-08-10");
  await add(page, "Gasto anterior", "400,20", "Gasto", "2026-08-10");
  await add(page, "Receita atual", "1000,25", "Receita", "2026-09-10");
  await add(page, "Gasto atual", "600,35", "Gasto", "2026-09-10");
  const revenue = page.getByRole("region", {
    name: "Receitas registradas",
    exact: true,
  });
  const expenses = page.getByRole("region", {
    name: "Despesas registradas",
    exact: true,
  });
  await expect(revenue.locator('[data-amount="1000.25"]')).toHaveText(
    /R\$\s*1\.000,25/,
  );
  await expect(
    revenue.locator('.ab-delta[data-tone="negative"][data-direction="down"]'),
  ).toHaveText("-50,0%");
  await expect(
    expenses.locator('.ab-delta[data-tone="negative"][data-direction="up"]'),
  ).toHaveText("+50,0%");
  await expect(page.locator(".primary-metric h2")).toHaveText(/R\$\s*399,90/);
  const categories = page.getByRole("region", {
    name: "Despesas por categoria",
    exact: true,
  });
  await categories.getByRole("button", { name: /^Anterior/ }).click();
  await expect(categories.locator("[data-category]").first()).toHaveAttribute(
    "aria-label",
    /400,20/,
  );
  const waves = page.getByRole("img", {
    name: "Entradas e Saídas por dia",
    exact: true,
  });
  await waves
    .locator("rect")
    .last()
    .hover({ position: { x: 10, y: 30 } });
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Dia");
  await expect(tooltip).toContainText("R$");
  await expect(
    categories.locator("[data-category] [data-amount]").first(),
  ).toHaveText("400,20");
  await page.locator("#main").focus();
  await page.mouse.move(900, 20);
  await page.locator(".financial-analytics").screenshot({
    path: info.outputPath("analytics-bento-desktop.png"),
  });
  await page.reload();
  await expect(revenue.locator('[data-amount="1000.25"]')).toHaveText(
    /R\$\s*1\.000,25/,
  );
  await expect(expenses.locator('[data-amount="600.35"]')).toHaveText(
    /R\$\s*600,35/,
  );
});

test("responsive themes, bounded tooltip and reduced motion preserve original interactions", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await add(page, "Receita", "1450,13", "Receita", "2026-09-10");
  await add(page, "Despesa", "15,05", "Gasto", "2026-09-10");
  const revenue = page.getByRole("region", {
    name: "Receitas registradas",
    exact: true,
  });
  await expect(revenue).toHaveCSS("background-color", "rgb(23, 23, 23)");
  await expect(revenue.locator("path[pathLength]")).toHaveCSS(
    "transition-property",
    "none",
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    const amountBounds = (await revenue
      .locator('[data-amount="1450.13"]')
      .boundingBox())!;
    const cardBounds = (await revenue.boundingBox())!;
    expect(amountBounds.x).toBeGreaterThanOrEqual(cardBounds.x);
    expect(amountBounds.x + amountBounds.width).toBeLessThanOrEqual(
      cardBounds.x + cardBounds.width,
    );
  }
  await page.setViewportSize({ width: 320, height: 812 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await expect(revenue).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const categories = page.getByRole("region", {
    name: "Despesas por categoria",
    exact: true,
  });
  await categories.getByRole("button", { name: /^Anterior/ }).click();
  await expect(
    page.getByText("Sem despesas registradas neste período.", { exact: true }),
  ).toBeVisible();
  await categories.getByRole("button", { name: /^Mês/ }).click();
  const tile = categories.locator("[data-category]").first();
  await tile.hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  const bounds = (await tooltip.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await page.locator("#main").focus();
  await page.mouse.move(310, 20);
  await page.locator(".financial-analytics").screenshot({
    path: info.outputPath("analytics-bento-mobile-light.png"),
  });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await expect(revenue).toHaveCSS("background-color", "rgb(23, 23, 23)");
  expect(errors).toEqual([]);
});
