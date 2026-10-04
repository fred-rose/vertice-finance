import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { WorkOwner } from "../../hooks/useUnsavedWork";
import { motion } from "framer-motion";
import { X } from "lucide-react";
const CloseContext = createContext<() => void>(() => {});
export function DialogClose({
  children,
  disabled = false,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  const close = useContext(CloseContext);
  return (
    <button
      type="button"
      className="secondary-button"
      disabled={disabled}
      onClick={close}
    >
      {children}
    </button>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  busy = false,
  wide = false,
  work,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  work?: WorkOwner;
}) {
  const [confirm, setConfirm] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  function resume() {
    setConfirm(false);
    returnFocus.current?.focus();
  }
  function requestClose() {
    if (busy || work?.get().busy) return;
    if (confirm) {
      resume();
      return;
    }
    if (work?.get().hasUnsavedWork) {
      returnFocus.current = document.activeElement as HTMLElement;
      setConfirm(true);
    } else onClose();
  }
  useEffect(() => {
    if (confirm) continueRef.current?.focus();
    else returnFocus.current?.focus();
  }, [confirm]);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current!;
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    el.showModal();
    document.body.style.overflow = "hidden";
    el.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      el.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`transaction-dialog ${wide ? "wide-dialog" : ""}`}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          requestClose();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            requestClose();
        }
      }}
    >
      <motion.div
        className="modal-content"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="section-heading">
          <div>
            <span className="eyebrow">FINANÇAS PESSOAIS</span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar"
            onClick={requestClose}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </div>
        <CloseContext.Provider value={requestClose}>
          <div hidden={confirm}>{children}</div>
        </CloseContext.Provider>
        {confirm && (
          <div role="group" aria-label="Confirmar descarte">
            <p>Há alterações não salvas.</p>
            <div className="dialog-actions">
              <button
                ref={continueRef}
                type="button"
                className="secondary-button"
                onClick={resume}
              >
                Continuar editando
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  if (busy || work?.get().busy) return;
                  work?.set({ hasUnsavedWork: false });
                  onClose();
                }}
              >
                Descartar e fechar
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </dialog>
  );
}
