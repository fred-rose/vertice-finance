import { test, expect, chromium, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join, dirname, basename, extname } from "node:path";
import { tmpdir } from "node:os";
import { build } from "vite";
import ExcelJS from "exceljs";
import config from "../vite.config";
import { backupFixture } from "./helpers/backupFixture";
import { rawDatabase } from "./helpers/b2cData";
import { rawLocal } from "./helpers/localData";

let origin: string;
let server: Server;
let temporary: string;
let release = 1;
const dist = resolve("dist");

test.beforeAll(async () => {
  test.setTimeout(120_000);
  temporary = await mkdtemp(join(tmpdir(), "vertice-pwa-test-"));
  // A real second build changes index.html and its precache revision.
  await build({
    ...config,
    configFile: false,
    logLevel: "silent",
    plugins: [
      ...(config.plugins ?? []),
      {
        name: "test-release-marker",
        transformIndexHtml: (html: string) =>
          html.replace(
            "</head>",
            '<meta name="test-release" content="2"></head>',
          ),
      },
    ],
    build: { ...config.build, outDir: temporary, emptyOutDir: false },
  });
  const mime: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webmanifest": "application/manifest+json",
  };
  server = createServer(async (req, res) => {
    const root = release === 1 ? dist : temporary;
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const file = resolve(root, `.${path === "/" ? "/index.html" : path}`);
    if (!file.startsWith(root + "/") && !file.startsWith(root + "\\")) {
      res.writeHead(403).end();
      return;
    }
    try {
      const content = await readFile(file);
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(content);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Servidor PWA indisponível");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
  if (
    temporary &&
    dirname(temporary) === resolve(tmpdir()) &&
    basename(temporary).startsWith("vertice-pwa-test-")
  )
    await rm(temporary, { recursive: true, force: true });
});
test.beforeEach(async ({ page }) => {
  release = 1;
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
});
async function ready(page: Page) {
  await page.goto(origin);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
}
async function add(
  page: Page,
  description: string,
  amount: string,
  type = "Receita",
) {
  await page
    .getByRole("button", { name: "Adicionar transação", exact: true })
    .filter({ visible: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: type, exact: true }).click();
  await dialog.getByLabel("Valor (R$)", { exact: true }).fill(amount);
  await dialog.getByLabel("Descrição", { exact: true }).fill(description);
  await dialog.getByRole("button", { name: "Salvar transação" }).click();
  await expect(dialog).toHaveCount(0);
}
async function snapshot(page: Page) {
  const raw = await rawLocal(page);
  return {
    version: (await rawDatabase(page)).version,
    rows: raw.transactions,
    settings: raw.settings[raw.keys.indexOf("personal")],
  };
}

test("manifest instalável, ícones, metadados iOS e precache sem ExcelJS", async ({
  page,
  request,
}) => {
  await ready(page);
  // Standard test contexts are incognito and cannot install apps. Use a fresh
  // temporary profile, automatically removed by Playwright on close.
  const profile = await chromium.launchPersistentContext("", {
    channel: "msedge",
    headless: true,
  });
  try {
    const installPage = profile.pages()[0];
    await ready(installPage);
    const devtools = await profile.newCDPSession(installPage);
    const installability = await devtools.send("Page.getInstallabilityErrors");
    expect(installability.installabilityErrors).toEqual([]);
    await devtools.detach();
  } finally {
    await profile.close();
  }
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const response = await request.get(new URL(href!, origin).href);
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    id: "/",
    name: "Vértice",
    short_name: "Vértice",
    display: "standalone",
    start_url: "/",
    scope: "/",
    orientation: "any",
    theme_color: "#101212",
    background_color: "#101212",
    icons: expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    ]),
  });
  for (const [file, size] of [
    ["pwa-192.png", 192],
    ["pwa-512.png", 512],
    ["maskable-512.png", 512],
    ["apple-touch-icon.png", 180],
  ] as const) {
    const image = await request.get(`${origin}/icons/${file}`);
    const bytes = await image.body();
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    expect(bytes.readUInt32BE(16)).toBe(size);
    expect(bytes.readUInt32BE(20)).toBe(size);
  }
  await expect(
    page.locator('meta[name="apple-mobile-web-app-capable"]'),
  ).toHaveAttribute("content", "yes");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/icons/apple-touch-icon.png",
  );
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    return (
      await Promise.all(
        keys.map(async (key) =>
          (await (await caches.open(key)).keys()).map((request) => request.url),
        ),
      )
    ).flat();
  });
  expect(cached.some((url) => url.includes("index.html"))).toBe(true);
  expect(cached.some((url) => url.includes(".css"))).toBe(true);
  expect(cached.some((url) => url.includes(".js"))).toBe(true);
  expect(cached.some((url) => url.includes("exceljs"))).toBe(false);
  expect(
    cached.every(
      (url) => !url.includes("transacoes") && !url.includes("backup"),
    ),
  ).toBe(true);
});

test("abre e recarrega offline, grava transações, configurações e importa CSV no IndexedDB", async ({
  page,
  context,
}) => {
  await ready(page);
  await add(page, "Receita antes do offline", "500");
  const before = await snapshot(page);
  await page.reload();
  await expect(page.locator(".primary-metric h2")).toContainText("500,00");
  await context.setOffline(true);
  await page.close();
  page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
  await page.goto(origin);
  await expect(page.locator(".primary-metric h2")).toContainText("500,00");
  expect(await snapshot(page)).toEqual(before);
  await add(page, "Despesa offline", "19,90", "Gasto");
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await expect(
    page.getByText(/Aplicativo pronto para uso offline/),
  ).toBeVisible();
  await page
    .getByLabel("Saldo inicial (R$)", { exact: true })
    .first()
    .fill("1000");
  // The hover rail overlays this action: leave it and wait for the close tween.
  await page.mouse.move(600, 200);
  await expect(page.locator(".app-sidebar")).toHaveCSS("width", "52px");
  await page.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Configurações salvas" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Transações", exact: true }).click();
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await page.getByLabel("Arquivo", { exact: true }).setInputFiles({
    name: "offline.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Data;Descrição;Valor\n10/09/2026;CSV offline;-0,30"),
  });
  await page.getByRole("button", { name: "Importar 1 transações" }).click();
  await page.getByRole("button", { name: "Concluir" }).click();
  const saved = await snapshot(page);
  await page.reload();
  expect(await snapshot(page)).toEqual(saved);
  await page.getByRole("link", { name: "Visão Geral", exact: true }).click();
  await expect(page.locator(".primary-metric h2")).toContainText("479,80");
});

test("ExcelJS é carregado sob demanda e pode ser reutilizado offline", async ({
  page,
  context,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "Importar planilha" }).click();
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Extrato").addRows([
    ["Data", "Descrição", "Valor"],
    ["2026-09-10", "XLSX offline", -29.9],
  ]);
  const file = {
    name: "extrato.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
  };
  await page.getByLabel("Arquivo", { exact: true }).setInputFiles(file);
  await expect(
    page.getByRole("button", { name: "Importar 1 transações" }),
  ).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await (await caches.open("vertice-exceljs")).keys()).length,
      ),
    )
    .toBe(1);
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Descartar e fechar" }).click();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "Importar planilha" }).click();
  await page.getByLabel("Arquivo", { exact: true }).setInputFiles(file);
  await page.getByRole("button", { name: "Importar 1 transações" }).click();
  await page.getByRole("button", { name: "Concluir" }).click();
  await expect(page.locator(".primary-metric h2")).toContainText("29,90");
});

test("nova versão aguarda confirmação, preserva IndexedDB e não recarrega rascunho em outra aba", async ({
  page,
  context,
}) => {
  await ready(page);
  await add(page, "Receita preservada na atualização", "500");
  const before = await snapshot(page);
  const other = await context.newPage();
  await other.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
  await ready(other);
  await other
    .getByRole("button", { name: "Adicionar transação", exact: true })
    .filter({ visible: true })
    .click();
  await other
    .getByLabel("Descrição", { exact: true })
    .fill("Rascunho da outra aba");
  await other.getByLabel("Valor (R$)", { exact: true }).fill("85");
  release = 2;
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())!.update();
  });
  await expect(
    page.getByText("Nova versão disponível.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('meta[name="test-release"]')).toHaveCount(0);
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await expect(page.locator('meta[name="test-release"]')).toHaveAttribute(
    "content",
    "2",
  );
  await expect(page.locator(".primary-metric h2")).toContainText("500,00");
  expect(await snapshot(page)).toEqual(before);
  await expect(other.getByLabel("Descrição", { exact: true })).toHaveValue(
    "Rascunho da outra aba",
  );
  await expect(other.locator('meta[name="test-release"]')).toHaveCount(0);
  await other.getByRole("button", { name: "Salvar transação" }).click();
  await expect(other.getByRole("dialog")).toHaveCount(0);
  await expect(other.locator(".primary-metric h2")).toContainText("415,00");
  await other.getByRole("button", { name: "Atualizar", exact: true }).click();
  await expect(other.locator('meta[name="test-release"]')).toHaveAttribute(
    "content",
    "2",
  );
  await context.setOffline(true);
  await other.reload();
  await expect(other.locator(".primary-metric h2")).toContainText("415,00");
});

async function waitingUpdate(page: Page) {
  // Finish the initial registration check before switching the served release.
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await navigator.serviceWorker.getRegistration())?.active?.state,
      ),
    )
    .toBe("activated");
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())!.update();
  });
  release = 2;
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())!.update();
  });
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          !!(await navigator.serviceWorker.getRegistration())?.waiting,
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Atualizar", exact: true }),
  ).toBeVisible();
}
for (const kind of ["settings", "transaction", "import", "restore"] as const) {
  test(`A2c PWA ${kind}: dirty bloqueia e descarte exige novo clique`, async ({
    page,
  }) => {
    await ready(page);
    await waitingUpdate(page);
    const before = await rawLocal(page);
    if (kind === "settings") {
      await page
        .getByRole("link", { name: "Configurações", exact: true })
        .click();
    } else if (kind === "transaction") {
      await page
        .getByRole("button", { name: "Adicionar transação", exact: true })
        .filter({ visible: true })
        .click();
    } else if (kind === "import") {
      await page
        .getByRole("button", { name: "Importar planilha", exact: true })
        .click();
      await page.getByLabel("Arquivo", { exact: true }).setInputFiles({
        name: "draft.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("Descrição;Valor;Data\nDraft PWA;-12;10/09/2026"),
      });
      await expect(
        page.getByRole("button", { name: "Importar 1 transações" }),
      ).toBeEnabled();
    } else {
      await page
        .getByRole("link", { name: "Configurações", exact: true })
        .click();
      await page.mouse.move(600, 200);
      await expect(page.locator(".app-sidebar")).toHaveCSS("width", "52px");
      await page
        .getByRole("button", { name: "Restaurar backup JSON", exact: true })
        .click();
      await page.getByLabel("Arquivo de backup JSON v2").setInputFiles({
        name: "backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(backupFixture())),
      });
      await expect(
        page.getByRole("region", { name: "Prévia do backup" }),
      ).toBeVisible();
    }
    if (kind === "settings" || kind === "transaction") {
      const input =
        kind === "settings"
          ? page.getByLabel("Nome da conta", { exact: true }).first()
          : page.getByLabel("Descrição", { exact: true });
      const unloadBlocked = await input.evaluate((element) => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!.call(element, "Draft PWA");
        element.dispatchEvent(new Event("input", { bubbles: true }));
        const blocked = !window.dispatchEvent(
          new Event("beforeunload", { cancelable: true }),
        );
        Array.from(document.querySelectorAll("button"))
          .find((button) => button.textContent === "Atualizar")!
          .click();
        return blocked;
      });
      expect(unloadBlocked).toBe(true);
    }
    const update = page.getByRole("button", {
      name: "Atualizar",
      exact: true,
      includeHidden: true,
    });
    await expect(update).toBeDisabled();
    await update.evaluate((el) => (el as HTMLButtonElement).click());
    await expect(page.locator('meta[name="test-release"]')).toHaveCount(0);
    expect(
      await page.evaluate(
        async () =>
          !!(await navigator.serviceWorker.getRegistration())?.waiting,
      ),
    ).toBe(true);
    if (kind === "settings") {
      await page
        .getByRole("link", { name: "Visão Geral", exact: true })
        .click();
      await page.getByRole("button", { name: "Descartar e sair" }).click();
    } else {
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Descartar e fechar" }).click();
    }
    await expect(update).toBeEnabled();
    await expect(page.locator('meta[name="test-release"]')).toHaveCount(0);
    expect(await rawLocal(page)).toEqual(before);
    await update.click();
    await expect(page.locator('meta[name="test-release"]')).toHaveAttribute(
      "content",
      "2",
    );
    expect(await rawLocal(page)).toEqual(before);
  });
}
test("A2c clean dialog não bloqueia update", async ({ page }) => {
  await ready(page);
  await waitingUpdate(page);
  await page
    .getByRole("button", { name: "Adicionar transação", exact: true })
    .filter({ visible: true })
    .click();
  const update = page.getByRole("button", {
    name: "Atualizar",
    exact: true,
    includeHidden: true,
  });
  await expect(update).toBeEnabled();
  // Background UI is inert; exercise the real callback without a fabricated SW.
  await update.evaluate((el) => (el as HTMLButtonElement).click());
  await expect(page.locator('meta[name="test-release"]')).toHaveAttribute(
    "content",
    "2",
  );
});

test("A2c busy bloqueia update e fechamento durante leitura real de arquivo", async ({
  page,
}) => {
  await ready(page);
  await waitingUpdate(page);
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await page.mouse.move(600, 200);
  await expect(page.locator(".app-sidebar")).toHaveCSS("width", "52px");
  await page
    .getByRole("button", { name: "Restaurar backup JSON", exact: true })
    .click();
  await page.evaluate(() => {
    const native = File.prototype.text;
    File.prototype.text = async function () {
      const content = await native.call(this);
      await new Promise<void>((resolve) =>
        Object.assign(window, { a2cReleaseFile: resolve }),
      );
      return content;
    };
  });
  await page.getByLabel("Arquivo de backup JSON v2").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backupFixture())),
  });
  await expect(page.getByText("Lendo e validando o backup…")).toBeVisible();
  const update = page.getByRole("button", {
    name: "Atualizar",
    exact: true,
    includeHidden: true,
  });
  await expect(update).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(() => {
    location.hash = "#/transacoes";
  });
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect.poll(() => new URL(page.url()).hash).toBe("#/configuracoes");
  await page.evaluate(() =>
    (window as unknown as { a2cReleaseFile: () => void }).a2cReleaseFile(),
  );
  await expect(
    page.getByRole("region", { name: "Prévia do backup" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Descartar e fechar" }).click();
  await expect(update).toBeEnabled();
  await expect(page.locator('meta[name="test-release"]')).toHaveCount(0);
  await update.click();
  await expect(page.locator('meta[name="test-release"]')).toHaveAttribute(
    "content",
    "2",
  );
});
test("A2c corrida controllerchange preserva edição e cancela autorização anterior", async ({
  page,
}) => {
  await ready(page);
  await waitingUpdate(page);
  await page.evaluate(() => {
    const native = ServiceWorker.prototype.postMessage;
    Object.assign(window, { a2cDocument: crypto.randomUUID(), a2cMessages: 0 });
    ServiceWorker.prototype.postMessage = function (
      ...args: [unknown, (Transferable[] | StructuredSerializeOptions)?]
    ) {
      if ((args[0] as { type?: string })?.type === "SKIP_WAITING") {
        const w = window as unknown as {
          a2cMessages: number;
          a2cActivate: () => void;
        };
        w.a2cMessages++;
        w.a2cActivate = () => Reflect.apply(native, this, args);
        return;
      }
      return Reflect.apply(native, this, args);
    };
  });
  const identity = await page.evaluate(
    () => (window as unknown as { a2cDocument: string }).a2cDocument,
  );
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  const name = page.getByLabel("Nome da conta", { exact: true }).first();
  await name.fill("Digitado durante ativação");
  await page.evaluate(() =>
    (window as unknown as { a2cActivate: () => void }).a2cActivate(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        async () => !(await navigator.serviceWorker.getRegistration())?.waiting,
      ),
    )
    .toBe(true);
  await expect(
    page.getByText("Versão pronta. Conclua sua edição antes de recarregar."),
  ).toBeVisible();
  await expect(name).toHaveValue("Digitado durante ativação");
  expect(
    await page.evaluate(
      () => (window as unknown as { a2cDocument: string }).a2cDocument,
    ),
  ).toBe(identity);
  const before = await rawLocal(page);
  // No-waiting branch is blocked while dirty; then explicit discard and click.
  await expect(
    page.getByRole("button", { name: "Atualizar", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Visão Geral", exact: true }).click();
  await page.getByRole("button", { name: "Descartar e sair" }).click();
  await expect(page.locator('meta[name="test-release"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await expect(page.locator('meta[name="test-release"]')).toHaveAttribute(
    "content",
    "2",
  );
  expect(await rawLocal(page)).toEqual(before);
});

test("instalação só aparece com evento disponível e some após uso", async ({
  page,
}) => {
  await page.addInitScript(() =>
    window.addEventListener("beforeinstallprompt", (event) => {
      if (event.isTrusted) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }),
  );
  await ready(page);
  await page.goto(`${origin}/#/configuracoes`);
  const button = page.getByRole("button", {
    name: "Instalar Vértice neste dispositivo",
  });
  await expect(button).toHaveCount(0);
  // Synthetic event exercises the UI contract; native installation needs a device/browser UI.
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    window.dispatchEvent(event);
  });
  await expect(button).toBeVisible();
  await button.click();
  await expect(button).toHaveCount(0);
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
    window.dispatchEvent(new Event("appinstalled"));
  });
  await expect(button).toHaveCount(0);
  await expect(
    page.getByText(/Vértice instalado neste dispositivo/),
  ).toBeVisible();
});

test("modo standalone iOS oculta instalação e mantém layout móvel", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "standalone", { value: true }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.goto(`${origin}/#/configuracoes`);
  await expect(
    page.getByText(/Vértice instalado neste dispositivo/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Instalar Vértice neste dispositivo" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 844, height: 390 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /viewport-fit=cover/,
  );
});

test("XLSX ainda não carregado explica a limitação offline e CSV continua disponível", async ({
  page,
  context,
}) => {
  await ready(page);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "Importar planilha" }).click();
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Extrato").addRows([
    ["Data", "Descrição", "Valor"],
    ["2026-09-10", "XLSX não importado", -29.9],
  ]);
  await page.getByLabel("Arquivo", { exact: true }).setInputFiles({
    name: "extrato.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
  });
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Para usar XLSX offline",
  );
  await page.getByLabel("Arquivo", { exact: true }).setInputFiles({
    name: "alternativa.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Data;Descrição;Valor\n10/09/2026;CSV disponível;-19,90",
    ),
  });
  await page.getByRole("button", { name: "Importar 1 transações" }).click();
  await page.getByRole("button", { name: "Concluir" }).click();
  await expect(page.locator(".primary-metric h2")).toContainText("19,90");
});

test("B2c real waiting PWA does not interrupt held migration or gain reload permission", async ({
  page,
}) => {
  await page.goto(origin + "/favicon.svg");
  const { seedLocal } = await import("./helpers/localData");
  await seedLocal(page, { ...backupFixture(), present: true });
  await page.goto(origin);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect(
    page.getByRole("heading", {
      name: "Atualização dos dados locais",
      exact: true,
    }),
  ).toBeVisible();
  await waitingUpdate(page);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar cópia de segurança", exact: true })
    .click();
  await download;
  await page.getByLabel("Confirmei que guardei a cópia de segurança").check();
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    let held = false;
    IDBObjectStore.prototype.add = function (...args) {
      const r = add.apply(this, args);
      if (this.name === "scopedTransactions" && !held) {
        held = true;
        const tx = this.transaction;
        let release = false;
        Object.assign(window, {
          releaseMigration: () => {
            release = true;
          },
        });
        r.addEventListener("success", () => {
          document.documentElement.setAttribute("data-copy-held", "true");
          const keep = () => {
            const q = tx.objectStore("settings").get("personal");
            q.onsuccess = () => {
              if (!release) keep();
            };
          };
          keep();
        });
      }
      return r;
    };
  });
  await page
    .getByRole("button", { name: "Atualizar dados locais", exact: true })
    .click();
  await page.waitForFunction(
    () => document.documentElement.getAttribute("data-copy-held") === "true",
  );
  const update = page.getByRole("button", { name: "Atualizar", exact: true });
  await expect(update).toBeDisabled();
  await update.evaluate((el) => (el as HTMLButtonElement).click());
  await page.evaluate(() =>
    navigator.serviceWorker.dispatchEvent(new Event("controllerchange")),
  );
  await expect(page.getByRole("status")).toContainText(
    "Atualizando os dados locais",
  );
  await page.evaluate(() =>
    (window as unknown as { releaseMigration: () => void }).releaseMigration(),
  );
  await expect(page.locator(".primary-metric")).toBeVisible();
  await expect(page.locator('meta[name="test-release"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Atualizar", exact: true }),
  ).toBeEnabled();
});
