import { expect, test } from "./helpers/appTest";
import { backupFixture } from "./helpers/backupFixture";
import { seedLocal } from "./helpers/localData";

test.use({ reducedMotion: "reduce" });

for (const width of [375, 1440]) {
  test(`Overview text contrast and theme isolation at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
    await page.goto("/favicon.svg");
    await seedLocal(page, { ...backupFixture(), present: true });
    await page.goto("/");
    const selectors = [
      ".period-context",
      ".insight-heading h2",
      ".insight-heading h2 svg",
      ".insight-grid > .empty-state",
    ];
    const darkColors = [
      "rgb(163, 176, 166)",
      "rgb(231, 234, 231)",
      "rgb(181, 195, 184)",
      "rgb(154, 168, 158)",
    ];
    for (const theme of ["dark", "light", "dark"] as const) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      for (const [index, selector] of selectors.entries()) {
        const target = page.locator(selector);
        await expect(target).toBeVisible();
        await expect(target).toHaveCSS(
          "color",
          theme === "light" ? "rgb(30, 41, 59)" : darkColors[index],
        );
        if (theme === "light") {
          const ratio = await target.evaluate((element) => {
            const composition = element.closest(
              ".overview-topofield-composition",
            )!;
            const style = getComputedStyle(composition);
            const opacity =
              Number(
                style
                  .getPropertyValue("--overview-field-content")
                  .match(/\/\s*([\d.]+)%/)![1],
              ) / 100;
            const start = parseFloat(
              style.getPropertyValue("--overview-field-content-stop"),
            );
            const end =
              composition.getBoundingClientRect().height -
              parseFloat(
                style.getPropertyValue("--overview-field-footer-fade"),
              );
            const bounds = element.getBoundingClientRect();
            const origin = composition.getBoundingClientRect().top;
            // These labels sit over the constant-opacity veil. A black WebGL
            // pixel beneath it gives the darkest possible composite background.
            if (bounds.top - origin < start || bounds.bottom - origin > end) {
              throw new Error("Text lies outside the evaluated veil interval");
            }
            const luminance = (channels: number[]) =>
              channels.reduce((sum, channel, i) => {
                const value = channel / 255;
                return (
                  sum +
                  (value <= 0.04045
                    ? value / 12.92
                    : ((value + 0.055) / 1.055) ** 2.4) *
                    [0.2126, 0.7152, 0.0722][i]
                );
              }, 0);
            const foreground = getComputedStyle(element)
              .color.match(/[\d.]+/g)!
              .slice(0, 3)
              .map(Number);
            const background = Array(3).fill(245 * opacity);
            return (
              (luminance(background) + 0.05) / (luminance(foreground) + 0.05)
            );
          });
          expect(
            ratio,
            `${selector}: minimum contrast over the animated background`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`overview-contrast-${theme}-${width}.png`),
        animations: "disabled",
      });
    }
  });
}
