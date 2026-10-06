import { build } from "vite";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { rawDatabase, seedLocal } from "./b2cExports";
export { rawDatabase, seedLocal };
export async function b2cBundle() {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL("./b2cHarness.ts", import.meta.url)),
        name: "b2cAudit",
        formats: ["iife"],
      },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!("output" in output)) throw Error("build");
  const chunk = output.output.find((c) => c.type === "chunk");
  if (!chunk || chunk.type !== "chunk") throw Error("build");
  return chunk.code;
}
declare global {
  interface Window {
    b2cAudit: typeof import("./b2cHarness");
  }
}
export async function migrateApp(page: Page) {
  await expect(
    page.getByRole("heading", {
      name: "Atualização dos dados locais",
      exact: true,
    }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar cópia de segurança", exact: true })
    .click();
  await download;
  await page.getByLabel("Confirmei que guardei a cópia de segurança").check();
  await page
    .getByRole("button", { name: "Atualizar dados locais", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: /^(Visão geral|Transações|Configurações)\.$/,
    }),
  ).toBeVisible({ timeout: 120000 });
  await expect(
    page.locator('[aria-label="Inicialização dos dados locais"]'),
  ).toHaveCount(0);
}
