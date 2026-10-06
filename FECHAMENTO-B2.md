# 1. Checkpoints

Revisão integrada em 06/10/2026, somente no worktree `C:\Users\patai\OneDrive\Documentos\Dashboard-Financeiro-B2`, branch `plan/b2-workspace-local`. HEAD analisado e preservado: **1589fc76702f18d69266625104dabfd5f53e577d** — `feat: ativa workspace local scoped B2c`.

| Etapa             | Checkpoint | Entrega                        |
| ----------------- | ---------- | ------------------------------ |
| Base B1 selada    | 0157797    | Fechamento B1                  |
| Plano B2 aprovado | 5fcf837    | Plano após revisão adversarial |
| B2a               | ff0cce2    | Contratos de workspace         |
| B2b               | fdf97a7    | Engine scoped e migração       |
| B2c               | 1589fc7    | App usa o Personal scoped      |

Antes da revisão: raiz/branch/HEAD/log conferidos, árvore limpa e index vazio. Fontes lidas integralmente: PLANO-B2.md, IMPLEMENTACAO-B2A.md, IMPLEMENTACAO-B2B.md, IMPLEMENTACAO-B2C.md, FECHAMENTO-B1.md e ROADMAP-VERTICE-2-POS-A2.md. Prioridade: código/testes atuais, plano aprovado, relatórios de implementação, documentação histórica. Declarações de fases ainda não iniciadas nos documentos anteriores pertencem a seus checkpoints.

# 2. B2a

**PASS.** WorkspaceId UUID v4 canônico com brand e validação runtime; único mode aceito `personal`; authority mínima; metadata `workspaceId/mode/revision`; envelopes financeiros raw; chave composta; precondition `workspaceId/expectedRevision`; lease opaca por identidade de referência e vinculada ao handle; dispose definitivo; A1→B→A2; revisão segura inclusive MAX.

[Tipos](src/types/workspace.ts) e [validação/handle](src/utils/workspace.ts) não diferem de ff0cce2. O comentário histórico sobre contratos “dormant” descreve a etapa B2a; imports e execução atuais mostram o consumo por B2b/B2c. Não indica um caminho financeiro v3 ativo na App atual. Nenhuma redefinição incompatível foi encontrada. Contratos dirigidos repetidos: **109/109 PASS**.

# 3. B2b

**PASS.** [Engine](src/services/scopedStorage.ts), [protocolo](src/services/scopedStorageProtocol.ts) e [repository](src/services/scopedTransactionRepository.ts) usam uma única base, schema uniforme, preflight e cópia/verificação atômica. Igualdade raw inclui campos ausentes, extras, IDs, settings e precisão legada; métricas financeiras não normalizam o arquivo de origem.

Os testes de engine cobrem seis writers A/B em commit/abort, CAS concorrente, referências e dedup locais, mismatch de scope/lease, dispose durante espera RW, revisão MAX, bloqueio/cancelamento tardio, migração concorrente, write entre commit/reopen, rollback de revisão, recuperação, faults/crash e fence com artefato histórico. A seleção dirigida e a suíte completa estão registradas na seção 17.

# 4. B2c

**PASS.** [Bootstrap](src/services/storageBootstrap.ts) valida authority/snapshot antes de publicar ready; [facade](src/services/workspaceRepository.ts) fica ligada a um handle; [App](src/App.tsx) e [hook](src/hooks/useTransactions.ts) capturam repository/revisão/contexto na abertura de cada operação.

Fresh usa Personal implícito, sem nome, login ou seletor. Legacy exige safety e consentimento explícito. Não existe publicação de dashboard legado, writer global de fallback ou defaults antes da validação. Contexto invalidado preserva consulta de drafts sem permitir reutilizar seu writer. As respostas tardias não publicam sobre o novo contexto. Não houve alteração de front/P1 nesta revisão.

# 5. Workspace contract final

**PASS.** Identidade estável por workspace, mode personal, settings e transactions locais. IDs financeiros continuam strings raw dentro dos envelopes; o namespace físico é o par `workspaceId/record.id`. Referências de conta/categoria e dedup consultam somente o snapshot capturado do workspace.

A precondition financeira persistível não contém identidade de sessão. A lease é runtime, não serializável, pertence ao handle original e não pode ser reconstruída de JSON. CAS local não é autenticação, autorização remota ou segurança contra JavaScript arbitrário da mesma origin.

# 6. Persistence/schema final

**PASS.** Database único `vertice-finance`, versão IndexedDB **4**. Fresh e migrado têm exatamente os mesmos cinco stores; nenhum store financeiro extra ou segundo database foi introduzido.

| Store físico       | keyPath                     | Índices                                              | Papel                                   |
| ------------------ | --------------------------- | ---------------------------------------------------- | --------------------------------------- |
| scopedTransactions | ["workspaceId","record.id"] | byWorkspace: workspaceId, não unique, não multiEntry | Finanças scoped                         |
| scopedSettings     | workspaceId                 | nenhum                                               | Configuração scoped                     |
| workspaceMeta      | out-of-line                 | nenhum                                               | Authority, revisão e recibo operacional |
| transactions       | id                          | nenhum                                               | Archive legacy                          |
| settings           | out-of-line                 | nenhum                                               | Archive legacy                          |

Todos sem autoIncrement. A engine valida lista de stores, keys e índices. Archive é readonly nas APIs aprovadas, serve diagnóstico e fica stale após novos writes. Não é fallback, fonte de recovery automático nem segunda authority. Readonly aqui é contrato de acesso da aplicação, não uma ACL de IndexedDB contra código arbitrário na origin. Nenhum archive foi apagado nesta entrega/revisão.

# 7. Authority/fence final

**PASS no escopo certificado.** Authority exatamente `layout=scoped, protocol=1, defaultWorkspaceId, sourceVersion=0|3`. Sem ownerKind, status/fenced redundante, sourceRevision/sourceCount ou authority paralela. Workspace metadata conserva somente `workspaceId, mode, revision`.

O schema v4 impede `open(3)` do cliente real **0157797478ac27c8339444b604caaefd9e22dc95**. Testes [old-client](tests/b2c-old-client.spec.ts) verificam load e os seis writers save/remove/import/saveSettings/removeDemo/restore, aba já aberta, reload, BC ausente e SW/assets históricos com reload offline. Dados raw ficam idênticos após as tentativas rejeitadas. Artefato histórico verificado pelo harness, sem substituto sintético ou skip.

Após promoção existe uma única autoridade financeira gravável: repository scoped. Nenhum writer v3 de fallback. BC não fornece o fence. A compatibilidade global de todos os releases publicados permanece residual de inventário; ver C01.

# 8. CAS/session final

**PASS.** Revisão por workspace; comparação de `workspaceId + expectedRevision`, mutação e incremento na mesma transação RW. Lease é verificada antes da transação e novamente quando os requests estão prontos, antes de mutar. Erro aborta dados e revisão juntos; não há reset. No-op bem-sucedido consome a revisão conforme contrato.

A e B com mesma revisão são independentes. Seis writers têm scope fixo, referências locais e nenhuma limpeza/lookup global financeiro. Restore usa cursor `byWorkspace` restrito a A, não clear global.

**MAX:** leitura/exportação permitidas; os seis writers recusados; snapshot permanece válido, sem recovery estrutural inventado.

A1→B→A2 não reativa lease, callback, resultado ou token antigos. Dispose é definitivo. Retry/recapture cria novo contexto validado, sem reaproveitar autorização de draft antigo. Testes de [sessões reais do hook](tests/b2c-sessions.spec.ts) verificam callback e leitura atrasados, restore que gira lease, B inalterado e detecção por focus sem BC.

# 9. Migration final

**PASS.** Fresh: inspeção de ausência → v4 direto → UUID/Personal/R=0/defaults/empty state; sem estágio v3.

Legacy v1/v2: migrador A2 real → `open(3)` → commit → close → preflight/safety → promoção consentida `open(4)`. Legacy v3: preflight/safety → promoção consentida v4. Não há `open(old,4)` fingindo commit intermediário.

Safety financeira JSON v2 gerada e validada; download iniciado; usuário confirma que guardou. **Não existe prova física de que o arquivo foi armazenado.** Falha de download, cancelamento, dirty/busy ou safety stale impedem a promoção. Retomada exige nova safety quando necessária.

Na versionchange, copia/verifica rows/settings raw antes de publicar metadata/authority. Commit preserva revisão fonte; reabertura valida schema/authority/snapshot. Write scoped comprometido entre migração e reopen é preservado, sem recopy do archive. Blocked/late upgrade usa cancelamento lógico; não força fechamento de outra aba. Crash antes do commit preserva v3; depois do commit retoma v4 validada.

# 10. Restore/import/backup

**PASS.** JSON financeiro permanece **versão 2**, representa um Personal e não transporta identidade de origem. Restore usa destino/handle capturado e safety desse mesmo destino. Substituição, CAS e recibo são atômicos; verificação posterior confere snapshot/revisão, sem compensação destrutiva. Restore A não toca B e invalida as sessões A.

Recibo B2c: chave operacional `["restore", workspaceId]` em workspaceMeta, valor da revisão do último restore, escrito na mesma RW da substituição e incremento CAS. Ausência é válida para bases B2b anteriores; quando presente, exige inteiro seguro entre 1 e R. Não é segunda CAS, authority ou dado financeiro e não entra no backup.

Import captura scope, settings e revisão na abertura. A implementação real lê CSV por **File.arrayBuffer + TextDecoder**, e XLSX por File.arrayBuffer + ExcelJS; não usa File.text. Após await, a sessão é revalidada antes de publicar preview ou escrever. Callback tardio não muda destino; preview invalidado pode sobreviver readonly; dedup permanece local; novos fatos mantêm source=import e captura civil/proveniência B1. O teste de parser pendente interrompe a leitura real de arrayBuffer e comprova ausência de writes após versionchange.

Backup mantém apenas o contrato financeiro v2: version/exportedAt/settings/transactions. Não adiciona workspaceId/revision/authority/lease/recibo operacional, nem envelopes. Extras raw históricos que por acaso usem esses nomes dentro do DTO continuam preservados; isso não é metadata adicionada pelo protocolo. [Backup](src/features/transactions/backup.ts), tipos financeiros e calculadores permanecem sem diff frente à base B1 selada.

# 11. Dirty/PWA/multi-tab

**PASS.** Dirty registry síncrono same-tick; guards de modal/rota/beforeunload/PWA; bloqueio durante migração; invalidação de sessão após restore/versionchange. Draft invalidado permanece visível readonly. Nenhum reload automático destrutivo ou consentimento implícito para update.

Waiting SW real, dirty+update, migration+update, corrida controllerchange e native versionchange são exercitados no navegador. A autorização de reload anterior é revogada ao surgir trabalho/invalidar contexto. Aceitar descarte/reload não promete recuperação durável de draft.

BC é advisory com workspaceId; mensagem B não invalida A. Sem BC, CAS/fence continuam válidos. Focus relê authority, metadata, revisão, snapshot e recibo numa leitura coerente; restore externo invalida o handle antigo. Resposta atrasada de A1 não substitui A2. Concorrência multi-tab permanece interna aos testes, mesmo com um worker na suíte.

# 12. Recovery

**PASS no limite aprovado.** Erros distinguem invalid-layout, invalid-authority, missing-workspace, invalid-scoped-settings/invalid-snapshot, unsupported-version, blocked/migration-aborted, stale-safety, revision-exhausted, quota e closed. MoneyError derivado é indisponibilidade financeira, não corrupção estrutural nem motivo para defaults.

V4 inválida não mostra dashboard, não usa archive como saldo, não cria defaults, não baixa a v3 e não recopia a origem. Oferece orientação/retry; restore sem destino validado permite somente conferir o arquivo e orientar recuperação em perfil limpo. Não ganha writer privilegiado sobre base inválida.

Faults/quota injetados testam rollback; crash de browser/contexto e reinício do mesmo perfil exercitam recuperação local. Não comprovam queda elétrica, disco, eviction, quota física esgotada, dump completo de corrupção ou reconstrução de qualquer dado perdido.

# 13. Performance

Baseline oficial final de B2c, preservado como evidência histórica distinta da reexecução desta revisão: três repetições por tamanho, Edge **154.0.4258.53**, Windows **10.0.26200**, Intel **i7-13620H**, 16 CPUs lógicas e aproximadamente 34,0 GB RAM decimais.

| Fatos  | Mediana promoção → render observado | Heap máximo amostrado | Maior gap de timer |
| ------ | ----------------------------------- | --------------------- | ------------------ |
| 1.000  | 339 ms                              | 12,3 MB               | 88 ms              |
| 10.000 | 1.823 ms                            | 48,6 MB               | 327 ms             |
| 90.072 | 15.978 ms                           | 245,0 MB              | 2.419 ms           |

**ACEITÁVEL PARA WEB DESKTOP ATUAL**, para migração explícita e excepcional com safety e tela busy. Pausa perceptível em 90k; não certifica mobile, Safari ou hardware modesto e não é SLA geral.

Promoção→render inclui scheduling/asserts; ready DOM e primeiro render são observações, não profiler CPU. Open(4)→commit é subtrecho. Heap é V8/CDP amostrado, não RSS, e inclui conferência raw do harness após ready; render/gap são capturados antes dessa conferência. Archive duplicado aumenta espaço; B2b estimou aproximadamente 26,4→87,2 MB em 90k, sem excluir a origem.

Reexecução nesta revisão, mesmo Edge/máquina, três repetições por tamanho: **3/3 benchmarks PASS**, igualdade raw integral e nenhum timeout/OOM ou resultado financeiro parcial.

| Fatos  | Repetições promoção → render (ms) | Mediana (ms) | Heap máximo V8 amostrado | Maior gap |
| ------ | --------------------------------- | ------------ | ------------------------ | --------- |
| 1.000  | 902 / 931 / 419                   | 902          | 11,3 MB                  | 75 ms     |
| 10.000 | 3.312 / 3.333 / 3.315             | 3.315        | 48,5 MB                  | 326 ms    |
| 90.072 | 33.389 / 29.611 / 13.078          | 29.611       | 243,9 MB                 | 4.477 ms  |

Engine isolada B2b reexecutada: open total **317,5 / 2.732,4 / 33.375,8 ms** em 1k/10k/90.072, com integridade raw em todos. O aumento e a variação nesta rodada reforçam o limite do ambiente; não foi demonstrada causa específica e não há budget universal aprovado para inferir regressão funcional somente por tempo. A classificação desktop para migração excepcional permanece, com a ressalva explícita de aproximadamente **30 segundos** de mediana no maior cenário desta revisão.

# 14. Compatibilidade A1/A2/B1

**PASS.** Regressão integrada preserva restore/rollback/verificação A1; leitura estrutural e ausência de defaults em corrupção A2a; CAS/create-update/fence A2b, agora scoped; dirty/PWA/descarte A2c; Money checked, calendário/corte e origem/proveniência B1.

IndexedDB muda deliberadamente de v3 para v4 no escopo B2. **Backup financeiro permanece v2.** CAS passa a ser por workspace, mantendo comparação e mutação atômicas. Não declarar “IndexedDB v3 preservado” como versão da App pós-B2.

Diff frente a 0157797 sem alterações nos contratos financeiros/backup/kernel/calculadores examinados; execução cobre os fluxos integrados. Suítes legacy usam protocolo v3 real onde pertinente, e as suítes da App usam consentimento e scope v4.

# 15. Findings

IDs abaixo são da auditoria arquitetural, não os IDs homônimos de revisão A2c.

| Finding | Status pós-B2                                                             | Evidência/limite                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01     | **MITIGADO globalmente**                                                  | Engine/fence resolvidos e provados para checkpoint 0157797 e seus assets/SW certificados; sem inventário completo de todos os releases publicados, não universalmente RESOLVIDO |
| H08     | **Escopo/contexto técnico concluído em B2**                               | Corte B1 preservado e repository/contexto scoped integrado; acabamento narrativo/composição de produto/UX permanece P1                                                          |
| M01     | **PASS/RESOLVIDO no escopo certificado**                                  | Dirty/release/schema testados em Edge e cliente histórico certificado; não certifica todos os releases/mobile                                                                   |
| M07     | **Recovery local scoped implementado no limite aprovado; MITIGADO local** | Retry/fail-closed/safety/restore/retomada exercitados; cloud e RPO/RTO de serviço permanecem adiados                                                                            |
| H06     | **RESOLVIDO para operações atuais**                                       | Money checked finito; não ilimitado                                                                                                                                             |
| H03     | **PRESERVADO/RESOLVIDO**                                                  | Leitura estrutural independente do relógio                                                                                                                                      |
| H07     | **MITIGADO/REDUZIDO**                                                     | Origem/contrato externo B1; sem conectores/reconciliação                                                                                                                        |
| M06     | **PARCIAL**                                                               | Seriais/épocas corrigidos em B1; expansão XLSX/memória ainda pendentes                                                                                                          |
| L01     | **MITIGADO**                                                              | Caixa explicitado; vocabulário de produto residual P1                                                                                                                           |

Nenhum finding cloud/Business/IA é declarado resolvido: C02/H05 dependem de domínio/piloto; H09/H10 de cloud/identidade; H11 de decisão sobre sync; H12 de grounding IA; H13 de classificação/história futura. Não existe autorização desta revisão para essas fases.

# 16. Residuals

1. Inventário dos clientes/assets efetivamente publicados e política operacional de release antes de distribuição: C01 continua mitigado globalmente.
2. Certificação limitada ao navegador/máquina/fixtures sintéticas; sem Safari, aparelhos físicos, hardware modesto ou perdas elétricas.
3. Safety exige guarda consciente do usuário, não confirmação física do navegador. Drafts não são duráveis após crash/kill/descarte aceito.
4. Archive readonly diagnóstico duplica espaço, fica stale após novos writes e não constitui recovery automático. Não fazer downgrade/reset/recopy para recuperá-lo.
5. Recovery não oferece dump raw/reconstrução integral de corrupção; perfil isolado e backup válido continuam necessários quando o destino não é validável.
6. Migração 90k tem pausa e consumo perceptíveis; sem promessa de desempenho universal.
7. M06 expansão XLSX e H07 conectores/reconciliação permanecem; P1 ainda precisa de plano próprio para contexto/produto/UX/vocabulário.
8. Auth/cloud/sync/Business/IA e suas garantias não foram implementados nem consultados operacionalmente.

Nenhum desses limites explícitos constitui inconsistência nova entre B2a/B2b/B2c no escopo aprovado.

# 17. Validation

Resultados reais desta revisão, no HEAD 1589fc7:

| Comando/verificação                                                       | Resultado                                          |
| ------------------------------------------------------------------------- | -------------------------------------------------- |
| `npm.cmd test`                                                            | **PASS — 673/673**, 19 arquivos; 17,42 s           |
| `node.exe node_modules/vitest/vitest.mjs run src/utils/workspace.test.ts` | **PASS — 109/109** contratos B2a; 1 arquivo        |
| `npm.cmd run build`                                                       | **PASS** — TypeScript `tsc -b`, Vite e PWA         |
| E2E completo, comando do script via Node abaixo                           | **PASS — 359/359**, 24 specs; 15,3 min             |
| E2E dirigido via npm, comando abaixo                                      | **PASS — 34/34**, 6 specs; 1,2 min                 |
| Benchmark App integrado 1k/10k/90.072                                     | **PASS — 3/3**, nove repetições, raw integral      |
| Old-client integrado real                                                 | **PASS — 2/2**, repetidos no dirigido              |
| Skips/falhas/flaky nas duas rodadas completas de casos                    | **0 / 0 / 0**                                      |
| `git diff --check` final                                                  | **PASS**                                           |
| Prettier --check somente FECHAMENTO-B2.md                                 | **PASS**                                           |
| HEAD/branch/index/diff tracked final                                      | **PRESERVADOS / index VAZIO / diff tracked VAZIO** |

Tentativa inicial `npm.cmd run test:e2e -- --workers=1 --reporter=line,json` encerrou com código **-1073740791** antes de executar casos. Foi registrada como tentativa sem validação, não como PASS. A repetição integral invocou diretamente o mesmo CLI que esse script usa, sem editar arquivos/configuração:

```text
node.exe node_modules/@playwright/test/cli.js test --workers=1 --reporter=line,json
```

Seleção dirigida efetivamente executada:

```text
npm.cmd run test:e2e -- tests/b2b-scoped.spec.ts tests/b2c-app.spec.ts tests/b2c-old-client.spec.ts tests/b2c-sessions.spec.ts tests/pwa.spec.ts tests/a2c-unsaved.spec.ts --grep 'fresh uniform|migration v3 raw R=17|historical v[12]|restore safety|CAS races|create/update|App legacy|fresh App|real App import|App B2c promotion|actual historical SW|A→B→A|focus response|focus detects|BC B|restore A rotates|two App tabs|two legacy|MAX App|App invalid4|pending CSV|external restore|dirty guard|B2c real waiting|A2c PWA settings|restore local exige' --workers=1 --reporter=line,json
```

Essa seleção repete fresh e migração v1/v2/v3, engine CAS/precondition/lease/dedup/referências/restore, App legacy/inválida/MAX/import/parser pendente, cliente antigo e SW offline, A→B→A, respostas atrasadas, restore/focus sem BC, tabs, dirty e waiting PWA durante migração. B2a foi repetido separadamente em unitários.

Ambiente: Edge headless, preview isolado `127.0.0.1:5193`, um worker, perfis de teste sintéticos, artefato histórico `%TEMP%\vertice-b2b-historical-Co8yuB`. Concorrência interna aos testes não foi removida. Helper temporário SetThreadExecutionState funcionou apenas enquanto cada runner existia, sem configuração permanente de energia.

JSON completo preservado em `%TEMP%\vertice-b2-closing-full.json` e dirigido em `test-results/b2-closing-directed.json`, também copiado para `%TEMP%\vertice-b2-closing-directed.json`. test-results é ignorado; as cópias completas permitem conferir estatísticas, casos e medições mesmo após a limpeza automática dos resultados na rodada seguinte.

Baseline oficial pós-B2c: unitários 673/673, build PASS, E2E 359/359. Os resultados acima pertencem à execução integrada atual e não foram inferidos do baseline.

Não existem scripts separados `lint` ou `typecheck`; build executa `tsc -b`. Aviso de chunk acima de 500 kB (ExcelJS) e NO_COLOR/FORCE_COLOR são não bloqueantes. Não foram editados testes, limites ou expectativas para conseguir aprovação; nenhum skip novo.

Artefatos de navegador ignorados não entram no documento/commit. Capturas PNG tracked regeneradas pelos testes foram repostas byte a byte ao HEAD inicial. Checagem final exige diff tracked vazio, index vazio, HEAD/branch preservados e somente `?? FECHAMENTO-B2.md`. Nenhum staging ou commit nesta execução.

# 18. Exit criteria

| Gate integrado                                              | Resultado |
| ----------------------------------------------------------- | --------- |
| B2a consumido sem redefinição                               | PASS      |
| Schema v4 uniforme e único database                         | PASS      |
| Uma authority gravável e archive diagnóstico                | PASS      |
| Fresh direto v4 e migração legacy consentida                | PASS      |
| Preservação raw/contagens/revisões e verificação            | PASS      |
| Fence v3 para release certificado com BC off/SW antigo      | PASS      |
| Seis writers scoped, lease/CAS e isolamento A/B             | PASS      |
| MAX readonly/export, sem reset                              | PASS      |
| Restore/import/backup v2 e recibo mínimo atômico            | PASS      |
| Sessões A→B→A e respostas tardias                           | PASS      |
| Dirty/PWA/multi-tab e recuperação fail-closed               | PASS      |
| Compatibilidade A1/A2/B1 e suítes reais                     | PASS      |
| C01 limitado à evidência; residuais explícitos              | PASS      |
| Somente documento novo; código/tests/HEAD/index preservados | PASS      |

**ATENDIDO para o escopo aprovado de B2.** Não foi encontrada inconsistência bloqueante entre B2a/B2b/B2c. Contratos, migração/fence, authority única, isolamento, leases/CAS, backup/restore/import e proteção de drafts estão integrados e regressados. Residuais de release, plataforma e produto ficam delimitados; não reabrem a arquitetura sem evidência de blocker.

# 19. Decision

**B2 APROVADO E CONCLUÍDO**

B2a: PASS. B2b: PASS. B2c: PASS. Workspace/schema v4/authority/fence/CAS/sessões/migração/restore/import/dirty-PWA/recovery: PASS no escopo certificado. Backup financeiro JSON v2: PRESERVADO. C01: MITIGADO globalmente, sem declarar certificação universal. Nenhum bloqueador B2 identificado.

Esta execução cria somente FECHAMENTO-B2.md, sem commit ou staging. Nenhuma implementação nova, mudança em src/tests, alteração de plano/roadmap/relatórios anteriores, merge, acesso operacional a Supabase ou início de P1. Working tree principal e worktree B1 não foram usados para escrita ou testes.
