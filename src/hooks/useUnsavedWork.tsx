import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { cleanWork, workRegistry, type WorkFlags } from "./unsavedWork";

export function useUnsavedWork(scope = "modal") {
  const id = useId();
  const [owner] = useState(() => {
    const lease = {};
    let flags = { ...cleanWork };
    return {
      get: () => flags,
      set(patch: Partial<WorkFlags>) {
        flags = { ...flags, ...patch };
        workRegistry.update(id, lease, flags);
      },
      mount() {
        workRegistry.register(id, lease, scope, flags);
      },
      unmount() {
        workRegistry.remove(id, lease);
      },
    };
  });
  useLayoutEffect(() => {
    owner.mount();
    return owner.unmount;
  }, [owner]);
  return owner;
}
export type WorkOwner = ReturnType<typeof useUnsavedWork>;
export function useWorkFlags() {
  useSyncExternalStore(workRegistry.subscribe, workRegistry.version);
  return workRegistry.read();
}
export function useBeforeUnload() {
  useLayoutEffect(() => {
    let installed = false;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const sync = () => {
      const flags = workRegistry.read();
      const needed = flags.hasUnsavedWork || flags.busy;
      if (needed === installed) return;
      installed = needed;
      if (needed) window.addEventListener("beforeunload", prevent);
      else window.removeEventListener("beforeunload", prevent);
    };
    const unsubscribe = workRegistry.subscribe(sync);
    sync();
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", prevent);
    };
  }, []);
}
export function useInvalidated(invalidate: boolean) {
  const ref = useRef(false);
  if (invalidate) ref.current = true;
  return ref;
}
