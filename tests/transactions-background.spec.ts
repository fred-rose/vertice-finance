import { expect, test } from "./helpers/appTest";

for (const theme of ["dark", "light"] as const) {
  test(`Transactions reuses the isolated background and veil in ${theme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#/transacoes");
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const composition = page.locator(".transactions-topofield-composition");
    const background = composition.locator("iframe.topofield-background");
    const frame = page.frameLocator("iframe.topofield-background");
    await expect(background).toHaveCount(1);
    await expect(background).toHaveAttribute("aria-hidden", "true");
    await expect(background).toHaveAttribute("tabindex", "-1");
    await expect(background).toHaveCSS("pointer-events", "none");
    await expect(frame.locator("body")).toHaveAttribute(
      "data-threeui-ready",
      "",
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
          element.querySelector(".transactions-page")!,
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
    const surface = theme === "dark" ? "rgb(23, 23, 23)" : "rgb(255, 255, 255)";
    await expect(composition.locator(".transactions-page")).toHaveCSS(
      "background-color",
      surface,
    );
    await expect(composition.getByLabel("Buscar descrição")).toHaveCSS(
      "background-color",
      surface,
    );
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 812 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await composition
        .getByLabel("Buscar descrição")
        .fill("Teste de interação");
      await expect(composition.getByLabel("Buscar descrição")).toHaveValue(
        "Teste de interação",
      );
      await composition
        .getByRole("button", { name: "Importar", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const bounds = (await background.boundingBox())!;
      const container = (await composition.boundingBox())!;
      expect(bounds.width).toBeCloseTo(container.width, 1);
      expect(bounds.height).toBeCloseTo(container.height, 1);
    }
    // Route changes retain one renderer in Overview and Settings.
    await page.evaluate(() => {
      location.hash = "/";
    });
    await expect(
      page.locator(".transactions-topofield-composition"),
    ).toHaveCount(0);
    await expect(page.locator("iframe.topofield-background")).toHaveCount(1);
    await page.evaluate(() => {
      location.hash = "/configuracoes";
    });
    await expect(page.locator("iframe.topofield-background")).toHaveCount(1);
    await expect(page.locator(".settings-topofield-composition")).toBeVisible();
  });
}
