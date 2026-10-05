# 1. Escopo/checkpoint

Entrega em 05/10/2026, exclusivamente no worktree `Dashboard-Financeiro-B2`, branch `plan/b2-workspace-local`, checkpoint `ff0cce2a0992c6fde26641ed6c281316080fcff7`. Root/branch/HEAD conferidos; entrada limpa, staging vazio, B2a presente. Leitura de PLANO-B2 (incluindo seção 31), IMPLEMENTACAO-B2A, repository, backup, validators, hook e testes existentes. Sem operação no principal/B1/controle-gado, banco pessoal, Supabase, cloud, UI ou P1.

B2b entrega uma engine dormente, exercitada exclusivamente por fábricas/harness explícitos. App/useTransactions/componentes não importam a engine; aplicação normal continua abrindo DB v3. B2c não iniciado, sem merge/cherry-pick/deploy.

# 2. Baseline

Antes de editar: `npm.cmd test` PASS **596/596**, 16 arquivos; `npm.cmd run build` PASS (tsc -b/Vite/PWA); `npm.cmd run test:e2e` PASS **245/245**, Edge headless, 2 workers, 2,3 min. Build/PWA concluídos antes do preview. Sem regressão reproduzível ou mudança em testes anteriores.

# 3. Arquitetura do engine v4

`createScopedStorage()` não abre IndexedDB na construção. Preflight, promoção explícita, reabertura/validação, leitura scoped, transações restritas aos três stores scoped e diagnóstico readonly do archive. Sem singleton alternativo no App, activeWorkspace, migration no mount ou flag de produção.

`createScopedTransactionRepository(engine,handle)` captura handle imutável B2a. `ScopedStorageError` classifica versão/layout/authority/workspace/settings/snapshot, blocked, migration-aborted, quota/request-failure, stale-safety/state, revision-exhausted e closed. As falhas transacionais mantêm causa e só rejeitam após rollback.

# 4. Schema

Mesmo banco `vertice-finance`, v4 somente em testes. Fresh/migrated: exatamente `scopedTransactions`, `scopedSettings`, `workspaceMeta`, `transactions`, `settings`. Scoped facts: keyPath `["workspaceId","record.id"]`, índice `byWorkspace` sobre workspaceId, non-unique, sem autoIncrement. Settings: keyPath workspaceId; metadata/legacy settings: out-of-line; legacy facts: id.

Validação de nomes, keyPaths, índices, defaults de authority e configuração válida antes de publicar conexão. Nenhuma reparação de schema ausente. Envelope só tem workspaceId/record; DTO financeiro não recebe campo operacional. Chave nested comprovada com add/get/put/delete/cursor/index/duplicate/Unicode/mesmo ID A/B no Edge.

# 5. Fresh bootstrap

Probe sem versão aborta criação acidental. Bootstrap exige preflight emitido pela própria instância. UUID síncrono na versionchange; Personal R=0/defaultSettings e authority `{layout:"scoped",protocol:1,defaultWorkspaceId,sourceVersion:0}`. Ambos stores legacy vazios, verificados também nas reaberturas. UUID permanece estável; mesma API scoped/backup v2 de migrated.

# 6. v1/v2→v3→v4

Reutilizado **o migrador A2 existente**, sem cópia de algoritmo: `transactionRepository.readForBackup()` abre explicitamente 3, aguarda commit, e `closeLocalDatabaseForMigration()` fecha seu cache. Só depois: nova readonly v3/preflight/safety e open(4). Tests observam v3 comprometida antes de pedir v4; preservação dos bytes transformados uma vez pelo A2.

Única mudança no repository atual: função de fechamento explícito por identidade da Promise. Justificativa: encerrar o estágio histórico antes de pedir v4 sem duplicar o migrador. Constante `LOCAL_DATABASE_VERSION=3`, algoritmo A2, seis writers e consumidores normais inalterados. Função só é chamada pela engine opt-in. Não ativa v4 na produção.

# 7. Migration v3→v4

Readonly coerente lê fatos/settings/chaves desconhecidas/CAS, valida estrutura e gera JSON v2 com roundtrip. Handle fechado antes de open(4). Safety fica vinculada à instância por WeakMap; cópia pública do snapshot não altera fonte privada. Na versionchange, releitura integral raw+R+keys/values: diferença aborta stale-safety e exige novo preflight.

UUID `crypto.randomUUID()` depois da revalidação, antes dos adds. Nenhuma conversão Money/backfill/source/createdAt/reordenação de catálogos. V3 com snapshot ou schema divergente aborta antes de promoção. In-flight v3 drena antes do upgrade; R alterada invalida safety e retry conserva o write confirmado.

# 8. Copy/verify/authority

Todos adds precisam ter success antes do verify. Cursor verifica cada chave composta, scope e record raw completo por ID; count/settings também comparados. Validação financeira/referências estrutural, sem saldo/totais obrigatórios. Só então workspace metadata com R original e authority mínima. Falha em qualquer request/callback/metadata aborta tudo.

Request chaining em callbacks IndexedDB, sem await externo/timer/rede no upgrade. Exceções capturadas abortam explicitamente; exceção não capturada em evento de request também ensaiada. Após commit: close/open(4) e readonly válida antes de publicar. R inferior ao archive é erro; R igual exige igualdade inicial; R superior conserva edição concorrente scoped sem recópia. Todos esses casos têm ensaio próprio.

# 9. Scoped repository

Load/export retornam `{workspaceId,revision,snapshot}` com contexto fora do DTO. GetAll usa índice/range do scope; update/delete usam chave composta. Authority exata, metadata Personal do destino e settings/referências validados. Não há getAll global seguido de filter como proteção financeira.

# 10. Seis writers

Save create usa add, update exige existência; remove exige existência e compound key. Import é atômico, dedup só destino/intralote (B não interfere), sem normalizar IDs. SaveSettings valida referências dos fatos locais e escreve só destino. RemoveDemo seleciona source demo somente no destino. Restore usa cursor limitado ao destino. Dados+CAS pertencem à mesma RW; no-op consome R conforme A2b, erro não consome.

Cada writer ensaiado em A com B contendo mesmos IDs/R/settings similares: sucesso e quota/abort preservam B e archive integralmente. Create existente/update/remove ausentes, referência apenas em B e settings incompatíveis rejeitados sem consumir R.

# 11. CAS/lease

Precondition workspaceId/expectedRevision e lease por referência B2a. Guard antes da RW e novamente depois da fila, antes da primeira mutação. R lida e incrementada na mesma RW. A/B com números iguais permanecem independentes; dois comandos concorrentes no mesmo R têm um commit/um conflito. Disposal na espera da RW e lease A1 usada em repository A2 rejeitados. Leituras tardias de sessão disposed são descartadas pelo repository.

R=MAX migra e permite leitura/export; todos seis writers falham antes de mutar/incrementar/resetar, inclusive no-op/restore. Não tratado como corrupção.

# 12. Restore scoped

Engine exige lease, precondition e safety do mesmo destino fixo. Snapshot financeiro clonado/validado. Exclusão por cursor byWorkspace/only(id), sem clear global. Substituição de facts/settings e incremento R atômicos. Verificação pós-commit pelo mesmo handle; falha vira RestoreError verify, sem escrita compensatória. A preserva B em sucesso/falha; safety B rejeitada em A mesmo com fatos/R iguais.

Ensaio de release: download safety v2 observado, arquivo salvo/re-lido pelo harness, restauração raw equivalente em contexto isolado com Personal fresh; origem intacta. Isso não comprova guarda física de backup em cada dispositivo. Consentimento/download/UX de produção pertencem a B2c.

# 13. Archive legacy

Raw facts e todas settings keys/values preservadas em migrated; unknown keys não viram scoped settings. API diagnóstica readonly fornece count/R/raw. Nenhum writer financeiro scoped altera archive. Após primeira edição ele fica stale: não é fallback nem recovery automático. Comparação raw distingue ausência/undefined, -0, extras e conteúdo de Maps/Sets/bytes/ciclos de keys diagnósticas. Sem limpeza/expiração nesta fase.

# 14. Fence v3

Commit v4 recusa open explícito 3 com VersionError. Conexões antigas fecham no versionchange e não iniciam novas RW; in-flight prévio termina antes da exclusividade. Conexão que ignora versionchange bloqueia sem fechamento forçado. BroadcastChannel não participa da integridade.

# 15. Old-writer real

Archive completo de **0157797478ac27c8339444b604caaefd9e22dc95** extraído em temporário fora dos worktrees. `npm ci` com lock histórico, harness daquele source e build completo App/PWA. Script versionado `tests/helpers/buildHistoricalB2b.mjs` reproduziu o artefato independentemente, com checksums iguais.

| Evidência              | SHA-256                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| package-lock histórico | `d0663f8d22bcef8309c68aa58c65b87605df4bd462565c847047965758ba5724` |
| bundle histórico       | `ceef9efe11f1fb4a0a90791a5ef16d8f55db032caace996b8c44236834896d79` |

Diretório usado na regressão: `C:\Users\patai\AppData\Local\Temp\vertice-b2b-historical-Co8yuB`. Harness verifica commit/checksum/lock antes de usar. Old/new em páginas distintas da MESMA origin/BrowserContext/storage partition. Load/save/remove/import/settings/removeDemo/restore após v4: falham com VersionError na cadeia de causas, sem alterar scoped/archive/R; reload também fenced. BC desligado. Assets/App/SW históricos reais servidos por HTTP local: reload offline mostra recovery e writer antigo não grava.

Reprodução: `node.exe tests/helpers/buildHistoricalB2b.mjs`; definir `B2B_OLD_ARTIFACT` como diretório temporário impresso; executar E2E. Dependências históricas não são copiadas de outro worktree. Ausência/artefato inválido bloqueiam os testes, sem skip. Controle negativo altera somente bundle em memória para remover versão explícita: detecta write indevido no archive. Isso prova sensibilidade e o limite: scripts arbitrários da origin não são fenced pelo protocolo.

# 16. blocked/cancel/late request

Attempt identity própria, cancelled irrevogável; onblocked rejeita uma vez e abandona, mantendo listeners. Late upgrade aborta antes de UUID/schema; late success fecha result sem publicar. Callbacks antigos não invalidam retry novo. Ensaio blocked→5 s→fechamento preserva v3 integral; retry novo funciona. Cancel durante copy aborta antes de verify/authority; cancel antes de success em v4 não cacheia handle. Duas migrations elegíveis chegam ao mesmo UUID/default sem segundo Personal.

# 17. crash matrix

Faults test-only por interceptação de APIs no harness; nenhuma flag/failpoint no código de produção. Antes de create; primeiro/meio/último add; último request nativo ConstraintError; exceção uncaught em success; copy→verify; verify adulterado; primeira metadata e authority; QuotaExceededError injetado; commit→reopen; primeira readonly. Antes de commit, restart preserva v3 integral. Depois, v4 raw/R/authority coerentes.

Crash real: teardown do contexto Edge durante copy com requests versionchange ativos, e depois do commit; relaunch no MESMO perfil temporário persistente com 10.000 fatos. Primeiro retorna v3 integral, segundo v4 equivalente; não são contextos vazios diferentes. Perfis temporários conservados como evidência. Não simula corte de energia/SIGKILL/falha física de disco.

# 18. recovery

V4 com missing store, keyPath/índice errado, authority inválida, workspace/settings ausentes, R retrocedida ou raw divergente no R inicial falha fechado, mesmo com archive válido. Não fabrica defaults, reabre legacy writer, recopia, restaura privilegiadamente ou baixa versão. Diagnóstico readonly explícito disponível. Versão futura >4 rejeitada; probe não vira writer. Sem UI de recovery nesta fase.

# 19. performance 1k/10k/90k

Fixtures sintéticas 1.000, 10.000 e 90.072, raw extras/subcentavo/ausência de source/createdAt; 90k tem soma em overflow, mas snapshot/export válidos. Igualdade completa com safety/archive e R=17, sem cálculo de total obrigatório. Todos completaram sem OOM/timeout/TransactionInactiveError/commit parcial.

| Fatos | Preflight/safety ms | Copy ms | Verify ms | Commit ms | Reopen ms | Primeira leitura ms | Open total ms | Storage antes→depois bytes | Maior amostra V8 heap bytes | Gap máximo ms |
| ----- | ------------------- | ------- | --------- | --------- | --------- | ------------------- | ------------- | -------------------------- | --------------------------- | ------------- |
| 1000  | 40.6                | 61.3    | 30.6      | 0.3       | 0.3       | 15.2                | 161.5         | 352256→1011712             | 6481264                     | 78.9          |
| 10000 | 205.2               | 644.9   | 290.0     | 0.8       | 0.6       | 119.5               | 1435.9        | 2867200→9543680            | 58159756                    | 290.0         |
| 90072 | 1734.7              | 5245.4  | 2346.4    | 2.0       | 0.2       | 1039.0              | 12091.5       | 26411008→87175168          | 275640796                   | 2460.3        |

Edge `154.0.4258.53`, Windows `10.0.26200`, Intel i7-13620H, 16 CPUs lógicas, 33.960.644.608 bytes RAM física. Medidas de V8 heap amostradas via CDP (100 ms), não RSS/pico físico garantido. StorageManager é estimativa; conta cópias/journal/overhead, não promessa de espaço livre. Timers de 50 ms medem gaps de main thread; há pausas mensuráveis. Sem orçamento numérico inventado: orçamento/dispositivos-alvo precisam ser aprovados antes da ativação B2c.

# 20. regressões

| Validação                               | Resultado final                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Unitários                               | PASS 659/659, 18 arquivos; 63 novos B2b                                       |
| Build                                   | PASS tsc -b/Vite/PWA                                                          |
| E2E completos                           | PASS 318/318, Edge headless, 2 workers, 3,0 min; 245 anteriores + 73 B2b      |
| Dirigidos B2b                           | PASS 73/73 na suíte dirigida final; old-writer/SW/crash/performance incluídos |
| Prettier somente 14 arquivos da entrega | PASS                                                                          |
| git diff --check / cached check         | PASS                                                                          |

Primeira regressão integrada 313/313 PASS. Controles finais adicionais exigiram nova regressão, não relaxamento dos testes antigos. A1/A2a/A2b/A2c/B1/B2a PASS no caminho normal v3. Nenhum skip novo. Novos harnesses tiveram falhas iniciais de namespace de anchor em SVG/baseURL e seletor de heading (pontuação), corrigidas sem alterar testes anteriores/source histórico. SW antigo passou servido por HTTP real.

Lint/typecheck dedicados **não existem** em package.json. TypeScript incluído no build. Mantidos avisos preexistentes de chunk ExcelJS >500 kB, NO_COLOR/FORCE_COLOR e deprecações das dependências do lock histórico; sem upgrade de pacote.

# 21. limitações

Quota física não foi esgotada/controlada deterministicamente; fault de QuotaExceededError e erro nativo de request/abort provaram rollback, sem claim de quota real. Crash de contexto não prova sobrevivência a falha de disco/energia/eviction. Só Edge desktop nesta certificação; Safari/mobile físicos não ensaiados. Retenção duplicada e heap/gaps relevantes em 90k exigem orçamento antes de B2c. Ensaio de backup de release não comprova armazenamento pessoal. Inventário de clientes efetivamente publicados ainda é gate da ativação; não alegar proteção contra qualquer script da origin.

# 22. C01

**ENGINE/FENCE PROVADO** para engine implementada e cliente B1 real do checkpoint 0157797, mesma origin/partition, paths completos, BC ausente/SW antigo, igualdade/atomicidade/CAS/isolamento, cancel/blocked/retry, falhas/crash e fixtures grandes. Controles negativos demonstram sensibilidade ao range/fence removidos somente em harness isolado.

C01 arquitetural global **não declarado totalmente resolvido**: integração real/consentimento/dirty/invalidation/recovery, orçamento de dispositivos e inventário de assets publicados permanecem B2c. B2c não autorizado nem iniciado.

# 23. arquivos

Somente 14 arquivos selecionados:

- `src/services/transactionRepository.ts` — só fechamento explícito do estágio v3.
- `src/services/scopedStorage.ts`
- `src/services/scopedStorageProtocol.ts`
- `src/services/scopedTransactionRepository.ts`
- `src/services/scopedStorageProtocol.test.ts`
- `src/services/scopedTransactionRepository.test.ts`
- `tests/b2b-scoped.spec.ts`
- `tests/b2b-faults.spec.ts`
- `tests/b2b-old-writer.spec.ts`
- `tests/b2b-performance-crash.spec.ts`
- `tests/helpers/scopedData.ts`
- `tests/helpers/scopedHarness.ts`
- `tests/helpers/buildHistoricalB2b.mjs`
- `IMPLEMENTACAO-B2B.md`

App/hook/componentes, DTOs/backup/calculadores, scripts/lock/config, tests anteriores, plano/roadmap, principal/B1 intactos. PNGs regenerados pela regressão repostos somente aos bytes do HEAD, sem alteração visual entregue. Artefatos ignored/temp não entram no commit. Sem migrations SQL/banco remoto/reset/exclusão de dados.

# 24. decisão B2b

**B2b CONCLUÍDO. ENGINE/FENCE PROVADO no escopo acima. Nenhum bloqueador B2b.** Limitações documentadas não autorizam ativação; C01 global e gates de integração/release ficam para B2c.

Commit único autorizado: `feat: adiciona engine scoped e migration B2b`, staging seletivo dos 14 arquivos, inspeção integral do diff/cached checks antes de commit. Pós: staging vazio e worktree B2 limpo. Parar depois do commit; não implementar B2c, promover base pessoal ou fazer merge.
