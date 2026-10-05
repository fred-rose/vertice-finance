import { useEffect, useState } from "react";
import { captureCivilCut } from "../utils/civil";
// Uma captura por render do App. Focus/visibilidade consultam novamente sem
// timer global, sem tocar revisão, sessão de edição ou conteúdo do draft.
export function useCivilToday() {
  const [, refresh] = useState(0);
  useEffect(() => {
    const focus = () => refresh((v) => v + 1);
    const visible = () => {
      if (document.visibilityState === "visible") focus();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return captureCivilCut().today;
}
