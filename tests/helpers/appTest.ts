// Existing UI tests explicitly complete the real B2c consent flow for their synthetic legacy fixtures.
import { test as base, expect } from "@playwright/test";
import { migrateApp } from "./b2cData";
export { expect };
export const test = base.extend({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const result = await goto(url, options);
      const target = new URL(url, page.url());
      if (target.pathname === "/" || target.pathname === "/index.html") {
        await expect
          .poll(
            async () =>
              await page
                .locator(
                  '.page-heading, [aria-label="Inicialização dos dados locais"] h1, [aria-label="Inicialização dos dados locais"] [role="alert"], [aria-label="Recuperação de dados locais"] [role="alert"]',
                )
                .count(),
          )
          .toBeGreaterThan(0);
        if (
          await page
            .getByRole("heading", {
              name: "Atualização dos dados locais",
              exact: true,
            })
            .count()
        )
          await migrateApp(page);
      }
      return result;
    };
    await use(page);
  },
});
