import { expect, test } from "./helpers/appTest";
import type { Page } from "@playwright/test";

declare global {
  interface Window {
    topoAudit: {
      draws: number;
      programs: number;
      deletedPrograms: number;
      buffers: number;
      deletedBuffers: number;
      shaders: number;
      deletedShaders: number;
      drawMs: number;
    };
  }
}
async function audit(
  page: Page,
  failure: "none" | "context" | "compile" = "none",
) {
  await page.addInitScript((failure) => {
    window.topoAudit = {
      draws: 0,
      programs: 0,
      deletedPrograms: 0,
      buffers: 0,
      deletedBuffers: 0,
      shaders: 0,
      deletedShaders: 0,
      drawMs: 0,
    };
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value: function (
        this: HTMLCanvasElement,
        type: string,
        ...args: unknown[]
      ) {
        const topo = this.parentElement?.classList.contains(
          "topofield-background",
        );
        if (topo && type === "webgl" && failure === "context") return null;
        const context = Reflect.apply(original, this, [type, ...args]);
        if (topo && type === "webgl" && context) {
          const gl = context as WebGLRenderingContext;
          const keys = {
            createProgram: "programs",
            deleteProgram: "deletedPrograms",
            createBuffer: "buffers",
            deleteBuffer: "deletedBuffers",
            createShader: "shaders",
            deleteShader: "deletedShaders",
          } as const;
          for (const [method, counter] of Object.entries(keys)) {
            const originalMethod = gl[method as keyof typeof keys] as (
              ...args: unknown[]
            ) => unknown;
            Object.defineProperty(gl, method, {
              value: (...args: unknown[]) => {
                window.topoAudit[counter as keyof typeof window.topoAudit]++;
                return Reflect.apply(originalMethod, gl, args);
              },
            });
          }
          const draw = gl.drawArrays.bind(gl);
          gl.drawArrays = (...args) => {
            const start = performance.now();
            draw(...args);
            window.topoAudit.draws++;
            window.topoAudit.drawMs += performance.now() - start;
          };
          if (failure === "compile") gl.getShaderParameter = () => false;
        }
        return context;
      },
    });
  }, failure);
}
const background = (page: Page) => page.locator(".topofield-background");

test("Overview has real decorative WebGL, routes unmount it and release resources", async ({
  page,
}, info) => {
  await audit(page);
  await page.goto("/");
  await expect(background(page)).toHaveAttribute("data-renderer", "webgl");
  await expect(page.locator(".dashboard-content")).toHaveCSS("opacity", "1");
  const region = await background(page).boundingBox();
  expect(region!.width).toBeCloseTo(
    (await page.locator(".dashboard-content").boundingBox())!.width,
    1,
  );
  await expect(background(page)).toHaveCSS("opacity", "1");
  const heading = await page.locator(".page-heading").boundingBox();
  const welcome = await page.locator(".welcome-panel").boundingBox();
  expect(heading!.height).toBeLessThan(130);
  expect(welcome!.y - heading!.y - heading!.height).toBeLessThanOrEqual(20);
  expect(region!.y + region!.height).toBeCloseTo(
    welcome!.y + welcome!.height + 24,
    0,
  );
  await info.attach("composition-geometry.json", {
    body: JSON.stringify({
      heading,
      welcome,
      background: region,
      gap: welcome!.y - heading!.y - heading!.height,
    }),
    contentType: "application/json",
  });
  await expect(page.locator(".dashboard-content")).toHaveCSS("opacity", "1");
  await expect(background(page)).toHaveAttribute("aria-hidden", "true");
  await expect(background(page).locator("canvas")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(background(page).locator("canvas")).toHaveCSS(
    "pointer-events",
    "none",
  );
  await expect
    .poll(() => page.evaluate(() => window.topoAudit.draws))
    .toBeGreaterThan(3);
  await page.screenshot({
    path: info.outputPath("overview-empty-collapsed.png"),
    fullPage: true,
  });
  await page.locator(".app-sidebar").hover();
  await expect
    .poll(async () => (await page.locator(".app-sidebar").boundingBox())?.width)
    .toBe(240);
  await page.screenshot({
    path: info.outputPath("overview-empty-expanded.png"),
    fullPage: true,
  });
  for (const route of ["Transações", "Configurações"]) {
    await page.getByRole("link", { name: route, exact: true }).click();
    await expect(background(page)).toHaveCount(0);
    const released = await page.evaluate(() => window.topoAudit);
    expect(released.deletedPrograms).toBe(released.programs);
    expect(released.deletedBuffers).toBe(released.buffers);
    expect(released.deletedShaders).toBe(released.shaders);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.topoAudit.draws)).toBe(
      released.draws,
    );
  }
  await page.getByRole("link", { name: "Visão Geral", exact: true }).click();
  await expect(background(page)).toHaveAttribute("data-renderer", "webgl");
});

for (const failure of ["context", "compile"] as const) {
  test(`WebGL ${failure} failure leaves a usable CSS fallback and navigation`, async ({
    page,
  }, info) => {
    await audit(page, failure);
    await page.goto("/");
    await expect(background(page)).toHaveAttribute("data-renderer", "fallback");
    await expect(background(page)).toHaveAttribute("data-animation", "paused");
    await expect(page.locator(".welcome-panel")).toBeVisible();
    await page
      .getByRole("button", { name: "Adicionar primeira transação" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath("fallback.png"),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Transações", exact: true }).click();
    await expect(background(page)).toHaveCount(0);
    const counts = await page.evaluate(() => window.topoAudit);
    expect(counts.programs).toBe(counts.deletedPrograms);
    expect(counts.shaders).toBe(counts.deletedShaders);
  });
}

test("reduced motion draws a static frame, responds live and handles context loss", async ({
  page,
}, info) => {
  await audit(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(background(page)).toHaveAttribute("data-renderer", "webgl");
  await expect(background(page)).toHaveAttribute("data-animation", "paused");
  await page.waitForTimeout(200);
  const count = await page.evaluate(() => window.topoAudit.draws);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.topoAudit.draws)).toBe(count);
  await page.screenshot({
    path: info.outputPath("reduced-motion.png"),
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(background(page)).toHaveAttribute("data-animation", "running");
  await expect
    .poll(() => page.evaluate(() => window.topoAudit.draws))
    .toBeGreaterThan(count + 3);
  await page.evaluate(() =>
    document
      .querySelector(".topofield-background canvas")!
      .dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
  );
  await expect(background(page)).toHaveAttribute("data-renderer", "fallback");
  await expect(background(page)).toHaveAttribute("data-animation", "paused");
  await expect(page.locator(".welcome-panel")).toBeVisible();
});

test("hidden and offscreen pause, visibility resumes; resize reuses one program", async ({
  page,
}) => {
  await audit(page);
  await page.goto("/");
  await expect(background(page)).toHaveAttribute("data-animation", "running");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(background(page)).toHaveAttribute("data-animation", "paused");
  const stopped = await page.evaluate(() => window.topoAudit.draws);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.topoAudit.draws)).toBe(stopped);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(background(page)).toHaveAttribute("data-animation", "running");
  await page.evaluate(() => {
    document.querySelector<HTMLElement>(
      ".overview-topofield-composition",
    )!.style.transform = "translateY(-2000px)";
  });
  await expect(background(page)).toHaveAttribute("data-animation", "paused");
  await page.evaluate(() => {
    document.querySelector<HTMLElement>(
      ".overview-topofield-composition",
    )!.style.transform = "";
  });
  await expect(background(page)).toHaveAttribute("data-animation", "running");
  const initial = await page.evaluate(() => window.topoAudit.programs);
  await page.setViewportSize({ width: 950, height: 720 });
  await expect(background(page)).toHaveAttribute("data-renderer", "webgl");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.querySelector<HTMLCanvasElement>(
            ".topofield-background canvas",
          )!.width,
      ),
    )
    .toBeLessThan(1537);
  expect(await page.evaluate(() => window.topoAudit.programs)).toBe(initial);
});

test("small viewport uses static fallback without allocating WebGL and preserves CTAs", async ({
  page,
}, info) => {
  await audit(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(background(page)).toHaveAttribute("data-renderer", "fallback");
  await expect(background(page)).toHaveAttribute("data-animation", "paused");
  expect(await page.evaluate(() => window.topoAudit.programs)).toBe(0);
  await expect(background(page)).toHaveCSS(
    "background-size",
    "48px 48px, 48px 48px, cover",
  );
  const contoursLoaded = await page.evaluate(async () => {
    const image = new Image();
    image.src = "/topofield-static.svg";
    await image.decode();
    return image.naturalWidth > 0 && image.naturalHeight > 0;
  });
  expect(contoursLoaded).toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await expect(
    page.getByRole("button", { name: "Adicionar primeira transação" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("mobile.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Transações", exact: true }).click();
  await expect(background(page)).toHaveCount(0);
});

test("synthetic transaction leaves existing summary intact; compare frame gaps with/without effect", async ({
  page,
}, info) => {
  await audit(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Adicionar primeira transação" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Receita", exact: true }).click();
  await dialog.getByLabel("Valor (R$)", { exact: true }).fill("1200");
  await dialog.getByLabel("Descrição", { exact: true }).fill("P1b sintético");
  await dialog.getByRole("button", { name: "Salvar transação" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".primary-metric h2")).toContainText("1.200,00");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator(".page-heading h1").click();
  await page.mouse.move(600, 500);
  await page.screenshot({
    path: info.outputPath("overview-populated.png"),
    fullPage: true,
  });
  const measure = () =>
    page.evaluate(async () => {
      const gaps: number[] = [];
      let previous = 0;
      await new Promise<void>((resolve) => {
        function sample(now: number) {
          if (previous) gaps.push(now - previous);
          previous = now;
          if (gaps.length === 90) resolve();
          else requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      gaps.sort((a, b) => a - b);
      const canvas = document.querySelector<HTMLCanvasElement>(
        ".topofield-background canvas",
      )!;
      return {
        approximateFps: 1000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length),
        medianGapMs: gaps[45],
        p95GapMs: gaps[85],
        maxGapMs: gaps[89],
        browserDpr: devicePixelRatio,
        buffer: [canvas.width, canvas.height],
        audit: { ...window.topoAudit },
      };
    });
  const withEffect = await measure();
  await page.getByRole("link", { name: "Transações", exact: true }).click();
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value: function (
        this: HTMLCanvasElement,
        type: string,
        ...args: unknown[]
      ) {
        return this.parentElement?.classList.contains("topofield-background") &&
          type === "webgl"
          ? null
          : Reflect.apply(original, this, [type, ...args]);
      },
    });
  });
  await page.getByRole("link", { name: "Visão Geral", exact: true }).click();
  await expect(background(page)).toHaveAttribute("data-renderer", "fallback");
  await background(page).evaluate((element) => {
    (element as HTMLElement).style.display = "none";
  });
  const withoutEffect = await measure();
  await info.attach("frame-comparison.json", {
    body: JSON.stringify(
      {
        withEffect,
        withoutEffect,
        note: "Headless Edge. RAF cadence is approximate; no physical mobile/GPU certification, no memory or CPU percentage inferred.",
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});
