# 1. Checkpoints

Fechamento integrado em 05/10/2026, exclusivamente no worktree `C:\Users\patai\OneDrive\Documentos\Dashboard-Financeiro-B1`, branch `plan/b1-money-dates-origin`.

HEAD analisado: `9a8514e6c1a2747745c5c5292a0d40577efc4176` — `feat: explicita calendario corte e origem B1c`. `git rev-parse --show-toplevel`, `git status --short`, `git log --oneline -8` e inspeção do index confirmaram diretório/branch corretos, árvore inicialmente limpa e staging vazio.

| Checkpoint | Entrega                                |
| ---------- | -------------------------------------- |
| `c7fc72c`  | Roadmap pós-A2                         |
| `67e5d9d`  | Plano B1 aprovado, incluindo seção 24  |
| `2b32caa`  | B1a — kernel Money e adapters          |
| `a02dc0b`  | B1b — integração monetária             |
| `9a8514e`  | B1c — calendário, corte e proveniência |

Fontes confrontadas: `PLANO-B1.md`, `IMPLEMENTACAO-B1A.md`, `IMPLEMENTACAO-B1B.md`, `IMPLEMENTACAO-B1C.md` e `ROADMAP-VERTICE-2-POS-A2.md`. Prioridade: código/testes, plano aprovado, relatórios. Expressões históricas como “B1c não iniciado” nos relatórios anteriores descrevem seus checkpoints; não são o estado do HEAD atual. A atualização de findings fica somente neste documento.

# 2. B1a

**PASS.** `src/utils/money.ts` contém MinorUnits nominal, construtor runtime, operações checked, adapters explícitos e parser lexical. `validation.ts` reutiliza o kernel nos comandos e na assinatura. Os 70 testes do kernel e 24 de validação passaram na execução atual.

Comparação `git diff 2b32caa HEAD -- src/utils/money.ts src/utils/money.test.ts`: vazia. B1b/B1c consomem o contrato original sem redefini-lo. BRL permanece invariável; não existe objeto currency por valor, BigInt persistido ou nova dependência.

# 3. B1b

**PASS.** A inspeção de `calculations.ts`, formatadores e consumidores confirmou o inventário completo:

| Operações                          | Contrato integrado                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| Receitas, despesas e saldo líquido | Entrada R$ → c; somas/diferença checked; R$ apenas na saída                              |
| Transferências                     | Excluídas de receitas/despesas; pernas preservadas nos saldos; total conservado          |
| Saldo por conta e total de contas  | Base e movimentos checked; abertura inclusiva; antes da base/null incompleto preservados |
| Categorias e orçamento             | Totais/diferenças em c; limiares de atenção por comparação racional exata                |
| Séries e médias                    | Seis meses; lacuna distinta de zero; acumulação checked e divisão racional               |
| Projeção                           | Corte civil explícito, mesmos gates de mês/dia/amostra; resultado racional checked       |
| Anomalias e queda de receita       | Limiares exatos; diferença mínima de 5.000 c e amostra preservadas                       |
| Insights                           | Composição interna em c, dedup/prioridades/top três preservados                          |
| Planejamento e metas               | Fixas, disponível e faltante checked; planejamento permanece separado do realizado       |

Os 76 testes ordinários preexistentes de cálculos permanecem idênticos à base; os 46 testes B1b preservam goldens e separam classes P/R/C/N. Os nove testes de integração civil verificam que B1c não muda Money ao substituir calendário/clocks.

Correções **C**, sem alegar paridade com erro IEEE: MAX_SAFE/3 termina em 330 c, não 331 c; produtos extremos dos limiares 120/85/115 são comparados exatamente; formatação de MAX mantém centavo 91; meta 9/40 c arredonda 22,5% para 23%; variação 30/10 c resulta em 200%; subcentavo bruto válido continua bruto, com projeção indisponível quando necessária. Correções de proveniência/época estão registradas nas seções seguintes.

# 4. B1c

**PASS.** `civil.ts`, `useCivilToday`, App, calculadores, validadores, formulário, preview e hook estão integrados. CivilDate/Month e Instant são contratos separados; não alteram DTOs persistidos. Timezone IANA participa da captura, não da aritmética financeira.

XLSX real: a propriedade efêmera `ImportSheet.date1904` chega ao preview pelo ImportModal. Seriais 46275/44813 nas épocas 1900/1904 convergem para 2026-09-10. Seriais 1/59/61 de 1900 produzem 01/01, 28/02 e 01/03; serial 60 e sua fração são rejeitados deterministicamente. Em 1904, 0/1 produzem 01/01 e 02/01. Células Date modernas já convertidas pelo ExcelJS permanecem no fluxo existente.

**Correção C:** a origem fixa antiga interpretava 44813 como 2022-09-09; o indicador da época corrige 1462 dias. `date1904` não integra NewTransaction, registro, schema ou backup. Valores monetários mantêm parser/validação B1a, sem conversão de época sobre amount. Fixtures unitárias e os dois imports reais no navegador passaram. **M06 continua PARCIAL**: expansão/descompressão/memória não foram resolvidas.

# 5. Contrato Money final

**PASS.** MinorUnits é number branded em centavos BRL, limitado a ±9.007.199.254.740.991 c. Campos persistidos continuam R$ Number com seus tetos/tolerâncias anteriores; teto por campo não é teto agregado.

`checkedAdd`, `checkedSubtract` e `checkedMultiply` validam operandos e fronteira. Prefixo que ultrapassa o limite falha mesmo que haja cancelamento posterior. BigInt fica local ao multiply/divide arredondado e ao fallback da comparação racional; não amplia a faixa do resultado. Política signed nearest/ties toward +infinity preservada.

Núcleos compostos usam c e não chamam wrappers R$ para reconverter durante o cálculo. `toLegacyReais` verifica roundtrip; c seguro que não pode ser expresso fielmente na API R$ produz erro precision. `moneyMinor` formata dígitos exatos; `moneyFromCalculation` recupera c somente na apresentação da saída já verificada. Percentuais/coordinates Number não voltam a decisões financeiras; alertas não dependem de Intl/toFixed.

MoneyError é capturado especificamente nas composições atuais: Overview, resumo de Transações e derivados de Settings. Nenhum erro monetário vira LocalReadError, zero, subtotal, alteração do snapshot ou recovery. Overview suprime seu bloco composto de métricas quando ele falha, conforme o plano; consulta recente, navegação e cadastro continuam disponíveis. Catches por conta/meta e blocos de Settings mantêm derivados independentes. A granularidade futura da apresentação pertence a P1.

Smoke de 90.072 registros individualmente válidos com soma MAX+1 passou: lista, edição CAS, CSV completo, JSON v2 e reload permanecem acessíveis, sem recovery nem números falsos. Smoke de saldo isolado indisponível mantém resumo mensal válido. Subcentavo R$1e-8 é preservado no export/restore, sem normalização para zero.

# 6. Contrato calendário/corte final

**PASS.** CivilDate YYYY-MM-DD é gregoriano, de 1900-01-01 a 9999-12-31; o mínimo é o contrato anterior comprovado, não uma restrição inventada por Excel. CivilMonth inclui meses anteriores somente nas lacunas da janela mínima. Instant não substitui transaction.date.

App captura hoje uma vez por render e fornece o corte à composição, saldos, navegação, formulário e import. Overview propaga selected/today a comparação, insights, projeção, saldos e fallback; dependências memo incluem today. Núcleos privados não recapturam o relógio. Calendário/clamp e dias XLSX não usam duração de 86.400.000 ms.

Meses históricos inteiros e comparação corrente parcial mantêm suas semânticas diferentes; um corte compartilhado não transforma toda métrica em filtro “até hoje”. Base de conta é inclusiva; createdAt não determina caixa. Mesmo snapshot/corte produziu resultados iguais sob São Paulo, UTC e Nova York; testes também cobrem leap years e DST.

Leitura estrutural não captura hoje. Focus/visibility geram nova consulta civil sem regravar fatos, mudar mês escolhido, descartar draft ou renovar baseRevision. Smokes de virada diária/ano e guards passaram. Clocks de fronteira são classificados na seção 12.

# 7. Contrato origem/proveniência final

**PASS.** `prepareTransaction` é consumido pelo hook: criação manual registra source manual e Instant real UTC; edição conserva source/createdAt explícitos, extras e ausências. Ausência não vira manual nem timestamp de edição. Import captura um instante para o lote, marca import e mantém caixa civil. Demo permanece demo.

Restore preserva campos raw, offsets e ausências. `removeDemo` filtra somente source demo: prefixo demo- sem source não autoriza exclusão. Não existe enum persistido external/unknown nem classificação sintetizada por horário de meio-dia. O migrador v1 histórico permanece inalterado; B1 não recupera proveniência previamente perdida.

Contrato externo continua exclusivamente documental: ID string lossless, 000123 ≠ 123; namespaces qualificados conforme garantia real; observação, vínculo e movimento têm identidades distintas; N observações podem referir um movimento sem duplicar caixa. Sem conector ou reconciliação implementados.

# 8. Compatibilidade A1/A2

| Entrega | Resultado atual | Evidência integrada                                                                                          |
| ------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| A1      | PASS            | Restore real, safety, cancelamento, rollback, equivalência raw e verificação sem segunda escrita corretiva   |
| A2a     | PASS            | Leitura estrutural futura/fusos, recovery sem defaults, overflow derivado separado de corrupção              |
| A2b     | PASS            | Seis writers, atomicidade/revisão, conflitos/create-update, fence v2→v3 e preservação de tokens              |
| A2c     | PASS            | Dirty same-tick, modal/route/beforeunload/PWA, controllerchange e drafts mantidos após conflito/virada civil |

Suíte completa inclui local-read, migração, conflict UI e restore adversarial; seleção dirigida repete CAS, recovery, restore e dirty/PWA. Testes antigos dessas proteções não foram alterados na fase B1 nem nesta revisão. A edição de legado mantém conteúdo e ausência de metadados em gravação/export/reload reais.

# 9. Backup/DB/CAS

**Backup JSON v2 PRESERVADO. IndexedDB v3 PRESERVADO. CAS PRESERVADO.**

Diff desde 67e5d9d para `src/types/finance.ts`, `src/services/transactionRepository.ts`, `src/features/transactions/backup.ts`, manifestos/lock/config: vazio. Stores, índices, schema, versão e protocolo continuam os existentes. Não há migration nem alteração de banco pessoal/remoto.

Seis writers seguem protegidos: save, remove, import, saveSettings, removeDemo e restore. Snapshot/revisão são lidos coerentemente; comparação CAS, alteração e incremento ocorrem na transação, com abort integral em erro. Validação B1 não introduz bypass nem novo writer.

Reader/backup descartam o retorno normalizado do validator e preservam os objetos originais validados. Restore/safety mantêm R$, datas, IDs, source/createdAt opcionais e extras. Ruído numérico válido/subcentavo histórico não é regravado por projeção Money. Backup não contém BigInt, brands ou metadados operacionais/date1904.

# 10. Findings

| Finding | Status lógico pós-B1            | Limite explícito                                                                                                             |
| ------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| H06     | RESOLVIDO para operações atuais | Faixa segura finita e erro explícito, sem promessa de Money ilimitado                                                        |
| H07     | MITIGADO/REDUZIDO               | Política de origem e contrato externo fechados; conectores/reconciliação não existem                                         |
| H08     | CONTRATO FECHADO EM B1          | Composição atual recebe corte e invalida por render/focus/visibilidade; integração final de produto/contexto/UX permanece P1 |
| H03     | PRESERVADO/RESOLVIDO            | Leitura estrutural continua independente do relógio; limites de comando separados                                            |
| M06     | PARCIAL                         | Seriais/épocas reproduzidos corrigidos; expansão/memória continuam pendentes                                                 |
| L01     | MITIGADO                        | Regime de caixa explicitado; revisão do vocabulário de produto permanece P1                                                  |

Nenhum finding futuro de workspace/fence v3, cloud, logout, sync, Business ou IA é declarado resolvido. Roadmap/plano/relatórios anteriores permanecem intactos.

# 11. Validação integrada

Resultados reais desta execução, no HEAD analisado:

| Comando/verificação             | Resultado                                     |
| ------------------------------- | --------------------------------------------- |
| `npm.cmd test`                  | PASS — 487/487, 15 arquivos                   |
| `npm.cmd run build`             | PASS — tsc -b, Vite e PWA                     |
| `npm.cmd run test:e2e`          | PASS — 245/245, Edge headless, 2 workers      |
| Unitários dirigidos             | PASS — 462/462, 13 arquivos                   |
| E2E dirigidos                   | PASS — 152/152, 9 specs                       |
| `git diff --check` antes/depois | PASS                                          |
| Formato de FECHAMENTO-B1.md     | PASS — Prettier --check limitado ao documento |

Seleção unitária reexecutada: civil, money, format, calculations/test/B1b/B1c, validation/test/B1c, importExport/test/B1c, useTransactions B1c, backup e backup.adversarial, via `vitest run` com esses 13 caminhos explícitos.

Seleção E2E reexecutada:

```text
npm.cmd run test:e2e -- tests/b1c-civil-origin.spec.ts tests/b1b-money-ui.spec.ts tests/dashboard.spec.ts tests/restore.spec.ts tests/recovery.spec.ts tests/repository.spec.ts tests/a2b-concurrency.spec.ts tests/a2c-unsaved.spec.ts tests/pwa.spec.ts
```

Preview isolado em 127.0.0.1:5191, sem perfil pessoal. Todos os casos passaram; nenhum skip novo ou teste editado. Não existem scripts dedicados lint/typecheck; o build executou TypeScript. Aviso Vite preexistente de chunk acima de 500 kB (ExcelJS) permanece não bloqueante. Avisos NO_COLOR/FORCE_COLOR não representam falha.

E2E regenerou somente os PNGs tracked de dashboard; seus bytes foram repostos explicitamente ao HEAD inicial, sem incluir mudança visual. Checagem final: HEAD/branch mantidos, staging vazio, diff tracked vazio, único arquivo novo `FECHAMENTO-B1.md`. Nenhum commit nesta execução; principal e controle-gado não foram utilizados para escrita ou testes.

# 12. Residuais explícitos

| Clock residual                      | Classificação | Por que não bloqueia a composição financeira                                                                                       |
| ----------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Defaults públicos e localDate       | ACEITÁVEL     | Captura somente quando chamada de entrada omite corte; composição interna atual passa o parâmetro                                  |
| Revalidação no repository           | ACEITÁVEL     | Guard de comando separado, sem derivar métricas; eventual rejeição aborta a gravação e não renova token                            |
| Form/preflight e preparação no hook | ACEITÁVEL     | Novas fronteiras de comando podem observar data posterior; lote do hook compartilha today/Instant, sem alterar o corte da consulta |
| Export/safety timestamps            | ACEITÁVEL     | Registram momento de exportação; não filtram nem normalizam fatos                                                                  |
| PWA                                 | ACEITÁVEL     | Lifecycle de atualização preserva guards; não calcula finanças                                                                     |
| Demo                                | ACEITÁVEL     | Captura própria para criar dados explicitamente demo; não recaptura dentro da consulta real                                        |

O repository intacto ainda valida cada linha importada por wrappers de comando e pode observar outro instante que o preflight. Não existe clock global atravessando todas as fronteiras. Isso não mistura cortes dentro da mesma composição financeira; erro mantém atomicidade/draft e dados. Não foi removido o guard nem modificado CAS para buscar “zero new Date”.

Residuais de produto: atualização contínua sem render/focus/visibilidade, composição/contexto/UX final H08 e vocabulário L01 em P1; expansão XLSX M06; conectores/reconciliação H07. Também permanecem teto seguro/prefixo de soma, brand que não proíbe operadores nativos por si, perda prévia de proveniência, histórico de orçamento não modelado, draft não durável em crash e certificação física Safari/mobile ausente. Nenhum desses itens está apresentado como entregue.

# 13. Critério de saída

**ATENDIDO para o escopo aprovado de B1.** Kernel consumido, operações atuais checked, goldens preservados, correções C explícitas, corte civil integrado sem recaptura interna, proveniência conservada, Money separado de leitura raw, DB/backup/CAS intactos, A1/A2 regressados e suítes reais verdes.

Não foi identificado bloqueador real entre B1a/B1b/B1c. Nenhuma correção de código foi necessária/autorizada nesta revisão. Só este documento foi criado no worktree; nenhum teste, plano, relatório anterior ou roadmap foi editado. Staging permanece vazio. B2 e P1 não iniciados. Não houve acesso operacional a Supabase ou serviço remoto.

# 14. Decisão final

**B1 APROVADO E CONCLUÍDO**

B1a: PASS. B1b: PASS. B1c: PASS. Money: PASS. Calendário/corte: PASS. Origem/proveniência: PASS. A1/A2a/A2b/A2c: PASS. Backup v2, IndexedDB v3 e CAS: PRESERVADOS.

Bloqueadores B1: nenhum. H07/H08/M06/L01 permanecem delimitados conforme seções 10/12, sem alegar conclusão do trabalho futuro. Documento entregue sem commit; encerrar esta execução sem iniciar B2 ou P1.
