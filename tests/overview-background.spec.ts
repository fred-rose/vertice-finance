import { expect, test } from "./helpers/appTest";
import type { Page } from "@playwright/test";

// The existing reduced-motion preference freezes WebGL and Bento animations for visual baselines.
test.use({ reducedMotion: "reduce" });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
});

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

for (const theme of ["dark", "light"] as const) {
  test(`Overview background visual regression: ${theme}, desktop and mobile`, async ({
    page,
  }) => {
    await page.goto("/");
    await add(page, "Receita de agosto", "1800,25", "Receita", "2026-08-10");
    await add(page, "Receita de setembro", "2100,35", "Receita", "2026-09-10");
    await add(page, "Despesa registrada", "350,15", "Gasto", "2026-09-11");
    await page
      .getByRole("button", { name: "Dispensar confirmação", exact: true })
      .click();
    await page.evaluate(
      (value) => (document.documentElement.dataset.theme = value),
      theme,
    );
    const composition = page.locator(".overview-topofield-composition");
    const frame = page.frameLocator("iframe.topofield-background");
    await expect(frame.locator("body")).toHaveAttribute(
      "data-threeui-ready",
      "",
    );
    await expect(frame.locator("#topo-canvas")).toBeVisible();
    await expect(page.locator(".ab-root > .grid > section").first()).toHaveCSS(
      "opacity",
      "1",
    );
    const layers = await composition.evaluate((element) => {
      const veil = getComputedStyle(element, "::after");
      return {
        pointerEvents: veil.pointerEvents,
        zIndex: veil.zIndex,
        background: veil.backgroundImage,
        filter: veil.filter,
        contentOpacity: getComputedStyle(
          element.querySelector(".dashboard-sections")!,
        ).opacity,
        lowerVeil: getComputedStyle(
          element.querySelector(".overview-details")!,
          "::before",
        ).content,
      };
    });
    expect(layers.pointerEvents).toBe("none");
    expect(layers.zIndex).toBe("0");
    expect(layers.background).toContain("linear-gradient");
    expect(layers.background).not.toContain("radial-gradient");
    expect(layers.filter).toBe("none");
    expect(layers.contentOpacity).toBe("1");
    expect(layers.lowerVeil).toBe("none");
    for (const [device, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 375, 812],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.mouse.move(width - 10, 10);
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur(),
      );
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await expect(composition).toHaveCSS("opacity", "1");
      await expect(composition).toHaveScreenshot(
        `overview-background-${theme}-${device}.png`,
        {
          animations: "disabled",
          caret: "hide",
          // Fixed elements are outside this composition and have separate regression tests.
          style: ".skip-link { visibility: hidden !important; }",
          maxDiffPixelRatio: 0.002,
        },
      );
    }
    // The veil stays behind the real content and never intercepts its existing actions.
    await page
      .locator(".overview-details .accounts-overview > summary")
      .click();
    await expect(
      page.locator(".overview-details .accounts-overview"),
    ).toHaveAttribute("open", "");
  });
}
