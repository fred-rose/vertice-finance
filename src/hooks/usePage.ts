import { useEffect, useState } from "react";
export type Page = "overview" | "transactions" | "settings";
const read = (): Page =>
  location.hash === "#/transacoes"
    ? "transactions"
    : location.hash === "#/configuracoes"
      ? "settings"
      : "overview";
export function usePage() {
  const [page, setPage] = useState<Page>(read);
  useEffect(() => {
    const change = () => {
      setPage(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  return page;
}
