import { describe, expect, it } from "vitest";
import { cleanWork, createWorkRegistry, editableKey } from "./unsavedWork";
describe("A2c indicators and ownership", () => {
  it("reads edits synchronously, aggregates owners and separates busy", () => {
    const registry = createWorkRegistry(),
      a = {},
      b = {};
    registry.register("a", a, "settings", cleanWork);
    registry.register("b", b, "modal", cleanWork);
    let seen = false;
    const unsubscribe = registry.subscribe(() => {
      seen = registry.read().hasUnsavedWork;
    });
    registry.update("a", a, { ...cleanWork, hasUnsavedWork: true });
    expect(seen).toBe(true);
    registry.update("b", b, { ...cleanWork, busy: true });
    registry.remove("a", a);
    expect(registry.read()).toEqual({ ...cleanWork, busy: true });
    registry.remove("b", b);
    unsubscribe();
    expect(registry.read()).toEqual(cleanWork);
  });
  it("obsolete cleanup or updates cannot replace another lease; StrictMode remount works", () => {
    const registry = createWorkRegistry(),
      old = {},
      next = {};
    registry.register("same", old, "settings", cleanWork);
    registry.remove("same", old);
    registry.register("same", old, "settings", {
      ...cleanWork,
      hasUnsavedWork: true,
    });
    expect(registry.read("settings").hasUnsavedWork).toBe(true);
    registry.register("same", next, "settings", {
      ...cleanWork,
      hasUnsavedWork: true,
      invalidated: true,
    });
    registry.remove("same", old);
    registry.update("same", old, cleanWork);
    expect(registry.read()).toEqual({
      ...cleanWork,
      hasUnsavedWork: true,
      invalidated: true,
    });
  });
});
describe("editable comparison", () => {
  it.each(["", "0", "0,00", "01", "1.00"])(
    "preserves UI representation %j",
    (value) => {
      expect(editableKey({ amount: value })).not.toBe(
        editableKey({ amount: 0 }),
      );
    },
  );
  it("object property order does not matter; list order and IDs do", () => {
    expect(editableKey({ name: "A", id: "a" })).toBe(
      editableKey({ id: "a", name: "A" }),
    );
    expect(editableKey([{ id: "a" }, { id: "b" }])).not.toBe(
      editableKey([{ id: "b" }, { id: "a" }]),
    );
  });
  it.each([
    "type",
    "category",
    "destination",
    "recurring",
    "date",
    "description",
    "amount",
    "account",
  ])("detects and undoes %s without changing the base", (field) => {
    const base = {
      type: "expense",
      category: "a",
      destination: "",
      recurring: "",
      date: "2026-09-15",
      description: "",
      amount: "",
      account: "a",
    };
    const key = editableKey(base);
    expect(editableKey({ ...base, [field]: "changed" })).not.toBe(key);
    expect(editableKey({ ...base })).toBe(key);
  });
});
