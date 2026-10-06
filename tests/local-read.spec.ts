import { expect, test } from "@playwright/test";
import { backupFixture } from "./helpers/backupFixture";
import {
  rawLocal,
  repositoryBundle,
  seedLocal,
  type RawFixture,
} from "./helpers/localData";

let bundle: string;
test.beforeAll(async () => {
  bundle = await repositoryBundle();
});
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-15T00:30:00Z"));
  await page.goto("/favicon.svg");
  await page.evaluate((code) => (0, eval)(code), bundle);
});

test("bootstrap real persiste personal, espera complete e não recria chave removida", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const r = window.financeAudit.transactionRepository;
    const events: string[] = [];
    const native = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (
      ...args: Parameters<typeof native>
    ) {
      const tx = native.apply(this, args);
      // Observe before the repository's handler: microtasks may run between
      // listeners of the same complete event in the browser.
      tx.addEventListener("complete", () => events.push("complete"));
      return tx;
    };
    try {
      const snapshot = await r.load();
      events.push("loaded");
      return { snapshot, events };
    } finally {
      IDBDatabase.prototype.transaction = native;
    }
  });
  expect(result.events).toEqual(["complete", "loaded"]);
  const raw = await rawLocal(page);
  expect(raw.keys).toEqual(["__vertice_local_concurrency__", "personal"]);
  expect(raw.settings).toEqual([
    { protocol: 1, revision: 0 },
    result.snapshot.snapshot.settings,
  ]);
  expect(result.snapshot.snapshot.transactions).toEqual([]);
  await seedLocal(page, {
    transactions: [],
    settings: undefined,
    present: false,
  });
  const before = await rawLocal(page);
  await page.reload();
  await page.evaluate((code) => (0, eval)(code), bundle);
  expect(
    await page.evaluate(async () => {
      try {
        await window.financeAudit.transactionRepository.load();
        return "accepted";
      } catch (e) {
        return (e as { code: string }).code;
      }
    }),
  ).toBe("missing-settings");
  expect(await rawLocal(page)).toEqual(before);
});

const cases = [
  "missing-completely-empty",
  "missing-empty",
  "missing-rows",
  "missing-custom-ref",
  "null",
  "undefined",
  "empty-object",
  "required-field",
  "bad-amount",
  "bad-account",
  "bad-category",
  "numeric-id",
  "bad-source",
  "bad-createdAt",
  "transfer-category",
  "income-destination",
  "duplicate-goal",
  "metadata-infinity",
] as const;
for (const variant of cases) {
  test(`A2a ${variant}: load/backup/comandos rejeitam e preservam estado bruto`, async ({
    page,
  }) => {
    const fixture = backupFixture();
    const state: RawFixture = { ...fixture, present: true };
    const row = fixture.transactions[0] as unknown as Record<string, unknown>;
    if (variant.startsWith("missing")) state.present = false;
    if (variant === "missing-empty" || variant === "missing-completely-empty")
      state.transactions = [];
    if (variant === "missing-completely-empty") state.includeOther = false;
    if (variant === "missing-completely-empty" || variant === "missing-empty")
      state.databaseVersion = 2;
    if (variant === "missing-custom-ref") row.accountId = "custom-lost";
    if (variant === "null") state.settings = null;
    if (variant === "undefined") state.settings = undefined;
    if (variant === "empty-object") state.settings = {};
    if (variant === "required-field")
      delete (
        fixture.settings.accounts[0] as unknown as Record<string, unknown>
      ).initialBalance;
    if (variant === "bad-amount") row.amount = -1;
    if (variant === "bad-account") row.accountId = "unknown";
    if (variant === "bad-category") row.categoryId = "unknown";
    if (variant === "numeric-id") row.id = 42;
    if (variant === "bad-source") row.source = "unknown";
    if (variant === "bad-createdAt") row.createdAt = "impossible";
    if (variant === "transfer-category")
      fixture.transactions[2].categoryId = "food";
    if (variant === "income-destination") row.destinationAccountId = "reserva";
    if (variant === "duplicate-goal")
      fixture.settings.goals.push({ ...fixture.settings.goals[0] });
    if (variant === "metadata-infinity")
      Object.assign(fixture.settings, { metadata: { external: Infinity } });
    await seedLocal(page, state);
    const before = await rawLocal(page);
    if (variant === "missing-completely-empty")
      expect(before).toEqual({ transactions: [], keys: [], settings: [] });
    if (variant === "missing-empty") expect(before.keys).toEqual(["other"]);
    if (variant === "undefined") {
      expect(before.keys).toContain("personal");
      expect(before.settings[before.keys.indexOf("personal")]).toBeUndefined();
    }
    for (const operation of [
      "load",
      "backup",
      "save",
      "import",
      "settings",
    ] as const) {
      const error = await page.evaluate(async (operation) => {
        const {
          transactionRepository: r,
          transaction,
          backupFixture,
        } = window.financeAudit;
        try {
          if (operation === "load") await r.load();
          if (operation === "backup") await r.readForBackup();
          if (operation === "save")
            await r.save(transaction(), {
              kind: "create",
              expectedRevision: 0,
            });
          if (operation === "import") await r.import([transaction()], false, 0);
          if (operation === "settings")
            await r.saveSettings(backupFixture().settings, 0);
          return null;
        } catch (e) {
          const error = e as Error & { code?: string };
          return { name: error.name, code: error.code, cause: !!error.cause };
        }
      }, operation);
      expect(error, operation).not.toBeNull();
      if (operation !== "backup")
        expect(error?.code).toBe(
          variant.startsWith("missing")
            ? "missing-settings"
            : "invalid-snapshot",
        );
      if (operation === "load" && !variant.startsWith("missing"))
        expect(error?.cause).toBe(true);
      expect(await rawLocal(page), operation).toEqual(before);
    }
  });
}

test("F01: saldo 8500 nunca vira 1500 quando personal é perdido", async ({
  page,
}) => {
  const fixture = backupFixture();
  await seedLocal(page, { ...fixture, present: true });
  expect(
    await page.evaluate(async () => {
      const h = window.financeAudit;
      const s = await h.transactionRepository.load();
      return h.totalAccountBalance(
        s.snapshot.settings.accounts,
        s.snapshot.transactions,
        "2026-09-15",
      );
    }),
  ).toBe(8500);
  await seedLocal(page, { ...fixture, present: false });
  const before = await rawLocal(page);
  expect(
    await page.evaluate(async () => {
      try {
        await window.financeAudit.transactionRepository.load();
        return "accepted";
      } catch (e) {
        return (e as { code: string }).code;
      }
    }),
  ).toBe("missing-settings");
  expect(await rawLocal(page)).toEqual(before);
});

for (const timezoneId of [
  "America/Sao_Paulo",
  "Pacific/Kiritimati",
  "America/Los_Angeles",
]) {
  test(`leitura estrutural com relógio móvel: ${timezoneId}`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ timezoneId });
    try {
      const page = await context.newPage();
      await page.goto(`${baseURL}/favicon.svg`);
      await page.evaluate((code) => (0, eval)(code), bundle);
      const fixture = backupFixture();
      fixture.transactions[0].date = "2099-12-31";
      fixture.settings.accounts[0].initialBalanceDate = "2099-01-01";
      fixture.settings.goals[0].deadline = "2099-12-31";
      await seedLocal(page, { ...fixture, present: true });
      const before = await rawLocal(page);
      for (const year of [2020, 2026, 2100]) {
        await page.clock.setFixedTime(new Date(`${year}-09-15T00:30:00Z`));
        const result = await page.evaluate(async () => {
          const r = window.financeAudit.transactionRepository;
          return { load: await r.load(), backup: await r.readForBackup() };
        });
        expect(result.load).toEqual(result.backup);
        expect(result.load.snapshot.settings).toEqual(fixture.settings);
        expect(result.load.snapshot.transactions).toEqual(
          [...fixture.transactions].sort((a, b) => a.id.localeCompare(b.id)),
        );
        expect(await rawLocal(page)).toEqual(before);
      }
    } finally {
      await context.close();
    }
  });
}

test("store ausente retorna storage-unavailable sem reparar schema", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open("vertice-finance", 2);
      req.onupgradeneeded = () =>
        req.result.createObjectStore("transactions", { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    try {
      await window.financeAudit.transactionRepository.load();
      return {
        code: "accepted",
        cause: false,
        stores: [...db.objectStoreNames],
        message: "",
      };
    } catch (e) {
      const error = e as Error & { code: string };
      return {
        code: error.code,
        cause: !!error.cause,
        stores: [...db.objectStoreNames],
        message: error.message,
      };
    } finally {
      db.close();
    }
  });
  expect(result.code).toBe("storage-unavailable");
  expect(result.cause).toBe(true);
  expect(result.stores).toEqual(["transactions"]);
  expect(result.message).not.toContain("Failed to execute");
});

test("VersionError real de abertura preserva cause, mensagem segura e banco", async ({
  page,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  const before = await rawLocal(page);
  const result = await page.evaluate(async () => {
    // A newer database is only a synthetic fixture; production stays on v3.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("vertice-finance", 4);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      let error: {
        name: string;
        code?: string;
        message: string;
        nativeName?: string;
        nativeDOMException: boolean;
      } | null = null;
      try {
        await window.financeAudit.transactionRepository.load();
      } catch (cause) {
        const publicError = cause as Error & { code?: string };
        const native = (publicError.cause as Error)?.cause;
        error = {
          name: publicError.name,
          code: publicError.code,
          message: publicError.message,
          nativeName: native instanceof Error ? native.name : undefined,
          nativeDOMException: native instanceof DOMException,
        };
      }
      const raw = await new Promise((resolve, reject) => {
        const tx = db.transaction(["transactions", "settings"]);
        const rows = tx.objectStore("transactions").getAll();
        const keys = tx.objectStore("settings").getAllKeys();
        const settings = tx.objectStore("settings").getAll();
        tx.oncomplete = () =>
          resolve({
            transactions: rows.result,
            keys: keys.result,
            settings: settings.result,
          });
        tx.onabort = () => reject(tx.error);
      });
      return {
        error,
        raw,
        version: db.version,
        stores: [...db.objectStoreNames],
      };
    } finally {
      db.close();
    }
  });
  expect(result.error).toMatchObject({
    name: "LocalReadError",
    code: "storage-unavailable",
    nativeName: "VersionError",
    nativeDOMException: true,
  });
  expect(result.error?.message).toBe(
    "Não foi possível acessar os dados locais. Tente novamente; saldos e configurações estão indisponíveis.",
  );
  expect(result.raw).toEqual(before);
  expect(result.version).toBe(4);
  expect(result.stores).toEqual(["settings", "transactions"]);
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("invalid-layout");
  await expect(page.getByRole("alert")).toContainText(
    "Seus registros foram preservados",
  );
  await expect(page.getByRole("alert")).not.toContainText(
    /VersionError|requested version|existing version/,
  );
  await expect(
    page.getByRole("button", { name: "Restaurar backup JSON", exact: true }),
  ).toBeVisible();
});

for (const failure of ["sync", "abort"] as const) {
  test(`falha nativa ${failure} termina em erro seguro e permite retry`, async ({
    page,
  }) => {
    expect(
      await page.evaluate(async (failure) => {
        const r = window.financeAudit.transactionRepository;
        await r.load();
        const native = IDBObjectStore.prototype.getAll;
        IDBObjectStore.prototype.getAll = function (...args) {
          if (failure === "sync")
            throw new DOMException("technical payload", "NotFoundError");
          const req = native.apply(this, args);
          this.transaction.abort();
          return req;
        };
        let code = "accepted";
        try {
          await r.load();
        } catch (e) {
          code = (e as { code: string }).code;
        } finally {
          IDBObjectStore.prototype.getAll = native;
        }
        const after = await r.load();
        return { code, rows: after.snapshot.transactions.length };
      }, failure),
    ).toEqual({ code: "storage-unavailable", rows: 0 });
  });
}
