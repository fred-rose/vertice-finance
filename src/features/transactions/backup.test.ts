import { describe, expect, it } from "vitest";
import { backupFixture } from "../../../tests/helpers/backupFixture";
import {
  backupPreview,
  parseBackup,
  sameBackupSnapshot,
  serializeBackup,
  type BackupV2,
} from "./backup";
import { validateSettings, validateTransaction } from "./validation";

describe("Contrato de backup JSON v2", () => {
  it("preserva IDs, campos, origem, abertura, metas e campos adicionais no roundtrip", () => {
    const backup = backupFixture();
    Object.assign(backup.transactions[0], {
      metadata: { legacy: "preservar", nested: [1, null, false] },
    });
    Object.assign(backup.settings, { existingMetadata: "preservar" });
    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed.settings).toEqual(backup.settings);
    expect(parsed.transactions).toEqual(backup.transactions);
    expect(sameBackupSnapshot(backup, parsed)).toBe(true);
  });
  it("gera prévia com contagens e intervalo sem alterar o snapshot", () => {
    const backup = backupFixture();
    backup.transactions[1].date = "2026-09-01";
    const before = structuredClone(backup);
    expect(backupPreview(backup)).toEqual({
      version: 2,
      exportedAt: backup.exportedAt,
      accounts: 2,
      categories: 7,
      goals: 1,
      transactions: 3,
      firstDate: "2026-09-01",
      lastDate: "2026-09-10",
    });
    expect(backup).toEqual(before);
  });
  it("aceita vazio e campos técnicos opcionais ausentes no contrato legado", () => {
    const backup = backupFixture();
    delete backup.transactions[0].createdAt;
    delete backup.transactions[0].source;
    expect(parseBackup(JSON.stringify(backup)).transactions[0]).toEqual(
      backup.transactions[0],
    );
    backup.transactions = [];
    expect(
      backupPreview(parseBackup(JSON.stringify(backup))).firstDate,
    ).toBeUndefined();
  });
  it("não rejeita futuro estrutural na restauração, mas mantém a regra dos comandos", () => {
    const backup = backupFixture();
    backup.transactions[0].date = "2099-12-31";
    backup.settings.accounts[0].initialBalanceDate = "2099-01-01";
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup);
    expect(() =>
      validateTransaction(backup.transactions[0], backup.settings),
    ).toThrow("até hoje");
    expect(() => validateSettings(backup.settings)).toThrow("data inicial");
  });
  it.each(["{", "null", "[]", "true", "{}"])(
    "rejeita JSON/raiz inválida: %s",
    (content) => {
      expect(() => parseBackup(content)).toThrow();
    },
  );
  it.each([1, 3, "2", null])("rejeita versão %s", (version) => {
    expect(() =>
      parseBackup(JSON.stringify({ ...backupFixture(), version })),
    ).toThrow("Versão incompatível");
  });
  const invalid: [string, (b: BackupV2) => void][] = [
    [
      "transactions ausentes",
      (b) => {
        delete (b as Partial<BackupV2>).transactions;
      },
    ],
    [
      "settings ausentes",
      (b) => {
        delete (b as Partial<BackupV2>).settings;
      },
    ],
    [
      "ID repetido de transação",
      (b) => {
        b.transactions[1].id = b.transactions[0].id;
      },
    ],
    [
      "ID vazio",
      (b) => {
        b.transactions[0].id = " ";
      },
    ],
    [
      "ID não textual",
      (b) => {
        Object.assign(b.transactions[0], { id: 4 });
      },
    ],
    [
      "contas repetidas",
      (b) => {
        b.settings.accounts[1].id = b.settings.accounts[0].id;
      },
    ],
    [
      "categorias repetidas",
      (b) => {
        b.settings.categories[1].id = b.settings.categories[0].id;
      },
    ],
    [
      "metas repetidas",
      (b) => {
        b.settings.goals.push({ ...b.settings.goals[0] });
      },
    ],
    [
      "despesas fixas repetidas",
      (b) => {
        b.settings.fixedExpenses.push({ ...b.settings.fixedExpenses[0] });
      },
    ],
    [
      "conta inexistente",
      (b) => {
        b.transactions[0].accountId = "missing";
      },
    ],
    [
      "categoria inexistente",
      (b) => {
        b.transactions[0].categoryId = "missing";
      },
    ],
    [
      "categoria de tipo diferente",
      (b) => {
        b.transactions[0].categoryId = "food";
      },
    ],
    [
      "destino inexistente",
      (b) => {
        Object.assign(b.transactions[2], { destinationAccountId: "missing" });
      },
    ],
    [
      "destino igual à origem",
      (b) => {
        Object.assign(b.transactions[2], { destinationAccountId: "principal" });
      },
    ],
    [
      "transferência sem destino",
      (b) => {
        Reflect.deleteProperty(b.transactions[2], "destinationAccountId");
      },
    ],
    [
      "destino em receita",
      (b) => {
        Object.assign(b.transactions[0], { destinationAccountId: "reserva" });
      },
    ],
    [
      "categoria errada em transferência",
      (b) => {
        b.transactions[2].categoryId = "food";
      },
    ],
    [
      "tipo inválido",
      (b) => {
        Object.assign(b.transactions[0], { type: "unknown" });
      },
    ],
    [
      "valor zero",
      (b) => {
        b.transactions[0].amount = 0;
      },
    ],
    [
      "valor negativo",
      (b) => {
        b.transactions[0].amount = -1;
      },
    ],
    [
      "valor com fração de centavo",
      (b) => {
        b.transactions[0].amount = 0.001;
      },
    ],
    [
      "valor textual",
      (b) => {
        Object.assign(b.transactions[0], { amount: "10" });
      },
    ],
    [
      "recorrência textual",
      (b) => {
        Object.assign(b.transactions[0], { recurring: "false" });
      },
    ],
    [
      "descrição de tipo errado",
      (b) => {
        Object.assign(b.transactions[0], { description: {} });
      },
    ],
    [
      "origem desconhecida",
      (b) => {
        Object.assign(b.transactions[0], { source: "bank" });
      },
    ],
    [
      "timestamp sem fuso",
      (b) => {
        b.transactions[0].createdAt = "2026-09-10T12:00:00";
      },
    ],
    [
      "timestamp impossível",
      (b) => {
        b.transactions[0].createdAt = "2026-02-31T12:00:00Z";
      },
    ],
    [
      "timestamp do backup inválido",
      (b) => {
        b.exportedAt = "inválido";
      },
    ],
    [
      "saldo inicial inválido",
      (b) => {
        b.settings.accounts[0].initialBalance = Infinity;
      },
    ],
    [
      "data inicial impossível",
      (b) => {
        b.settings.accounts[0].initialBalanceDate = "2026-02-31";
      },
    ],
    [
      "cor inválida",
      (b) => {
        b.settings.categories[0].color = "red";
      },
    ],
    [
      "meta inválida",
      (b) => {
        b.settings.goals[0].targetAmount = 0;
      },
    ],
    [
      "compromisso inválido",
      (b) => {
        b.settings.fixedExpenses[0].amount = -1;
      },
    ],
  ];
  it.each(invalid)("rejeita %s sem normalizar a entrada", (_, change) => {
    const backup = backupFixture();
    change(backup);
    expect(() => parseBackup(JSON.stringify(backup))).toThrow();
  });
  it.each([
    "2026-02-31",
    "2025-02-29",
    "2026-13-01",
    "2026-01-32",
    "31/01/2026",
    "bad",
  ])("rejeita data civil %s", (date) => {
    const backup = backupFixture();
    backup.transactions[0].date = date;
    expect(() => parseBackup(JSON.stringify(backup))).toThrow();
  });
  it("compara todos os campos e aceita só diferenças de ordem/undefined de JSON", () => {
    const a = backupFixture(),
      b = structuredClone(a);
    b.transactions.reverse();
    Object.assign(a.transactions[0], { destinationAccountId: undefined });
    expect(sameBackupSnapshot(a, b)).toBe(true);
    b.transactions[0].amount++;
    expect(sameBackupSnapshot(a, b)).toBe(false);
  });
  it("não perde silenciosamente metadata não representável em JSON na cópia de segurança", () => {
    const backup = backupFixture();
    Object.assign(backup.transactions[0], { existingMetadata: NaN });
    expect(() => serializeBackup(backup)).toThrow();
    Object.assign(backup.transactions[0], { existingMetadata: BigInt(1) });
    expect(() => serializeBackup(backup)).toThrow();
  });
});
