import { createRoot } from "react-dom/client";
import { createElement, useLayoutEffect } from "react";
import { useTransactions } from "../../src/hooks/useTransactions";
import { createScopedStorage } from "../../src/services/scopedStorage";
import {
  bindWorkspaceRepository,
  type WorkspaceRepository,
} from "../../src/services/workspaceRepository";
import {
  createScopedHandle,
  workspaceId,
  workspaceMetadataKey,
  scopedEnvelope,
} from "../../src/utils/workspace";
import { transactionCompletion } from "../../src/services/scopedStorageProtocol";
import type { WorkspaceId } from "../../src/types/workspace";
export async function startSessionHarness() {
  const engine = createScopedStorage(),
    manifest = await engine.open(await engine.preflight());
  const a = manifest.defaultWorkspaceId,
    b = workspaceId("22222222-2222-4222-8222-222222222222");
  const settings = (await engine.read(a)).snapshot.settings;
  const tx = engine.scopedTransaction("readwrite"),
    done = transactionCompletion(tx).done;
  tx.objectStore("workspaceMeta").add(
    { workspaceId: b, mode: "personal", revision: 0 },
    workspaceMetadataKey(b),
  );
  tx.objectStore("scopedSettings").add(
    scopedEnvelope(b, { ...settings, plannedIncome: 12345 }),
  );
  await done;
  const root = createRoot(document.getElementById("root")!);
  let repo = bindWorkspaceRepository(engine, createScopedHandle(a)),
    finance!: ReturnType<typeof useTransactions>;
  let release: (() => void) | undefined,
    delay = false,
    waiting = false,
    reads = 0;
  const delayedEngine = {
    ...engine,
    async read(id: WorkspaceId) {
      reads++;
      const value = await engine.read(id);
      if (delay) {
        delay = false;
        waiting = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        waiting = false;
      }
      return value;
    },
  };
  function switchTo(id: WorkspaceId) {
    repo.handle.dispose();
    repo = bindWorkspaceRepository(delayedEngine, createScopedHandle(id));
    render();
  }
  repo.handle.dispose();
  repo = bindWorkspaceRepository(delayedEngine, createScopedHandle(a));
  const rotate = () => switchTo(repo.handle.workspaceId),
    failure = () => {};
  function View({ repository }: { repository: WorkspaceRepository }) {
    const f = useTransactions(repository, rotate, failure);
    useLayoutEffect(() => {
      finance = f;
    });
    return createElement(
      "p",
      { "data-testid": "session-view" },
      f.snapshot ? String(f.snapshot.settings.plannedIncome) : "loading",
    );
  }
  function render() {
    root.render(createElement(View, { repository: repo }));
  }
  render();
  return {
    a,
    b,
    switchTo,
    delayNext() {
      delay = true;
    },
    release() {
      release?.();
    },
    get waiting() {
      return waiting;
    },
    get reads() {
      return reads;
    },
    get finance() {
      return finance;
    },
    get repo() {
      return repo;
    },
    async raw(id: WorkspaceId) {
      return engine.read(id);
    },
    close() {
      repo.handle.dispose();
      root.unmount();
      engine.close();
    },
  };
}

export async function restoreExternally(id: WorkspaceId) {
  const engine = createScopedStorage();
  await engine.open();
  const repository = bindWorkspaceRepository(engine, createScopedHandle(id));
  try {
    const safety = await repository.readForBackup();
    return await repository.restore(safety.snapshot, safety);
  } finally {
    repository.handle.dispose();
    engine.close();
  }
}
