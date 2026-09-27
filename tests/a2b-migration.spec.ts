import { expect, test } from "@playwright/test";
import { backupFixture } from "./helpers/backupFixture";
import { rawLocal, repositoryBundle, seedLocal } from "./helpers/localData";

let bundle: string;
test.beforeAll(async () => {
  bundle = await repositoryBundle();
});
test.beforeEach(async ({ page }) => {
  await page.goto("/favicon.svg");
  await page.evaluate((code) => (0, eval)(code), bundle);
});

test("v2 válida preserva bytes financeiros e outras keys; fence rejeita cliente v2", async ({
  page,
}) => {
  const fixture = backupFixture();
  await seedLocal(page, { ...fixture, present: true, databaseVersion: 2 });
  const before = await rawLocal(page);
  const loaded = await page.evaluate(() =>
    window.financeAudit.transactionRepository.load(),
  );
  const after = await rawLocal(page);
  expect(loaded.revision).toBe(0);
  expect(after.transactions).toEqual(before.transactions);
  expect(after.keys).toEqual(["__vertice_local_concurrency__", ...before.keys]);
  expect(after.settings).toEqual([
    { protocol: 1, revision: 0 },
    ...before.settings,
  ]);
  expect(
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const old = indexedDB.open("vertice-finance", 2);
          old.onerror = () => resolve(old.error?.name);
          old.onsuccess = () => {
            old.result.close();
            resolve("accepted");
          };
        }),
    ),
  ).toBe("VersionError");
});

for (const fault of [
  "missing",
  "personal",
  "row",
  "collision",
  "abort",
] as const) {
  test(`v2 ${fault}: aborta upgrade e preserva versão e conteúdo`, async ({
    page,
  }) => {
    const fixture = backupFixture();
    const state = {
      ...fixture,
      settings: fixture.settings as unknown,
      present: fault !== "missing",
      databaseVersion: 2 as const,
      metadataPresent: fault === "collision",
      metadata: { arbitrary: true },
    };
    if (fault === "personal") state.settings = {};
    if (fault === "row") fixture.transactions[0].source = "invalid" as "manual";
    await seedLocal(page, state);
    const before = await rawLocal(page);
    const result = await page.evaluate(async (fault) => {
      const add = IDBObjectStore.prototype.add;
      if (fault === "abort")
        IDBObjectStore.prototype.add = function (...args) {
          const req = add.apply(this, args);
          if (args[1] === "__vertice_local_concurrency__")
            this.transaction.abort();
          return req;
        };
      let rejected = false;
      try {
        await window.financeAudit.transactionRepository.load();
      } catch {
        rejected = true;
      } finally {
        IDBObjectStore.prototype.add = add;
      }
      const version = await new Promise<number>((resolve) => {
        const req = indexedDB.open("vertice-finance");
        req.onsuccess = () => {
          const v = req.result.version;
          req.result.close();
          resolve(v);
        };
      });
      return { rejected, version };
    }, fault);
    expect(result).toEqual({ rejected: true, version: 2 });
    expect(await rawLocal(page)).toEqual(before);
    if (fault === "abort")
      expect(
        (
          await page.evaluate(() =>
            window.financeAudit.transactionRepository.load(),
          )
        ).revision,
      ).toBe(0);
  });
}

for (const fault of [
  "missing",
  "null",
  "array",
  "empty",
  "protocol",
  "negative",
  "fraction",
  "infinity",
  "unsafe",
] as const) {
  test(`v3 metadata ${fault}: leitura e writer rejeitam sem repair`, async ({
    page,
  }) => {
    const metadata: Record<string, unknown> = {
      null: null,
      array: [],
      empty: {},
      protocol: { protocol: 2, revision: 0 },
      negative: { protocol: 1, revision: -1 },
      fraction: { protocol: 1, revision: 0.5 },
      infinity: { protocol: 1, revision: Infinity },
      unsafe: { protocol: 1, revision: Number.MAX_SAFE_INTEGER + 1 },
    };
    await seedLocal(page, {
      ...backupFixture(),
      present: true,
      metadataPresent: fault !== "missing",
      metadata: metadata[fault],
    });
    const before = await rawLocal(page);
    expect(
      await page.evaluate(async () => {
        const { transactionRepository: r, transaction } = window.financeAudit;
        const codes = [];
        for (const op of [
          () => r.load(),
          () => r.readForBackup(),
          () => r.save(transaction(), { kind: "create", expectedRevision: 0 }),
        ]) {
          try {
            await op();
            codes.push("accepted");
          } catch (e) {
            codes.push((e as { code: string }).code);
          }
        }
        return codes;
      }),
    ).toEqual(["invalid-snapshot", "invalid-snapshot", "invalid-snapshot"]);
    expect(await rawLocal(page)).toEqual(before);
  });
}

test("blocked: duas conexões v2, falha segura, sem upgrade tardio e retry explícito", async ({
  page,
  context,
}) => {
  await seedLocal(page, {
    ...backupFixture(),
    present: true,
    databaseVersion: 2,
  });
  const before = await rawLocal(page);
  const other = await context.newPage();
  await other.goto("/favicon.svg");
  await other.evaluate(async () => {
    const connections: IDBDatabase[] = [];
    for (let i = 0; i < 2; i++)
      connections.push(
        await new Promise<IDBDatabase>((resolve) => {
          const req = indexedDB.open("vertice-finance", 2);
          req.onsuccess = () => resolve(req.result);
        }),
      );
    Object.assign(window, {
      closeOld: () => connections.forEach((db) => db.close()),
    });
  });
  expect(
    await page.evaluate(async () => {
      try {
        await window.financeAudit.transactionRepository.load();
        return "accepted";
      } catch (e) {
        return (e as { code: string }).code;
      }
    }),
  ).toBe("upgrade-blocked");
  await other.evaluate(() =>
    (window as unknown as { closeOld: () => void }).closeOld(),
  );
  // This open is queued behind the abandoned upgrade request; success proves it settled.
  expect(
    await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const req = indexedDB.open("vertice-finance");
          req.onsuccess = () => {
            const v = req.result.version;
            req.result.close();
            resolve(v);
          };
        }),
    ),
  ).toBe(2);
  expect(await rawLocal(page)).toEqual(before);
  expect(
    (
      await page.evaluate(() =>
        window.financeAudit.transactionRepository.load(),
      )
    ).revision,
  ).toBe(0);
});

test("versionchange fecha conexão A2b e próxima leitura preserva VersionError", async ({
  page,
  context,
}) => {
  await page.evaluate(() => window.financeAudit.transactionRepository.load());
  const other = await context.newPage();
  await other.goto("/favicon.svg");
  await other.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("vertice-finance", 4);
        req.onsuccess = () => {
          req.result.close();
          resolve();
        };
        req.onerror = () => reject(req.error);
      }),
  );
  expect(
    await page.evaluate(async () => {
      try {
        await window.financeAudit.transactionRepository.load();
        return "accepted";
      } catch (e) {
        return ((e as Error).cause as Error & { cause: Error }).cause.name;
      }
    }),
  ).toBe("VersionError");
});
