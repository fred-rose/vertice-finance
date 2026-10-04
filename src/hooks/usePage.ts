import { useEffect, useRef, useState } from "react";
import { workRegistry } from "./unsavedWork";
export type Page = "overview" | "transactions" | "settings";
const read = (hash = location.hash): Page =>
  hash === "#/transacoes"
    ? "transactions"
    : hash === "#/configuracoes"
      ? "settings"
      : "overview";
export function usePage() {
  const [page, setPage] = useState<Page>(read);
  const accepted = useRef(location.hash);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    function request(hash: string, alreadyChanged: boolean) {
      if (read(hash) === read(accepted.current)) {
        accepted.current = hash;
        return;
      }
      const flags = workRegistry.read();
      const destructive =
        read(accepted.current) === "settings" &&
        workRegistry.read("settings").hasUnsavedWork;
      if (flags.busy || destructive) {
        if (alreadyChanged)
          history.replaceState(
            history.state,
            "",
            location.pathname + location.search + accepted.current,
          );
        setBusy(flags.busy);
        setPending(hash);
        return;
      }
      accepted.current = hash;
      setPending(null);
      if (!alreadyChanged)
        history.pushState(null, "", hash || location.pathname);
      setPage(read(hash));
      window.scrollTo(0, 0);
    }
    const change = () => request(location.hash, true);
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>(
        'a[href^="#/"]',
      );
      if (!anchor || anchor.target) return;
      event.preventDefault();
      request(anchor.hash, false);
    };
    window.addEventListener("hashchange", change);
    document.addEventListener("click", click);
    return () => {
      window.removeEventListener("hashchange", change);
      document.removeEventListener("click", click);
    };
  }, []);
  return {
    page,
    pending,
    busy,
    cancel: () => setPending(null),
    confirm: () => {
      if (pending === null || workRegistry.read().busy) return;
      accepted.current = pending;
      history.pushState(null, "", pending || location.pathname);
      setPage(read(pending));
      setPending(null);
      window.scrollTo(0, 0);
    },
  };
}
