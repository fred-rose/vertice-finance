import { workRegistry } from "../hooks/unsavedWork";
export interface PwaState {
  offlineReady: boolean;
  updateAvailable: boolean;
  updating: boolean;
  error: string;
}
export const initialPwaState: PwaState = {
  offlineReady: false,
  updateAvailable: false,
  updating: false,
  error: "",
};
export const pwaEnabled =
  import.meta.env.PROD &&
  import.meta.env.VITE_DISABLE_PWA !== "true" &&
  "serviceWorker" in navigator &&
  window.isSecureContext &&
  ["http:", "https:"].includes(location.protocol);

// Only assets belong to the worker. Financial persistence stays in the repository.
export function registerPwa(notify: (state: PwaState) => void) {
  if (!pwaEnabled) return { update() {}, dispose() {} };
  let state = { ...initialPwaState };
  let registration: ServiceWorkerRegistration | undefined;
  let disposed = false;
  let requestedReload = false;
  let hadController = !!navigator.serviceWorker?.controller;
  let lastCheck = 0;
  let reloadTimeout: ReturnType<typeof setTimeout> | undefined;
  const listeners: (() => void)[] = [];
  const publish = (patch: Partial<PwaState>) => {
    state = { ...state, ...patch };
    if (!disposed) notify(state);
  };
  const safe = () => {
    const flags = workRegistry.read();
    return !flags.hasUnsavedWork && !flags.busy;
  };
  const defer = () => {
    requestedReload = false;
    clearTimeout(reloadTimeout);
    publish({
      updating: false,
      updateAvailable: true,
      error: "Versão pronta. Conclua sua edição antes de recarregar.",
    });
  };
  listeners.push(
    workRegistry.subscribe(() => {
      if (requestedReload && !safe()) defer();
    }),
  );
  const listen = (target: EventTarget, event: string, callback: () => void) => {
    target.addEventListener(event, callback);
    listeners.push(() => target.removeEventListener(event, callback));
  };
  const checkUpdate = () => {
    if (
      !registration ||
      !navigator.onLine ||
      document.visibilityState === "hidden"
    )
      return;
    if (Date.now() - lastCheck < 60_000) return;
    lastCheck = Date.now();
    // Offline/check failures never interrupt local financial operations.
    void registration.update().catch(() => {});
  };
  const watchInstalling = () => {
    const worker = registration?.installing;
    if (!worker) return;
    const changed = () => {
      if (worker.state === "installed") {
        publish(
          navigator.serviceWorker.controller
            ? { updateAvailable: true }
            : { offlineReady: true },
        );
      }
    };
    listen(worker, "statechange", changed);
    changed();
  };
  {
    listen(navigator.serviceWorker, "controllerchange", () => {
      if (requestedReload) {
        clearTimeout(reloadTimeout);
        requestedReload = false;
        if (safe()) location.reload();
        else defer();
      } else {
        // Another tab may activate a worker. Never reload this tab's draft.
        publish({ offlineReady: true, updateAvailable: hadController });
        hadController = true;
      }
    });
    listen(window, "online", checkUpdate);
    listen(window, "focus", checkUpdate);
    listen(document, "visibilitychange", checkUpdate);
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: "none",
      })
      .then((value) => {
        if (disposed) return;
        registration = value;
        publish({
          offlineReady: !!value.active,
          updateAvailable: !!value.waiting,
        });
        listen(value, "updatefound", watchInstalling);
        watchInstalling();
        checkUpdate();
      })
      .catch(() =>
        publish({
          error:
            "Não foi possível preparar o modo offline. Tente reabrir o aplicativo com conexão.",
        }),
      );
  }
  const interval = setInterval(checkUpdate, 60 * 60 * 1000);
  return {
    update() {
      if (disposed || !state.updateAvailable || state.updating) return;
      if (!safe()) {
        publish({
          error: workRegistry.read().busy
            ? "Aguarde a operação terminar."
            : "Há uma atualização disponível. Salve ou descarte suas alterações antes de atualizar.",
        });
        return;
      }
      publish({ updating: true, error: "" });
      if (!registration?.waiting) {
        if (safe())
          location.reload(); // A different tab already activated the update.
        else defer();
        return;
      }
      requestedReload = true;
      const worker = registration.waiting;
      const fail = () => {
        requestedReload = false;
        clearTimeout(reloadTimeout);
        publish({
          updating: false,
          error:
            "A atualização não terminou. Tente novamente quando estiver pronto.",
        });
      };
      listen(worker, "statechange", () => {
        if (worker.state === "redundant") fail();
      });
      reloadTimeout = setTimeout(fail, 15_000);
      try {
        worker.postMessage({ type: "SKIP_WAITING" });
      } catch {
        fail();
        return;
      }
    },
    dispose() {
      disposed = true;
      requestedReload = false;
      clearInterval(interval);
      clearTimeout(reloadTimeout);
      listeners.forEach((remove) => remove());
    },
  };
}
