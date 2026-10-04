import { useEffect, useRef, useState } from "react";
import { initialPwaState, pwaEnabled, registerPwa } from "../../pwa/register";
import { useWorkFlags } from "../../hooks/useUnsavedWork";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaControls({ showInstall }: { showInstall: boolean }) {
  const work = useWorkFlags();
  const [state, setState] = useState(initialPwaState);
  const registration = useRef<ReturnType<typeof registerPwa> | null>(null);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [installError, setInstallError] = useState("");
  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const installed = () => {
      setStandalone(
        display.matches ||
          !!(navigator as Navigator & { standalone?: boolean }).standalone,
      );
    };
    const available = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const complete = () => {
      setPrompt(null);
      setStandalone(true);
    };
    installed();
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", complete);
    display.addEventListener("change", installed);
    const worker = registerPwa(setState);
    registration.current = worker;
    return () => {
      worker.dispose();
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", complete);
      display.removeEventListener("change", installed);
    };
  }, []);
  const canInstall = showInstall && !!prompt && !standalone;
  if (!pwaEnabled || (!state.updateAvailable && !showInstall)) return null;
  return (
    <aside className="pwa-controls" aria-label="Aplicativo neste dispositivo">
      {state.updateAvailable && (
        <div className="pwa-action">
          <p>
            <strong>Nova versão disponível.</strong>{" "}
            {work.busy
              ? "Aguarde a operação terminar."
              : work.hasUnsavedWork
                ? "Salve ou descarte suas alterações antes de atualizar."
                : "Atualize quando estiver pronto."}
          </p>
          <button
            type="button"
            className="secondary-button"
            disabled={state.updating || work.busy || work.hasUnsavedWork}
            onClick={() => registration.current?.update()}
          >
            {state.updating ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      )}
      {showInstall && (
        <p className="form-note">
          {standalone ? "Vértice instalado neste dispositivo. " : ""}
          {state.offlineReady
            ? "Aplicativo pronto para uso offline. Seus dados continuam neste navegador."
            : "O modo offline fica disponível após a primeira carga completa com conexão."}
        </p>
      )}
      {canInstall && (
        <button
          type="button"
          className="text-link"
          onClick={async () => {
            const event = prompt!;
            setPrompt(null);
            setInstallError("");
            try {
              await event.prompt();
              await event.userChoice;
            } catch {
              setInstallError(
                "Use o menu do navegador para instalar o Vértice.",
              );
            }
          }}
        >
          Instalar Vértice neste dispositivo
        </button>
      )}
      {(state.error || installError) && (
        <p className="form-note" role="status">
          {state.error || installError}
        </p>
      )}
    </aside>
  );
}
