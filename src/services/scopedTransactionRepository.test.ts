import { expect, it, vi } from "vitest";
import { createScopedStorage } from "./scopedStorage";
import { createScopedTransactionRepository } from "./scopedTransactionRepository";
import { createScopedHandle, workspaceId } from "../utils/workspace";
import type { ScopedStorage, ScopedRead } from "./scopedStorage";
import { defaultSettings } from "../data/catalog";
import type { Transaction } from "../types/finance";
const id = workspaceId("11111111-1111-4111-8111-111111111111"),
  other = workspaceId("22222222-2222-4222-8222-222222222222");
function fixture() {
  const handle = createScopedHandle(id);
  const read: ScopedRead = {
    workspaceId: id,
    revision: 0,
    snapshot: { transactions: [], settings: defaultSettings() },
  };
  const rw = vi.fn(() => {
      throw new Error("RW_MUST_NOT_OPEN");
    }),
    load = vi.fn(async () => read);
  const engine = {
    scopedTransaction: rw,
    read: load,
  } as unknown as ScopedStorage;
  return {
    handle,
    read,
    rw,
    load,
    repo: createScopedTransactionRepository(engine, handle),
  };
}
const row: Transaction = {
  id: "test",
  type: "expense",
  amount: 1,
  categoryId: "food",
  description: "test",
  accountId: "principal",
  date: "2026-09-10",
  recurring: false,
};
it("both factories are dormant, no browser globals needed at construction", () => {
  expect(createScopedStorage()).toBeDefined();
  const f = fixture();
  expect(f.rw).not.toHaveBeenCalled();
  expect(f.load).not.toHaveBeenCalled();
});
for (const writer of [
  "save",
  "remove",
  "import",
  "saveSettings",
  "removeDemo",
  "restore",
] as const)
  for (const invalid of ["lease", "scope", "disposed", "revision"] as const)
    it(`repository ${writer} rejects ${invalid} before requesting RW`, async () => {
      const f = fixture(),
        token = {
          workspaceId: invalid === "scope" ? other : id,
          expectedRevision: invalid === "revision" ? -1 : 0,
        };
      const command = {
        lease:
          invalid === "lease" ? createScopedHandle(id).lease : f.handle.lease,
        precondition: token,
      };
      if (invalid === "disposed") f.handle.dispose();
      const run =
        writer === "save"
          ? () => f.repo.save(row, "create", command)
          : writer === "remove"
            ? () => f.repo.remove("test", command)
            : writer === "import"
              ? () => f.repo.import([], true, command)
              : writer === "saveSettings"
                ? () => f.repo.saveSettings(f.read.snapshot.settings, command)
                : writer === "removeDemo"
                  ? () => f.repo.removeDemo(command)
                  : () => f.repo.restore(f.read.snapshot, f.read, command);
      await expect(run()).rejects.toThrow();
      expect(f.rw).not.toHaveBeenCalled();
    });
it("read result of a disposed lease is discarded even if storage resolves later", async () => {
  const f = fixture();
  const promise = f.repo.load();
  f.handle.dispose();
  await expect(promise).rejects.toThrow();
  expect(f.load).toHaveBeenCalledWith(id);
});
it("export delegates to unchanged v2 financial serializer, excluding operational context", async () => {
  const f = fixture(),
    json = JSON.parse(await f.repo.exportJSON());
  expect(json.version).toBe(2);
  expect(Object.keys(json).sort()).toEqual([
    "exportedAt",
    "settings",
    "transactions",
    "version",
  ]);
});
it("restore safety from identical financial A/B still rejects wrong destination before RW", async () => {
  const f = fixture();
  await expect(
    f.repo.restore(
      f.read.snapshot,
      { ...f.read, workspaceId: other },
      {
        lease: f.handle.lease,
        precondition: { workspaceId: id, expectedRevision: 0 },
      },
    ),
  ).rejects.toThrow();
  expect(f.rw).not.toHaveBeenCalled();
});
