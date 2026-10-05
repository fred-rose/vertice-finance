import { asCivilMonth, civilDate, civilMonthLabel } from "./civil";
import { minorUnits, type MinorUnits } from "./money";

export const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
export const accountBalanceLabel = (value: number | null) =>
  value === null ? "Saldo indisponível para este período" : money(value);
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const monthKey = (date: Date | string) => asCivilMonth(date);
export const monthLabel = (date: Date | string) =>
  civilMonthLabel(asCivilMonth(date));
export const shortDate = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
  }).format(new Date(civilDate(date) + "T12:00:00Z"));
export const changeLabel = (value: number | null) =>
  value === null
    ? "Sem base anterior"
    : `${value > 0 ? "+" : ""}${value.toFixed(1).replace(".", ",")}%`;

// Texto exato de BRL, sem converter centavos para um decimal IEEE.
export function moneyMinor(value: MinorUnits): string {
  minorUnits(value);
  const digits = Math.abs(value).toString().padStart(3, "0");
  const whole = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${value < 0 ? "-" : ""}R$\u00a0${whole},${digits.slice(-2)}`;
}
// Borda visual das APIs compatíveis: toLegacyReais garantiu este roundtrip.
// Não usar esta recuperação de centavos para calcular métricas ou decisões.
export const moneyFromCalculation = (value: number) =>
  moneyMinor(minorUnits(Math.round(value * 100)));

export const calculationUnavailable =
  "Cálculo monetário indisponível. Os dados continuam disponíveis para consulta, edição e exportação.";
