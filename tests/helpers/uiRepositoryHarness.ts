// Explicit UI regression harness. Historical repository specs keep repositoryHarness/v3.
export * from "./repositoryHarness";
import { transactionRepository as legacy } from "../../src/services/transactionRepository";
import { createScopedStorage } from "../../src/services/scopedStorage";
import { bindWorkspaceRepository } from "../../src/services/workspaceRepository";
import { createScopedHandle } from "../../src/utils/workspace";
import type { TransactionRepository } from "../../src/services/transactionRepository";
let scoped: ReturnType<typeof bindWorkspaceRepository> | undefined;
const engine = createScopedStorage();
let scope: string | undefined;
const BC = globalThis.BroadcastChannel;
if (BC)
  globalThis.BroadcastChannel = class extends BC {
    postMessage(message: unknown) {
      super.postMessage(
        typeof message === "string" && scope
          ? { workspaceId: scope, type: message }
          : message,
      );
    }
  };
async function target() {
  if ((await engine.inspectVersion()) !== 4) return legacy;
  if (!scoped) {
    const authority = await engine.open();
    scoped = bindWorkspaceRepository(
      engine,
      createScopedHandle(authority.defaultWorkspaceId),
    );
    scope = authority.defaultWorkspaceId;
  }
  return scoped;
}
export const transactionRepository: TransactionRepository = {
  load: async () => (await target()).load(),
  readForBackup: async () => (await target()).readForBackup(),
  save: async (row, intent) => (await target()).save(row, intent),
  remove: async (id, r) => (await target()).remove(id, r),
  import: async (rows, skip, r) => (await target()).import(rows, skip, r),
  saveSettings: async (s, r) => (await target()).saveSettings(s, r),
  removeDemo: async (r) => (await target()).removeDemo(r),
  restore: async (s, previous) => (await target()).restore(s, previous),
};
