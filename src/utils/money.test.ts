import { describe, expect, expectTypeOf, it } from "vitest";
import {
  checkedAdd,
  checkedMultiply,
  checkedSubtract,
  compareScaled,
  fromLegacyReais,
  hasLegacyPrecision,
  minorUnits,
  MoneyError,
  multiplyDivideRounded,
  parseMinorUnits,
  toLegacyReais,
  type MinorUnits,
} from "./money";

const max = Number.MAX_SAFE_INTEGER;

describe("B1a: MinorUnits e adapters", () => {
  it.each([0, 1, -1, max, -max])("constrói inteiro seguro %s", (n) => {
    expect(minorUnits(n)).toBe(n);
  });
  it.each([NaN, Infinity, -Infinity, 0.1, max + 1, -max - 1])(
    "rejeita MinorUnits inválido %s",
    (n) => expect(() => minorUnits(n)).toThrow(MoneyError),
  );
  it("normaliza zero negativo somente no domínio", () => {
    expect(Object.is(minorUnits(-0), -0)).toBe(false);
  });
  it("distingue centavos de number nas assinaturas TypeScript", () => {
    const checkTypes = () => {
      // @ts-expect-error Reais/number não são MinorUnits sem construtor.
      const unsafe: MinorUnits = 1;
      void unsafe;
      // @ts-expect-error A operação checked requer centavos nominais.
      checkedAdd(1, minorUnits(1));
      // @ts-expect-error Operador nativo perde o brand.
      const sum: MinorUnits = minorUnits(1) + minorUnits(2);
      void sum;
    };
    expectTypeOf(checkTypes).toEqualTypeOf<() => void>();
    expectTypeOf(minorUnits(1)).toEqualTypeOf<MinorUnits>();
  });
  it.each([0, 0.01, 1.1, 1234.56, -1234.56, 999999999, -999999999])(
    "faz roundtrip do campo legado %s",
    (n) => expect(toLegacyReais(fromLegacyReais(n))).toBe(n),
  );
  it("aceita ruído IEEE sem alterar o valor bruto", () => {
    const raw = { amount: 0.1 + 0.2 };
    expect(fromLegacyReais(raw.amount)).toBe(30);
    expect(raw.amount).toBe(0.30000000000000004);
  });
  it.each([NaN, Infinity, -Infinity, 1.001, 1e20])(
    "rejeita projeção legada inválida %s",
    (n) => expect(() => fromLegacyReais(n)).toThrow(MoneyError),
  );
  it("preserva tolerância inclusiva de transação e estrita de settings em centavos", () => {
    // Δ=abs(n*100-round(n*100)); 0.00001 c = R$0.0000001.
    const atTolerance = 0.00001 / 100;
    expect(atTolerance * 100).toBe(0.00001);
    expect(hasLegacyPrecision(atTolerance, "transaction")).toBe(true);
    expect(hasLegacyPrecision(atTolerance, "settings")).toBe(false);
  });
  it.each([1e-8, -1e-8])(
    "não projeta subcentavo não zero %s como zero",
    (n) => {
      expect(hasLegacyPrecision(n, "settings")).toBe(true);
      expect(() => fromLegacyReais(n, "settings")).toThrowError(
        expect.objectContaining({ code: "subcentavo" }),
      );
    },
  );
  it("não aplica teto de campo ao kernel e rejeita saída legacy com perda de centavo", () => {
    expect(fromLegacyReais(1000000000)).toBe(100000000000);
    // Safe c que /100 seguido de *100 perde um centavo.
    const n = minorUnits(9007199254740990);
    expect(Math.round((n / 100) * 100)).not.toBe(n);
    expect(() => toLegacyReais(n)).toThrow(MoneyError);
  });
});

describe("B1a: parser lexical", () => {
  it.each([
    ["0", 0],
    ["0,01", 1],
    ["1", 100],
    ["1,1", 110],
    ["1,10", 110],
    ["1.234,56", 123456],
    ["R$ 1.234,56", 123456],
    ["-1,10", -110],
    ["1.001", 100100],
    ["999.999.999,00", 99999999900],
    ["999.999.999,01", 99999999901],
    ["90.071.992.547.409,91", max],
  ] as const)("lê pt-BR %s", (text, expected) => {
    expect(parseMinorUnits(text, ",")).toBe(expected);
  });
  it.each(["1234.56", "1,234.56"])("lê ponto explícito %s", (text) => {
    expect(parseMinorUnits(text, ".")).toBe(123456);
  });
  it.each([
    "NaN",
    "Infinity",
    "",
    " ",
    "1e3",
    "+1",
    "12.50",
    "1,001",
    "1.23,45",
    "90.071.992.547.409,92",
  ])("rejeita pt-BR inválido %s", (text) =>
    expect(() => parseMinorUnits(text, ",")).toThrow(MoneyError),
  );
  it("não muda separador ou arredonda terceira casa", () => {
    expect(() => parseMinorUnits("1.001", ".")).toThrow(MoneyError);
    expect(() => parseMinorUnits("1.234,56", ".")).toThrow(MoneyError);
  });
});

describe("B1a: operações checked e racionais", () => {
  it("soma e subtrai nos limites sem saturação", () => {
    expect(checkedAdd(minorUnits(max - 1), minorUnits(1))).toBe(max);
    expect(checkedSubtract(minorUnits(-max + 1), minorUnits(1))).toBe(-max);
    expect(checkedSubtract(minorUnits(0), minorUnits(-max))).toBe(max);
    expect(checkedAdd(minorUnits(10), minorUnits(-20))).toBe(-10);
  });
  it.each([
    [max, 1],
    [-max, -1],
  ] as const)("rejeita soma overflow %s + %s", (a, b) => {
    expect(() => checkedAdd(minorUnits(a), minorUnits(b))).toThrow(MoneyError);
  });
  it.each([
    [max, -1],
    [-max, 1],
  ] as const)("rejeita subtração overflow %s - %s", (a, b) => {
    expect(() => checkedSubtract(minorUnits(a), minorUnits(b))).toThrow(
      MoneyError,
    );
  });
  it("multiplica para o parser e valida fator antes de usar", () => {
    expect(checkedMultiply(minorUnits(-3), 2)).toBe(-6);
    expect(checkedMultiply(minorUnits(max), 0)).toBe(0);
    expect(() => checkedMultiply(minorUnits(max), 2)).toThrow(MoneyError);
    expect(() => checkedMultiply(minorUnits(0), NaN)).toThrow(MoneyError);
    expect(() => checkedMultiply(minorUnits(2), 0.5)).toThrow(MoneyError);
    // Runtime valida mesmo um brand forjado fora do construtor.
    expect(() => checkedAdd(NaN as MinorUnits, minorUnits(1))).toThrow(
      MoneyError,
    );
  });
  it.each([
    [1, 2, 1],
    [-1, 2, 0],
    [3, 2, 2],
    [-3, 2, -1],
  ] as const)("arredonda %s/%s com empate para +infinito", (n, d, expected) => {
    expect(multiplyDivideRounded(minorUnits(n), 1, d)).toBe(expected);
    expect(Object.is(multiplyDivideRounded(minorUnits(n), 1, d), -0)).toBe(
      false,
    );
  });
  it("projeção com produto inseguro e resultado seguro continua exata", () => {
    expect(multiplyDivideRounded(minorUnits(300000000000001), 31, 31)).toBe(
      300000000000001,
    );
  });
  it("CORREÇÃO EXPLÍCITA do erro IEEE extremo aprovado no plano", () => {
    expect(Math.round(max / 3)).toBe(3002399751580331);
    expect(multiplyDivideRounded(minorUnits(max), 1, 3)).toBe(3002399751580330);
  });
  it("erro racional não retorna NaN/Infinity ou amplia faixa do resultado", () => {
    expect(() => multiplyDivideRounded(minorUnits(1), 1, 0)).toThrow(
      MoneyError,
    );
    expect(() => multiplyDivideRounded(minorUnits(1), 1, -1)).toThrow(
      MoneyError,
    );
    expect(() => multiplyDivideRounded(minorUnits(max), 2, 1)).toThrow(
      MoneyError,
    );
  });
  it("preserva operadores dos limiares 80/100/120/85/115 sem perder desigualdade", () => {
    expect(compareScaled(minorUnits(80), 100, minorUnits(100), 80)).toBe(0);
    expect(compareScaled(minorUnits(100), 100, minorUnits(100), 100)).toBe(0);
    expect(
      compareScaled(
        minorUnits(8400000000000003),
        100,
        minorUnits(7000000000000002),
        120,
      ),
    ).toBe(1);
    expect(
      compareScaled(
        minorUnits(5950000000000001),
        100,
        minorUnits(7000000000000001),
        85,
      ),
    ).toBe(1);
    expect(
      compareScaled(
        minorUnits(8050000000000003),
        100,
        minorUnits(7000000000000002),
        115,
      ),
    ).toBe(1);
    expect(compareScaled(minorUnits(-2), 100, minorUnits(-1), 100)).toBe(-1);
  });
  it("confere operações contra oracle inteiro independente, inclusive negativos", () => {
    const values = [-max, -1001, -3, 0, 3, 1001, max];
    for (const a of values)
      for (const factor of [-31, -1, 0, 1, 31]) {
        const product = BigInt(a) * BigInt(factor);
        const denominator = 31n;
        // Floor((2*p+d)/(2*d)), ajustando divisão BigInt truncada para floor.
        const numerator = 2n * product + denominator;
        let oracle = numerator / (2n * denominator);
        if (numerator < 0n && numerator % (2n * denominator) !== 0n)
          oracle -= 1n;
        if (oracle <= BigInt(max) && oracle >= -BigInt(max)) {
          expect(multiplyDivideRounded(minorUnits(a), factor, 31)).toBe(
            Number(oracle),
          );
        } else {
          expect(() =>
            multiplyDivideRounded(minorUnits(a), factor, 31),
          ).toThrow(MoneyError);
        }
      }
  });
});
