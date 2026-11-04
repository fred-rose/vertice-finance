import { useMemo } from "react";
import { AnalyticsBento } from "../ui/analytics-bento";
import type { FinanceSettings, Transaction } from "../../types/finance";
import type { CivilDate, CivilMonth } from "../../utils/civil";
import { MoneyError } from "../../utils/money";
import { calculationUnavailable } from "../../utils/format";
import { financialAnalyticsData } from "./financialAnalyticsData";

export function FinancialAnalyticsBento({
  transactions,
  settings,
  selected,
  today,
}: {
  transactions: Transaction[];
  settings: FinanceSettings;
  selected: CivilMonth;
  today: CivilDate;
}) {
  const data = useMemo(() => {
    try {
      return financialAnalyticsData(transactions, settings, selected, today);
    } catch (error) {
      if (!(error instanceof MoneyError)) throw error;
      return null;
    }
  }, [transactions, settings, selected, today]);
  if (!data) return <p role="status">{calculationUnavailable}</p>;
  return (
    <section aria-label="Análises financeiras" className="financial-analytics">
      <AnalyticsBento key={selected} {...data} />
      <p className="analytics-records-note">
        Somente valores registrados. Dias e meses sem lançamentos não comprovam
        ausência de receitas ou despesas. O radar mostra a distribuição relativa
        das despesas, não uma previsão.
      </p>
    </section>
  );
}
