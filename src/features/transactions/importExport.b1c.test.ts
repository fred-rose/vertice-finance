import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { defaultSettings } from "../../data/catalog";
import { civilDate } from "../../utils/civil";
import {
  importDate,
  previewImport,
  readSpreadsheet,
  suggestMapping,
} from "./importExport";
const options = {
  decimal: "," as const,
  dateFormat: "dmy" as const,
  accountId: "principal",
  expenseCategoryId: "food",
  incomeCategoryId: "income",
  defaultType: "signed" as const,
  today: civilDate("2026-09-15"),
};
async function workbook(date1904: boolean) {
  const w = new ExcelJS.Workbook();
  w.properties.date1904 = date1904;
  const s = w.addWorksheet("Datas");
  s.addRow(["Data", "Descrição", "Valor"]);
  s.addRow([date1904 ? 44813 : 46275, "Serial moderno", -100]);
  s.addRow([new Date("2026-09-10T00:00:00Z"), "Date moderna", -50]);
  s.getCell("A3").numFmt = "yyyy-mm-dd";
  const buffer = await w.xlsx.writeBuffer();
  return new File([new Uint8Array(buffer)], "datas.xlsx");
}
describe("B1c: reprodução real e correção deliberada XLSX", () => {
  it.each([false, true])(
    "workbook date1904=%s: serial e Date mantêm data civil",
    async (date1904) => {
      const [sheet] = await readSpreadsheet(await workbook(date1904));
      expect(sheet.date1904).toBe(date1904);
      expect(sheet.rows[2][0]).toBe("2026-09-10");
      const result = previewImport(
        sheet.rows,
        suggestMapping(sheet.rows[0]),
        defaultSettings(),
        { ...options, date1904: sheet.date1904 },
      );
      expect(result.map((r) => r.transaction?.date)).toEqual([
        "2026-09-10",
        "2026-09-10",
      ]);
      expect(result.every((r) => !r.error)).toBe(true);
    },
  );
  it("evidência anterior: origem fixa erra serial 1904 em 1462 dias", () => {
    const before = new Date(Date.UTC(1899, 11, 30) + 44813 * 86400000)
      .toISOString()
      .slice(0, 10);
    expect(before).toBe("2022-09-09");
    expect(importDate(44813, "dmy", true)).toBe("2026-09-10");
  });
  it.each([
    [1, false, "1900-01-01"],
    [59, false, "1900-02-28"],
    [60, false, ""],
    [61, false, "1900-03-01"],
    [0, true, "1904-01-01"],
    [1, true, "1904-01-02"],
    [46275.9, false, "2026-09-10"],
    [44813.5, true, "2026-09-10"],
  ] as const)("serial %s/%s", (serial, epoch, result) =>
    expect(importDate(serial, "dmy", epoch)).toBe(result),
  );
  it.each([NaN, Infinity, -1, 1e20])("serial inválido %s", (serial) =>
    expect(importDate(serial, "dmy")).toBe(""),
  );
  it("um preview inteiro captura um corte, não um por linha", () => {
    const rows = [
      ["Data", "Descrição", "Valor"],
      ["2026-09-15", "A", 10],
      ["2026-09-16", "B", 10],
    ];
    const result = previewImport(
      rows,
      suggestMapping(rows[0]),
      defaultSettings(),
      options,
    );
    expect(result[0].transaction?.date).toBe("2026-09-15");
    expect(result[1].error).toContain("até hoje");
  });
});

it("workbook real 1900 confirma primeiros seriais e rejeita o dia fictício", async () => {
  const w = new ExcelJS.Workbook(),
    sheet = w.addWorksheet("1900");
  sheet.addRow(["Data", "Descrição", "Valor"]);
  for (const serial of [1, 59, 60, 61])
    sheet.addRow([serial, "Epoch " + serial, -10]);
  const [loaded] = await readSpreadsheet(
    new File([new Uint8Array(await w.xlsx.writeBuffer())], "1900.xlsx"),
  );
  const result = previewImport(
    loaded.rows,
    suggestMapping(loaded.rows[0]),
    defaultSettings(),
    { ...options, date1904: loaded.date1904 },
  );
  expect(result.map((r) => r.transaction?.date)).toEqual([
    "1900-01-01",
    "1900-02-28",
    undefined,
    "1900-03-01",
  ]);
  expect(result[2].error).toContain("data válida");
});
