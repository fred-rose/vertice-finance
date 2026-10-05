// Centavos BRL; regras de sinal, zero e teto por campo pertencem ao consumidor.
declare const minorUnitsBrand: unique symbol;
export type MinorUnits = number & { readonly [minorUnitsBrand]: true };
export type LegacyPrecision = "transaction" | "settings";

export class MoneyError extends Error {
  constructor(
    readonly code:
      "invalid" | "overflow" | "precision" | "subcentavo" | "division",
  ) {
    super(`Valor monetário não representável: ${code}.`);
    this.name = "MoneyError";
  }
}

function safeInteger(value: number): void {
  if (!Number.isFinite(value) || !Number.isInteger(value))
    throw new MoneyError("invalid");
  if (!Number.isSafeInteger(value)) throw new MoneyError("overflow");
}

export function minorUnits(value: number): MinorUnits {
  safeInteger(value);
  // Único cast nominal; zero negativo não é uma unidade financeira distinta.
  return (value === 0 ? 0 : value) as MinorUnits;
}

export function checkedAdd(a: MinorUnits, b: MinorUnits): MinorUnits {
  safeInteger(a);
  safeInteger(b);
  if (
    (b > 0 && a > Number.MAX_SAFE_INTEGER - b) ||
    (b < 0 && a < Number.MIN_SAFE_INTEGER - b)
  )
    throw new MoneyError("overflow");
  return minorUnits(a + b);
}

export function checkedSubtract(a: MinorUnits, b: MinorUnits): MinorUnits {
  safeInteger(a);
  safeInteger(b);
  return checkedAdd(a, minorUnits(-b));
}

function productFits(a: number, b: number): boolean {
  return (
    b === 0 || Math.abs(a) <= Math.floor(Number.MAX_SAFE_INTEGER / Math.abs(b))
  );
}

// Fator adimensional inteiro; usado também para montar dígitos do parser.
export function checkedMultiply(value: MinorUnits, factor: number): MinorUnits {
  safeInteger(value);
  safeInteger(factor);
  if (!productFits(value, factor)) throw new MoneyError("overflow");
  return minorUnits(value * factor);
}

function legacyCandidate(
  value: number,
  precision: LegacyPrecision,
): MinorUnits {
  if (!Number.isFinite(value)) throw new MoneyError("invalid");
  const scaled = value * 100;
  const candidate = minorUnits(Math.round(scaled));
  // Δ em CENTAVOS. Inclusivo em transações; estrito em settings.
  const delta = Math.abs(scaled - candidate);
  if (precision === "transaction" ? delta > 0.00001 : delta >= 0.00001)
    throw new MoneyError("precision");
  return candidate;
}

// Validação do contrato bruto não é projeção nem normalização de settings.
export function hasLegacyPrecision(
  value: number,
  precision: LegacyPrecision,
): boolean {
  try {
    legacyCandidate(value, precision);
    return true;
  } catch (error) {
    if (error instanceof MoneyError) return false;
    throw error;
  }
}

export function fromLegacyReais(
  value: number,
  precision: LegacyPrecision = "transaction",
): MinorUnits {
  const candidate = legacyCandidate(value, precision);
  if (value !== 0 && candidate === 0) throw new MoneyError("subcentavo");
  return candidate;
}

// Apenas fronteira R$ number. Não usar para intermediários/agregados do domínio.
// Políticas do campo são aplicadas pelos validators legados, não pelo kernel.
export function toLegacyReais(value: MinorUnits): number {
  safeInteger(value);
  const reais = value / 100;
  if (Math.round(reais * 100) !== value) throw new MoneyError("precision");
  return reais;
}

export function parseMinorUnits(text: string, decimal: "," | "."): MinorUnits {
  let value = text.trim().replace(/R\$|\s/g, "");
  if (decimal === ",") {
    if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value))
      throw new MoneyError("invalid");
    value = value.replace(/\./g, "").replace(",", ".");
  } else {
    if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value))
      throw new MoneyError("invalid");
    value = value.replace(/,/g, "");
  }
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const digits = whole + fraction.padEnd(2, "0");
  let result = minorUnits(0);
  for (const digit of digits)
    result = checkedAdd(checkedMultiply(result, 10), minorUnits(Number(digit)));
  return negative ? checkedSubtract(minorUnits(0), result) : result;
}

// Consumidores previstos no plano: médias e closingProjection atuais em B1b.
// BigInt existe somente neste intermediário; API e resultado são Number seguros.
export function multiplyDivideRounded(
  value: MinorUnits,
  numerator: number,
  denominator: number,
): MinorUnits {
  safeInteger(value);
  safeInteger(numerator);
  safeInteger(denominator);
  if (denominator <= 0) throw new MoneyError("division");
  const product = BigInt(value) * BigInt(numerator);
  const divisor = BigInt(denominator);
  let quotient = product / divisor;
  const remainder = product % divisor;
  // Nearest, ties toward +infinity, compatível com a política Math.round.
  if (remainder >= 0n && remainder * 2n >= divisor) quotient += 1n;
  if (remainder < 0n && -remainder * 2n > divisor) quotient -= 1n;
  if (
    quotient > BigInt(Number.MAX_SAFE_INTEGER) ||
    quotient < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new MoneyError("overflow");
  return minorUnits(Number(quotient));
}

// Compara os produtos exatos dos limiares financeiros 100/120/85/115.
export function compareScaled(
  a: MinorUnits,
  aFactor: number,
  b: MinorUnits,
  bFactor: number,
): -1 | 0 | 1 {
  safeInteger(a);
  safeInteger(b);
  safeInteger(aFactor);
  safeInteger(bFactor);
  if (productFits(a, aFactor) && productFits(b, bFactor)) {
    const left = checkedMultiply(a, aFactor);
    const right = checkedMultiply(b, bFactor);
    return left < right ? -1 : left > right ? 1 : 0;
  }
  const left = BigInt(a) * BigInt(aFactor);
  const right = BigInt(b) * BigInt(bFactor);
  return left < right ? -1 : left > right ? 1 : 0;
}
