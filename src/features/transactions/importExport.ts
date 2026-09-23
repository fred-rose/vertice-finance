import type {
  FinanceSettings,
  NewTransaction,
  Transaction,
} from "../../types/finance";
import {
  parseAmount,
  validDate,
  validateTransaction,
  transactionSignature,
} from "./validation";
export type Cell = string | number;
export interface ImportSheet {
  name: string;
  rows: Cell[][];
}
export type Mapping = Record<
  | "date"
  | "amount"
  | "description"
  | "type"
  | "categoryId"
  | "accountId"
  | "destinationAccountId"
  | "recurring",
  number
>;
const unescapeText = (value: string) => value.replace(/^'(?=[=+\-@\t\r])/, "");
const normalize = (value: string) =>
  unescapeText(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function parseCSV(text: string, separator?: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  if (!separator) {
    const first = text.split(/\r?\n/)[0];
    separator = [";", ",", "\t"].sort(
      (a, b) => first.split(b).length - first.split(a).length,
    )[0];
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === separator && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("CSV com aspas não fechadas. Revise o arquivo.");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
export async function readSpreadsheet(
  file: File,
  separator?: string,
): Promise<ImportSheet[]> {
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Use um arquivo de até 5 MB.");
  if (/\.csv$/i.test(file.name)) {
    const bytes = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(bytes);
    if (text.includes("\uFFFD"))
      text = new TextDecoder("windows-1252").decode(bytes);
    const rows = parseCSV(text, separator);
    if (rows.length > 5001)
      throw new Error("Importe até 5.000 transações por vez.");
    return [{ name: file.name, rows }];
  }
  if (!/\.xlsx$/i.test(file.name))
    throw new Error("Selecione um arquivo CSV ou XLSX.");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  return workbook.worksheets
    .map((sheet) => {
      if (sheet.rowCount > 5001 || sheet.columnCount > 100)
        throw new Error("Use abas de até 5.000 transações e 100 colunas.");
      const rows: Cell[][] = [];
      sheet.eachRow({ includeEmpty: true }, (row) => {
        const cells: Cell[] = [];
        for (let i = 1; i <= sheet.columnCount; i++) {
          const cell = row.getCell(i);
          const value = cell.value;
          cells.push(
            value instanceof Date
              ? value.toISOString().slice(0, 10)
              : typeof value === "number"
                ? value
                : cell.text,
          );
        }
        rows.push(cells);
      });
      return { name: sheet.name, rows };
    })
    .filter((sheet) => sheet.rows.length);
}
export function suggestMapping(headers: Cell[]): Mapping {
  const find = (...names: string[]) =>
    headers.findIndex((h) => names.includes(normalize(String(h))));
  return {
    date: find("data", "date", "data de pagamento"),
    amount: find("valor", "amount", "valor (r$)"),
    description: find("descricao", "description", "historico"),
    type: find("tipo", "type"),
    categoryId: find("categoria", "category", "categoryid"),
    accountId: find("conta", "account", "accountid"),
    destinationAccountId: find(
      "destino",
      "conta de destino",
      "destinationaccountid",
    ),
    recurring: find("recorrente", "recurring"),
  };
}
export function importDate(cell: Cell, format: "dmy" | "mdy"): string {
  if (typeof cell === "number") {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(cell) * 86400000);
    return Number.isFinite(date.getTime())
      ? date.toISOString().slice(0, 10)
      : "";
  }
  const value = cell.trim();
  if (validDate(value)) return value;
  const match = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(value);
  if (!match) return "";
  return `${match[3]}-${(format === "dmy" ? match[2] : match[1]).padStart(2, "0")}-${(format === "dmy" ? match[1] : match[2]).padStart(2, "0")}`;
}
export function previewImport(
  rows: Cell[][],
  mapping: Mapping,
  settings: FinanceSettings,
  options: {
    decimal: "," | ".";
    dateFormat: "dmy" | "mdy";
    accountId: string;
    expenseCategoryId: string;
    incomeCategoryId: string;
    defaultType: "signed" | "expense" | "income";
  },
  existing: Transaction[] = [],
) {
  const results: {
    line: number;
    transaction?: NewTransaction;
    error?: string;
    duplicate?: boolean;
  }[] = [];
  const known = new Set(existing.map(transactionSignature));
  rows.slice(1).forEach((row, i) => {
    // Keep physical row numbers in diagnostics, but do not import blank rows.
    if (row.every((cell) => String(cell).trim() === "")) return;
    const get = (key: keyof Mapping) => row[mapping[key]] ?? "";
    try {
      const raw = get("amount");
      const amount =
        typeof raw === "number" ? raw : parseAmount(raw, options.decimal);
      const rawType = normalize(String(get("type")));
      const type = ["gasto", "despesa", "expense", "debito"].includes(rawType)
        ? "expense"
        : ["receita", "income", "credito"].includes(rawType)
          ? "income"
          : ["transferencia", "transfer"].includes(rawType)
            ? "transfer"
            : mapping.type >= 0
              ? null
              : options.defaultType === "signed"
                ? amount < 0
                  ? "expense"
                  : "income"
                : options.defaultType;
      if (!type)
        throw new Error(
          "Tipo não reconhecido. Use Gasto, Receita ou Transferência.",
        );
      const findAccount = (value: Cell) =>
        settings.accounts.find(
          (a) =>
            a.id === value || normalize(a.name) === normalize(String(value)),
        )?.id;
      const accountId =
        mapping.accountId >= 0
          ? findAccount(get("accountId"))
          : options.accountId;
      if (!accountId)
        throw new Error(
          "Conta não cadastrada. Configure-a ou ajuste o mapeamento.",
        );
      const categoryId =
        type === "transfer"
          ? "transfer"
          : mapping.categoryId >= 0
            ? settings.categories.find(
                (c) =>
                  c.type === type &&
                  (c.id === get("categoryId") ||
                    normalize(c.name) === normalize(String(get("categoryId")))),
              )?.id
            : type === "income"
              ? options.incomeCategoryId
              : options.expenseCategoryId;
      if (!categoryId)
        throw new Error(
          "Categoria não cadastrada ou incompatível. Configure-a ou ajuste o mapeamento.",
        );
      const recurringText = normalize(String(get("recurring")));
      if (
        recurringText &&
        !["sim", "true", "1", "nao", "false", "0"].includes(recurringText)
      )
        throw new Error("Recorrência inválida. Use Sim ou Não.");
      const base = {
        amount: Math.abs(amount),
        categoryId,
        accountId,
        description: unescapeText(String(get("description"))),
        date: importDate(get("date"), options.dateFormat),
        recurring: ["sim", "true", "1"].includes(recurringText),
      };
      const input: NewTransaction =
        type === "transfer"
          ? {
              ...base,
              type,
              destinationAccountId:
                findAccount(get("destinationAccountId")) ?? "",
            }
          : { ...base, type };
      const transaction = validateTransaction(input, settings);
      const signature = transactionSignature(transaction),
        duplicate = known.has(signature);
      known.add(signature);
      results.push({ line: i + 2, transaction, duplicate });
    } catch (e) {
      results.push({
        line: i + 2,
        error: e instanceof Error ? e.message : "Linha inválida.",
      });
    }
  });
  return results;
}
export function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
export function downloadTransactions(
  items: Transaction[],
  settings: FinanceSettings,
) {
  // Prefix spreadsheet formula triggers in free text; the importer removes this escape.
  const safe = (value: string) =>
    /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [
    [
      "Data",
      "Tipo",
      "Valor",
      "Descrição",
      "Categoria",
      "Conta",
      "Destino",
      "Recorrente",
    ],
    ...items.map((t) => [
      t.date,
      t.type === "expense"
        ? "Gasto"
        : t.type === "income"
          ? "Receita"
          : "Transferência",
      t.amount.toFixed(2).replace(".", ","),
      safe(t.description),
      safe(
        settings.categories.find((c) => c.id === t.categoryId)?.name ??
          "Transferência",
      ),
      safe(settings.accounts.find((a) => a.id === t.accountId)?.name ?? ""),
      safe(
        settings.accounts.find((a) => a.id === t.destinationAccountId)?.name ??
          "",
      ),
      t.recurring ? "Sim" : "Não",
    ]),
  ];
  download(
    "\uFEFF" + rows.map((row) => row.map(quote).join(";")).join("\r\n"),
    "vertice-transacoes.csv",
    "text/csv;charset=utf-8",
  );
}
export function downloadBackup(
  settings: FinanceSettings,
  transactions: Transaction[],
) {
  download(
    JSON.stringify(
      {
        version: 2,
        exportedAt: new Date().toISOString(),
        settings,
        transactions,
      },
      null,
      2,
    ),
    "vertice-backup.json",
    "application/json",
  );
}
