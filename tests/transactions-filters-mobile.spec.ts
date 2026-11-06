import { readFile } from "node:fs/promises";
import { expect, test } from "./helpers/appTest";
import { backupFixture } from "./helpers/backupFixture";
import { rawLocal, seedLocal } from "./helpers/localData";

test.use({ reducedMotion: "reduce" });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
  await page.goto("/favicon.svg");
});

for (const theme of ["dark", "light"] as const) {
  test(`compact filters remain accessible from 320 to 639px in ${theme}`, async ({
    page,
  }, info) => {
    await seedLocal(page, { ...backupFixture(), present: true });
    await page.goto("/#/transacoes");
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const panel = page.locator(".transactions-page");
    const filters = panel.locator(".transaction-filters");
    const secondary = panel.locator(".transaction-secondary-filters");
    const toggle = panel.getByRole("button", { name: /^Filtros/ });
    const before = await rawLocal(page);
    for (const width of [320, 360, 375, 390, 414, 479, 480, 540, 600, 639]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(panel.getByLabel("Buscar descrição")).toBeVisible();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(secondary).toBeHidden();
      expect((await filters.boundingBox())!.height).toBeLessThan(180);
      await toggle.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveCSS("outline-style", "solid");
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(await toggle.getAttribute("aria-controls")).toBe(
        await secondary.getAttribute("id"),
      );
      for (const label of ["Mês", "Tipo", "Categoria", "Conta"]) {
        await expect(
          label === "Mês"
            ? secondary.getByLabel(label, { exact: true })
            : secondary.getByRole("combobox", {
                name: new RegExp(`^${label}\\b`),
              }),
        ).toBeVisible();
      }
      const issues = await filters
        .locator("button, input, select")
        .evaluateAll((controls) =>
          controls.flatMap((control) => {
            const box = control.getBoundingClientRect();
            const font = parseFloat(getComputedStyle(control).fontSize);
            return box.width < 44 ||
              box.height < 44 ||
              box.left < 0 ||
              box.right > innerWidth ||
              (control.matches("input, select") && font < 16)
              ? [control.outerHTML]
              : [];
          }),
        );
      expect(issues).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await toggle.click();
      if (width === 320 || width === 639) {
        await filters.screenshot({
          path: info.outputPath(`filters-${theme}-${width}.png`),
        });
      }
    }
    for (const width of [640, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(toggle).toBeHidden();
      await expect(secondary.getByLabel("Mês", { exact: true })).toBeVisible();
      await expect(
        secondary.getByRole("combobox", { name: /^Tipo\b/ }),
      ).toBeVisible();
      await expect(
        secondary.getByRole("combobox", { name: /^Conta\b/ }),
      ).toBeVisible();
      await expect(
        secondary.getByRole("combobox", { name: /^Categoria\b/ }),
      ).toBeVisible();
      await expect(panel.locator("table")).toHaveCSS("display", "table");
    }
    expect(await rawLocal(page)).toEqual(before);
  });

  test(`combined filters, collapse, CSV, pagination and clear preserve data in ${theme}`, async ({
    page,
  }, info) => {
    const fixture = backupFixture();
    const expense = fixture.transactions[1];
    fixture.transactions = [
      fixture.transactions[0],
      fixture.transactions[2],
      ...Array.from({ length: 25 }, (_, index) => ({
        ...expense,
        id: `filter-${index}`,
        description: `Movimento ${String(index).padStart(2, "0")}`,
      })),
    ];
    await seedLocal(page, { ...fixture, present: true });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/#/transacoes");
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const panel = page.locator(".transactions-page");
    const before = await rawLocal(page);
    const toggle = panel.getByRole("button", { name: /^Filtros/ });
    const clear = panel.getByRole("button", { name: "Limpar", exact: true });
    await expect(clear).toBeDisabled();
    await panel.getByLabel("Buscar descrição").fill(" MOVIMENTO ");
    await expect(toggle).toHaveAccessibleName("Filtros, 1 ativo");
    await toggle.click();
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
    await expect(toggle).toHaveAccessibleName("Filtros, 5 ativos");
    expect((await toggle.boundingBox())!.height).toBeLessThanOrEqual(48);
    await panel.getByRole("button", { name: "Próxima", exact: true }).click();
    await expect(panel.locator("tbody tr")).toHaveCount(5);
    await toggle.click();
    await expect(panel.locator(".transaction-secondary-filters")).toBeHidden();
    await panel
      .locator(".transaction-filters")
      .screenshot({ path: info.outputPath(`filters-active-${theme}-320.png`) });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(panel.locator(".pagination")).toContainText("Página 2 de 2");
    await expect(panel.locator(".filter-summary")).toContainText(
      "25 lançamentos",
    );
    const downloading = page.waitForEvent("download");
    await panel
      .getByRole("button", { name: "Exportar CSV", exact: true })
      .click();
    const download = await downloading;
    const csv = await readFile((await download.path())!, "utf8");
    expect(csv.trim().split(/\r?\n/)).toHaveLength(26);
    expect(csv).toContain("Movimento 00");
    expect(csv).toContain("Movimento 24");
    expect(csv).not.toContain("Receita restaurada");
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(panel.getByRole("combobox", { name: /^Tipo\b/ })).toHaveValue(
      "expense",
    );
    await expect(panel.locator("tbody tr")).toHaveCount(5);
    await expect(panel.locator("table")).toHaveCSS("display", "table");
    await page.setViewportSize({ width: 320, height: 900 });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await clear.focus();
    await page.keyboard.press("Enter");
    await expect(panel.getByLabel("Buscar descrição")).toHaveValue("");
    await expect(panel.locator(".pagination")).toContainText("Página 1 de 2");
    await expect(panel.locator(".filter-summary")).toContainText(
      "27 lançamentos",
    );
    await expect(toggle).toHaveAccessibleName("Filtros");
    await expect(clear).toBeDisabled();
    await toggle.click();
    await expect(panel.getByLabel("Mês", { exact: true })).toHaveValue("");
    for (const label of ["Tipo", "Conta", "Categoria"])
      await expect(
        panel.getByRole("combobox", { name: new RegExp(`^${label}\\b`) }),
      ).toHaveValue("");
    await toggle.click();
    await panel.getByLabel("Buscar descrição").fill("Sem correspondência");
    await expect(panel.locator(".empty-state")).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Exportar CSV", exact: true }),
    ).toBeDisabled();
    await clear.click();
    await expect(panel.locator("tbody tr")).toHaveCount(20);
    expect(await rawLocal(page)).toEqual(before);
  });
}
