import { describe, expect, it } from "vitest";
import type { FinanceSettings, Transaction } from "../types/finance";
import {
  SCOPED_DATABASE_VERSION,
  SCOPED_SETTINGS_KEY_PATH,
  SCOPED_TRANSACTION_KEY_PATH,
  WORKSPACE_AUTHORITY_KEY,
  WORKSPACE_INDEX,
  WORKSPACE_STORES,
  type FinancialPrecondition,
  type ScopedSettingsEnvelope,
  type ScopedTransactionEnvelope,
  type ScopedTransactionKey,
  type SessionLease,
  type WorkspaceId,
  type WorkspaceMetadata,
} from "../types/workspace";
import {
  assertSameWorkspace,
  canIncrementRevision,
  createScopedHandle,
  financialPrecondition,
  parseTransactionKey,
  scopedEnvelope,
  transactionKey,
  workspaceAuthority,
  workspaceId,
  workspaceMetadata,
  workspaceMetadataKey,
  workspaceMode,
  workspaceRevision,
} from "./workspace";

const A = workspaceId("f0ed9219-6335-4d5a-8aa0-123456789001");
const B = workspaceId("f0ed9219-6335-4d5a-8aa0-123456789002");
const metadata = { workspaceId: A, mode: "personal", revision: 17 };
const authority = {
  layout: "scoped",
  protocol: 1,
  defaultWorkspaceId: A,
  sourceVersion: 3,
};
const invalidRevisions = [
  -1,
  0.5,
  NaN,
  Infinity,
  -Infinity,
  Number.MAX_SAFE_INTEGER + 1,
  "17",
  null,
  undefined,
];

describe("B2a: WorkspaceId e mode", () => {
  it.each(["8", "9", "a", "b"])("aceita UUID v4 variante %s", (variant) => {
    const id = `f0ed9219-6335-4d5a-${variant}aa0-123456789001`;
    expect(workspaceId(id)).toBe(id);
  });
  it.each([
    "",
    " ",
    undefined,
    null,
    123,
    {},
    [],
    A.toUpperCase(),
    ` ${A}`,
    `${A}\n`,
    "not-a-uuid",
    "f0ed9219-6335-1d5a-8aa0-123456789001",
    "f0ed9219-6335-4d5a-7aa0-123456789001",
    "00000000-0000-0000-0000-000000000000",
    "f0ed921963354d5a8aa0123456789001",
  ])("rejeita WorkspaceId inválido/alias %j", (value) => {
    expect(() => workspaceId(value)).toThrow(TypeError);
  });
  it("aceita apenas personal", () =>
    expect(workspaceMode("personal")).toBe("personal"));
  it.each(["business", "investments", "Personal", "", undefined, null, 1])(
    "rejeita mode %j",
    (value) => expect(() => workspaceMode(value)).toThrow(TypeError),
  );
});

describe("B2a: authority mínima e metadata", () => {
  it.each([0, 3])("valida authority sourceVersion %i", (sourceVersion) => {
    const result = workspaceAuthority({ ...authority, sourceVersion });
    expect(result).toEqual({ ...authority, sourceVersion });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.keys(result)).toEqual([
      "layout",
      "protocol",
      "defaultWorkspaceId",
      "sourceVersion",
    ]);
  });
  it.each([
    undefined,
    null,
    [],
    {},
    { ...authority, defaultWorkspaceId: undefined },
    { layout: "scoped", protocol: 1, sourceVersion: 3 },
    { ...authority, defaultWorkspaceId: "invalid" },
    { ...authority, protocol: 2 },
    { ...authority, protocol: "1" },
    { ...authority, layout: "legacy" },
    { ...authority, sourceVersion: 1 },
    { ...authority, sourceVersion: 2 },
    { ...authority, sourceVersion: "3" },
    { ...authority, ownerKind: "local" },
    { ...authority, fenced: true },
    Object.create(authority),
  ])("rejeita authority incompleta/não suportada %j", (value) => {
    expect(() => workspaceAuthority(value)).toThrow(TypeError);
  });
  it.each([0, 17, Number.MAX_SAFE_INTEGER])(
    "preserva revisão válida %i",
    (revision) => {
      const result = workspaceMetadata({ ...metadata, revision });
      expect(result).toEqual({ ...metadata, revision });
      expect(Object.isFrozen(result)).toBe(true);
      expect(workspaceRevision(revision)).toBe(revision);
      expect(Object.keys(result)).toEqual(["workspaceId", "mode", "revision"]);
    },
  );
  it.each(invalidRevisions)("rejeita revisão inválida %j", (revision) => {
    expect(() => workspaceMetadata({ ...metadata, revision })).toThrow(
      TypeError,
    );
    expect(() => workspaceRevision(revision)).toThrow(TypeError);
  });
  it.each([
    {},
    { mode: "personal", revision: 0 },
    { ...metadata, workspaceId: B.toUpperCase() },
    { ...metadata, mode: "business" },
    { ...metadata, protocol: 1 },
    { ...metadata, layout: "scoped" },
  ])("rejeita metadata inválida/redundante %j", (value) => {
    expect(() => workspaceMetadata(value)).toThrow(TypeError);
  });
  it("MAX é leitura válida/esgotada, sem incrementar ou resetar", () => {
    const max = workspaceMetadata({
      ...metadata,
      revision: Number.MAX_SAFE_INTEGER,
    });
    expect(canIncrementRevision(max.revision)).toBe(false);
    expect(max.revision).toBe(Number.MAX_SAFE_INTEGER);
    expect(canIncrementRevision(0)).toBe(true);
    expect(canIncrementRevision(Number.MAX_SAFE_INTEGER - 1)).toBe(true);
    expect(() => canIncrementRevision(-1)).toThrow(TypeError);
  });
});

describe("B2a: envelopes raw, keys e referências locais", () => {
  it("envelope de transação conserva extras/source ausente e scope externo", () => {
    const raw = {
      id: "id-x",
      type: "expense",
      amount: 1,
      description: "Raw",
      accountId: "x",
      categoryId: "x",
      date: "2026-09-10",
      recurring: false,
      workspaceId: "historical-extra",
      mode: "business",
      extra: { note: "preservar" },
    } as const;
    const before = structuredClone(raw);
    const result: ScopedTransactionEnvelope = scopedEnvelope(A, raw);
    expect(result.workspaceId).toBe(A);
    expect(result.record).toBe(raw);
    expect(result.record).toEqual(before);
    expect(Object.hasOwn(result.record, "createdAt")).toBe(false);
    expect(Object.hasOwn(result.record, "source")).toBe(false);
    expect(Object.keys(result)).toEqual(["workspaceId", "record"]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(raw)).toBe(false);
  });
  it("settings raw preserva subcentavo/extras sem normalização", () => {
    const raw: FinanceSettings & { workspaceId: string; mode: string } = {
      accounts: [],
      categories: [],
      goals: [],
      fixedExpenses: [],
      plannedIncome: 1e-8,
      lowBalanceThreshold: 1e-8,
      workspaceId: "extra",
      mode: "extra",
    };
    const result: ScopedSettingsEnvelope = scopedEnvelope(B, raw);
    expect(result.workspaceId).toBe(B);
    expect(result.record).toBe(raw);
    expect(result.record.plannedIncome).toBe(1e-8);
    expect(raw.workspaceId).toBe("extra");
  });
  it("envelope rejeita scope forjado/record não objeto", () => {
    expect(() => scopedEnvelope("invalid" as WorkspaceId, {})).toThrow(
      TypeError,
    );
    expect(() => scopedEnvelope(A, null as unknown as Transaction)).toThrow(
      TypeError,
    );
    expect(() => scopedEnvelope(A, [])).toThrow(TypeError);
  });
  it("A/id-x e B/id-x são diferentes e determinísticos", () => {
    expect(transactionKey(A, "id-x")).not.toEqual(transactionKey(B, "id-x"));
    expect(transactionKey(A, "id-x")).toEqual(transactionKey(A, "id-x"));
    expect(parseTransactionKey([A, "id-x"])).toEqual([A, "id-x"]);
    expect(workspaceMetadataKey(A)).toEqual(["workspace", A]);
    expect(workspaceMetadataKey(B)).not.toEqual(workspaceMetadataKey(A));
  });
  it.each(["000123", "  id-x  ", "x:y", "ç/日本語"])(
    "ID financeiro permanece lossless %s",
    (id) => {
      expect(transactionKey(A, id)).toEqual([A, id]);
    },
  );
  it.each(["", " ", "\t", null, undefined, 17])(
    "rejeita ID financeiro inválido %j",
    (id) => {
      expect(() => parseTransactionKey([A, id])).toThrow(TypeError);
    },
  );
  it.each([
    null,
    undefined,
    {},
    "A:id-x",
    [],
    [A],
    [A, "id-x", 1],
    ["invalid", "id-x"],
  ])("rejeita key inválida %j", (key) =>
    expect(() => parseTransactionKey(key)).toThrow(TypeError),
  );
  it("mesmo account x exige scope capturado, sem lookup global", () => {
    const accountA = scopedEnvelope(A, { accountId: "x" });
    const accountB = scopedEnvelope(B, { accountId: "x" });
    expect(accountA.record.accountId).toBe(accountB.record.accountId);
    expect(() => assertSameWorkspace(A, accountA.workspaceId)).not.toThrow();
    expect(() => assertSameWorkspace(A, accountB.workspaceId)).toThrow(
      /Workspace divergente/,
    );
  });
  it("constantes congelam contrato futuro, sem criar stores/ranges", () => {
    expect(SCOPED_DATABASE_VERSION).toBe(4);
    expect(Object.values(WORKSPACE_STORES)).toEqual([
      "scopedTransactions",
      "scopedSettings",
      "workspaceMeta",
      "transactions",
      "settings",
    ]);
    expect(SCOPED_TRANSACTION_KEY_PATH).toEqual(["workspaceId", "record.id"]);
    expect(SCOPED_SETTINGS_KEY_PATH).toBe("workspaceId");
    expect(WORKSPACE_INDEX).toBe("byWorkspace");
    expect(WORKSPACE_AUTHORITY_KEY).toBe("authority");
    expect(Object.isFrozen(WORKSPACE_STORES)).toBe(true);
    expect(Object.isFrozen(SCOPED_TRANSACTION_KEY_PATH)).toBe(true);
  });
});

describe("B2a: precondition financeira e capability efêmera", () => {
  it.each([0, 17, Number.MAX_SAFE_INTEGER])(
    "precondition preserva scope e revisão %i",
    (expectedRevision) => {
      const input = { workspaceId: A, expectedRevision };
      const result = financialPrecondition(input);
      expect(result).toEqual(input);
      expect(Object.isFrozen(result)).toBe(true);
      expect(JSON.parse(JSON.stringify(result))).toEqual(input);
    },
  );
  it.each([
    null,
    undefined,
    {},
    { expectedRevision: 17 },
    { workspaceId: A },
    { workspaceId: "invalid", expectedRevision: 17 },
    { workspaceId: A, expectedRevision: -1 },
    { workspaceId: A, expectedRevision: 0.5 },
    { workspaceId: A, expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
    { workspaceId: A, revision: 17 },
    { workspaceId: A, expectedRevision: 17, lease: {} },
  ])("rejeita precondition ausente/inválida %j", (value) => {
    expect(() => financialPrecondition(value)).toThrow(TypeError);
  });
  it("handle ativo verifica identidade e scope, sem simular CAS/storage", () => {
    const handle = createScopedHandle(A);
    expect(handle.active).toBe(true);
    expect(handle.mode).toBe("personal");
    expect(handle.workspaceId).toBe(A);
    expect(handle.canUse(handle.lease)).toBe(true);
    expect(
      handle.assertCommand(handle.lease, {
        workspaceId: A,
        expectedRevision: 17,
      }),
    ).toEqual({ workspaceId: A, expectedRevision: 17 });
    expect(() =>
      handle.assertCommand(handle.lease, {
        workspaceId: B,
        expectedRevision: 17,
      }),
    ).toThrow(/Workspace divergente/);
    expect(() =>
      handle.assertCommand(handle.lease, { expectedRevision: 17 }),
    ).toThrow(TypeError);
    expect(Object.isFrozen(handle)).toBe(true);
  });
  it("lease não é token JSON, clone, spread nem objeto reconstruível", () => {
    const handle = createScopedHandle(A);
    expect(Object.isFrozen(handle.lease)).toBe(true);
    expect(() => JSON.stringify(handle.lease)).toThrow(/não serializar/);
    expect(() => JSON.stringify({ lease: handle.lease })).toThrow(TypeError);
    expect(() => structuredClone(handle.lease)).toThrow();
    for (const forged of [
      null,
      {},
      { ...handle.lease },
      { workspaceId: A, revision: 17 },
    ]) {
      expect(handle.canUse(forged)).toBe(false);
      expect(() => handle.assertSession(forged)).toThrow(/Lease/);
    }
  });
  it("dispose é definitivo/idempotente, incluindo métodos capturados", () => {
    const handle = createScopedHandle(A);
    const { lease, assertCommand, dispose } = handle;
    dispose();
    dispose();
    expect(handle.active).toBe(false);
    expect(handle.canUse(lease)).toBe(false);
    expect(() => handle.assertSession(lease)).toThrow(/disposed/);
    expect(() =>
      assertCommand(lease, { workspaceId: A, expectedRevision: 17 }),
    ).toThrow(/disposed/);
    expect(() => Reflect.set(handle, "active", true)).not.toThrow();
    expect(Reflect.set(handle, "active", true)).toBe(false);
    expect(handle.active).toBe(false);
  });
  it("A→B→A com mesmo R rejeita lease antiga no novo A", () => {
    const a1 = createScopedHandle(A),
      b = createScopedHandle(B);
    const precondition = { workspaceId: A, expectedRevision: 3 };
    a1.dispose();
    const a2 = createScopedHandle(A);
    expect(a1.lease).not.toBe(a2.lease);
    expect(a2.canUse(a1.lease)).toBe(false);
    expect(() => a2.assertCommand(a1.lease, precondition)).toThrow(/Lease/);
    expect(() => b.assertCommand(a1.lease, precondition)).toThrow(/Lease/);
    expect(a2.assertCommand(a2.lease, precondition)).toEqual(precondition);
  });
  it("dois handles ativos de A não compartilham capability", () => {
    const first = createScopedHandle(A),
      second = createScopedHandle(A);
    expect(() => second.assertSession(first.lease)).toThrow(/Lease/);
    first.dispose();
    expect(second.canUse(second.lease)).toBe(true);
  });
  it("callback tardio não publica nem ganha lease nova", async () => {
    const oldHandle = createScopedHandle(A),
      oldLease = oldHandle.lease;
    const originalCheck = oldHandle.assertSession;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const published: string[] = [];
    const callback = (async () => {
      await pending;
      originalCheck(oldLease);
      published.push("old");
    })();
    oldHandle.dispose();
    const newHandle = createScopedHandle(A);
    release();
    await expect(callback).rejects.toThrow(/disposed/);
    expect(published).toEqual([]);
    expect(newHandle.canUse(oldLease)).toBe(false);
    expect(newHandle.canUse(newHandle.lease)).toBe(true);
  });
  it("handle rejeita scope/mode forjados no runtime", () => {
    expect(() => createScopedHandle("invalid" as WorkspaceId)).toThrow(
      TypeError,
    );
    expect(() => createScopedHandle(A, "business" as "personal")).toThrow(
      TypeError,
    );
  });
});

// Compiled by tsc -b, never executed: brands/readonly guard accidental mixing.
function compileTimeContracts(id: WorkspaceId, meta: WorkspaceMetadata) {
  // @ts-expect-error raw strings are not a WorkspaceId
  const rawId: WorkspaceId = "raw";
  // @ts-expect-error numbers are not a WorkspaceId
  const numericId: WorkspaceId = 17;
  const precondition: FinancialPrecondition = {
    // @ts-expect-error financial preconditions require a branded scope
    workspaceId: "raw",
    expectedRevision: 0,
  };
  // @ts-expect-error raw scope is not a composite key
  const key: ScopedTransactionKey = ["raw", "x"];
  // @ts-expect-error lease cannot be reconstructed from a financial scope/revision
  const lease: SessionLease = { workspaceId: id, revision: 17 };
  // @ts-expect-error mode is immutable
  meta.mode = "personal";
  void [rawId, numericId, precondition, key, lease];
}
void compileTimeContracts;
