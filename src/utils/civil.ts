// Calendário de caixa; estes brands não alteram DTOs persistidos.
declare const civilDateBrand: unique symbol;
declare const civilMonthBrand: unique symbol;
declare const instantBrand: unique symbol;
export type CivilDate = string & { readonly [civilDateBrand]: true };
export type CivilMonth = string & { readonly [civilMonthBrand]: true };
export type Instant = string & { readonly [instantBrand]: true };
const pad = (n: number) => String(n).padStart(2, "0");
export function daysInMonth(year: number, month: number): number {
  if (
    !Number.isInteger(year) ||
    year < 1 ||
    year > 9999 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  )
    throw new RangeError("Mês civil inválido.");
  return month === 2
    ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
      ? 29
      : 28
    : [4, 6, 9, 11].includes(month)
      ? 30
      : 31;
}
export function isCivilDate(value: string): value is CivilDate {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "1900-01-01" ||
    value > "9999-12-31"
  )
    return false;
  const [year, month, day] = value.split("-").map(Number);
  return (
    month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
  );
}
export function civilDate(value: string): CivilDate {
  if (!isCivilDate(value))
    throw new RangeError("Data civil inválida (1900–9999).");
  return value;
}
// Meses anteriores a 1900 são necessários apenas para janelas sem fatos na
// borda mínima; não tornam transações anteriores a 1900 válidas.
export function civilMonth(value: string): CivilMonth {
  if (!/^\d{4}-\d{2}$/.test(value)) throw new RangeError("Mês civil inválido.");
  const [year, month] = value.split("-").map(Number);
  daysInMonth(year, month);
  return value as CivilMonth;
}
export function dateMonth(value: CivilDate): CivilMonth {
  return civilMonth(civilDate(value).slice(0, 7));
}
export function monthParts(value: CivilMonth) {
  return civilMonth(value).split("-").map(Number) as [number, number];
}
export function shiftMonth(value: CivilMonth, delta: number): CivilMonth {
  if (!Number.isInteger(delta))
    throw new RangeError("Deslocamento civil inválido.");
  const [year, month] = monthParts(value),
    index = year * 12 + month - 1 + delta;
  return civilMonth(
    String(Math.floor(index / 12)).padStart(4, "0") +
      "-" +
      pad((index % 12) + 1),
  );
}
export function shiftDateMonth(value: CivilDate, delta: number): CivilDate {
  const month = shiftMonth(dateMonth(value), delta),
    [year, m] = monthParts(month);
  return civilDate(
    month + "-" + pad(Math.min(Number(value.slice(8)), daysInMonth(year, m))),
  );
}
const daysBeforeYear = (year: number) => {
  const y = year - 1;
  return (
    365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400)
  );
};
function ordinal(value: CivilDate) {
  const [year, month, day] = civilDate(value).split("-").map(Number);
  let result = daysBeforeYear(year) + day;
  for (let m = 1; m < month; m++) result += daysInMonth(year, m);
  return result;
}
export function addCivilDays(value: CivilDate, delta: number): CivilDate {
  if (!Number.isSafeInteger(delta))
    throw new RangeError("Deslocamento civil inválido.");
  const target = ordinal(value) + delta;
  if (
    !Number.isSafeInteger(target) ||
    target < daysBeforeYear(1900) + 1 ||
    target > daysBeforeYear(10000)
  )
    throw new RangeError("Data civil fora de 1900–9999.");
  let low = 1900,
    high = 9999;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (daysBeforeYear(mid) < target) low = mid;
    else high = mid - 1;
  }
  let day = target - daysBeforeYear(low),
    month = 1;
  while (day > daysInMonth(low, month)) {
    day -= daysInMonth(low, month);
    month++;
  }
  return civilDate(
    String(low).padStart(4, "0") + "-" + pad(month) + "-" + pad(day),
  );
}
export function instant(value: string): Instant {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match || !Number.isFinite(Date.parse(value)))
    throw new RangeError("Instante inválido.");
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    throw new RangeError("Instante inválido.");
  return value as Instant;
}
export function civilAt(value: Instant, timezone: string): CivilDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant(value)));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return civilDate(
    get("year").padStart(4, "0") + "-" + get("month") + "-" + get("day"),
  );
}
export function captureCivilCut(
  now = new Date(),
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const at = instant(now.toISOString());
  return { instant: at, today: civilAt(at, timezone), timezone };
}
// Adapters públicos de compatibilidade Date local; núcleo usa strings civis.
export function asCivilDate(value: string | Date): CivilDate {
  return civilDate(
    typeof value === "string"
      ? value
      : String(value.getFullYear()).padStart(4, "0") +
          "-" +
          pad(value.getMonth() + 1) +
          "-" +
          pad(value.getDate()),
  );
}
export function asCivilMonth(value: string | Date): CivilMonth {
  return civilMonth(
    typeof value === "string"
      ? value.slice(0, 7)
      : String(value.getFullYear()).padStart(4, "0") +
          "-" +
          pad(value.getMonth() + 1),
  );
}
// Date é apenas veículo de Intl na borda visual, sempre UTC explícito.
export function civilMonthLabel(value: CivilMonth, short = false): string {
  const label = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" }),
  }).format(new Date(civilMonth(value) + "-01T12:00:00Z"));
  return short ? label.replace(".", "") : label;
}
