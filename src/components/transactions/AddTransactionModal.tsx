import { useLayoutEffect, useState } from "react";
import { Dialog } from "../ui/Dialog";
import { TransactionForm } from "./TransactionForm";
import { useUnsavedWork, useInvalidated } from "../../hooks/useUnsavedWork";
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
  invalidated = false,
}: {
  onClose: () => void;
  onSave: (input: NewTransaction) => Promise<void>;
  settings: FinanceSettings;
  transaction?: Transaction;
  invalidated?: boolean;
}) {
  const [busy, setBusyState] = useState(false);
  const work = useUnsavedWork();
  const invalid = useInvalidated(invalidated);
  useLayoutEffect(() => {
    if (invalid.current && !work.get().hasUnsavedWork && !work.get().busy)
      onClose();
  }, [invalidated, invalid, work, busy, onClose]);
  const setBusy = (value: boolean) => {
    work.set({ busy: value });
    setBusyState(value);
  };
  return (
    <TransactionForm
      settings={settings}
      transaction={transaction}
      busy={busy}
      setBusy={setBusy}
      onSave={onSave}
      onClose={onClose}
      work={work}
      invalidated={invalid.current}
      wrap={(content) => (
        <Dialog
          title={transaction ? "Editar transação" : "Adicionar transação"}
          busy={busy}
          onClose={onClose}
          work={work}
        >
          {content}
        </Dialog>
      )}
    />
  );
}
