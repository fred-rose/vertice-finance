import { expect, test } from "./helpers/appTest";
import type { Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
});

async function dismissNotice(page: Page) {
  const dismiss = page.getByRole("button", {
    name: "Dispensar confirmação",
    exact: true,
  });
  if (await dismiss.count()) {
    await dismiss.click();
    await expect(dismiss).toHaveCount(0);
  }
}

async function add(
  page: Page,
  description: string,
  value: string,
  type: "Receita" | "Gasto",
  date: string,
) {
  await page
    .getByRole("button", { name: "Adicionar transação", exact: true })
    .filter({ visible: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: type, exact: true }).click();
  await dialog.getByLabel("Valor (R$)", { exact: true }).fill(value);
  await dialog.getByLabel("Descrição", { exact: true }).fill(description);
  await dialog.getByLabel("Data", { exact: true }).fill(date);
  await dialog.getByRole("button", { name: "Salvar transação" }).click();
  await expect(dialog).toHaveCount(0);
}

test("early states remain truthful and the accounts disclosure works with a keyboard", async ({
  page,
}, info) => {
  await page.goto("/");
  await add(page, "Receita registrada", "1250,35", "Receita", "2026-09-10");
  const lower = page.locator(".overview-details");
  const trend = lower.getByRole("region", {
    name: "Tendência financeira",
    exact: true,
  });
  await expect(trend).toContainText("Primeiro mês registrado");
  const bento = page.getByRole("region", {
    name: "Receitas registradas",
    exact: true,
  });
  for (const property of [
    "background-color",
    "border-top-color",
    "border-radius",
  ]) {
    const reference = await bento.evaluate(
      (element, name) => getComputedStyle(element).getPropertyValue(name),
      property,
    );
    await expect(trend).toHaveCSS(property, reference);
  }
  await expect(trend.locator(".overview-empty")).toHaveCSS(
    "background-color",
    "rgb(28, 28, 28)",
  );
  await expect(trend.locator(".overview-empty")).toHaveCSS(
    "background-image",
    "none",
  );
  await expect(trend.locator(".chart-container")).toHaveCount(0);
  await expect(
    trend.getByRole("link", {
      name: "Adicionar histórico ou importar uma planilha",
    }),
  ).toHaveAttribute("href", "#/transacoes");
  await expect(
    lower.getByRole("region", { name: "Gastos por categoria" }),
  ).toContainText("Aguardando despesas");
  await expect(
    lower.getByRole("link", { name: "Registrar uma despesa" }),
  ).toHaveAttribute("href", "#/transacoes");
  const recent = lower.getByRole("region", { name: "Últimas movimentações" });
  await expect(recent.locator("tbody tr")).toHaveCount(1);
  await expect(recent).toContainText("Receita registrada");
  const accounts = lower.locator("details.accounts-overview");
  await expect(accounts).not.toHaveAttribute("open", "");
  await expect(accounts.locator("summary")).toContainText(
    "2 contas cadastradas",
  );
  await dismissNotice(page);
  await page.locator("#main").focus();
  await page.mouse.move(900, 20);
  await lower.screenshot({
    path: info.outputPath("overview-lower-early-dark.png"),
  });
  await accounts.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(accounts).toHaveAttribute("open", "");
  await expect(accounts.locator(".overview-account-card")).toHaveCount(2);
  await expect(
    accounts.locator(".overview-account-card").first().locator("strong"),
  ).toHaveText(/R\$\s*1\.250,35/);
  await page.keyboard.press("Space");
  await expect(accounts).not.toHaveAttribute("open", "");
});

test("a month without records offers actions without invented movements or balances", async ({
  page,
}, info) => {
  await page.goto("/");
  await add(page, "Histórico de agosto", "100,25", "Receita", "2026-08-10");
  await page.getByRole("button", { name: "Próximo mês", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nenhum lançamento neste mês" }),
  ).toBeVisible();
  const recent = page.locator(".overview-details .recent-panel");
  await expect(recent).toContainText("Nenhuma movimentação neste mês.");
  await expect(recent.locator("table")).toHaveCount(0);
  await expect(recent).not.toContainText("Histórico de agosto");
  await dismissNotice(page);
  await page.mouse.move(900, 20);
  await page
    .locator(".overview-details")
    .screenshot({ path: info.outputPath("overview-lower-empty-month.png") });
  await recent
    .getByRole("link", { name: "Registrar ou importar", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/transacoes$/);
});

test("populated lower modules retain real values, light/dark contrast and mobile geometry", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await add(page, "Receita agosto", "1000,15", "Receita", "2026-08-10");
  await add(page, "Receita setembro", "1200,35", "Receita", "2026-09-10");
  await add(page, "Despesa setembro", "100,05", "Gasto", "2026-09-10");
  const lower = page.locator(".overview-details");
  await expect(lower.locator(".chart-container")).toBeVisible();
  await expect(lower.locator(".category-value").first()).toContainText(
    /R\$\s*100,05/,
  );
  await expect(lower.locator(".recent-panel tbody tr")).toHaveCount(2);
  await expect(lower.locator(".trend-panel")).toHaveCSS(
    "border-radius",
    "28px",
  );
  await dismissNotice(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  await page.locator("#main").focus();
  await page.mouse.move(1100, 20);
  await lower.screenshot({
    path: info.outputPath("overview-lower-populated-dark.png"),
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await expect(lower.locator(".trend-panel")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(
    lower.locator(".recent-panel .transaction-value.text-mint"),
  ).toHaveCSS("color", "rgb(40, 116, 81)");
  await expect(lower.locator(".overview-disclosure")).toHaveCSS(
    "transition-property",
    "none",
  );
  const summary = lower.locator(".accounts-overview > summary");
  await summary.click();
  await expect(
    lower.locator(".overview-account-card").first().locator("strong"),
  ).toHaveText(/R\$\s*2\.100,45/);
  await page.setViewportSize({ width: 320, height: 812 });
  await expect(lower.getByRole("table")).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.locator("#main").focus();
  await page.mouse.move(310, 20);
  await lower.screenshot({
    path: info.outputPath("overview-lower-populated-mobile-light.png"),
  });
  expect(errors).toEqual([]);
});
