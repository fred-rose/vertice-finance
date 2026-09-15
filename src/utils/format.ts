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
export const monthKey = (date: Date) => localDate(date).slice(0, 7);
export const monthLabel = (date: Date) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    date,
  );
export const shortDate = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(
    new Date(`${date}T12:00:00`),
  );
export const changeLabel = (value: number | null) =>
  value === null
    ? "Sem base anterior"
    : `${value > 0 ? "+" : ""}${value.toFixed(1).replace(".", ",")}%`;
