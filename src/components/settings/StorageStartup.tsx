import { useState } from "react";
import type {
  BootState,
  createStorageBootstrap,
} from "../../services/storageBootstrap";
import { ScopedStorageError } from "../../services/scopedStorageProtocol";
import { download } from "../../features/transactions/importExport";
import { RestoreBackupDialog } from "./RestoreBackupDialog";
import { RecoveryGuidance } from "./LocalDataRecovery";
import { useWorkFlags } from "../../hooks/useUnsavedWork";
export function storageMessage(error: Error) {
  if (!(error instanceof ScopedStorageError)) return error.message;
  switch (error.code) {
    case "request-failure":
      return "Não foi possível acessar os dados locais. Seus registros foram preservados; tente novamente.";
    case "unsupported-version":
      return "Este banco usa uma versão não suportada. Abra uma versão compatível do Vértice; os dados foram preservados.";
    case "blocked":
      return "Feche a outra aba ou versão do Vértice que está bloqueando a atualização. Nenhum fechamento foi forçado.";
    case "stale-safety":
      return "Os dados mudaram desde a cópia de segurança. Prepare e baixe uma nova cópia antes de continuar.";
    case "migration-aborted":
      return "Atualização local cancelada ou impedida por trabalho não salvo. Retome com uma nova cópia de segurança. Uma atualização já comprometida será validada na retomada.";
    case "closed":
      return "Esta sessão foi invalidada por uma mudança no armazenamento. Seus rascunhos foram preservados para consulta. Reabra a edição para usar uma nova sessão.";
    case "quota":
      return "Não foi possível concluir por falta de espaço. A transação foi revertida. Preserve sua cópia de segurança antes de tentar novamente.";
    default:
      return (
        "Não foi possível validar os dados locais (" +
        error.code +
        "). Seus registros foram preservados; não é seguro mostrar saldos ou editar esta base."
      );
  }
}
export function StorageStartup({
  state,
  coordinator,
  onPreview,
}: {
  state: BootState;
  coordinator: ReturnType<typeof createStorageBootstrap>;
  onPreview?: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false),
    [initiated, setInitiated] = useState(false),
    [error, setError] = useState("");
  const flags = useWorkFlags();
  const [preview, setPreview] = useState(false);
  return (
    <section
      className="panel empty-state"
      aria-label={
        state.status === "recovery"
          ? "Recuperação de dados locais"
          : "Inicialização dos dados locais"
      }
    >
      {(state.status === "loading" || state.status === "migrating") && (
        <p role="status">
          {state.status === "loading"
            ? "Verificando os dados locais…"
            : "Atualizando os dados locais… Aguarde antes de editar."}
        </p>
      )}
      {state.status === "migration-required" && (
        <>
          <h1>Atualização dos dados locais</h1>
          <p>
            Seus dados serão organizados no espaço Personal deste navegador.
            Prepare uma cópia antes de continuar. A atualização preserva seus
            registros. A operação pode demorar alguns segundos; aguarde sua
            conclusão.
          </p>
          <p>
            Backup preparado. O navegador não confirma que o arquivo foi
            guardado.
          </p>
          {initiated && (
            <p role="status">Download iniciado. Confira e guarde sua cópia.</p>
          )}
          <button
            className="secondary-button"
            disabled={flags.busy || flags.hasUnsavedWork}
            onClick={() => {
              setConfirmed(false);
              setInitiated(false);
              setError("");
              try {
                coordinator.downloadSafety((json) =>
                  download(
                    json,
                    "vertice-backup-pre-atualizacao.json",
                    "application/json",
                  ),
                );
                setInitiated(true);
              } catch {
                setError(
                  "Não foi possível preparar ou iniciar o download. A atualização continua bloqueada.",
                );
              }
            }}
          >
            Baixar cópia de segurança
          </button>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!initiated}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Confirmei que guardei a cópia de segurança
          </label>
          <button
            className="primary-button"
            disabled={
              !confirmed || !initiated || flags.busy || flags.hasUnsavedWork
            }
            onClick={() => void coordinator.promote(confirmed)}
          >
            Atualizar dados locais
          </button>
          <button className="secondary-button" onClick={coordinator.cancel}>
            Cancelar atualização
          </button>
          {(flags.busy || flags.hasUnsavedWork) && (
            <p role="alert">
              Conclua ou descarte seu trabalho não salvo antes da atualização.
              Prepare uma nova cópia ao retomar.
            </p>
          )}
        </>
      )}
      {state.status === "migrating" && (
        <button className="secondary-button" onClick={coordinator.cancel}>
          Cancelar atualização
        </button>
      )}
      {state.status === "recovery" && (
        <>
          <p role="alert">{storageMessage(state.error)}</p>
          <button
            className="secondary-button"
            onClick={() => void coordinator.start()}
          >
            Tentar novamente
          </button>
          <button
            className="secondary-button"
            onClick={() => (onPreview ? onPreview() : setPreview(true))}
          >
            Restaurar backup JSON
          </button>
          <p>
            Esta base não tem um destino financeiro validado. Aqui você pode
            apenas conferir o arquivo; restaure-o em outro perfil limpo.
          </p>
          <RecoveryGuidance />
        </>
      )}
      {preview && state.status === "recovery" && (
        <RestoreBackupDialog
          previewOnly
          readForBackup={() =>
            Promise.reject(new ScopedStorageError("invalid-snapshot"))
          }
          onRestore={() =>
            Promise.reject(new ScopedStorageError("invalid-snapshot"))
          }
          onClose={() => setPreview(false)}
        />
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
