import { describe, expect, it } from "vitest";
import {
  sameRaw,
  OpenAttempt,
  ScopedStorageError,
  storageError,
  legacyRevision,
  rawSnapshot,
  validateLayout,
} from "./scopedStorageProtocol";
import { defaultSettings } from "../data/catalog";
describe("B2b storage protocol", () => {
  it.each([0, 17, Number.MAX_SAFE_INTEGER])("legacy revision %s", (revision) =>
    expect(legacyRevision({ protocol: 1, revision })).toBe(revision),
  );
  it.each([
    undefined,
    null,
    {},
    { protocol: 2, revision: 0 },
    { protocol: 1, revision: -1 },
    { protocol: 1, revision: NaN },
    { protocol: 1, revision: 1.5 },
    { protocol: 1, revision: Number.MAX_SAFE_INTEGER + 1 },
  ])("reject legacy metadata %j", (value) =>
    expect(() => legacyRevision(value)).toThrow(ScopedStorageError),
  );
  it("attempt identity rejects old callbacks independently from new retry", () => {
    const old = new OpenAttempt(),
      retry = new OpenAttempt();
    expect(old.usable(old)).toBe(true);
    old.cancel();
    old.cancel();
    expect(old.usable(old)).toBe(false);
    expect(old.usable(retry)).toBe(false);
    expect(retry.usable(retry)).toBe(true);
  });
  it.each([
    "quota",
    "stale-state",
    "blocked",
    "invalid-authority",
    "stale-safety",
    "revision-exhausted",
  ] as const)("typed error %s", (code) => {
    const e = new ScopedStorageError(code, new Error("cause"));
    expect(storageError(e)).toBe(e);
    expect(e.code).toBe(code);
    expect(e.cause).toBeInstanceOf(Error);
  });
  it("native quota classification", () =>
    expect(
      storageError(new DOMException("quota", "QuotaExceededError")).code,
    ).toBe("quota"));
  it.each([
    [{ a: undefined }, {}],
    [-0, 0],
    [{ raw: 1e-8 }, { raw: 0 }],
    [
      [1, 2],
      [2, 1],
    ],
    [{ a: 1 }, { a: 1, b: 2 }],
    [new Date(0), new Date(1)],
    [new Uint8Array([1]), new Uint8Array([2])],
  ])("raw mismatch", (a, b) => expect(sameRaw(a, b)).toBe(false));
  it.each([
    [
      { a: 1, b: [{ raw: 1e-8 }] },
      { b: [{ raw: 1e-8 }], a: 1 },
    ],
    [
      ["000é", undefined],
      ["000é", undefined],
    ],
    [new Date(0), new Date(0)],
    [new Uint8Array([1]), new Uint8Array([1])],
  ])("raw equality", (a, b) => expect(sameRaw(a, b)).toBe(true));
  it("validation returns original financial DTO preserving raw identity", () => {
    const settings = { ...defaultSettings(), extra: { raw: 1e-8 } };
    settings.accounts[0].initialBalance = 1e-8;
    const snapshot = { settings, transactions: [] };
    expect(rawSnapshot(snapshot)).toBe(snapshot);
    expect(snapshot.settings.accounts[0].initialBalance).toBe(1e-8);
  });
  it("invalid snapshot is never defaulted", () =>
    expect(() =>
      rawSnapshot({ settings: null, transactions: [] } as never),
    ).toThrow());
  it("archive maps and sets compare actual contents, not empty own keys", () => {
    expect(sameRaw(new Map([["k", 1]]), new Map([["k", 2]]))).toBe(false);
    expect(sameRaw(new Set([1]), new Set([2]))).toBe(false);
    expect(
      sameRaw(new Map([["k", { raw: 1e-8 }]]), new Map([["k", { raw: 1e-8 }]])),
    ).toBe(true);
  });
  it("cyclic unknown archive keys can be compared without an endless recursion", () => {
    const a: Record<string, unknown> = { value: 1 };
    a.self = a;
    const b: Record<string, unknown> = { value: 1 };
    b.self = b;
    expect(sameRaw(a, b)).toBe(true);
    b.value = 2;
    expect(sameRaw(a, b)).toBe(false);
  });
  it("layout accepts exactly uniform stores/keys/index", () => {
    const stores: Record<
      string,
      {
        keyPath: string | string[] | null;
        autoIncrement: boolean;
        indexNames: string[];
        index?: () => unknown;
      }
    > = {
      scopedTransactions: {
        keyPath: ["workspaceId", "record.id"],
        autoIncrement: false,
        indexNames: ["byWorkspace"],
        index: () => ({
          keyPath: "workspaceId",
          unique: false,
          multiEntry: false,
        }),
      },
      scopedSettings: {
        keyPath: "workspaceId",
        autoIncrement: false,
        indexNames: [],
      },
      workspaceMeta: { keyPath: null, autoIncrement: false, indexNames: [] },
      transactions: { keyPath: "id", autoIncrement: false, indexNames: [] },
      settings: { keyPath: null, autoIncrement: false, indexNames: [] },
    };
    const db = {
      version: 4,
      objectStoreNames: Object.keys(stores),
    } as unknown as IDBDatabase;
    const tx = {
      objectStore: (name: string) => stores[name],
    } as unknown as IDBTransaction;
    expect(() => validateLayout(db, tx)).not.toThrow();
    stores.scopedTransactions.keyPath = ["workspaceId", "transactionId"];
    expect(() => validateLayout(db, tx)).toThrow(ScopedStorageError);
    stores.scopedTransactions.keyPath = ["workspaceId", "record.id"];
    stores.scopedTransactions.index = () => ({
      keyPath: "workspaceId",
      unique: true,
      multiEntry: false,
    });
    expect(() => validateLayout(db, tx)).toThrow(ScopedStorageError);
  });
});
