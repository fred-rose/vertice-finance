import { useEffect, useState } from "react";
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
import { Dialog } from "./components/ui/Dialog";
import { useTransactions } from "./hooks/useTransactions";
import { usePage } from "./hooks/usePage";
import { monthKey, monthLabel } from "./utils/format";
import type { NewTransaction, Transaction } from "./types/finance";
export default function App() {
  const finance = useTransactions();
  const snapshot = finance.snapshot;
  const page = usePage();
  const [selected, setSelected] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [editor, setEditor] = useState<{ transaction?: Transaction } | null>(
    null,
  );
  const [importing, setImporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [notice, setNotice] = useState("");
  const [removeDemo, setRemoveDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  useEffect(() => {
    if (!finance.restoreVersion) return;
    setEditor(null);
    setImporting(false);
    setRemoveDemo(false);
  }, [finance.restoreVersion]);
  useEffect(() => {
    if (snapshot) return;
    setEditor(null);
    setImporting(false);
    setRemoveDemo(false);
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
    await finance.saveTransaction(input, editor?.transaction);
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
                onClick={() => setEditor({})}
              >
                <Plus size={18} />
                Adicionar transação
              </button>
            )}
          </div>
        </div>
        {finance.loading ? (
          <div className="panel empty-state" role="status">
            Preparando sua visão financeira…
          </div>
        ) : finance.error ? (
          <LocalDataRecovery
            error={finance.error}
            onRetry={() => void finance.refresh()}
            onRestore={() => setRestoring(true)}
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
                    setRemoveDemo(true);
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
                onAdd={() => setEditor({})}
                onImport={() => setImporting(true)}
              />
            ) : page === "transactions" ? (
              <TransactionsPage
                transactions={snapshot.transactions}
                settings={snapshot.settings}
                onEdit={(transaction) => setEditor({ transaction })}
                onDelete={async (id) => {
                  await finance.removeTransaction(id);
                  setNotice(
                    "Transação excluída. Seus totais foram recalculados.",
                  );
                }}
                onImport={() => setImporting(true)}
              />
            ) : (
              <SettingsPage
                key={finance.restoreVersion}
                settings={snapshot.settings}
                transactions={snapshot.transactions}
                onSave={finance.saveSettings}
                onRestore={() => setRestoring(true)}
              />
            )}
            <footer className="page-footer">
              <span>
                vértice<span className="text-mint">.</span>{" "}
                <span>Clareza para suas próximas decisões.</span>
              </span>
              <span>Dados locais · Exporte uma cópia nas configurações.</span>
            </footer>
          </>
        ) : null}
      </motion.div>
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
      {snapshot && editor && (
        <AddTransactionModal
          settings={snapshot.settings}
          transaction={editor.transaction}
          onSave={save}
          onClose={() => setEditor(null)}
        />
      )}
      {restoring && (
        <RestoreBackupDialog
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
      {snapshot && importing && (
        <ImportModal
          settings={snapshot.settings}
          transactions={snapshot.transactions}
          onImport={finance.importTransactions}
          onClose={() => setImporting(false)}
        />
      )}
      {snapshot && removeDemo && (
        <Dialog
          title="Remover dados demonstrativos?"
          onClose={() => setRemoveDemo(false)}
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
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => setRemoveDemo(false)}
            >
              Cancelar
            </button>
            <button
              className="danger-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await finance.removeDemo();
                  setRemoveDemo(false);
                  setNotice(
                    "Demonstração removida. Agora os totais usam seus dados.",
                  );
                } catch (e) {
                  setActionError(
                    e instanceof Error
                      ? e.message
                      : "Não foi possível remover a demonstração. Tente novamente.",
                  );
                } finally {
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
