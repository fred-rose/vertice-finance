import type { CivilDate } from "../../utils/civil";
import { LocalConflictError } from "../../services/transactionRepository";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useInvalidated, useUnsavedWork } from "../../hooks/useUnsavedWork";
import { InvalidatedWork } from "../ui/InvalidatedWork";
import { Dialog } from "../ui/Dialog";
import type {
  FinanceSettings,
  NewTransaction,
  Transaction,
} from "../../types/finance";
import {
  previewImport,
  readSpreadsheet,
  suggestMapping,
  type ImportSheet,
  type Mapping,
} from "../../features/transactions/importExport";
import { money } from "../../utils/format";
export function ImportModal({
  settings,
  today,
  transactions,
  onImport,
  onClose,
  invalidated = false,
}: {
  settings: FinanceSettings;
  today: CivilDate;
  transactions: Transaction[];
  onImport: (items: NewTransaction[], skip: boolean) => Promise<number>;
  onClose: () => void;
  invalidated?: boolean;
}) {
  const work = useUnsavedWork();
  const invalidatedRef = useInvalidated(invalidated);
  useLayoutEffect(() => {
    if (
      invalidatedRef.current &&
      !work.get().hasUnsavedWork &&
      !work.get().busy
    )
      onClose();
  }, [invalidated, invalidatedRef, work, onClose]);
  const lastPreview = useRef<ReturnType<typeof previewImport>>([]);
  useLayoutEffect(() => {
    if (invalidatedRef.current) work.set({ invalidated: true });
  }, [invalidated, invalidatedRef, work]);
  const [sheets, setSheets] = useState<ImportSheet[]>([]);
  const [sheet, setSheet] = useState(0);
  const [mapping, setMapping] = useState<Mapping>(suggestMapping([]));
  const [separator, setSeparator] = useState("");
  const [file, setFile] = useState<File>();
  const [decimal, setDecimal] = useState<"," | ".">(",");
  const [dateFormat, setDateFormat] = useState<"dmy" | "mdy">("dmy");
  const [defaultType, setDefaultType] = useState<
    "signed" | "expense" | "income"
  >("signed");
  const [accountId, setAccountId] = useState(settings.accounts[0].id);
  const [expenseCategoryId, setExpense] = useState(
    settings.categories.find((c) => c.type === "expense")!.id,
  );
  const [incomeCategoryId, setIncome] = useState(
    settings.categories.find((c) => c.type === "income")!.id,
  );
  const [skip, setSkip] = useState(true);
  const [busy, setBusyState] = useState(false);
  const setBusy = (value: boolean) => {
    work.set({ busy: value });
    setBusyState(value);
  };
  const [error, setError] = useState("");
  const [conflicted, setConflicted] = useState(false);
  const [result, setResult] = useState<number>();
  const rows = sheets[sheet]?.rows ?? [];
  const preview = useMemo(
    () =>
      invalidatedRef.current
        ? lastPreview.current
        : previewImport(
            rows,
            mapping,
            settings,
            {
              today,
              date1904: sheets[sheet]?.date1904,
              decimal,
              dateFormat,
              defaultType,
              accountId,
              expenseCategoryId,
              incomeCategoryId,
            },
            transactions,
          ),
    [
      today,
      sheets,
      sheet,
      rows,
      mapping,
      settings,
      decimal,
      dateFormat,
      defaultType,
      accountId,
      expenseCategoryId,
      incomeCategoryId,
      transactions,
    ],
  );
  if (!invalidatedRef.current) lastPreview.current = preview;
  const invalid = preview.filter((r) => r.error);
  const duplicateCount = preview.filter((r) => r.duplicate).length;
  async function read(file: File, delimiter: string) {
    if (invalidatedRef.current || work.get().busy) return;
    setBusy(true);
    setError("");
    setSheets([]);
    try {
      const loaded = await readSpreadsheet(file, delimiter || undefined);
      if (invalidatedRef.current) return;
      if (!loaded.length || loaded[0].rows.length < 2)
        throw new Error("Inclua cabeçalho e pelo menos uma transação.");
      setSheets(loaded);
      setSheet(0);
      setMapping(suggestMapping(loaded[0].rows[0]));
    } catch (e) {
      setError(
        !navigator.onLine &&
          /\.xlsx$/i.test(file.name) &&
          e instanceof TypeError
          ? "Para usar XLSX offline, abra uma planilha XLSX uma vez com conexão. Você também pode importar CSV offline."
          : e instanceof Error
            ? e.message
            : "Não foi possível ler a planilha.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (invalidatedRef.current)
    return (
      <InvalidatedWork
        label="Importação"
        text={JSON.stringify(
          {
            arquivo: file?.name,
            separator,
            sheet,
            mapping,
            decimal,
            dateFormat,
            defaultType,
            accountId,
            expenseCategoryId,
            incomeCategoryId,
            skip,
            preview: lastPreview.current,
          },
          null,
          2,
        )}
        onDiscard={onClose}
      />
    );
  return (
    <Dialog
      title="Importar planilha"
      wide
      busy={busy}
      onClose={onClose}
      work={work}
    >
      {result !== undefined ? (
        <div className="empty-state">
          <h3>Importação concluída</h3>
          <p role="status">
            {result} transações importadas. Sua visão geral foi atualizada.
          </p>
          <button className="primary-button" onClick={onClose}>
            Concluir
          </button>
        </div>
      ) : (
        <>
          <p className="dialog-description">
            CSV ou XLSX, até 5 MB e 5.000 linhas. A primeira linha deve conter
            os nomes das colunas. Revise os dados antes de salvar; o arquivo é
            processado neste navegador.
          </p>
          <fieldset disabled={busy}>
            <label>
              Arquivo
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    work.set({ hasUnsavedWork: true });
                    setFile(f);
                    void read(f, separator);
                  }
                }}
              />
            </label>
            {file?.name.toLowerCase().endsWith(".csv") && (
              <label>
                Separador CSV
                <select
                  value={separator}
                  onChange={(e) => {
                    setSeparator(e.target.value);
                    void read(file, e.target.value);
                  }}
                >
                  <option value="">Detectar automaticamente</option>
                  <option value=";">Ponto e vírgula</option>
                  <option value=",">Vírgula</option>
                  <option value={"\t"}>Tabulação</option>
                </select>
              </label>
            )}
            {sheets.length > 0 && (
              <>
                {sheets.length > 1 && (
                  <label>
                    Aba
                    <select
                      value={sheet}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setSheet(n);
                        setMapping(suggestMapping(sheets[n].rows[0]));
                      }}
                    >
                      {sheets.map((s, i) => (
                        <option key={i} value={i}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <h3 className="subheading">1. Relacione as colunas</h3>
                <div className="import-mapping">
                  {(
                    Object.entries({
                      date: "Data *",
                      amount: "Valor *",
                      description: "Descrição *",
                      type: "Tipo",
                      categoryId: "Categoria",
                      accountId: "Conta",
                      destinationAccountId: "Conta de destino",
                      recurring: "Recorrente",
                    }) as [keyof Mapping, string][]
                  ).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <select
                        value={mapping[key]}
                        onChange={(e) =>
                          setMapping({
                            ...mapping,
                            [key]: Number(e.target.value),
                          })
                        }
                      >
                        <option value={-1}>Não mapeada</option>
                        {rows[0]?.map((header, i) => (
                          <option key={i} value={i}>
                            {i + 1}. {header}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <h3 className="subheading">2. Como interpretar os valores</h3>
                <div className="import-mapping">
                  <label>
                    Separador decimal
                    <select
                      value={decimal}
                      onChange={(e) => setDecimal(e.target.value as "," | ".")}
                    >
                      <option value=",">Vírgula: 1.250,50</option>
                      <option value=".">Ponto: 1,250.50</option>
                    </select>
                  </label>
                  <label>
                    Formato de data
                    <select
                      value={dateFormat}
                      onChange={(e) =>
                        setDateFormat(e.target.value as "dmy" | "mdy")
                      }
                    >
                      <option value="dmy">Dia / mês / ano</option>
                      <option value="mdy">Mês / dia / ano</option>
                    </select>
                  </label>
                  {mapping.type < 0 && (
                    <label>
                      Tipo sem coluna
                      <select
                        value={defaultType}
                        onChange={(e) =>
                          setDefaultType(e.target.value as typeof defaultType)
                        }
                      >
                        <option value="signed">
                          Negativo = gasto; positivo = receita
                        </option>
                        <option value="expense">Todos são gastos</option>
                        <option value="income">Todos são receitas</option>
                      </select>
                    </label>
                  )}
                  {mapping.accountId < 0 && (
                    <label>
                      Conta para os lançamentos
                      <select
                        value={accountId}
                        onChange={(e) => setAccountId(e.target.value)}
                      >
                        {settings.accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {mapping.categoryId < 0 && (
                    <>
                      <label>
                        Categoria dos gastos
                        <select
                          value={expenseCategoryId}
                          onChange={(e) => setExpense(e.target.value)}
                        >
                          {settings.categories
                            .filter((c) => c.type === "expense")
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Categoria das receitas
                        <select
                          value={incomeCategoryId}
                          onChange={(e) => setIncome(e.target.value)}
                        >
                          {settings.categories
                            .filter((c) => c.type === "income")
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    </>
                  )}
                </div>
                <p className="form-note">
                  Datas ISO (AAAA-MM-DD) também são aceitas. Contas e categorias
                  mapeadas precisam existir nas configurações. Transferências
                  exigem coluna de destino.
                </p>
                <h3 className="subheading">3. Confira antes de importar</h3>
                <p className="dialog-description">
                  {preview.length} linhas · {invalid.length} com erro ·{" "}
                  {duplicateCount} possíveis duplicatas
                </p>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={skip}
                    onChange={(e) => setSkip(e.target.checked)}
                  />
                  Ignorar lançamentos idênticos, inclusive dentro do arquivo
                </label>
                <div className="import-preview table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>LINHA</th>
                        <th>DESCRIÇÃO / PROBLEMA</th>
                        <th>DATA</th>
                        <th>VALOR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(0, 30).map((r) => (
                        <tr key={r.line}>
                          <td>{r.line}</td>
                          <td className={r.error ? "danger-text" : ""}>
                            {r.error ??
                              `${r.transaction!.description}${r.duplicate ? " · possível duplicata" : ""}`}
                          </td>
                          <td>{r.transaction?.date}</td>
                          <td>
                            {r.transaction &&
                              `${r.transaction.type === "expense" ? "−" : r.transaction.type === "income" ? "+" : ""}${money(r.transaction.amount)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.length > 30 && (
                  <p className="form-note">
                    Prévia das primeiras 30 linhas. Todas as {preview.length}{" "}
                    linhas foram validadas.
                  </p>
                )}
                {invalid.length > 0 && (
                  <p className="form-error" role="alert">
                    Corrija o arquivo ou o mapeamento. Nenhuma linha será
                    importada enquanto houver erros.{" "}
                    {invalid
                      .slice(0, 3)
                      .map((r) => `Linha ${r.line}: ${r.error}`)
                      .join(" ")}
                  </p>
                )}
                <button
                  className="primary-button save-button"
                  disabled={
                    conflicted ||
                    busy ||
                    !!invalid.length ||
                    mapping.date < 0 ||
                    mapping.amount < 0 ||
                    mapping.description < 0 ||
                    !preview.length ||
                    (skip && duplicateCount === preview.length)
                  }
                  onClick={async () => {
                    if (invalidatedRef.current || conflicted || work.get().busy)
                      return;
                    setBusy(true);
                    setError("");
                    try {
                      const count = await onImport(
                        preview.flatMap((r) =>
                          r.transaction ? [r.transaction] : [],
                        ),
                        skip,
                      );
                      if (invalidatedRef.current) return;
                      work.set({ hasUnsavedWork: false });
                      setResult(count);
                    } catch (e) {
                      setConflicted(e instanceof LocalConflictError);
                      setError(
                        e instanceof Error
                          ? e.message
                          : "A importação falhou; nenhum registro foi salvo.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy
                    ? "Processando…"
                    : `Importar ${preview.length - (skip ? duplicateCount : 0)} transações`}
                </button>
              </>
            )}
          </fieldset>
          {busy && (
            <p role="status" className="form-note">
              Processando sua planilha…
            </p>
          )}
          {conflicted && (
            <p>
              Feche e reabra a importação para revisar a prévia com os dados
              atuais.
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </Dialog>
  );
}
