import { expect, test } from "@playwright/test";
import { backupFixture } from "./helpers/backupFixture";

for (const fault of ["blob", "object-url", "anchor-click"] as const) {
  test(`backup de segurança: falha ${fault} bloqueia restore e libera ObjectURL`, async ({
    page,
  }) => {
    await page.goto("/#/configuracoes");
    await page
      .getByRole("button", { name: "Restaurar backup JSON", exact: true })
      .click();
    await page.getByLabel("Arquivo de backup JSON v2").setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backupFixture())),
    });
    await expect(
      page.getByRole("heading", { name: "Prévia do backup" }),
    ).toBeVisible();
    await page.evaluate((fault) => {
      const state = {
        created: [] as string[],
        revoked: [] as string[],
        clears: 0,
      };
      Object.assign(window, { restoreDownloadEvidence: state });
      const clear = IDBObjectStore.prototype.clear;
      IDBObjectStore.prototype.clear = function () {
        state.clears++;
        return clear.call(this);
      };
      if (fault === "blob")
        window.Blob = new Proxy(Blob, {
          construct() {
            throw new Error("injected-blob");
          },
        });
      const create = URL.createObjectURL;
      URL.createObjectURL = function (blob) {
        if (fault === "object-url") throw new Error("injected-object-url");
        const url = create.call(this, blob);
        state.created.push(url);
        return url;
      };
      const revoke = URL.revokeObjectURL;
      URL.revokeObjectURL = function (url) {
        state.revoked.push(url);
        return revoke.call(this, url);
      };
      if (fault === "anchor-click")
        HTMLAnchorElement.prototype.click = () => {
          throw new Error("injected-click");
        };
    }, fault);
    await page
      .getByRole("button", { name: "Baixar backup de segurança" })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "A restauração está bloqueada",
    );
    await expect(
      page.getByRole("button", { name: "Restaurar este backup" }),
    ).toBeDisabled();
    const evidence = () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              restoreDownloadEvidence: {
                created: string[];
                revoked: string[];
                clears: number;
              };
            }
          ).restoreDownloadEvidence,
      );
    if (fault === "anchor-click") {
      await expect.poll(async () => (await evidence()).revoked.length).toBe(1);
      const state = await evidence();
      expect(state.revoked).toEqual(state.created);
    }
    expect((await evidence()).clears).toBe(0);
    await page.reload();
    await expect(
      page.getByLabel("Saldo inicial (R$)", { exact: true }).first(),
    ).toHaveValue("0");
  });
}
