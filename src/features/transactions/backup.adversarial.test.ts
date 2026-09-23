import { describe, expect, it } from "vitest";
import { backupFixture } from "../../../tests/helpers/backupFixture";
import {
  BackupValidationError,
  parseBackup,
  sameBackupSnapshot,
  serializeBackup,
  validateBackupSnapshot,
} from "./backup";
import { validateTransaction, validDate } from "./validation";

describe("Revisão adversarial A0/A1", () => {
  const numericPaths = [
    "version",
    "transactions.0.amount",
    "settings.accounts.0.initialBalance",
    "settings.categories.0.monthlyBudget",
    "settings.goals.0.targetAmount",
    "settings.goals.0.currentAmount",
    "settings.plannedIncome",
    "settings.fixedExpenses.0.amount",
    "settings.lowBalanceThreshold",
  ];
  for (const token of ["1e400", "-1e400"]) {
    it.each(numericPaths)(`rejeita %s = ${token} no texto JSON`, (path) => {
      const backup = backupFixture();
      const keys = path.split(".");
      let target = backup as unknown as Record<string, unknown>;
      for (const key of keys.slice(0, -1))
        target = target[key] as Record<string, unknown>;
      target[keys.at(-1)!] = "__overflow__";
      const json = JSON.stringify(backup).replace('"__overflow__"', token);
      expect(json).toContain(token);
      expect(() => parseBackup(json)).toThrow(BackupValidationError);
    });
  }

  it.each([
    '{"external":1e400}',
    '{"external":-1e400}',
    '{"nested":{"value":1e400}}',
    '{"values":[1,2,1e400]}',
  ])("rejeita metadata não finita: %s", (metadata) => {
    const json = JSON.stringify(backupFixture()).replace(
      '"plannedIncome":3000',
      `"metadata":${metadata},"plannedIncome":3000`,
    );
    expect(json).toContain(metadata);
    expect(() => parseBackup(json)).toThrow(BackupValidationError);
  });

  it.each([Infinity, -Infinity, NaN])(
    "validação direta também rejeita número não finito %s sem modificar entrada",
    (value) => {
      const backup = backupFixture();
      Object.assign(backup.transactions[0], { metadata: { values: [value] } });
      const before = structuredClone(backup);
      expect(() => validateBackupSnapshot(backup)).toThrow(
        BackupValidationError,
      );
      expect(backup).toEqual(before);
    },
  );

  it("metadata finita é aceita, preservada e reexportada sem perda", () => {
    const backup = backupFixture();
    const metadata = {
      provider: "manual",
      confidence: 0.75,
      nested: { enabled: true, count: 2 },
      values: [0, -1, 1e300, null],
    };
    for (const target of [
      backup.settings,
      ...backup.transactions,
      ...backup.settings.accounts,
      ...backup.settings.categories,
      ...backup.settings.goals,
      ...backup.settings.fixedExpenses,
    ])
      Object.assign(target, { metadata });
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed).toEqual(backup);
    const reexported = parseBackup(serializeBackup(parsed));
    expect(reexported.settings).toEqual(backup.settings);
    expect(reexported.transactions).toEqual(backup.transactions);
    expect(sameBackupSnapshot(parsed, reexported)).toBe(true);
  });

  it.each([
    ["2024-02-29", true],
    ["2026-02-29", false],
    ["2026-04-31", false],
    ["2026-13-01", false],
    ["2026-00-10", false],
    ["2026-01-00", false],
    ["2027-01-10", true],
    ["9999-12-31", true],
    [" 2026-01-01 ", false],
    ["2026-01-01T00:00:00Z", false],
    ["2026-01", false],
    ["2026", false],
  ])("CivilDate %s: %s", (date, expected) => {
    expect(validDate(date as string)).toBe(expected);
    const backup = backupFixture();
    backup.transactions[0].date = date as string;
    if (expected) expect(parseBackup(JSON.stringify(backup))).toEqual(backup);
    else expect(() => parseBackup(JSON.stringify(backup))).toThrow();
  });

  it("future estrutural não altera o modo padrão dos comandos", () => {
    const backup = backupFixture();
    backup.transactions[0].date = "9999-12-31";
    expect(() =>
      validateTransaction(backup.transactions[0], backup.settings),
    ).toThrow("até hoje");
  });

  const fields = [
    "id",
    "amount",
    "type",
    "date",
    "categoryId",
    "accountId",
    "destinationAccountId",
    "recurring",
    "createdAt",
    "source",
    "metadata",
  ];
  it.each(fields)(
    "comparação detecta mudança em %s com contagem preservada",
    (field) => {
      const a = backupFixture(),
        b = structuredClone(a);
      Object.assign(b.transactions[2], {
        [field]:
          field === "amount" ? 1001 : field === "recurring" ? true : "changed",
      });
      expect(sameBackupSnapshot(a, b)).toBe(false);
    },
  );

  const configCases: [
    string,
    (value: ReturnType<typeof backupFixture>) => void,
  ][] = [
    [
      "account",
      (b) => {
        b.settings.accounts[0].name += " changed";
      },
    ],
    [
      "initialBalance",
      (b) => {
        b.settings.accounts[0].initialBalance++;
      },
    ],
    [
      "initialBalanceDate",
      (b) => {
        b.settings.accounts[0].initialBalanceDate = "2026-08-31";
      },
    ],
    [
      "category",
      (b) => {
        b.settings.categories[0].color = "#000000";
      },
    ],
    [
      "budget",
      (b) => {
        b.settings.categories[0].monthlyBudget = 799;
      },
    ],
    [
      "goal",
      (b) => {
        b.settings.goals[0].currentAmount++;
      },
    ],
    [
      "plannedIncome",
      (b) => {
        b.settings.plannedIncome++;
      },
    ],
    [
      "fixedExpenses",
      (b) => {
        b.settings.fixedExpenses[0].amount++;
      },
    ],
    [
      "threshold",
      (b) => {
        b.settings.lowBalanceThreshold++;
      },
    ],
    [
      "extra",
      (b) => {
        Object.assign(b.settings, { metadata: { extra: true } });
      },
    ],
  ];
  it.each(configCases)("comparação detecta settings: %s", (_, mutate) => {
    const a = backupFixture(),
      b = structuredClone(a);
    mutate(b);
    expect(sameBackupSnapshot(a, b)).toBe(false);
  });

  it("ignora exportedAt, ordem de propriedades/transações e undefined ausente nos dois sentidos", () => {
    const a = backupFixture(),
      b = structuredClone(a);
    b.exportedAt = "2027-01-01T00:00:00Z";
    b.transactions = b.transactions
      .reverse()
      .map(
        (row) =>
          Object.fromEntries(Object.entries(row).reverse()) as typeof row,
      );
    Object.assign(a.transactions[0], { destinationAccountId: undefined });
    expect(sameBackupSnapshot(a, b)).toBe(true);
    expect(sameBackupSnapshot(b, a)).toBe(true);
    expect(parseBackup(serializeBackup(a)).transactions[0]).not.toHaveProperty(
      "destinationAccountId",
    );
  });

  it("preserva nomes/descrições com espaços e campos JSON adicionais aninhados", () => {
    const a = backupFixture();
    a.transactions[0].description = "  Receita restaurada  ";
    Object.assign(a.settings.accounts[0], {
      meta: { list: [0, false, null, "a"], nested: { x: "y" } },
    });
    const parsed = parseBackup(serializeBackup(a));
    expect(parsed.transactions).toEqual(a.transactions);
    expect(parsed.settings).toEqual(a.settings);
  });
});
