import { expect, test } from "./helpers/appTest";
import { backupFixture } from "./helpers/backupFixture";
import { seedLocal } from "./helpers/localData";

test.use({ reducedMotion: "reduce" });

for (const theme of ["dark", "light"] as const) {
  test(`Settings stays usable across widths in ${theme} and isolates its styles`, async ({
    page,
  }, info) => {
    await page.goto("/favicon.svg");
    await seedLocal(page, { ...backupFixture(), present: true });
    await page.goto("/");
    await page
      .getByRole("link", { name: "Configurações", exact: true })
      .click();
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const settings = page.locator(".settings-page");
    const composition = page.locator(".settings-topofield-composition");
    const background = composition.locator("iframe.topofield-background");
    const frame = page.frameLocator("iframe.topofield-background");
    await expect(background).toHaveCount(1);
    await expect(background).toHaveAttribute("aria-hidden", "true");
    await expect(background).toHaveAttribute("tabindex", "-1");
    await expect(background).toHaveAttribute("sandbox", "allow-scripts");
    await expect(background).toHaveCSS("pointer-events", "none");
    await expect(frame.locator("body")).toHaveAttribute(
      "data-threeui-ready",
      "",
    );
    await expect(frame.locator("body")).toHaveCSS(
      "background-color",
      theme === "dark" ? "rgb(0, 0, 0)" : "rgb(238, 241, 246)",
    );
    await expect(frame.locator("#topo-canvas")).toBeVisible();
    const layers = await composition.evaluate((element) => {
      const veil = getComputedStyle(element, "::after");
      return {
        isolation: getComputedStyle(element).isolation,
        pointerEvents: veil.pointerEvents,
        zIndex: veil.zIndex,
        gradient: veil.backgroundImage,
        contentZIndex: getComputedStyle(
          element.querySelector(".settings-page")!,
        ).zIndex,
      };
    });
    expect(layers).toMatchObject({
      isolation: "isolate",
      pointerEvents: "none",
      zIndex: "0",
      contentZIndex: "1",
    });
    expect(layers.gradient).toContain("linear-gradient");
    expect(layers.gradient).toContain(theme === "dark" ? "0.8" : "0.78");
    await expect(settings.locator(".settings-section").first()).toHaveCSS(
      "background-color",
      theme === "dark" ? "rgb(23, 23, 23)" : "rgb(255, 255, 255)",
    );
    for (const summary of await settings.locator("details > summary").all()) {
      await summary.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await expect(summary).toBeFocused();
      await expect(summary).toHaveCSS("outline-style", "solid");
      await page.keyboard.press("Enter");
      await expect(summary.locator("..")).toHaveAttribute("open", "");
    }
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      const clipping = await settings
        .locator("input, select, button, summary")
        .evaluateAll((elements) =>
          elements
            .filter((element) => {
              const bounds = element.getBoundingClientRect();
              return (
                bounds.width > 0 &&
                (bounds.left < 0 ||
                  bounds.right > innerWidth ||
                  bounds.height < 44)
              );
            })
            .map((element) => element.outerHTML.slice(0, 140)),
        );
      expect(clipping).toEqual([]);
      const bounds = (await background.boundingBox())!;
      const container = (await composition.boundingBox())!;
      expect(bounds.width).toBeCloseTo(container.width, 1);
      expect(bounds.height).toBeCloseTo(container.height, 1);
      if (width === 375 || width === 1440) {
        await page.mouse.move(width - 10, 10);
        await page.evaluate(() => {
          (document.activeElement as HTMLElement)?.blur();
          window.scrollTo(0, 0);
        });
        // Viewport captures avoid resizing the tall, static WebGL composition.
        await page.screenshot({
          path: info.outputPath(`settings-${theme}-${width}.png`),
          animations: "disabled",
        });
      }
    }
    await page.getByRole("link", { name: "Transações", exact: true }).click();
    const transactions = page.locator(".transactions-page");
    await expect(transactions).toBeVisible();
    await expect(page.locator(".settings-topofield-composition")).toHaveCount(
      0,
    );
    await expect(page.locator("iframe.topofield-background")).toHaveCount(1);
    expect(
      await transactions.evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--st-surface"),
      ),
    ).toBe("");
  });
}
