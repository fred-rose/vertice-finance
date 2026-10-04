import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanWork, workRegistry } from "../hooks/unsavedWork";
let worker: EventTarget & {
  state: string;
  postMessage: ReturnType<typeof vi.fn>;
};
let service: EventTarget & {
  controller: object;
  register: ReturnType<typeof vi.fn>;
};
let registration: EventTarget & {
  waiting: typeof worker | null;
  active: object;
  update: ReturnType<typeof vi.fn>;
};
let reload: ReturnType<typeof vi.fn>;
const lease = {};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("PROD", true);
  worker = Object.assign(new EventTarget(), {
    state: "installed",
    postMessage: vi.fn(),
  });
  registration = Object.assign(new EventTarget(), {
    waiting: worker as typeof worker | null,
    active: {},
    update: vi.fn().mockResolvedValue(undefined),
  });
  service = Object.assign(new EventTarget(), {
    controller: {},
    register: vi.fn().mockResolvedValue(registration),
  });
  reload = vi.fn();
  vi.stubGlobal("navigator", { serviceWorker: service, onLine: true });
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { isSecureContext: true }),
  );
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), { visibilityState: "visible" }),
  );
  vi.stubGlobal("location", { protocol: "https:", reload });
  workRegistry.register("pwa-test", lease, "settings", cleanWork);
});
afterEach(() => {
  workRegistry.remove("pwa-test", lease);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function setup() {
  vi.resetModules();
  // Keep the registry singleton shared with this test across the dynamic import.
  vi.doMock("../hooks/unsavedWork", () => ({ workRegistry }));
  const { registerPwa } = await import("./register");
  const notify = vi.fn();
  const api = registerPwa(notify);
  await Promise.resolve();
  return { api, notify };
}
it.each(["dirty", "busy"] as const)(
  "%s blocks request synchronously, and clearing it requires another click",
  async (kind) => {
    const { api } = await setup();
    workRegistry.update("pwa-test", lease, {
      ...cleanWork,
      hasUnsavedWork: kind === "dirty",
      busy: kind === "busy",
    });
    api.update();
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    workRegistry.update("pwa-test", lease, cleanWork);
    expect(worker.postMessage).not.toHaveBeenCalled();
    api.update();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    service.dispatchEvent(new Event("controllerchange"));
    expect(reload).toHaveBeenCalledTimes(1);
    api.dispose();
  },
);
it("dirty then clean during activation revokes old permission permanently", async () => {
  const { api } = await setup();
  api.update();
  workRegistry.update("pwa-test", lease, {
    ...cleanWork,
    hasUnsavedWork: true,
  });
  workRegistry.update("pwa-test", lease, cleanWork);
  service.dispatchEvent(new Event("controllerchange"));
  expect(reload).not.toHaveBeenCalled();
  registration.waiting = null;
  api.update();
  expect(reload).toHaveBeenCalledTimes(1);
  api.dispose();
});
it("no waiting still guards dirty and busy", async () => {
  const { api } = await setup();
  registration.waiting = null;
  workRegistry.update("pwa-test", lease, {
    ...cleanWork,
    hasUnsavedWork: true,
  });
  api.update();
  expect(reload).not.toHaveBeenCalled();
  workRegistry.update("pwa-test", lease, { ...cleanWork, busy: true });
  api.update();
  expect(reload).not.toHaveBeenCalled();
  workRegistry.update("pwa-test", lease, cleanWork);
  api.update();
  expect(reload).toHaveBeenCalledTimes(1);
  api.dispose();
});
it.each(["timeout", "redundant", "throw", "dispose"] as const)(
  "%s cancels permission; a late controllerchange cannot reload",
  async (failure) => {
    const { api } = await setup();
    if (failure === "throw")
      worker.postMessage.mockImplementation(() => {
        throw Error("post failed");
      });
    api.update();
    if (failure === "timeout") vi.advanceTimersByTime(15000);
    if (failure === "redundant") {
      worker.state = "redundant";
      worker.dispatchEvent(new Event("statechange"));
    }
    if (failure === "dispose") api.dispose();
    service.dispatchEvent(new Event("controllerchange"));
    expect(reload).not.toHaveBeenCalled();
    api.dispose();
  },
);
it("double click sends once; repeated controllerchange reloads only once", async () => {
  const { api } = await setup();
  api.update();
  api.update();
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  service.dispatchEvent(new Event("controllerchange"));
  service.dispatchEvent(new Event("controllerchange"));
  expect(reload).toHaveBeenCalledTimes(1);
  api.dispose();
});
