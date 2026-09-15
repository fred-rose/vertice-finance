import { describe, expect, it } from "vitest";
import {
  parseCSV,
  previewImport,
  suggestMapping,
  importDate,
} from "./importExport";
import { defaultSettings } from "../../data/catalog";
import { parseAmount, validateTransaction, validDate } from "./validation";
import type { NewTransaction } from "../../types/finance";
const settings = defaultSettings();
const options = {
  decimal: "," as const,
  dateFormat: "dmy" as const,
  accountId: "principal",
  expenseCategoryId: "food",
  incomeCategoryId: "income",
  defaultType: "signed" as const,
};
const input: NewTransaction = {
  type: "expense",
  amount: 85,
  categoryId: "food",
  description: "Mercado",
  accountId: "principal",
  date: "2026-01-10",
  recurring: false,
};
describe("Validação e importação", () => {
  it("aceita moeda brasileira com milhar e rejeita valores ambíguos", () => {
    expect(parseAmount("R$ 1.250,50")).toBe(1250.5);
    expect(parseAmount("1,250.50", ".")).toBe(1250.5);
    expect(parseAmount("1e3")).toBeNaN();
    expect(parseAmount("12.50")).toBeNaN();
    expect(parseAmount("0,001")).toBeNaN();
  });
  it("valida calendário e transferências", () => {
    expect(validDate("2024-02-29")).toBe(true);
    expect(validDate("2025-02-29")).toBe(false);
    expect(() =>
      validateTransaction(
        { ...input, type: "transfer", destinationAccountId: "principal" },
        settings,
      ),
    ).toThrow("diferente");
    expect(() =>
      validateTransaction({ ...input, categoryId: "income" }, settings),
    ).toThrow("compatível");
    expect(() =>
      validateTransaction({ ...input, amount: NaN }, settings),
    ).toThrow();
    expect(() =>
      validateTransaction({ ...input, date: "2099-01-01" }, settings),
    ).toThrow();
  });
  it("lê CSV com BOM, separadores, aspas escapadas e quebras dentro de células", () => {
    expect(
      parseCSV(
        '\uFEFFData;Descrição;Valor\r\n10/01/2026;"Mercado; \"\"bairro\"\"\nCentro";-85,00',
      ),
    ).toEqual([
      ["Data", "Descrição", "Valor"],
      ["10/01/2026", 'Mercado; "bairro"\nCentro', "-85,00"],
    ]);
    expect(() => parseCSV('A;B\n"ab;2')).toThrow();
  });
  it("mapeia colunas fora de ordem e não salva linhas inválidas", () => {
    const rows = parseCSV(
      "Descrição;Valor;Data\nMercado;-85,00;10/01/2026\nSalário;4500;10/01/2026\nInválida;20;31/02/2026",
    );
    const result = previewImport(
      rows,
      suggestMapping(rows[0]),
      settings,
      options,
    );
    expect(result[0].transaction).toMatchObject({
      type: "expense",
      amount: 85,
      categoryId: "food",
    });
    expect(result[1].transaction).toMatchObject({
      type: "income",
      amount: 4500,
    });
    expect(result[2].error).toBeTruthy();
  });
  it("marca duplicatas no arquivo e já existentes", () => {
    const rows = parseCSV(
      "Data;Descrição;Valor\n10/01/2026;Mercado;-85\n10/01/2026;Mercado;-85",
    );
    const result = previewImport(
      rows,
      suggestMapping(rows[0]),
      settings,
      options,
      [{ ...input, id: "saved" }],
    );
    expect(result.every((r) => r.duplicate)).toBe(true);
  });
  it("aceita células numéricas XLSX sem aplicar separador brasileiro", () => {
    const rows = [
      ["Data", "Descrição", "Valor"],
      ["2026-01-10", "Teste", 85.5],
    ];
    expect(
      previewImport(rows, suggestMapping(rows[0]), settings, options)[0]
        .transaction?.amount,
    ).toBe(85.5);
    expect(importDate(46032, "dmy")).toBe("2026-01-10");
    expect(importDate("01/10/2026", "mdy")).toBe("2026-01-10");
  });
  it("valida contas, categorias e destino mapeados", () => {
    const rows = parseCSV(
      "Data;Descrição;Valor;Tipo;Conta;Destino\n10/01/2026;Reserva;100;Transferência;Conta principal;Reserva pessoal\n10/01/2026;Erro;100;Transferência;Conta principal;Desconhecida",
    );
    const result = previewImport(
      rows,
      suggestMapping(rows[0]),
      settings,
      options,
    );
    expect(result[0].transaction).toMatchObject({
      type: "transfer",
      destinationAccountId: "reserva",
    });
    expect(result[1].error).toBeTruthy();
  });
});

describe("Auditoria de importação", () => {
  it.each([NaN, Infinity, -Infinity, 1e20])(
    "data numérica inválida %s recebe mensagem útil sem afetar linhas válidas",
    (date) => {
      const rows = [
        ["Data", "Descrição", "Valor"],
        ["2026-01-10", "Válido", -19.9],
        [date, "Inválido", -29.9],
      ];
      const result = previewImport(
        rows,
        suggestMapping(rows[0]),
        settings,
        options,
      );
      expect(result[0].transaction).toMatchObject({ amount: 19.9 });
      expect(result[1]).toEqual({
        line: 3,
        error: "Informe uma data válida, até hoje.",
      });
      expect(importDate(date, "dmy")).toBe("");
    },
  );
  it.each(["Conta", "Categoria", "Destino"])(
    "rejeita %s inexistente sem produzir uma transação",
    (field) => {
      const rows = parseCSV(
        `Data;Descrição;Valor;Tipo;${field}\n10/01/2026;Teste;-19,90;${field === "Destino" ? "Transferência" : "Gasto"};Inexistente`,
      );
      const result = previewImport(
        rows,
        suggestMapping(rows[0]),
        settings,
        options,
      );
      expect(result).toHaveLength(1);
      expect(result[0].error).toBeTruthy();
      expect(result[0].transaction).toBeUndefined();
    },
  );
  it("rejeita transferência sem coluna de destino", () => {
    const rows = parseCSV(
      "Data;Descrição;Valor;Tipo\n10/01/2026;Reserva;1000;Transferência",
    );
    expect(
      previewImport(rows, suggestMapping(rows[0]), settings, options)[0].error,
    ).toContain("destino");
  });
  it("ignora linhas vazias mantendo o número original das linhas inválidas", () => {
    const rows = parseCSV(
      "Data;Descrição;Valor\n\n10/01/2026;Mercado;-19,90\n;;\n31/02/2026;Inválida;29,90\n",
    );
    const result = previewImport(
      rows,
      suggestMapping(rows[0]),
      settings,
      options,
    );
    expect(result.map((r) => r.line)).toEqual([3, 5]);
    expect(result[0].transaction).toMatchObject({
      type: "expense",
      amount: 19.9,
    });
    expect(result[1].error).toContain("data válida");
  });
  it("ignora linhas XLSX totalmente vazias, mas rejeita valor zero", () => {
    const rows = [
      ["Data", "Descrição", "Valor"],
      ["", " ", ""],
      ["2026-01-10", "Valor zero", 0],
    ];
    const result = previewImport(
      rows,
      suggestMapping(rows[0]),
      settings,
      options,
    );
    expect(result).toHaveLength(1);
    expect(result[0].line).toBe(3);
    expect(result[0].error).toContain("valor");
  });
  it.each([0, 0.25, 0.5, 0.75, 0.9999])(
    "preserva o dia de uma data Excel com fração %s",
    (fraction) => {
      expect(importDate(46032 + fraction, "dmy")).toBe("2026-01-10");
    },
  );
  it.each(["31/02/2026", "29/02/2025", "2026-13-01", "2026-04-31", "amanhã"])(
    "rejeita a data %s",
    (date) => {
      const rows = [
        ["Data", "Descrição", "Valor"],
        [date, "Teste", "-0,30"],
      ];
      expect(
        previewImport(rows, suggestMapping(rows[0]), settings, options)[0]
          .transaction,
      ).toBeUndefined();
    },
  );
  it("preserva centavos e interpreta o sinal conforme a opção explícita", () => {
    const rows = parseCSV(
      "Data;Descrição;Valor\n10/01/2026;A;-0,10\n10/01/2026;B;-0,20\n10/01/2026;C;0,30\n10/01/2026;D;-19,90\n10/01/2026;E;-29,90",
    );
    const result = previewImport(
      rows,
      suggestMapping(rows[0]),
      settings,
      options,
    );
    expect(result.map((r) => r.transaction?.amount)).toEqual([
      0.1, 0.2, 0.3, 19.9, 29.9,
    ]);
    expect(result.map((r) => r.transaction?.type)).toEqual([
      "expense",
      "expense",
      "income",
      "expense",
      "expense",
    ]);
    expect(
      previewImport(rows, suggestMapping(rows[0]), settings, {
        ...options,
        defaultType: "expense",
      }).every((r) => r.transaction?.type === "expense"),
    ).toBe(true);
  });
  it("diferencia repetições legítimas de duplicatas exatas", () => {
    const rows = parseCSV(
      "Data;Descrição;Valor\n10/01/2026;Mercado;-85\n10/01/2026;Mercado;-85,01\n11/01/2026;Mercado;-85\n10/01/2026;Outro mercado;-85",
    );
    const result = previewImport(
      rows,
      suggestMapping(rows[0]),
      settings,
      options,
      [{ ...input, id: "saved" }],
    );
    expect(result.map((r) => r.duplicate)).toEqual([true, false, false, false]);
  });
});
