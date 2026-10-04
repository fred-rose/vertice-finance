import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { DashboardLayout } from "./components/dashboard/DashboardLayout";
import { OverviewPage } from "./components/dashboard/OverviewPage";
import { TransactionsPage } from "./components/transactions/TransactionsPage";
import { AddTransactionModal } from "./components/transactions/AddTransactionModal";
import { ImportModal } from "./components/transactions/ImportModal";
import { SettingsPage } from "./components/settings/SettingsPage";
import { RestoreBackupDialog } from "./components/settings/RestoreBackupDialog";
import { LocalDataRecovery } from "./components/settings/LocalDataRecovery";
import { Dialog, DialogClose } from "./components/ui/Dialog";
import { useTransactions } from "./hooks/useTransactions";
import { usePage } from "./hooks/usePage";
import { monthKey, monthLabel } from "./utils/format";
import type { NewTransaction, Transaction } from "./types/finance";
import { LocalConflictError } from "./services/transactionRepository";
import { PwaControls } from "./components/pwa/PwaControls";
import { useBeforeUnload, useUnsavedWork } from "./hooks/useUnsavedWork";
import { workRegistry } from "./hooks/unsavedWork";
import type { FinanceSnapshot, FinanceSettings } from "./types/finance";
export default function App() {
  useBeforeUnload();
  const actionWork = useUnsavedWork();
  const finance = useTransactions();
  const snapshot = finance.snapshot;
  const navigation = usePage();
  const page = navigation.page;
  const [selected, setSelected] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [editor, setEditor] = useState<{
    transaction?: Transaction;
    revision: number;
    version: number;
    settings: FinanceSettings;
  } | null>(null);
  const [importing, setImporting] = useState<{
    revision: number;
    version: number;
    snapshot: FinanceSnapshot;
  } | null>(null);
  const [settingsSession, setSettingsSession] = useState<{
    revision: number;
    version: number;
    snapshot: FinanceSnapshot;
    id: number;
  } | null>(null);
  const nextSession = useRef(0);
  useEffect(() => {
    if (page !== "settings") {
      setSettingsSession(null);
      return;
    }
    const retainedWork = workRegistry.read("settings");
    if (!snapshot) {
      if (!retainedWork.hasUnsavedWork && !retainedWork.busy)
        setSettingsSession(null);
      return;
    }
    if (
      !settingsSession ||
      (settingsSession.version !== finance.restoreVersion &&
        !retainedWork.hasUnsavedWork &&
        !retainedWork.busy)
    )
      setSettingsSession({
        revision: finance.revision!,
        version: finance.restoreVersion,
        snapshot,
        id: ++nextSession.current,
      });
  }, [
    page,
    snapshot,
    settingsSession,
    finance.revision,
    finance.restoreVersion,
  ]);
  const restoreKey = finance.restoreVersion * 2 + (snapshot ? 0 : 1);
  const openEditor = (transaction?: Transaction) => {
    if (snapshot && !editor)
      setEditor({
        transaction,
        revision: finance.revision!,
        version: finance.restoreVersion,
        settings: snapshot.settings,
      });
  };
  const openImport = () => {
    if (snapshot && !importing)
      setImporting({
        revision: finance.revision!,
        version: finance.restoreVersion,
        snapshot,
      });
  };
  const [restoring, setRestoring] = useState(false);
  const [restorePending, setRestorePending] = useState(false);
  function requestRestore() {
    const flags = workRegistry.read();
    if (flags.busy) {
      setNotice("Aguarde a operação terminar.");
      return;
    }
    if (flags.hasUnsavedWork) setRestorePending(true);
    else setRestoring(true);
  }
  const [notice, setNotice] = useState("");
  const [removeDemo, setRemoveDemo] = useState<number | null>(null);
  const [actionConflict, setActionConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  useEffect(() => {
    if (!finance.restoreVersion) return;
    setRemoveDemo(null);
  }, [finance.restoreVersion]);
  useEffect(() => {
    if (snapshot) return;
    setRemoveDemo(null);
  }, [snapshot]);
  const title =
    page === "overview"
      ? "Visão geral"
      : page === "transactions"
        ? "Transações"
        : "Configurações";
  useEffect(() => {
    document.title = `Vértice · ${title}`;
  }, [title]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function save(input: NewTransaction) {
    if (!editor || !snapshot || editor.version !== finance.restoreVersion)
      return;
    await finance.saveTransaction(input, editor.revision, editor.transaction);
    setSelected(new Date(`${input.date.slice(0, 7)}-01T12:00:00`));
    setNotice("Transação salva. Sua visão geral está atualizada.");
  }
  const demoCount =
    snapshot?.transactions.filter((t) => t.source === "demo").length ?? 0;
  return (
    <DashboardLayout page={page}>
      <header className="topbar">
        <span>
          Finanças pessoais <span className="breadcrumb-separator">/</span>{" "}
          <b>{title}</b>
        </span>
        <span className="topbar-right">
          <span className="status-dot" />
          {snapshot
            ? "Salvo neste navegador"
            : finance.loading
              ? "Carregando dados locais"
              : "Dados locais indisponíveis"}
          <span className="avatar small-avatar">P</span>
        </span>
      </header>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="dashboard-content"
      >
        <div className="page-heading">
          <div>
            <span className="eyebrow">SEU DINHEIRO, COM PERSPECTIVA</span>
            <h1>
              {title}
              <span>.</span>
            </h1>
            <p>
              {page === "overview"
                ? "Entenda seu presente. Planeje seu próximo passo."
                : page === "transactions"
                  ? "Cada movimento faz parte da sua história."
                  : "Seu ponto de partida. Suas prioridades."}
            </p>
          </div>
          <div className="heading-actions">
            {page === "overview" && (
              <div className="month-selector">
                <button
                  className="icon-button"
                  aria-label="Mês anterior"
                  disabled={monthKey(selected) <= "1900-01"}
                  onClick={() =>
                    setSelected(
                      new Date(
                        selected.getFullYear(),
                        selected.getMonth() - 1,
                        1,
                      ),
                    )
                  }
                >
                  <ChevronLeft size={16} />
                </button>
                <CalendarDays size={15} />
                <span>{monthLabel(selected)}</span>
                <button
                  className="icon-button"
                  aria-label="Próximo mês"
                  disabled={monthKey(selected) >= monthKey(new Date())}
                  onClick={() =>
                    setSelected(
                      new Date(
                        selected.getFullYear(),
                        selected.getMonth() + 1,
                        1,
                      ),
                    )
                  }
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
            {page !== "settings" && (
              <button
                className={`primary-button ${page === "overview" ? "desktop-add" : ""}`}
                disabled={!snapshot || finance.loading || !!finance.error}
                onClick={() => openEditor()}
              >
                <Plus size={18} />
                Adicionar transação
              </button>
            )}
          </div>
        </div>
        <PwaControls showInstall={page === "settings"} />
        {finance.loading ? (
          <div className="panel empty-state" role="status">
            Preparando sua visão financeira…
          </div>
        ) : finance.error ? (
          <LocalDataRecovery
            error={finance.error}
            onRetry={() => void finance.refresh()}
            onRestore={requestRestore}
          />
        ) : snapshot ? (
          <>
            {demoCount > 0 && (
              <div className="demo-banner">
                <span>
                  {demoCount} lançamentos demonstrativos estão incluídos nos
                  cálculos.
                </span>
                <button
                  className="text-link"
                  onClick={() => {
                    setActionError("");
                    setActionConflict(false);
                    setRemoveDemo(finance.revision!);
                  }}
                >
                  Remover demonstração
                </button>
              </div>
            )}
            {page === "overview" ? (
              <OverviewPage
                transactions={snapshot.transactions}
                settings={snapshot.settings}
                selected={selected}
                onAdd={() => openEditor()}
                onImport={openImport}
              />
            ) : page === "transactions" ? (
              <TransactionsPage
                transactions={snapshot.transactions}
                settings={snapshot.settings}
                revision={finance.revision!}
                onEdit={(transaction) => openEditor(transaction)}
                onDelete={async (id, revision) => {
                  await finance.removeTransaction(id, revision);
                  setNotice(
                    "Transação excluída. Seus totais foram recalculados.",
                  );
                }}
                onImport={openImport}
              />
            ) : null}
          </>
        ) : null}
        {settingsSession && page === "settings" && (
          <SettingsPage
            key={settingsSession.id}
            settings={(snapshot ?? settingsSession.snapshot).settings}
            transactions={(snapshot ?? settingsSession.snapshot).transactions}
            revision={finance.revision ?? settingsSession.revision}
            invalidated={
              !snapshot || settingsSession.version !== finance.restoreVersion
            }
            onSave={finance.saveSettings}
            onRestore={requestRestore}
            onDiscard={() => setSettingsSession(null)}
          />
        )}
        {snapshot && !finance.loading && !finance.error && (
          <footer className="page-footer">
            <span>
              vértice<span className="text-mint">.</span>{" "}
              <span>Clareza para suas próximas decisões.</span>
            </span>
            <span>Dados locais · Exporte uma cópia nas configurações.</span>
          </footer>
        )}
      </motion.div>
      {navigation.pending !== null &&
        (navigation.busy ? (
          <p role="status">
            Aguarde a operação terminar.{" "}
            <button onClick={navigation.cancel}>Continuar</button>
          </p>
        ) : (
          <Dialog title="Há alterações não salvas." onClose={navigation.cancel}>
            <p>Descartar a edição e sair desta página?</p>
            <div className="dialog-actions">
              <button className="secondary-button" onClick={navigation.cancel}>
                Continuar editando
              </button>
              <button className="danger-button" onClick={navigation.confirm}>
                Descartar e sair
              </button>
            </div>
          </Dialog>
        ))}
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
          <button
            className="icon-button"
            aria-label="Dispensar confirmação"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
      {restorePending && (
        <Dialog
          title="Há alterações não salvas."
          onClose={() => setRestorePending(false)}
        >
          <p>Descarte as edições abertas antes de iniciar a restauração.</p>
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => setRestorePending(false)}
            >
              Continuar editando
            </button>
            <button
              className="danger-button"
              onClick={() => {
                if (workRegistry.read().busy) return;
                setEditor(null);
                setImporting(null);
                setSettingsSession(null);
                setRestorePending(false);
                setRestoring(true);
              }}
            >
              Descartar e continuar
            </button>
          </div>
        </Dialog>
      )}
      {editor && (
        <AddTransactionModal
          settings={editor.settings}
          invalidated={!snapshot || editor.version !== finance.restoreVersion}
          transaction={editor.transaction}
          onSave={save}
          onClose={() => setEditor(null)}
        />
      )}
      {restoring && (
        <RestoreBackupDialog
          invalidationKey={restoreKey}
          readForBackup={finance.readForBackup}
          onClose={() => setRestoring(false)}
          onRestore={async (next, previous) => {
            await finance.restoreBackup(next, previous);
            setRestoring(false);
            setNotice(
              "Backup restaurado e verificado. Seus dados foram recuperados.",
            );
          }}
        />
      )}
      {importing !== null && (
        <ImportModal
          settings={(snapshot ?? importing.snapshot).settings}
          transactions={(snapshot ?? importing.snapshot).transactions}
          invalidated={
            !snapshot || importing.version !== finance.restoreVersion
          }
          onImport={(items, skip) =>
            finance.importTransactions(items, skip, importing.revision)
          }
          onClose={() => setImporting(null)}
        />
      )}
      {snapshot && removeDemo !== null && (
        <Dialog
          title="Remover dados demonstrativos?"
          work={actionWork}
          onClose={() => setRemoveDemo(null)}
          busy={busy}
        >
          <p className="dialog-description">
            Serão removidos somente os {demoCount} lançamentos identificados
            como demonstração. Seus lançamentos pessoais e suas configurações
            serão preservados.
          </p>
          {actionError && (
            <p role="alert" className="form-error">
              {actionError}
            </p>
          )}
          <div className="dialog-actions">
            <DialogClose disabled={busy}>Cancelar</DialogClose>
            <button
              className="danger-button"
              disabled={busy || actionConflict}
              onClick={async () => {
                if (actionWork.get().busy) return;
                actionWork.set({ busy: true });
                setBusy(true);
                try {
                  await finance.removeDemo(removeDemo!);
                  setRemoveDemo(null);
                  setNotice(
                    "Demonstração removida. Agora os totais usam seus dados.",
                  );
                } catch (e) {
                  setActionConflict(e instanceof LocalConflictError);
                  setActionError(
                    e instanceof Error
                      ? e.message
                      : "Não foi possível remover a demonstração. Tente novamente.",
                  );
                } finally {
                  actionWork.set({ busy: false });
                  setBusy(false);
                }
              }}
            >
              {busy ? "Removendo…" : "Remover demonstração"}
            </button>
          </div>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
