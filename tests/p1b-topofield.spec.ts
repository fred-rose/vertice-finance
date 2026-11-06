import { expect, test } from "./helpers/appTest";
import type { Page } from "@playwright/test";

// Read the real shader clock inside the sandboxed frame, without injecting bootstrap hooks.
function elapsed(page: Page) {
  return canvas(page).evaluate((element) => {
    const gl = (element as HTMLCanvasElement).getContext("webgl")!;
    const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram;
    return Number(
      gl.getUniform(program, gl.getUniformLocation(program, "u_time")!),
    );
  });
}

const background = (page: Page) => page.locator("iframe.topofield-background");
const canvas = (page: Page) =>
  page.frameLocator("iframe.topofield-background").locator("#topo-canvas");

test("original isolated shader runs offline across the full overview composition", async ({
  page,
}, info) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (
      url.protocol.startsWith("http") &&
      !["127.0.0.1", "localhost"].includes(url.hostname)
    ) {
      external.push(url.href);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/");
  await expect(background(page)).toHaveAttribute("sandbox", "allow-scripts");
  await expect(background(page)).toHaveAttribute("aria-hidden", "true");
  await expect(background(page)).toHaveAttribute("tabindex", "-1");
  await expect(background(page)).toHaveCSS("pointer-events", "none");
  await expect(canvas(page)).toBeVisible();
  await expect.poll(() => elapsed(page)).toBeGreaterThan(0.05);
  const frameBounds = (await background(page).boundingBox())!;
  const composition = (await page
    .locator(".overview-topofield-composition")
    .boundingBox())!;
  expect(frameBounds.width).toBeCloseTo(composition.width, 1);
  expect(frameBounds.height).toBeCloseTo(composition.height, 1);
  const shader = await canvas(page).evaluate((element) => {
    const gl = (element as HTMLCanvasElement).getContext("webgl")!;
    const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram;
    return gl
      .getAttachedShaders(program)!
      .map((shader) => gl.getShaderSource(shader))
      .join("\n");
  });
  expect(shader).toContain("float noiseScale = 1.400;");
  expect(shader).toContain("float numBands = 10.00;");
  expect(shader).toContain("48.0 * u_dpr");
  expect(shader).toContain("u_time * 0.015, u_time * 0.025");
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  await page.screenshot({
    path: info.outputPath("topofield-original-dark.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Adicionar primeira transação" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("automatic light and dark modes rebuild the actual shader", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(background(page)).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await expect(background(page)).toHaveCSS(
    "background-color",
    "rgb(238, 241, 246)",
  );
  await expect(page.locator(".page-heading h1")).toHaveCSS(
    "color",
    "rgb(30, 41, 59)",
  );
  await expect.poll(() => elapsed(page)).toBeGreaterThan(0.05);
  await expect
    .poll(() =>
      canvas(page).evaluate((element) => {
        const gl = (element as HTMLCanvasElement).getContext("webgl")!;
        return gl
          .getAttachedShaders(gl.getParameter(gl.CURRENT_PROGRAM))!
          .map((shader) => gl.getShaderSource(shader))
          .join("\n");
      }),
    )
    .toContain("mix(paper, ink, lines)");
  await expect(
    page.frameLocator("iframe.topofield-background").locator("body"),
  ).toHaveCSS("background-color", "rgb(238, 241, 246)");
  await page.screenshot({
    path: info.outputPath("topofield-original-light.png"),
    fullPage: true,
  });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await expect(background(page)).toHaveCSS("background-color", "rgb(0, 0, 0)");
});

test("live controls preserve zero speed, resume time and apply opacity after load", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => elapsed(page)).toBeGreaterThan(0.05);
  await background(page).evaluate((element) =>
    (element as HTMLIFrameElement).contentWindow!.postMessage(
      { type: "threeui-controls", controls: { speed: 0, opacity: 0.4 } },
      "*",
    ),
  );
  await expect(canvas(page)).toHaveCSS("opacity", "0.4");
  const paused = await elapsed(page);
  await page.waitForTimeout(120);
  expect(await elapsed(page)).toBe(paused);
  await background(page).evaluate((element) =>
    (element as HTMLIFrameElement).contentWindow!.postMessage(
      { type: "threeui-controls", controls: { speed: 2 } },
      "*",
    ),
  );
  await expect.poll(() => elapsed(page)).toBeGreaterThan(paused + 0.05);
});

test("reduced motion draws a static frame and resumes when preference changes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(canvas(page)).toBeVisible();
  await expect(
    page.frameLocator("iframe.topofield-background").locator("body"),
  ).toHaveAttribute("data-threeui-ready", "");
  await expect.poll(() => elapsed(page)).toBe(0);
  const draws = await canvas(page).evaluateHandle((element) => {
    const gl = (element as HTMLCanvasElement).getContext("webgl")!;
    const counter = { value: 0 };
    const draw = gl.drawArrays.bind(gl);
    gl.drawArrays = (...args) => {
      counter.value++;
      draw(...args);
    };
    return counter;
  });
  await page.waitForTimeout(150);
  expect((await draws.jsonValue()).value).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect
    .poll(async () => (await draws.jsonValue()).value)
    .toBeGreaterThan(2);
  await expect.poll(() => elapsed(page)).toBeGreaterThan(0.05);
});
test("mobile keeps the original animated WebGL at device resolution and all routes", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect.poll(() => elapsed(page)).toBeGreaterThan(0.05);
  const size = await canvas(page).evaluate((element) => ({
    width: (element as HTMLCanvasElement).width,
    expected: Math.round(innerWidth * devicePixelRatio),
  }));
  expect(size.width).toBe(size.expected);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await page.screenshot({
    path: info.outputPath("topofield-original-mobile.png"),
    fullPage: true,
  });
  for (const label of ["Transações", "Configurações"]) {
    await page.getByRole("link", { name: label, exact: true }).click();
    await expect(background(page)).toHaveCount(1);
    await page.getByRole("link", { name: "Visão Geral", exact: true }).click();
    await expect(canvas(page)).toBeVisible();
  }
});
