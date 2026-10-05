# Implementação B1c — calendário civil, corte e origem

05/10/2026. Somente worktree Dashboard-Financeiro-B1, branch plan/b1-money-dates-origin. Checkpoint a02dc0b8a7125846765ad18ea8294edd9fbfc94d, B1b; root, branch, HEAD, staging vazio e worktree limpo conferidos antes de editar. B1a e B1b presentes; B1c inexistente naquele checkpoint. PLANO-B1.md integral, IMPLEMENTACAO-B1A.md e IMPLEMENTACAO-B1B.md confrontados com código/testes. Código/testes prevalecem. Principal e controle-gado não foram utilizados para escrita, build, instalação ou publicação.

## Baseline real

| Comando antes de editar          | Resultado                                |
| -------------------------------- | ---------------------------------------- |
| npm.cmd test                     | PASS — 400/400, 10 arquivos              |
| npm.cmd run build                | PASS — tsc -b, Vite e PWA                |
| npm.cmd run test:e2e, porta 5191 | PASS — 231/231, Edge headless, 2 workers |

Dependências existentes reutilizadas. Nenhuma instalação, alteração de package/lock, skip novo, remoção ou alteração de teste preexistente. Goldens anteriores mantidos. Testes novos separam representação/paridade, corte determinístico e correções deliberadas.

## CivilDate, CivilMonth e Instant

src/utils/civil.ts implementa contratos branded sobre strings, com construtores runtime. CivilDate é YYYY-MM-DD, gregoriano real, intervalo 1900-01-01 a 9999-12-31. Esse mínimo já existia em validDate, usado pelo leitor estrutural/backup/migração. 2024-02-29 é válido; 2026-02-29, 1900-02-29 e 2100-02-29 são inválidos. Comparação lexicográfica só após validação. DTOs persistidos permanecem string; não há Date canônico no domínio, migração ou normalização de fatos.

CivilMonth é YYYY-MM. Seleção do App, navegação, séries de seis meses, médias e comparativos usam meses civis. Jan↔dez e clamp 28/29/30/31 preservados. Meses de janela anteriores a 1900 continuam possíveis apenas como lacunas sem fatos, mantendo o gráfico de janeiro/1900; isso não valida uma Transaction.date de 1899. Navegação segue limitada a 1900-01.

addCivilDays usa ordinal gregoriano e busca limitada de ano/mês; shiftMonth e shiftDateMonth usam calendário/clamp. Não somam 86.400.000 ms para simular um dia. O helper de dias tem consumidor real no serial XLSX. Testes independentes cobrem leap years, fronteiras, DST civil, extremos 1900↔9999 e tipos incompatíveis com @ts-expect-error, verificados por TypeScript.

Instant tem contrato separado para timestamp ISO com offset e calendário/horário reais. captureCivilCut captura uma única Date atual, produz ISO UTC e deriva CivilDate por Intl com zona IANA, calendário gregoriano e dígitos latinos explícitos. Instantes legados/backup não passam por nova normalização: createdAt/exportedAt continuam raw timestamps; nenhum deles decide mês financeiro ou substitui a data de caixa. Criar agora registra UTC real; editar não reconstrói criação.

## Captura, timezone e clocks

useCivilToday faz uma captura por render do App; a mesma CivilDate chega ao Overview, Settings, formulário e preview de import. O mês inicial vem dessa captura, evitando a antiga dupla new Date para ano e mês. Navegação usa o mesmo limite civil. Focus/visibilitychange provocam nova consulta, sem timer global. Mudança de data/fuso só afeta nova composição, nunca regrava transaction.date, initialBalanceDate ou deadline. Mês escolhido e data do draft não são reinicializados.

Overview recebe today e selected CivilMonth. Comparação, resumo dependente, insights, projeção, saldos e fallback recebem o mesmo corte. Memo inclui today. Settings usa o corte compartilhado para saldos, max e defaults de novos campos. InitialDate do editor permanece fixada na abertura: foco após meia-noite atualiza max, preserva edição e baseRevision original. Guards dirty/PWA existentes não foram modificados.

Calculadores não recebem timezone IANA. Ela pertence à captura; textos de datas usam UTC fixo apenas na borda Intl, sem deslocar o fato civil. Wrappers públicos conservam Date explícita local por compatibilidade e/ou default de captura quando corte omitido. Núcleos temporais privados recebem CivilMonth/CivilDate, sem relógio. generateInsights propaga o corte a comparação, saldo e projeção; totalAccountBalance propaga asOf a todas as contas.

Comandos: validateTransaction recebe options.today; validateSettings aceita terceiro today e captura uma vez para todas as contas quando omitido; estrutural não captura hoje. Formulário e Settings capturam corte atual no envio para preflight. prepareTransaction captura uma vez para validação e eventual createdAt novo. importTransactions captura uma vez para o lote inteiro, compartilhando today e Instant; previewImport captura uma vez por preview quando options.today não for fornecido. Nada renova token CAS ou faz rebase por clock.

Clocks residuais intencionais: localDate e defaults externos de compatibilidade; fábrica de demo com sua captura própria; timestamps de export/safety; controle de atualização PWA. O repository intacto continua revalidando comandos na sua fronteira transacional por wrappers públicos, incluindo cada registro de import. Esse guard final pode observar instante posterior ao preflight/hook; não se promete um clock global atravessando todas as fronteiras de comando. Não houve contexto ambiente, engine genérica ou alteração do protocolo CAS para compartilhar esse relógio. A composição financeira atual não depende desses guards e não recaptura agora internamente.

## APIs alteradas

| API / camada                                                | Contrato atual                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| forMonth, monthlyData, monthlyBalanceAverage, movingAverage | Date legada ou CivilMonth; calendário interno civil                                              |
| comparablePeriods, closingProjection, generateInsights      | Período civil/Date compatível e CivilDate/Date compatível explícita; default somente na entrada  |
| accountBalance, totalAccountBalance                         | asOf explícito; string compatível validada; antes da abertura null e inclusão no dia preservadas |
| validDate                                                   | Delega ao calendário puro; mesmos limites estruturais                                            |
| validateTransaction / validateSettings                      | Corte opcional explícito; leitura estrutural permanece sem hoje                                  |
| prepareTransaction                                          | Comando consumido pelo hook; preserva alegações/ausências históricas na edição                   |
| previewImport / ImportSheet / importDate                    | today único por preview e date1904 efêmero da planilha; não persistido                           |
| monthKey/monthLabel/shortDate                               | Adapters civis e formatação determinística, sem mudar caixa                                      |
| App/Overview/Settings/editor/import                         | Prop today compartilhada; somente integração necessária, sem redesign                            |

## Source e createdAt

Correção deliberada C: antes, existing?.source ?? manual e existing?.createdAt ?? now inventavam metadados na edição de legado. prepareTransaction distingue create/update pela existência já utilizada pelo hook. Nova criação mantém source manual, ID novo e createdAt UTC real. Edição preserva ID, source explícito, timestamp raw e extras; source/createdAt ausentes continuam ausentes semanticamente. O repository mantém seus DTOs opcionais/undefined existentes, que JSON v2 serializa como ausência.

Não existe enum unknown/external novo nem classificação temporal persistida. Unknown é apenas o significado documental de source ausente. Manual/import/demo explícitos são alegações preservadas, não prova bancária. Meio-dia não é usado para inferir timestamp sintético. Import mantém source import e instante do comando; restore conserva origem, ausência, offsets, extras e R$ brutos. removeDemo permanece source===demo; prefixo demo- de um registro v3 sem source não provoca exclusão nem backfill. Migrador v1 histórico e sua síntese/política permanecem intactos, sem reinterpretar dados já migrados.

Contrato de referência externa é exclusivamente documental: external ID string lossless, nenhum Number intermediário; 000123 ≠ 123; namespaces distintos não colidem; namespace qualificado conforme fornecedor/conexão/conta/tipo e garantia real. Observação externa, vínculo e movimento são conceitos distintos; N observações podem referir um movimento sem duplicar caixa. Vínculo não redefine origem. Nenhum matching, connector model, tabela ou tipo persistido criado.

## XLSX / M06: reprodução e correção deliberada

Antes de alterar importExport, ensaio com ExcelJS escreveu e releu workbooks reais nas duas épocas: serial cru 1 permanecia Number; célula Date moderna vinha correta; a origem fixa 1899-12-30 interpretava ambos os seriais crus como 1899-12-31. Na época 1904 o valor esperado era 1904-01-02. Isso comprovou que se perdia o indicador da época no fluxo do serial cru.

Fixtures unitárias e E2E finais: 2026-09-10 = serial 46275 em 1900 e 44813 em 1904; o código anterior dava 2022-09-09 para 44813, diferença de 1462 dias. readSpreadsheet preserva date1904 efêmero; ImportModal o fornece ao preview; importDate converte o serial por aritmética gregoriana. Não interpreta valores monetários como datas, não envia metadado ao banco e não muda células Date modernas já convertidas pelo ExcelJS.

1900: serial1→1900-01-01, 59→1900-02-28, 61→1900-03-01; serial60, dia fictício 1900-02-29, rejeitado com validação determinística, em vez de inventar 28/02. 1904: serial0→1904-01-01 e1→1904-01-02. Fração de dia é descartada conforme o contrato civil anterior. Não houve reparo de registros já importados: usuário revisa preview e pode corrigir manualmente. Conversões de células Date feitas pela biblioteca permanecem na borda existente; não se tenta reconstruir serial original a partir de Date.

M06 reduzido na interpretação civil dos seriais reproduzidos. Limites de expansão/descompressão/memória e demais regras de leitura da biblioteca continuam fora de B1c; não se declara M06 integralmente encerrado.

## Persistência, dinheiro e compatibilidade

IndexedDB vertice-finance v3, schema/stores/índices, repository e seis writers CAS permanecem intactos. Nenhuma migration, reset, backup v3, alteração de DB version ou escrita em serviço remoto. JSON v2 preserva datas/timestamps raw, source/createdAt opcionais, extras e R$ Number. Não há novos metadados persistidos.

money.ts e testes B1a não foram alterados. MinorUnits, checked sums, comparação racional e todos os goldens B1b preservados. Catches específicos MoneyError continuam locais; overflow derivado não vira recovery nem zero. H03 preservado: snapshots futuros estruturalmente válidos continuam legíveis e restauráveis sob relógios diferentes.

H08: CONTRATO FECHADO e integração necessária atual entregue. H08 integral permanece residual P1, incluindo composição final/contexto/UX e decisão sobre atualização contínua quando não há render/focus/visibilidade. B1c não criou timer global nem engine/cache universal. H07 reduzido pela política de proveniência, sem reconciliação externa implementada. B2/P1/front/cloud/Supabase/Three/IA/Business/Investments não iniciados.

## Testes e resultados finais

| Validação                                                                         | Resultado                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------- |
| npm.cmd test                                                                      | PASS — 487/487, 15 arquivos; +87 testes B1c |
| Unitários dirigidos civil/money/format/calculations/validation/import/hook/backup | PASS — 462/462, 13 arquivos                 |
| npm.cmd run build                                                                 | PASS — TypeScript tsc -b, Vite e PWA        |
| npm.cmd run test:e2e                                                              | PASS — 245/245, +14 smokes B1c              |
| E2E dirigidos B1c/B1b/dashboard/restore/recovery/repository/CAS/dirty/PWA         | PASS — 152/152, 9 specs                     |
| Prettier --check somente arquivos B1c                                             | PASS                                        |
| git diff --check e staged --check                                                 | PASS                                        |
| Arquivos versionados fora do escopo comparados a a02dc0b                          | Idênticos ao checkpoint                     |
| A1 / A2a / A2b / A2c / B1a / B1b                                                  | PASS pelas suítes reais                     |

87 unitários novos: civil47, cálculos9, validação6, proveniência8 e import17. 14 smokes reais: quatro sources/edição CAS; criação manual; remoção demo/unknown e timestamp explícito; virada civil com draft/revisão preservados; virada do ano/navegação; duas épocas XLSX com source import; três máquinas/fusos; restore A1 com safety, ausências, source/offset/extras e reload/export. Mesmo snapshot e corte produzem mesmos resultados sob São Paulo, UTC e Nova York. DST inclui salto e repetição de hora nas fixtures Instant→CivilDate.

Falhas intermediárias foram corrigidas sem relaxar testes existentes: um teste novo exigia identidade do wrapper de backup em vez de equivalência; harness de fuso tentou inserir script/HTML em documento SVG, corrigido para navegação HTML; typecheck identificou imports sem uso, props de preview e um adapter civil faltante durante integração. Resultados finais acima substituem essas rodadas. Nenhum caso ignorado. Capturas PNG de dashboard geradas pelos E2E foram repostas somente aos bytes do checkpoint limpo, sem incluir artefatos visuais no commit. A checagem ampla de formato inicialmente incluiu esses PNGs; a validação final foi limitada aos21 arquivos textuais autorizados.

Não existe script lint nem typecheck separado no package.json; typecheck foi executado pelo build. Aviso preexistente Vite de chunks acima de500kB/ExcelJS permanece não bloqueante. Testes usam contextos/origens isolados, sem perfil pessoal. Não são certificação de Safari/mobile físico.

## Arquivos da entrega

- IMPLEMENTACAO-B1C.md
- src/App.tsx
- src/components/dashboard/OverviewPage.tsx
- src/components/settings/SettingsPage.tsx
- src/components/transactions/AddTransactionModal.tsx
- src/components/transactions/ImportModal.tsx
- src/components/transactions/TransactionForm.tsx
- src/features/dashboard/calculations.ts
- src/features/dashboard/calculations.b1c.test.ts
- src/features/transactions/importExport.ts
- src/features/transactions/importExport.b1c.test.ts
- src/features/transactions/validation.ts
- src/features/transactions/validation.b1c.test.ts
- src/hooks/useCivilToday.ts
- src/hooks/useTransactions.ts
- src/hooks/useTransactions.b1c.test.ts
- src/utils/format.ts
- src/utils/civil.ts
- src/utils/civil.test.ts
- tests/b1c-civil-origin.spec.ts
- tests/helpers/b1cHarness.ts

Somente esses21 arquivos em staging seletivo e um commit feat: explicita calendario corte e origem B1c. Staging e worktree B1 vazios após commit; principal intocado. Rollback é somente de código, sem restaurar snapshot antigo sobre writes novos. Proveniência já perdida não é recuperável por inferência. Bloqueadores B1c: nenhum após verificações finais. Parar após o commit; não iniciar B2/P1.
