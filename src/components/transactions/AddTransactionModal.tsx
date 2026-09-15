import { useState } from "react";
import { Dialog } from "../ui/Dialog";
import { TransactionForm } from "./TransactionForm";
import type {
  FinanceSettings,
  NewTransaction,
  Transaction,
} from "../../types/finance";
export function AddTransactionModal({
  onClose,
  onSave,
  settings,
  transaction,
}: {
  onClose: () => void;
  onSave: (input: NewTransaction) => Promise<void>;
  settings: FinanceSettings;
  transaction?: Transaction;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      title={transaction ? "Editar transação" : "Adicionar transação"}
      busy={busy}
      onClose={onClose}
    >
      <TransactionForm
        settings={settings}
        transaction={transaction}
        busy={busy}
        setBusy={setBusy}
        onSave={onSave}
        onClose={onClose}
      />
    </Dialog>
  );
}
