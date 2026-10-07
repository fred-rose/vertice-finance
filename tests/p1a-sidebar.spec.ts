import { expect, test } from "./helpers/appTest";

test("sidebar starts collapsed, overlays without shift and collapses on mouse leave", async ({
  page,
}, info) => {
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: "Barra lateral" });
  await expect(sidebar).toHaveAttribute("data-expanded", "false");
  await expect
    .poll(async () => (await sidebar.boundingBox())?.width)
    .toBeCloseTo(48.8, 1);
  const mainBefore = await page.locator("#main").boundingBox();
  await page.screenshot({
    path: info.outputPath("sidebar-collapsed.png"),
    fullPage: true,
  });
  await sidebar.hover();
  await expect(sidebar).toHaveAttribute("data-expanded", "true");
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(240);
  expect((await page.locator("#main").boundingBox())?.x).toBe(mainBefore?.x);
  await expect(sidebar.locator(".app-sidebar-label").first()).toHaveCSS(
    "opacity",
    "1",
  );
  const settings = await sidebar
    .getByRole("link", { name: "Configurações" })
    .boundingBox();
  expect(settings!.y + settings!.height).toBeGreaterThan(
    (await sidebar.boundingBox())!.height - 30,
  );
  await page.screenshot({
    path: info.outputPath("sidebar-expanded.png"),
    fullPage: true,
  });
  await sidebar.getByRole("link", { name: "Transações" }).click();
  await page.mouse.move(600, 200);
  await expect(sidebar).toHaveAttribute("data-expanded", "false");
  await expect
    .poll(async () => (await sidebar.boundingBox())?.width)
    .toBeCloseTo(48.8, 1);
});

test("real routes, active item and accessible names survive collapsed navigation", async ({
  page,
}, info) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(nav.getByRole("link")).toHaveCount(3);
  for (const [label, hash] of [
    ["Transações", "#/transacoes"],
    ["Configurações", "#/configuracoes"],
    ["Visão Geral", "#/"],
  ]) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(hash + "$"));
    await expect(
      nav.getByRole("link", { name: label, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await page.mouse.move(600, 200);
    await expect
      .poll(
        async () => (await page.locator(".app-sidebar").boundingBox())?.width,
      )
      .toBeCloseTo(48.8, 1);
    await page.screenshot({
      path: info.outputPath(label + ".png"),
      fullPage: true,
    });
  }
});

test("keyboard focus expands and follows the hash router, then collapses outside", async ({
  page,
}, info) => {
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: "Barra lateral" });
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Ir para o conteúdo" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(sidebar.getByRole("button")).toBeFocused();
  await expect(sidebar).toHaveAttribute("data-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(
    sidebar.getByRole("link", { name: "Visão Geral" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  const transactions = sidebar.getByRole("link", { name: "Transações" });
  await expect(transactions).toBeFocused();
  await expect(transactions).toHaveCSS("outline-style", "solid");
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(240);
  await expect(transactions.locator(".app-sidebar-label")).toHaveCSS(
    "opacity",
    "1",
  );
  await page.screenshot({
    path: info.outputPath("keyboard-focus.png"),
    fullPage: true,
  });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/transacoes$/);
  await page.keyboard.press("Tab");
  await expect(
    sidebar.getByRole("link", { name: "Configurações" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/configuracoes$/);
  await page.keyboard.press("Tab");
  await expect(sidebar).toHaveAttribute("data-expanded", "false");
});

test("reduced motion keeps hover and keyboard navigation functional", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: "Barra lateral" });
  await sidebar.hover();
  await expect(sidebar).toHaveAttribute("data-expanded", "true");
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(240);
  await sidebar.getByRole("link", { name: "Configurações" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/configuracoes$/);
  await page.locator("#main").focus();
  await page.mouse.move(600, 200);
  await expect(sidebar).toHaveAttribute("data-expanded", "false");
});

test("mobile touch preserves all current routes without hover", async ({
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
    const nav = page.getByRole("navigation", { name: "Navegação principal" });
    await expect(nav).toBeVisible();
    for (const label of ["Transações", "Configurações", "Visão Geral"]) {
      const link = nav.getByRole("link", { name: label, exact: true });
      await link.tap();
      await expect(link).toHaveAttribute("aria-current", "page");
      await expect(link.locator(".app-sidebar-label")).toHaveCSS(
        "opacity",
        "1",
      );
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    await page.screenshot({
      path: info.outputPath("mobile.png"),
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});

test("desktop touch can expand using the brand button", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1100, height: 800 },
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const sidebar = page.getByRole("complementary", { name: "Barra lateral" });
    const toggle = sidebar.getByRole("button");
    await expect(sidebar).toHaveAttribute("data-expanded", "false");
    await toggle.tap();
    await expect(sidebar).toHaveAttribute("data-expanded", "true");
    await toggle.tap();
    await expect(sidebar).toHaveAttribute("data-expanded", "false");
    await sidebar.getByRole("link", { name: "Transações" }).tap();
    await expect(page).toHaveURL(/#\/transacoes$/);
  } finally {
    await context.close();
  }
});

test("brief mouseleave is cancelled on return, and keyboard focus survives delayed close", async ({
  page,
}, info) => {
  await page.goto("/");
  const sidebar = page.locator(".app-sidebar");
  await sidebar.hover();
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(240);
  const iconBefore = await sidebar
    .locator(".app-sidebar-link svg")
    .first()
    .boundingBox();
  const states = await sidebar.evaluate(async (element) => {
    const leave = () =>
      element.dispatchEvent(
        new PointerEvent("pointerout", {
          pointerType: "mouse",
          bubbles: true,
          relatedTarget: document.body,
        }),
      );
    const enter = () =>
      element.dispatchEvent(
        new PointerEvent("pointerover", {
          pointerType: "mouse",
          bubbles: true,
          relatedTarget: document.body,
        }),
      );
    const pause = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    leave();
    await pause(50);
    const duringDelay = element.getAttribute("data-expanded");
    enter();
    await pause(150);
    const afterReturn = element.getAttribute("data-expanded");
    leave();
    await pause(160);
    const afterDeparture = element.getAttribute("data-expanded");
    enter();
    await pause(350);
    return { duringDelay, afterReturn, afterDeparture };
  });
  expect(states).toEqual({
    duringDelay: "true",
    afterReturn: "true",
    afterDeparture: "false",
  });
  await sidebar.getByRole("link", { name: "Visão Geral" }).focus();
  await page.mouse.move(600, 200);
  await page.waitForTimeout(160);
  await expect(sidebar).toHaveAttribute("data-expanded", "true");
  await page.locator("#main").focus();
  await expect(sidebar).toHaveAttribute("data-expanded", "false");
  await expect
    .poll(async () => (await sidebar.boundingBox())?.width)
    .toBeCloseTo(48.8, 1);
  const iconAfter = await sidebar
    .locator(".app-sidebar-link svg")
    .first()
    .boundingBox();
  expect(iconAfter!.x).toBeCloseTo(iconBefore!.x, 1);
  await expect(sidebar.locator(".app-sidebar-label").first()).toHaveCSS(
    "flex-shrink",
    "0",
  );
  await info.attach("mouseleave-states.json", {
    body: JSON.stringify(states),
    contentType: "application/json",
  });
});
