import { expect, test } from "./helpers/appTest";

test("supplied sidebar expands over content and preserves the real routes", async ({
  page,
}, info) => {
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: "Barra lateral" });
  const nav = sidebar.getByRole("navigation", { name: "Navegação principal" });
  await expect(sidebar).toHaveAttribute("data-expanded", "false");
  await expect
    .poll(async () => (await sidebar.boundingBox())!.width)
    .toBeCloseTo(48.8, 1);
  const mainBefore = await page.locator("#main").boundingBox();
  await sidebar.hover();
  await expect(sidebar).toHaveAttribute("data-expanded", "true");
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(240);
  expect((await page.locator("#main").boundingBox())!.x).toBe(mainBefore!.x);
  await expect(nav.getByRole("link")).toHaveCount(3);
  await page.screenshot({
    path: info.outputPath("sidebar-expanded.png"),
    fullPage: true,
  });
  for (const [label, hash] of [
    ["Transações", "#/transacoes"],
    ["Configurações", "#/configuracoes"],
    ["Visão Geral", "#/"],
  ]) {
    const link = nav.getByRole("link", { name: label, exact: true });
    await link.click();
    await expect(page).toHaveURL(new RegExp(hash + "$"));
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  }
  await page.locator("#main").focus();
  await page.mouse.move(600, 200);
  await expect(sidebar).toHaveAttribute("data-expanded", "false");
});

test("keyboard navigation expands the sidebar and dropdowns dismiss with Escape", async ({
  page,
}) => {
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: "Barra lateral" });
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Ir para o conteúdo" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    sidebar.getByRole("button", { name: "Menu do Vértice" }),
  ).toBeFocused();
  await expect(sidebar).toHaveAttribute("data-expanded", "true");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(
    sidebar.getByRole("button", { name: "Menu do Vértice" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    sidebar.getByRole("link", { name: "Visão Geral" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(sidebar.getByRole("link", { name: "Transações" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/transacoes$/);
  await page.locator("#main").focus();
  await expect(sidebar).toHaveAttribute("data-expanded", "false");
});

test("reduced motion preserves navigation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: "Barra lateral" });
  await sidebar.hover();
  await expect(sidebar).toHaveAttribute("data-expanded", "true");
  await sidebar.getByRole("button", { name: "Menu pessoal" }).click();
  await expect(page.getByRole("menu")).toHaveCSS("animation-name", "none");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await sidebar
    .getByRole("link", { name: "Configurações", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/configuracoes$/);
});

test("reference scale and CSS isolation include portaled menus", async ({
  page,
}) => {
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: "Barra lateral" });
  const trigger = sidebar.getByRole("button", { name: "Menu do Vértice" });
  const link = sidebar.getByRole("link", { name: "Visão Geral", exact: true });
  await expect(page.locator("html")).toHaveCSS("font-size", "14px");
  await expect(sidebar).toHaveCSS("font-size", "16px");
  await expect(link).toHaveCSS("height", "32px");
  await expect(link).toHaveCSS("padding-left", "8px");
  await expect(link.locator("svg")).toHaveCSS("width", "16px");
  await expect(trigger).toHaveCSS("height", "36px");
  await expect(trigger).toHaveCSS("font-size", "14px");
  await expect(trigger).toHaveCSS("font-weight", "500");
  await expect(trigger).toHaveCSS(
    "transition-property",
    "color, background-color, border-color, box-shadow",
  );
  await link.focus();
  await expect(link).toHaveCSS("outline-color", "rgb(163, 163, 163)");
  await trigger.hover();
  await page.mouse.down();
  await expect(trigger).toHaveCSS("transform", "none");
  await page.mouse.up();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu).toHaveCSS("font-size", "16px");
  await expect(menu).toHaveCSS("min-width", "128px");
  await expect(menu.getByRole("menuitem")).toHaveCSS("font-size", "14px");
  await expect(menu.getByRole("menuitem")).toHaveCSS("padding-left", "8px");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  // A real overflow exercises the scrollbar's transparent border, too.
  await page.setViewportSize({ width: 1100, height: 180 });
  await sidebar.hover();
  const scrollArea = sidebar
    .locator("[data-radix-scroll-area-viewport]")
    .locator("..");
  await scrollArea.hover();
  await expect(sidebar.locator('[data-orientation="vertical"]')).toHaveCSS(
    "border-left-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator("html")).toHaveCSS("font-size", "14px");
});

test("both dropdowns animate fade, zoom and directional slide on enter and exit", async ({
  page,
}) => {
  await page.goto("/");
  const animationNames = await page.evaluateHandle(() => {
    const names: string[] = [];
    document.addEventListener("animationstart", (event) => {
      if (
        (event.target as HTMLElement).classList.contains("vertice-sidebar-menu")
      )
        names.push(event.animationName);
    });
    return names;
  });
  const sidebar = page.getByRole("complementary", { name: "Barra lateral" });
  for (const name of ["Menu do Vértice", "Menu pessoal"]) {
    await sidebar.getByRole("button", { name }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toHaveCSS("animation-name", "vertice-sidebar-enter");
    await expect(menu).toHaveCSS("animation-duration", "0.15s");
    const frames = await menu.evaluate((element) =>
      element.getAnimations()[0].effect!.getKeyframes(),
    );
    expect(frames[0].opacity).toBe("0");
    expect(frames[0].transform).toContain("0.95");
    expect(frames[0].transform).toMatch(/-?8px/);
    expect(frames[frames.length - 1].opacity).toBe("1");
    await expect
      .poll(
        async () =>
          (await animationNames.jsonValue()).filter(
            (value) => value === "vertice-sidebar-enter",
          ).length,
      )
      .toBe(name === "Menu do Vértice" ? 1 : 2);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(sidebar.getByRole("button", { name })).toBeFocused();
  }
  expect(await animationNames.jsonValue()).toEqual([
    "vertice-sidebar-enter",
    "vertice-sidebar-exit",
    "vertice-sidebar-enter",
    "vertice-sidebar-exit",
  ]);
});

test("touch supports menus and existing routes on mobile", async ({
  browser,
  baseURL,
}, info) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 320, height: 740 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const sidebar = page.getByRole("complementary", { name: "Barra lateral" });
    await sidebar.getByRole("button", { name: "Menu do Vértice" }).tap();
    await expect(page.getByRole("menu")).toBeVisible();
    await page
      .getByRole("menuitem", { name: "Configurações", exact: true })
      .tap();
    await expect(page).toHaveURL(/#\/configuracoes$/);
    const nav = sidebar.getByRole("navigation", {
      name: "Navegação principal",
    });
    for (const label of ["Transações", "Configurações", "Visão Geral"]) {
      const link = nav.getByRole("link", { name: label, exact: true });
      await link.tap();
      await expect(link).toHaveAttribute("aria-current", "page");
    }
    await expect(sidebar).toHaveAttribute("data-expanded", "false");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    await page.screenshot({
      path: info.outputPath("sidebar-mobile.png"),
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});

test("sidebar and portaled menus share light and dark tokens", async ({
  page,
}) => {
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: "Barra lateral" });
  const surface = sidebar.locator(":scope > div");
  await expect(surface).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await expect(surface).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await sidebar.getByRole("button", { name: "Menu pessoal" }).click();
  await expect(page.getByRole("menu")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await expect(surface).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect(page.getByRole("menu")).toHaveCSS(
    "background-color",
    "rgb(10, 10, 10)",
  );
  await page.getByRole("menuitem", { name: "Configurações pessoais" }).click();
  await expect(page).toHaveURL(/#\/configuracoes$/);
});
