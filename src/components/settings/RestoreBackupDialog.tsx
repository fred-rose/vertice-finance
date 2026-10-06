import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useUnsavedWork } from "../../hooks/useUnsavedWork";
import type { FinanceSnapshot } from "../../types/finance";
import {
  BackupValidationError,
  backupPreview,
  parseBackup,
  serializeBackup,
  type BackupV2,
} from "../../features/transactions/backup";
import { download } from "../../features/transactions/importExport";
import {
  RestoreError,
  type LocalRead,
} from "../../services/transactionRepository";
import { Dialog, DialogClose } from "../ui/Dialog";
import { RecoveryGuidance } from "./LocalDataRecovery";

export function RestoreBackupDialog({
  readForBackup,
  onRestore,
  onClose,
  invalidationKey = 0,
  invalidated = false,
  previewOnly = false,
}: {
  readForBackup: () => Promise<LocalRead>;
  onRestore: (snapshot: FinanceSnapshot, previous: LocalRead) => Promise<void>;
  onClose: () => void;
  invalidationKey?: number;
  invalidated?: boolean;
  previewOnly?: boolean;
}) {
  const work = useUnsavedWork();
  const invalid = useRef(false);
  if (invalidated) invalid.current = true;
  const generation = useRef(0);
  const lastKey = useRef(invalidationKey);
  if (lastKey.current !== invalidationKey) {
    generation.current++;
    lastKey.current = invalidationKey;
  }
  const [backup, setBackup] = useState<BackupV2 | null>(null);
  const [safety, setSafety] = useState<LocalRead | null>(null);
  const [busy, setBusyState] = useState("");
  const setBusy = (value: string) => {
    work.set({ busy: !!value });
    setBusyState(value);
  };
  const [error, setError] = useState("");
  const [verificationFailed, setVerificationFailed] = useState(false);
  const [safetyFailed, setSafetyFailed] = useState(false);
  const active = useRef(false);
  useLayoutEffect(() => {
    setSafety(null);
  }, [invalidationKey]);
  const preview = useMemo(
    () => (backup ? backupPreview(backup) : null),
    [backup],
  );
  async function select(file?: File) {
    if (active.current || invalid.current) return;
    active.current = true;
    setBackup(null);
    work.set({ hasUnsavedWork: false });
    setSafety(null);
    setSafetyFailed(false);
    setError("");
    setBusy("Lendo e validando o backup…");
    try {
      if (file) {
        const content = await file.text();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const parsed = parseBackup(content);
        setBackup(parsed);
        work.set({ hasUnsavedWork: true });
      }
    } catch (cause) {
      setError(
        cause instanceof BackupValidationError
          ? cause.message
          : "Não foi possível ler o arquivo. Selecione novamente o backup JSON v2.",
      );
    } finally {
      active.current = false;
      setBusy("");
    }
  }
  async function safetyDownload() {
    if (previewOnly || !backup || active.current || invalid.current) return;
    active.current = true;
    const started = generation.current;
    setSafety(null);
    setSafetyFailed(false);
    setError("");
    setBusy("Preparando o backup de segurança…");
    try {
      const current = await readForBackup();
      if (generation.current !== started || invalid.current) return;
      const content = serializeBackup(current.snapshot);
      download(
        content,
        `vertice-backup-pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
        "application/json",
      );
      setSafety(current);
    } catch {
      setSafetyFailed(true);
      setError(
        "Não foi possível gerar ou iniciar o download do backup de segurança. A restauração está bloqueada; seus dados não foram substituídos. Verifique o download e a integridade dos dados atuais.",
      );
    } finally {
      active.current = false;
      setBusy("");
    }
  }
  async function restore() {
    if (previewOnly || !backup || !safety || active.current || invalid.current)
      return;
    active.current = true;
    const started = generation.current;
    setError("");
    setBusy("Restaurando e verificando os dados…");
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (generation.current !== started) return;
      await onRestore(backup, safety);
      work.set({ hasUnsavedWork: false });
    } catch (cause) {
      setSafety(null);
      setVerificationFailed(
        cause instanceof RestoreError && cause.phase === "verify",
      );
      setError(
        cause instanceof RestoreError
          ? cause.message
          : "Não foi possível concluir a restauração. Guarde o backup de segurança e confira os dados antes de tentar novamente.",
      );
    } finally {
      active.current = false;
      setBusy("");
    }
  }
  return (
    <Dialog
      title={
        previewOnly
          ? "Conferir backup JSON (sem destino validado)"
          : "Restaurar backup JSON"
      }
      onClose={onClose}
      busy={!!busy}
      work={work}
    >
      {previewOnly && (
        <p>
          Prévia somente. Não é possível restaurar nesta base inválida. Use um
          perfil limpo com Personal validado.
        </p>
      )}
      <p className="dialog-description">
        O backup substituirá as transações e configurações do Personal
        capturado. O JSON v2 não identifica o espaço de origem. Feche outras
        abas do Vértice antes de continuar. Edições ainda não salvas não fazem
        parte do backup.
      </p>
      {invalid.current && (
        <p role="status">
          Esta sessão de restauração foi invalidada. Reabra para capturar o
          destino e preparar uma nova cópia de segurança.
        </p>
      )}
      {!verificationFailed && (
        <label>
          Arquivo de backup JSON v2
          <input
            data-autofocus
            type="file"
            accept=".json,application/json"
            style={{ maxWidth: "100%" }}
            disabled={!!busy || invalid.current}
            onChange={(e) => void select(e.target.files?.[0])}
          />
        </label>
      )}
      {preview && (
        <section aria-label="Prévia do backup" className="settings-section">
          <h3>Prévia do backup</h3>
          <p>
            Versão {preview.version} · {preview.transactions} transações ·{" "}
            {preview.accounts} contas · {preview.categories} categorias ·{" "}
            {preview.goals} metas.
          </p>
          <p>
            {preview.firstDate
              ? `Período dos registros: ${preview.firstDate} a ${preview.lastDate}.`
              : "Sem transações neste backup."}
          </p>
          <p>Exportado em: {preview.exportedAt}</p>
        </section>
      )}
      {busy && <p role="status">{busy}</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {safety && (
        <p role="status" className="form-note">
          O download da cópia de recuperação foi iniciado. Confira o arquivo
          baixado e guarde-o até verificar que a restauração ficou correta.
        </p>
      )}
      {(safetyFailed || previewOnly) && <RecoveryGuidance />}
      <div className="dialog-actions row-actions">
        <DialogClose disabled={!!busy}>
          {verificationFailed ? "Fechar" : "Cancelar"}
        </DialogClose>
        {!verificationFailed && (
          <>
            <button
              type="button"
              className="secondary-button"
              disabled={previewOnly || !backup || !!busy || invalid.current}
              onClick={() => void safetyDownload()}
            >
              Baixar backup de segurança
            </button>
            <button
              type="button"
              className="danger-button"
              disabled={previewOnly || !safety || !!busy || invalid.current}
              onClick={() => void restore()}
            >
              Restaurar este backup
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}
