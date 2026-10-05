import { describe, expect, it } from "vitest";
import {
  addCivilDays,
  asCivilDate,
  captureCivilCut,
  civilAt,
  civilDate,
  civilMonth,
  dateMonth,
  daysInMonth,
  instant,
  shiftDateMonth,
  shiftMonth,
} from "./civil";
describe("B1c: calendário civil independente de relógio", () => {
  it.each(["1900-01-01", "2024-02-29", "2000-02-29", "9999-12-31"])(
    "aceita %s",
    (value) => expect(civilDate(value)).toBe(value),
  );
  it.each([
    "1899-12-31",
    "2026-02-29",
    "1900-02-29",
    "2100-02-29",
    "2026-04-31",
    "2026-00-10",
    "2026-13-10",
    "2026-01-00",
    "2026-1-01",
    "2026-01-01T00:00:00Z",
  ])("rejeita %s", (value) => expect(() => civilDate(value)).toThrow());
  it.each([
    ["2026-01-31", 1, "2026-02-28"],
    ["2024-01-31", 1, "2024-02-29"],
    ["2026-03-31", -1, "2026-02-28"],
    ["2024-03-31", -1, "2024-02-29"],
    ["2026-01-31", -1, "2025-12-31"],
    ["2026-12-31", 1, "2027-01-31"],
  ] as const)("clamp %s/%s", (date, delta, result) =>
    expect(shiftDateMonth(civilDate(date), delta)).toBe(result),
  );
  it.each([
    ["2024-02-28", 1, "2024-02-29"],
    ["2024-02-29", 1, "2024-03-01"],
    ["2026-02-28", 1, "2026-03-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-01-01", -1, "2025-12-31"],
    ["2026-03-08", 1, "2026-03-09"],
    ["2026-11-01", 1, "2026-11-02"],
  ] as const)("dia civil %s/%s", (date, delta, result) =>
    expect(addCivilDays(civilDate(date), delta)).toBe(result),
  );
  it("compara strings validadas cronologicamente", () =>
    expect(civilDate("2026-01-01") > civilDate("2025-12-31")).toBe(true));
  it("mês atravessa ano sem relógio", () => {
    expect(shiftMonth(civilMonth("2026-01"), -1)).toBe("2025-12");
    expect(shiftMonth(civilMonth("2026-12"), 1)).toBe("2027-01");
    expect(dateMonth(civilDate("2024-02-29"))).toBe("2024-02");
  });
  it.each(["2026-00", "2026-13", "0000-01", "10000-01", "2026-1"])(
    "mês inválido %s",
    (value) => expect(() => civilMonth(value)).toThrow(),
  );
  it("limites de calendário não ampliam o contrato", () => {
    expect(() => addCivilDays(civilDate("1900-01-01"), -1)).toThrow();
    expect(() => addCivilDays(civilDate("9999-12-31"), 1)).toThrow();
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(() => shiftMonth(civilMonth("2026-01"), 0.5)).toThrow();
  });
  it.each([
    ["2026-01-01T01:00:00Z", "UTC", "2026-01-01"],
    ["2026-01-01T01:00:00Z", "America/Sao_Paulo", "2025-12-31"],
    ["2026-03-08T06:59:59Z", "America/New_York", "2026-03-08"],
    ["2026-03-08T07:00:00Z", "America/New_York", "2026-03-08"],
    ["2026-11-01T05:30:00Z", "America/New_York", "2026-11-01"],
    ["2026-11-01T06:30:00Z", "America/New_York", "2026-11-01"],
  ] as const)("captura %s/%s", (at, zone, expected) =>
    expect(civilAt(instant(at), zone)).toBe(expected),
  );
  it("captura um Instant conhecido e zona sem mudar o Date fornecido", () => {
    const at = new Date("2026-10-01T02:59:59Z");
    const cut = captureCivilCut(at, "America/Sao_Paulo");
    expect(cut).toEqual({
      instant: "2026-10-01T02:59:59.000Z",
      today: "2026-09-30",
      timezone: "America/Sao_Paulo",
    });
    expect(at.toISOString()).toBe(cut.instant);
  });
  it("Instant exige offset; zona inexistente falha explicitamente", () => {
    expect(() => instant("2026-01-01")).toThrow();
    expect(() => instant("2026-01-01T12:00:00")).toThrow();
    expect(() =>
      civilAt(instant("2026-01-01T00:00:00Z"), "zona-inexistente"),
    ).toThrow();
  });
  it("adapter Date não é representação persistida", () =>
    expect(asCivilDate(new Date(2026, 1, 28))).toBe("2026-02-28"));
});

it("Instant não aceita normalização de calendário impossível", () => {
  expect(() => instant("2026-02-31T12:00:00Z")).toThrow();
  expect(() => instant("2026-01-01T24:00:00Z")).toThrow();
  expect(instant("2026-01-01T09:00:00-03:00")).toBe(
    "2026-01-01T09:00:00-03:00",
  );
});

it("aritmética ordinal atravessa todo o limite suportado sem dias de duração", () => {
  expect(addCivilDays(civilDate("1900-01-01"), 2958463)).toBe("9999-12-31");
  expect(addCivilDays(civilDate("9999-12-31"), -2958463)).toBe("1900-01-01");
  expect(() =>
    addCivilDays(civilDate("2026-01-01"), Number.MAX_SAFE_INTEGER),
  ).toThrow();
});
it("CivilDate, CivilMonth e Instant são contratos nominais distintos", () => {
  const date = civilDate("2026-01-01");
  // @ts-expect-error Data de caixa não é timestamp.
  const timestamp: import("./civil").Instant = date;
  // @ts-expect-error Um dia não é um mês selecionado.
  const month: import("./civil").CivilMonth = date;
  expect(timestamp).toBe(date);
  expect(month).toBe(date);
});
