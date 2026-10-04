export type WorkFlags = {
  hasUnsavedWork: boolean;
  busy: boolean;
  invalidated: boolean;
};
export const cleanWork: WorkFlags = {
  hasUnsavedWork: false,
  busy: false,
  invalidated: false,
};

// Indicators only. A lease prevents an obsolete component from removing a replacement.
export function createWorkRegistry() {
  const entries = new Map<
    string,
    { lease: object; scope: string; flags: WorkFlags }
  >();
  const listeners = new Set<() => void>();
  let version = 0;
  const publish = () => {
    version++;
    listeners.forEach((fn) => fn());
  };
  return {
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    version: () => version,
    register(id: string, lease: object, scope: string, flags: WorkFlags) {
      entries.set(id, { lease, scope, flags });
      publish();
    },
    update(id: string, lease: object, flags: WorkFlags) {
      const entry = entries.get(id);
      if (!entry || entry.lease !== lease) return;
      if (
        Object.keys(cleanWork).every(
          (key) =>
            entry.flags[key as keyof WorkFlags] ===
            flags[key as keyof WorkFlags],
        )
      )
        return;
      entry.flags = flags;
      publish();
    },
    remove(id: string, lease: object) {
      if (entries.get(id)?.lease !== lease) return;
      entries.delete(id);
      publish();
    },
    read(scope?: string): WorkFlags {
      const values = [...entries.values()].filter(
        (entry) => !scope || entry.scope === scope,
      );
      return {
        hasUnsavedWork: values.some((entry) => entry.flags.hasUnsavedWork),
        busy: values.some((entry) => entry.flags.busy),
        invalidated: values.some((entry) => entry.flags.invalidated),
      };
    },
  };
}
export const workRegistry = createWorkRegistry();

// Property order is irrelevant, but array order and UI strings are significant.
export function editableKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(editableKey).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${editableKey(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
