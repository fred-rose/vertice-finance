import { expect, it, vi } from "vitest";
import { createStorageBootstrap } from "./storageBootstrap";
import type { ScopedStorage, MigrationPreflight } from "./scopedStorage";
import { defaultSettings } from "../data/catalog";
import { workspaceId } from "../utils/workspace";
import { ScopedStorageError } from "./scopedStorageProtocol";
const id = workspaceId("11111111-1111-4111-8111-111111111111");
function fixture(version = 3) {
  const safety: MigrationPreflight = {
    sourceVersion: version === 0 ? 0 : 3,
    safetyJSON: version === 0 ? undefined : '{"version":2}',
  };
  const read = {
    workspaceId: id,
    revision: 0,
    snapshot: { settings: defaultSettings(), transactions: [] },
  };
  let invalidate = () => {};
  const engine = {
    inspectVersion: vi.fn(async () => version),
    preflight: vi.fn(async () => safety),
    open: vi.fn(async () => ({
      layout: "scoped",
      protocol: 1,
      defaultWorkspaceId: id,
      sourceVersion: version === 0 ? 0 : 3,
    })),
    read: vi.fn(async () => read),
    cancel: vi.fn(),
    close: vi.fn(),
    subscribeInvalidation: vi.fn((fn: () => void) => {
      invalidate = fn;
      return () => {};
    }),
  } as unknown as ScopedStorage;
  const flags = { busy: false, hasUnsavedWork: false, invalidated: false };
  const boot = createStorageBootstrap(engine, () => flags);
  return { boot, engine, safety, flags, invalidate: () => invalidate() };
}
it.each([0, 4])(
  "fresh/existing %s publishes only after validated engine read",
  async (version) => {
    const f = fixture(version);
    await f.boot.start();
    expect(f.boot.getState().status).toBe("ready");
    expect(f.engine.read).toHaveBeenCalled();
    if (version === 4) expect(f.engine.preflight).not.toHaveBeenCalled();
    f.boot.dispose();
  },
);
it.each([1, 2, 3])(
  "legacy %s stops at required and reuses B2b engine",
  async (version) => {
    const f = fixture(version);
    await f.boot.start();
    expect(f.boot.getState().status).toBe("migration-required");
    expect(f.engine.open).not.toHaveBeenCalled();
    f.boot.dispose();
  },
);
it("future version never opens/writes/defaults", async () => {
  const f = fixture(5);
  await f.boot.start();
  expect(f.boot.getState().status).toBe("recovery");
  expect(f.engine.open).not.toHaveBeenCalled();
  f.boot.dispose();
});
it.each([false, true])(
  "confirmation %s cannot replace download delivery",
  async (confirmed) => {
    const f = fixture();
    await f.boot.start();
    await f.boot.promote(confirmed);
    expect(f.engine.open).not.toHaveBeenCalled();
    expect(f.boot.getState().status).toBe("recovery");
    f.boot.dispose();
  },
);
it("download failure cannot authorize promotion", async () => {
  const f = fixture();
  await f.boot.start();
  expect(() =>
    f.boot.downloadSafety(() => {
      throw Error("download");
    }),
  ).toThrow();
  await f.boot.promote(true);
  expect(f.engine.open).not.toHaveBeenCalled();
  f.boot.dispose();
});
it("dirty after safety blocks promotion, resolving dirty requires new safety", async () => {
  const f = fixture();
  await f.boot.start();
  f.boot.downloadSafety(() => {});
  f.flags.hasUnsavedWork = true;
  await f.boot.promote(true);
  expect(f.engine.open).not.toHaveBeenCalled();
  f.flags.hasUnsavedWork = false;
  await f.boot.start();
  await f.boot.promote(true);
  expect(f.engine.open).not.toHaveBeenCalled();
  f.boot.dispose();
});
it("busy before start blocks preflight and all writes", async () => {
  const f = fixture();
  f.flags.busy = true;
  await f.boot.start();
  expect(f.engine.preflight).not.toHaveBeenCalled();
  expect(f.engine.open).not.toHaveBeenCalled();
  f.boot.dispose();
});
it("download + confirmation opens with same issued safety; recapture revokes old lease", async () => {
  const f = fixture();
  await f.boot.start();
  const deliver = vi.fn();
  f.boot.downloadSafety(deliver);
  await f.boot.promote(true);
  expect(f.engine.open).toHaveBeenCalledWith(f.safety);
  const first = f.boot.getState();
  if (first.status !== "ready") throw Error("ready");
  f.boot.recapture();
  const next = f.boot.getState();
  if (next.status !== "ready") throw Error("ready");
  expect(next.context.workspaceId).toBe(first.context.workspaceId);
  expect(first.context.repository.handle.active).toBe(false);
  expect(next.context.repository.handle.lease).not.toBe(
    first.context.repository.handle.lease,
  );
  await expect(first.context.repository.load()).rejects.toThrow(
    ScopedStorageError,
  );
  f.boot.dispose();
});
it("native versionchange disposes old context and produces recovery without rebind", async () => {
  const f = fixture(4);
  await f.boot.start();
  const ready = f.boot.getState();
  if (ready.status !== "ready") throw Error("ready");
  f.invalidate();
  expect(ready.context.repository.handle.active).toBe(false);
  expect(f.boot.getState().status).toBe("recovery");
  f.boot.dispose();
});
it("cancel late startup result cannot publish context", async () => {
  const f = fixture(4);
  let release!: (version: number) => void;
  vi.mocked(f.engine.inspectVersion).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = f.boot.start();
  f.boot.cancel();
  release(4);
  await pending;
  expect(f.boot.getState().status).toBe("recovery");
  expect(f.engine.open).not.toHaveBeenCalled();
  f.boot.dispose();
});
