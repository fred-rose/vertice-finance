import {
  createScopedStorage,
  type MigrationPreflight,
  type ScopedStorage,
} from "./scopedStorage";
import { ScopedStorageError, storageError } from "./scopedStorageProtocol";
import { createScopedHandle } from "../utils/workspace";
import {
  bindWorkspaceRepository,
  type WorkspaceRepository,
} from "./workspaceRepository";
import { workRegistry } from "../hooks/unsavedWork";
import type { WorkspaceId } from "../types/workspace";

export interface PersonalContext {
  workspaceId: WorkspaceId;
  mode: "personal";
  repository: WorkspaceRepository;
}
export type BootState =
  | { status: "loading" | "migrating" }
  | {
      status: "migration-required";
      sourceVersion: number;
      safety: MigrationPreflight;
    }
  | { status: "ready"; context: PersonalContext }
  | { status: "recovery"; error: Error };
export function createStorageBootstrap(
  engine: ScopedStorage = createScopedStorage(),
  guards = () => workRegistry.read(),
) {
  let generation = 0,
    state: BootState = { status: "loading" },
    context: PersonalContext | undefined;
  const busyId = "storage-bootstrap-" + crypto.randomUUID(),
    busyLease = {};
  const busy = () =>
    workRegistry.register(busyId, busyLease, "storage-bootstrap", {
      hasUnsavedWork: false,
      busy: true,
      invalidated: false,
    });
  const idle = () => workRegistry.remove(busyId, busyLease);
  let delivered: MigrationPreflight | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: BootState) => {
    state = next;
    listeners.forEach((fn) => fn());
  };
  const allowed = () => {
    const flags = guards();
    if (flags.busy || flags.hasUnsavedWork)
      throw new ScopedStorageError(
        "migration-aborted",
        new Error("UNSAVED_WORK"),
      );
  };
  const disposeContext = () => context?.repository.handle.dispose();
  const unsubscribe = engine.subscribeInvalidation(() => {
    disposeContext();
    publish({ status: "recovery", error: new ScopedStorageError("closed") });
  });
  async function ready(attempt: number, safety?: MigrationPreflight) {
    const authority = await engine.open(safety);
    if (attempt !== generation) return;
    const handle = createScopedHandle(authority.defaultWorkspaceId);
    const repository = bindWorkspaceRepository(engine, handle);
    try {
      await repository.load();
    } catch (error) {
      handle.dispose();
      throw error;
    }
    if (attempt !== generation) {
      handle.dispose();
      return;
    }
    disposeContext();
    context = {
      workspaceId: handle.workspaceId,
      mode: handle.mode,
      repository,
    };
    delivered = undefined;
    publish({ status: "ready", context });
  }
  async function start() {
    const attempt = ++generation;
    delivered = undefined;
    disposeContext();
    engine.close();
    publish({ status: "loading" });
    try {
      const version = await engine.inspectVersion();
      if (attempt !== generation) return;
      if (version > 4) throw new ScopedStorageError("unsupported-version");
      if (version === 4) {
        await ready(attempt);
        return;
      }
      allowed();
      busy();
      let safety: MigrationPreflight;
      try {
        safety = await engine.preflight();
      } finally {
        idle();
      }
      if (attempt !== generation) return;
      if (version === 0 && safety.sourceVersion === 0) {
        allowed();
        busy();
        try {
          await ready(attempt, safety);
        } finally {
          idle();
        }
        return;
      }
      publish({ status: "migration-required", sourceVersion: version, safety });
    } catch (error) {
      if (attempt === generation)
        publish({ status: "recovery", error: storageError(error) });
    }
  }
  function downloadSafety(download: (json: string) => void) {
    allowed();
    if (state.status !== "migration-required" || !state.safety.safetyJSON)
      throw new ScopedStorageError("stale-safety");
    delivered = undefined;
    download(state.safety.safetyJSON);
    delivered = state.safety;
  }
  async function promote(confirmed: boolean) {
    if (state.status !== "migration-required") return;
    const safety = state.safety;
    const attempt = ++generation;
    try {
      allowed();
      if (!confirmed || delivered !== safety)
        throw new ScopedStorageError("stale-safety");
      busy();
      publish({ status: "migrating" });
      await ready(attempt, safety);
    } catch (error) {
      delivered = undefined;
      if (attempt === generation)
        publish({ status: "recovery", error: storageError(error) });
    } finally {
      idle();
    }
  }
  function cancel() {
    ++generation;
    delivered = undefined;
    engine.cancel();
    publish({
      status: "recovery",
      error: new ScopedStorageError("migration-aborted"),
    });
  }
  function recapture() {
    if (!context || state.status !== "ready") return;
    const handle = createScopedHandle(context.workspaceId);
    disposeContext();
    context = {
      ...context,
      repository: bindWorkspaceRepository(engine, handle),
    };
    publish({ status: "ready", context });
  }
  function recover(error: Error) {
    ++generation;
    disposeContext();
    engine.close();
    publish({ status: "recovery", error });
  }
  return {
    recover,
    getState: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    start,
    promote,
    downloadSafety,
    cancel,
    recapture,
    dispose() {
      ++generation;
      disposeContext();
      engine.close();
      idle();
      unsubscribe();
      listeners.clear();
    },
  };
}
