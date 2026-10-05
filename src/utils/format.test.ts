import { describe, expect, it } from "vitest";
import {
  accountBalanceLabel,
  money,
  moneyFromCalculation,
  moneyMinor,
} from "./format";
import { minorUnits, MoneyError, toLegacyReais } from "./money";

describe("B1b: formatação canônica BRL", () => {
  it.each([
    [0, "R$\u00a00,00"],
    [1, "R$\u00a00,01"],
    [-1, "-R$\u00a00,01"],
    [123456, "R$\u00a01.234,56"],
    [Number.MAX_SAFE_INTEGER, "R$\u00a090.071.992.547.409,91"],
    [-Number.MAX_SAFE_INTEGER, "-R$\u00a090.071.992.547.409,91"],
  ] as const)("formata %s c sem decimal intermediário", (n, text) =>
    expect(moneyMinor(minorUnits(n))).toBe(text),
  );
  it.each([0.1, 0.2, 19.9, 29.9, -50.4, 999999999])(
    "paridade visual ordinária de R$ %s",
    (value) =>
      expect(
        moneyFromCalculation(
          toLegacyReais(minorUnits(Math.round(value * 100))),
        ),
      ).toBe(money(value)),
  );
  it("zero negativo de domínio e null continuam diferentes", () => {
    expect(moneyMinor(minorUnits(-0))).toBe("R$\u00a00,00");
    expect(accountBalanceLabel(null)).toBe(
      "Saldo indisponível para este período",
    );
  });
  it("não formata saída insegura como fato", () =>
    expect(() => moneyFromCalculation(Infinity)).toThrow(MoneyError));
});
