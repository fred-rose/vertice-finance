import { expect, test } from "./helpers/appTest";
import { backupFixture } from "./helpers/backupFixture";
import { rawLocal, seedLocal } from "./helpers/localData";

test.use({ reducedMotion: "reduce" });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
  await page.goto("/favicon.svg");
});

for (const theme of ["dark", "light"] as const) {
  for (const count of [0, 1, 2, 5]) {
    test(`${theme}: analytics uses content space with ${count} expense categories`, async ({
      page,
    }, info) => {
      const fixture = backupFixture();
      const income = fixture.transactions[0];
      const expense = fixture.transactions[1];
      fixture.transactions = [
        income,
        { ...income, id: "prior-income", date: "2026-08-10" },
        ...fixture.settings.categories
          .filter((category) => category.type === "expense")
          .slice(0, count)
          .map((category, index) => ({
            ...expense,
            id: `space-${category.id}`,
            categoryId: category.id,
            amount: 100 * (index + 1),
          })),
      ];
      await seedLocal(page, { ...fixture, present: true });
      await page.goto("/");
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      const before = await rawLocal(page);
      const categories = page.getByRole("region", {
        name: "Despesas por categoria",
        exact: true,
      });
      const treemap = categories.getByRole("img", {
        name: /^Despesas por categoria,/,
      });
      const seasonality = page.getByRole("region", {
        name: "Sazonalidade das despesas",
        exact: true,
      });
      const radar = seasonality.getByRole("img");
      const lower = page.locator(".overview-details .categories-panel");
      const geometry = [];
      for (const width of [320, 390, 639, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(categories).toBeVisible();
        await expect(categories.locator("[data-category]")).toHaveCount(count);
        await expect
          .poll(async () => (await radar.boundingBox())!.width)
          .toBeLessThanOrEqual(320);
        const mapBox = (await treemap.boundingBox())!;
        expect(mapBox.height).toBeLessThanOrEqual(
          count === 0 ? 96 : count <= 2 ? 220 : 340,
        );
        expect(mapBox.height).toBeGreaterThanOrEqual(count === 0 ? 64 : 150);
        await expect(lower).toHaveCSS("align-self", "start");
        const lowerTail = await lower.evaluate(
          (element) =>
            element.getBoundingClientRect().bottom -
            element.lastElementChild!.getBoundingClientRect().bottom,
        );
        expect(lowerTail).toBeLessThanOrEqual(26);
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          )
          .toBe(true);
        expect(
          await page
            .locator(".ab-root svg")
            .evaluateAll((elements) =>
              elements.every(
                (element) => !/NaN|Infinity/.test(element.outerHTML),
              ),
            ),
        ).toBe(true);
        geometry.push({
          width,
          treemapHeight: mapBox.height,
          radar: await radar.boundingBox(),
          lowerTail,
        });
        if (count === 0) {
          await expect(treemap).toContainText(
            "Sem despesas registradas neste período.",
          );
          await expect(lower).toContainText("Aguardando despesas");
        } else {
          await expect(lower.locator(".category-row")).toHaveCount(count);
          await expect(
            categories.locator("[data-category]").first(),
          ).toHaveAccessibleName(/R\$/);
        }
        if ((width === 320 || width === 1440) && count <= 2) {
          await categories.screenshot({
            path: info.outputPath(`categories-${width}.png`),
          });
          await seasonality.screenshot({
            path: info.outputPath(`seasonality-${width}.png`),
          });
          await lower.screenshot({
            path: info.outputPath(`lower-categories-${width}.png`),
          });
        }
      }
      // The active period controls sizing; the catalog also includes other periods.
      await categories.getByRole("button", { name: /^Anterior/ }).click();
      await expect(categories.locator("[data-category]")).toHaveCount(0);
      expect((await treemap.boundingBox())!.height).toBeLessThanOrEqual(96);
      await categories.getByRole("button", { name: /^Mês/ }).click();
      await expect(categories.locator("[data-category]")).toHaveCount(count);
      if (count) {
        await categories.locator("[data-category]").first().hover();
        await expect(page.getByRole("tooltip")).toBeVisible();
        await expect(page.getByRole("tooltip")).toContainText("Participação");
      }
      await radar.locator("rect").hover({ position: { x: 20, y: 20 } });
      await expect(page.getByRole("tooltip")).toBeVisible();
      await expect(page.getByRole("tooltip")).toContainText("R$");
      await info.attach("geometry", {
        body: JSON.stringify(geometry),
        contentType: "application/json",
      });
      expect(await rawLocal(page)).toEqual(before);
    });
  }
}

test("an entirely empty workspace keeps the welcome state without invented charts", async ({
  page,
}) => {
  const fixture = backupFixture();
  fixture.transactions = [];
  await seedLocal(page, { ...fixture, present: true });
  await page.goto("/");
  await expect(page.locator(".welcome-panel")).toBeVisible();
  await expect(page.locator(".ab-root")).toHaveCount(0);
});
