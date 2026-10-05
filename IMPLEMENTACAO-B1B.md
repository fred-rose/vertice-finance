# Implementação B1b — cálculos monetários seguros

Execução iniciada em 04/10/2026 e concluída em 05/10/2026, exclusivamente no worktree `C:\Users\patai\OneDrive\Documentos\Dashboard-Financeiro-B1`, branch `plan/b1-money-dates-origin`. Base verificada: `2b32caa2d04d91cf4be67c9d7594e8501bf23b62`, `feat: adiciona kernel monetario seguro B1a`; working tree e staging inicialmente vazios. Plano aprovado e relatório B1a confrontados com código/testes. Principal e controle-gado não foram utilizados para editar, testar, instalar ou publicar.

Somente B1b foi implementado. Kernel B1a reutilizado sem alteração. Persistência R$ Number, JSON v2, IndexedDB v3, tipos persistidos, validação, repository, hook e CAS permanecem intactos. Não há novas dependências, migration ou escrita em serviços externos.

## Baseline e congelamento

| Verificação anterior a alterações de código                    | Resultado real                                |
| -------------------------------------------------------------- | --------------------------------------------- |
| `npm.cmd test`                                                 | 340/340, 8 arquivos                           |
| `npm.cmd run build`                                            | PASS, `tsc -b` + Vite + PWA                   |
| `npm.cmd run test:e2e`                                         | 227/227, Edge headless, 2 workers             |
| Novos goldens executados contra o código B1a antes da migração | 13 goldens + todos os 340 anteriores: 353/353 |

As expectativas dos 76 testes preexistentes de calculations não foram alteradas. Nenhum teste anterior foi removido, reescrito ou marcado como skip. Os goldens cobrem receita100/gastos0,10+0,20/transferência1000; transferência A/B5500/3000/total8500; abertura inclusiva/null anterior/total incompleto null; médias16,70 e0,17; projeção600→1200; budgets79,99/80/100; anomalia300/300,01; receita284,24/284,25; base zero e fallback. Novos limites, correções e preservação raw são separados dessas expectativas.

## Inventário conferido e migrado

Entradas continuam DTOs em R$. O adapter numérico B1a conserva as tolerâncias vigentes. Todos os intermediários monetários abaixo permanecem `MinorUnits`; nenhuma função interna composta chama wrappers R$ para voltar a centavos. Resultados públicos existentes continuam R$ Number via `toLegacyReais`; perda de centavo nesse adapter gera `MoneyError("precision")`.

| Função/fluxo                         | Estado anterior: operação/conversão                      | Integração B1b, saída e semântica                                                                                                                                                                                                            |
| ------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `totalIncome`, `totalExpenses`       | `round(amount*100)`, reduce sem limite, `/100`           | `fromLegacyReais` por linha, `checkedAdd` em ordem; R$ somente na saída; vazio0; transferências excluídas                                                                                                                                    |
| `netBalance`, `summarize`            | Reconversão de totais R$ para c e subtração              | Resumo interno c, `checkedSubtract`; FinancialSummary R$ na fronteira; realizado não inclui planejamento/saldo inicial                                                                                                                       |
| `savingsRate`                        | Diferença c dividida pela receita                        | Razão Number finita de saldo/receita c; receita0 mantém null; sem decisão baseada no texto                                                                                                                                                   |
| `percentageChange`                   | Subtração direta R$ / abs(previous)                      | Diferença checked c, razão visual Number; anterior0 continua null; melhora de negativo preservada; diferença fora do limite gera erro                                                                                                        |
| `compareSummaries`                   | Cards recompunham diferenças a partir dos resultados R$  | Novo consumidor real: diferenças dos três cards calculadas antes da saída R$; mesmas prioridades/cores e contexto; erro capturado pela composição                                                                                            |
| `budgetUsed`                         | `round(amount*100)/round(budget*100)*100`                | Adapter de budget settings e razão c; ausente/zero desativam/null; subcentavo não vira denominador0                                                                                                                                          |
| `aggregateCategories`                | Totais R$ reconvertidos, share/change/budget float       | Totais e diferenças c; fallback/ordem estável/share0/base null preservados; saída monetária R$; flag derivada `attention` compara ≥80% budget ou ≥20% aumento exatamente                                                                     |
| `monthlyData`                        | Seis resumos públicos, null nas lacunas                  | Seis resumos internos c e adapters finais; mesmas datas/ordem/null/hasData; zero realizado continua diferente de ausência                                                                                                                    |
| `monthlyBalanceAverage` / TrendChart | Soma c e `Math.round` dentro do componente, sem checked  | Novo helper consumidor real: soma de saldos assinados checked e divisão racional; null sem histórico; empate para +infinito; gráfico recebe a média pronta                                                                                   |
| `movingAverage`                      | Soma mensal reconvertida R$→c / meses, `Math.round`      | Soma checked de totais c e `multiplyDivideRounded`; somente meses com fatos não transfer; null sem base; mesmos records e contagem; wrapper final R$                                                                                         |
| `closingProjection`                  | Produto c×dias / dia em Number, `Math.round`             | `multiplyDivideRounded`, resultado c validado; mesmos gates mês corrente/dia≥7/≥3 datas de gasto, null se insuficiente; wrapper final R$                                                                                                     |
| `accountBalance`                     | Base e pernas somadas c sem checks                       | Base settings e movimentos c, add/subtract checked em ordem; antes da abertura null; abertura inclusiva; destino/origem da transferência preservados; wrapper final R$                                                                       |
| `totalAccountBalance`                | Reconversão dos saldos públicos e soma                   | Saldo interno por conta c e soma checked; contas vazias ou base desconhecida mantêm null; overflow é exceção distinta                                                                                                                        |
| `detectAnomalies`                    | Média c por reconversão; produtos100/120 float           | Média checked/racional, comparação exata `compareScaled`; histórico≥2, >20%, diferença≥5000c; texto c e mesma prioridade65+min(10,ratio)                                                                                                     |
| `generateInsights`                   | Resumos/média/categorias/projeção em R$ com reconversões | Composição interna c; budgets≥80/100, receita≤85%, projeção>115%, diferenças≥5000c; prioridade/ordem/dedup/top3 mantidos; strings monetárias de `moneyMinor`                                                                                 |
| Fixas / renda disponível             | Reduce round c sem limite e subtração R$                 | `planningAmounts`: fixed/available c com add/subtract checked; planejamento não vira realizado; valores negativos reais mantidos                                                                                                             |
| Meta / porcentagem                   | Subtração R$ e `round(current/target*100)`               | `goalProgress`: falta checked c limitada a0; porcentagem Number visual de c; meta sem alvo definido mantém mensagem; raw inválido/subcentavo não é normalizado                                                                               |
| Formatação                           | Intl decimal R$ para todos os valores                    | `moneyMinor` separa dígitos do inteiro c para sinal/agrupamento/fração exatos, inclusive ±MAX; `moneyFromCalculation` recupera apenas na borda visual o roundtrip garantido pelo adapter público; `money` legado de campos brutos inalterado |

`forMonth`, `comparablePeriods`, os gates civis, defaults `new Date()`/`localDate()` e os formatadores de datas foram preservados. Saldo das contas do Overview continua avaliado por render, com catch por conta, sem introduzir captura temporal memoizada. Nenhum CivilDate, corte novo, timezone ou política de proveniência foi implementado.

## Operações e apresentação

Somas/diferenças monetárias usam `checkedAdd`/`checkedSubtract`. Produtos/divisões monetários usam `multiplyDivideRounded`. Limiares percentuais usam `compareScaled` (fast path com `checkedMultiply`, BigInt local quando necessário). BigInt não aparece nos DTOs, no JSON ou na UI; fixtures/oracles de testes usam BigInt independentemente para montar lançamentos dentro do teto R$999.999.999,00.

Razões de exibição, shares e prioridades conservam Number finito. Intl/toFixed não determinam budgets, anomalias, queda de receita, projeção nem o destaque da categoria. `FinancialSummary` recebe mudanças já calculadas em c; `TrendChart` não soma moeda. Recharts recebe exclusivamente saídas finais cujo roundtrip centesimal é validado; tooltip formata esses valores de dados, sem usar ticks/interpolação ou coordenadas arredondadas para reconstruir fatos. Saídas que não passam esse contrato ficam indisponíveis, em vez de usar aproximações extremas para texto.

## Paridade, correções e limites explícitos

| Classe | Caso reproduzido                                                                                              | Resultado e evidência                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P/R    | Goldens ordinários e todos os testes anteriores                                                               | Números, gates, nulls, abertura, transferências, top3/dedup/prioridades preservados                                                                          |
| C      | `MAX_SAFE/3`                                                                                                  | `Math.round` produz3.002.399.751.580.331c; quociente/resto exatos produzem3.002.399.751.580.330c; fixture real em três meses retorna R$30.023.997.515.803,30 |
| N      | 300.000.000.000.001c×31/31                                                                                    | Produto ultrapassa MAX, resultado seguro preservado pela divisão racional; fixture de3001 lançamentos e três datas, R$3.000.000.000.000,01                   |
| C      | Anomalia: média3.500.000.000.000.003c, atual4.200.000.000.000.004c                                            | Produtos Number empatam; exato >20% alerta corretamente; duas médias históricas somadas ainda cabem no limite                                                |
| C      | Receita anterior7.000.000.000.000.001c, atual5.950.000.000.000.001c                                           | Produto Number aceitaria ≤85%; racional comprova >85%; falso alerta removido                                                                                 |
| C      | Projeção4.025.000.000.000.006c, histórico3.500.000.000.000.005c                                               | Produtos Number empatam; >115% exato gera alerta; média de dois meses cabe no domínio; frase preserva diferença525.000.000.000.001c                          |
| C      | Intl sobre saída R$ de MAX c                                                                                  | Intl mostra último centavo90; texto canônico mantém91; teste cobre negativo e positivo                                                                       |
| C      | Meta R$0,09 / R$0,40                                                                                          | Antigo float produz22%; ratio em c mantém empate22,5%→23%; falta31c, sem alteração do dado bruto                                                             |
| C      | Variação R$0,30 / R$0,10                                                                                      | Subtração R$ antiga produz199,99999999999997%; diferença c produz200%; razão continua Number visual                                                          |
| C      | Settings R$1e-8 válido                                                                                        | Projeção Money gera `subcentavo`/indisponibilidade, em lugar de0/denominador0; reader/writer/backup/restore brutos continuam válidos                         |
| N      | Soma MAX+1, prefixo antes de cancelamento, média com soma acima de MAX, projeção com resultado fora do limite | `MoneyError("overflow")`; nunca aproximação, saturação, zero ou subtotal; mesma ordem de avaliação                                                           |
| N      | 9.007.199.254.740.990c é seguro, mas saída R$ não faz roundtrip                                               | `MoneyError("precision")`; indisponibilidade preserva dados                                                                                                  |

Percentuais de exibição podem conter o ruído Number permitido pelo contrato; savingsRate66,66666666666666 permanece igual ao cálculo legado, não foi substituído pelo oracle200/3 de ordem diferente. Os exemplos da revisão documental com média7×10^15c não foram usados indevidamente como fixture real de dois meses: essa soma excederia MAX; os casos integrados acima mantêm o acumulador seguro.

## Erro derivado e UI mínima

Reutiliza-se a exceção pequena `MoneyError` B1a. Overview captura erros monetários na composição dependente e suprime os cards/gráficos/insights/projeção afetados, mostrando mensagem de cálculo indisponível e registros recentes. Navegação e cadastro, inclusive botão mobile, continuam acessíveis. Saldo de conta isolado tem catch por conta e não suprime resumo mensal válido. Transactions captura apenas o cálculo do resumo; filtros, tabela, paginação, edição/exclusão/importação e CSV continuam acessíveis. Settings captura planejamento, saldo por conta e meta por meta; inputs originais, drafts inválidos, dirty guard, export e restore permanecem acessíveis. Erros não monetários são repropagados.

Não há Result/Either, boundary genérica, LocalReadError novo ou alteração de recovery. `null` continua significando base/ausência conforme o contrato antigo; overflow não é convertido para null ou0. Dados não são corrigidos/regravados como consequência do cálculo.

## Settings/backup/CAS

Testes abrangem subcentavo em renda prevista, fixa, meta, saldo inicial, orçamento e limite de saldo; validação estrutural mantém identidade dos objetos e serialização/parse conserva os valores. Backup de90.072 transações que somam acima de MAX preserva registros, extras, source e createdAt. A integração nunca transforma backup inteiro em Money para reserializar.

Smoke real em IndexedDB v3 isolado:90.072 lançamentos individualmente válidos, soma MAX+1c; recovery ausente, nenhuma métrica/insight falso, tabela recente e histórico20 linhas, CSV com todos os registros, edição real de descrição via CAS, JSON v2 completo e reload com count preservado/revision1. Outro smoke exporta raw1e-8 de conta/fixa/meta, baixa safety e restaura JSON v2 pelo fluxo A1, mantendo dados/extras e revision1. Um draft1.001/vazio permanece no editor protegido pelo guard A2c. Saldo isolado indisponível mantém resumo mensal1500 e segunda conta3000.

## Verificações finais

| Verificação                                                                   | Resultado                                                   |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Unitários finais `npm.cmd test`                                               | PASS — 400/400, 10 arquivos; +60 testes nesta fase          |
| Focados: money/format/calculations/Settings/validation/backup                 | PASS — 346/346, 7 arquivos                                  |
| Build final `npm.cmd run build`                                               | PASS, inclui typecheck `tsc -b`, Vite e PWA                 |
| E2E finais `npm.cmd run test:e2e`, porta5191                                  | PASS — 231/231, Edge headless, 2 workers; +4 smokes B1b     |
| E2E focados: B1b/dashboard/Settings/restore/recovery/repository/CAS/dirty/PWA | PASS — 138/138, seleção explícita de8 specs                 |
| Prettier `--check` apenas dos12 arquivos alterados                            | PASS                                                        |
| `git diff --check` e staged `--check`                                         | PASS                                                        |
| Repository/hook/backup/import/validation/kernel/types/packages/plan/roadmap   | Blobs comparados com2b32caa; intactos                       |
| A1 / A2a / A2b / A2c / B1a                                                    | PASS pelas suítes reais de regressão e arquivos preservados |

Não existem scripts separados de lint ou typecheck no package.json. O typecheck real foi executado pelo build; não foi inventado comando lint. O warning Vite de chunks>500kB já existia na baseline (incluindo ExcelJS) e permanece não bloqueante. Nenhuma instalação/alteração de lock ou package foi feita.

Durante desenvolvimento, dois novos asserts foram ajustados ao contrato verificado: ordem de transações de uma fixture versus ordem das keys do IndexedDB; e oracle Number de savingsRate com ordem200/3 versus20/30×100. Nenhuma expectativa de teste preexistente foi relaxada. A rodada focada inicial33/34 e a unitária inicial398/399 foram substituídas por reexecuções finais verdes, registradas acima.

## Arquivos desta entrega

- `src/features/dashboard/calculations.ts`
- `src/features/dashboard/calculations.b1b.test.ts`
- `src/utils/format.ts`
- `src/utils/format.test.ts`
- `src/components/dashboard/OverviewPage.tsx`
- `src/components/dashboard/FinancialSummary.tsx`
- `src/components/dashboard/CategoryBreakdown.tsx`
- `src/components/charts/TrendChart.tsx`
- `src/components/transactions/TransactionsPage.tsx`
- `src/components/settings/SettingsPage.tsx`
- `tests/b1b-money-ui.spec.ts`
- `IMPLEMENTACAO-B1B.md`

## Limites e residuais

H06 tratado para as operações atuais dentro de ±MAX_SAFE c, com falha explícita de prefixo/intermediário/saída. Não se promete moeda ilimitada. A composição Overview suprime o conjunto de métricas dependentes quando necessário; não tenta apresentar totais parciais. Percentuais Number são aproximações visuais e nunca substituem os limiares racionais.

B1c permanece não iniciado: CivilDate, contexto/corte e proveniência ficam para nova autorização. Defaults/clocks independentes e invalidation após meia-noite/fuso (H08) continuam residuais B1c/P1; não foram escondidos como conclusão de B1. Hardening/expansão XLSX/M06, refinamento visual e demais trabalhos P1/B2 ficam fora desta entrega. Schema/DBv3/JSONv2/repository/CAS não precisam migração nem reparo. Rollback é somente de código, sem restaurar um snapshot antigo sobre dados novos.

Staging seletivo deve conter exatamente esses12 arquivos, em um commit `feat: integra calculos monetarios seguros B1b`, seguido de staging e worktree B1 vazios. Nenhum B1c/B2/front/cloud/Three/IA/Business incluído. Bloqueadores B1b: nenhum após os resultados finais registrados. Parar após o commit.
