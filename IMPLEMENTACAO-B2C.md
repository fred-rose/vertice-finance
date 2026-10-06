# 1. Checkpoint

Entrega B2c em 06/10/2026, somente no worktree Dashboard-Financeiro-B2, branch plan/b2-workspace-local. Base fdf97a78c833de622a9828e6789120bb6cd647e7; B2a/B2b presentes. Antes da implementação, root/branch/HEAD, árvore limpa e staging vazio foram conferidos. A retomada encontrou os mesmos HEAD/branch e alterações B2c desta sessão ainda sem commit; elas foram preservadas. Principal, B1, controle-gado, banco pessoal e serviços externos não foram operados.

PLANO-B2, IMPLEMENTACAO-B2A/B2B e código/testes foram confrontados. B2c consome a engine B2b, sem segunda migration ou segundo banco.

# 2. Baseline

Baseline real antes das edições B2c, executada na sessão anterior: npm.cmd test **659/659 PASS** (18 arquivos), npm.cmd run build **PASS**, npm.cmd run test:e2e **318/318 PASS**, Edge desktop com dois workers. A retomada não resetou a árvore para refazer essa baseline.

Validação final: unit **673/673 PASS** (19 arquivos); build **PASS**, incluindo tsc -b, Vite e PWA; E2E **359/359 PASS**, zero skips, flaky ou falhas inesperadas. Duração final E2E: 597,0 s.

# 3. Bootstrap/authority

storageBootstrap classifica fresh, legacy v1/v2/v3, scoped v4, versão futura e recovery. Publica loading, migration-required, migrating, ready e recovery. Authority e snapshot são validados antes da primeira montagem financeira. Geração de tentativa descarta resultados tardios; handle anterior é revogado em recovery/dispose/versionchange.

v4 existente usa open existente e leitura validada; não passa por preflight legacy. Retry de leitura v4 pode ocorrer com draft retido, mas não reativa a lease desse draft. Flags busy cobrem também o preflight v1/v2 que usa o migrador A2.

# 4. Fresh v4

App abre diretamente v4, cinco stores uniformes, archive vazio, Personal implícito, UUID estável, R=0, defaults válidos e authority sourceVersion=0. Teste observa chamadas nativas e verifica ausência de estágio v3. Cadastro/reload/export/restore/CAS preservados.

# 5. Legacy migration UX

App v1/v2 usa exatamente o engine B2b: open(3), commit, close, preflight/safety v2, consentimento e open(4). v3 usa a mesma promoção. A App não mostra fatos legacy antes da validação v4.

Download observado, confirmação explícita e guard dirty/busy são obrigatórios. Blob/URL/click falhando, safety stale, cancelamento e blocked não autorizam promoção. Novo retry exige nova safety. UI reutiliza classes existentes, avisa sobre demora e mostra operação ativa sem saldos parciais.

# 6. Workspace context

Contexto pequeno: workspaceId, mode personal e repository preso ao handle. Um Personal implícito no produto. A/B existem somente em harness sintético; nenhum selector, CRUD de workspace, login ou campo de workspace na UI.

# 7. Repository integration

workspaceRepository é uma fachada que adapta assinaturas UI existentes ao scoped repository já implementado. Captura id/handle/lease uma vez e converte revision em precondition explícita. Os seis writers continuam no scoped repository B2b, com lease revalidada dentro da RW e CAS por workspace.

Nenhum fallback writer legacy na App/hook/fachada. O repository v3 permanece necessário somente ao estágio A2 de migration e aos testes históricos isolados. O harness de regressão UI resolve versões explicitamente apenas nos testes, não no produto.

# 8. Sessions/lease

Editor, settings, import e restore capturam repository/handle/lease; drafts mantêm sua revision e callbacks originais. Respostas pertencem a repository + sequence + handle ativo. A1→B→A2 com mesma revision não revalida callback, resultado ou lease antigos.

Testes reais do hook com React no browser cobrem A→B→A, resposta de focus tardia, BC de outro scope e restore A preservando B. Não há seleção por variável global de destino ao terminar callback.

# 9. Dirty/invalidation

Drafts retidos tornam-se readonly em restore, recovery, dispose e versionchange. Retry da base pode recapturar o contexto da App, mas a edição antiga continua invalidada; usuário descarta/reabre explicitamente. Guard dirty/busy antes de preflight/promotion exercitado também em browser com workRegistry real.

Evidência concreta exigiu um recibo operacional de restore: sem BC, revision sozinha não distingue restore de uma edição comum. A chave [restore, workspaceId] em workspaceMeta guarda a revision do último restore, atomicamente na mesma RW da substituição e do CAS. Não muda authority mínima, objeto de workspace metadata, DB version, stores, DTO financeiro, lease ou JSON v2. Ausência é válida para bases B2b existentes e não provoca escrita de defaults. Recibo inválido falha fechado. Focus detecta novo recibo e revoga o contexto anterior; CAS continua protegendo comandos antes da releitura.

# 10. Import

ImportModal conserva parser/preview/validação/dedup. Callback usa scoped repository original. CSV, XLSX/ExcelJS reais, correção manual, duplicatas e provenance B1 passam. Leitura arrayBuffer mantida pendente enquanto versionchange invalida a sessão: arquivo/draft são preservados para consulta, callback tardio não importa.

# 11. Restore

UX A1 usa safety do destino capturado, JSON v2 validado, confirmação destrutiva, CAS e lease. Restore A não toca B nem archive legacy. Sucesso invalida sessões A; falha pós-commit informa recuperação manual, sem compensação ou segunda RW. Recibo de restore, substituição e incremento de R ficam na mesma transação.

A integração revelou causa RestoreError changed encapsulada pelo protocolo; ela é preservada ao invés de ser classificada como erro genérico de escrita. Edição/importação scoped também preservam ausência real de source/createdAt, conforme contrato B1.

# 12. Backup v2

Export JSON relê somente repository/handle capturado, revalida lease após await e usa o serializador v2 original. Export não inclui workspaceId, revision, authority, restoreRevision ou lease. JSON v2 não prova identidade de origem. Falha de download mostra erro seguro e não escreve. R MAX permite exportar.

# 13. Broadcast/focus

BC usa workspaceId e tipo; mensagens B não afetam A. Mudança financeira pede refresh; restore matching invalida contexto. BC é advisory: com ele ausente, CAS/storage mantêm integridade e focus descobre o recibo de restore. Releitura engloba authority, metadata, revision, snapshot e recibo na mesma RO. Resultado tardio de handle antigo é descartado.

# 14. PWA/versionchange

Registry A2c bloqueia update durante dirty/busy/preflight/promotion. Novo teste usa SW waiting real de uma segunda build, migration mantida ativa e controllerchange: sem reload destrutivo, nenhum update ganha consentimento pela conclusão da migration. Versionchange nativo fecha conexão e revoga contexto. Suite PWA histórica preservada.

# 15. Recovery

Erros distintos: layout/authority/workspace/settings inválidos, versão futura, blocked/cancel, stale safety e escrita esgotada. MoneyError derivado permanece nos calculadores B1, sem declarar corrupção estrutural.

v4 inválido não usa archive na dashboard, não faz recopy, downgrade, repair ou defaults. Recovery oferece orientação e somente conferência do arquivo JSON sem destino validado; safety/restore ficam indisponíveis. Recuperação efetiva pode ser ensaiada em outro perfil limpo, preservando a origem.

# 16. Revision MAX

Dashboard e export permanecem funcionais. Add/edit/delete/import/settings/removeDemo/restore bloqueados na UI e os seis writers rejeitam na engine. Mensagem de limite de revisão, sem recovery estrutural, reset ou consumo adicional de R.

# 17. Old-client real

Cliente B1 real 0157797478ac27c8339444b604caaefd9e22dc95 contra App B2c real: load e os seis writers rejeitam VersionError após promoção; aba antiga/reload/BC ausente mantêm fence e igualdade raw.

App/assets/SW históricos servidos na mesma origin do novo cliente; cache/offline reload antigo também fenced. Artefato de B2b reutilizado, sem alterar source histórico; helper exige commit e SHA256 corretos:

- lockfile: d0663f8d22bcef8309c68aa58c65b87605df4bd462565c847047965758ba5724
- bundle: ceef9efe11f1fb4a0a90791a5ef16d8f55db032caace996b8c44236834896d79

# 18. Multi-tab

Duas Apps fresh partilham Personal/UUID e comunicam alterações. Duas Apps legacy convergem para a mesma authority comprometida; a outra retoma mediante reload/retry explícito. CAS e drafts stale preservados, inclusive com BC ausente. Abas antigas não são fechadas à força.

Crash/invalidation: App fechada durante cópia retorna à mesma origin com v3 intacto; fechada após commit retoma v4 validado. Matriz B2b de fault/crash e reinício do mesmo perfil persistente também passa.

# 19. Performance

Três repetições por tamanho, perfis sintéticos independentes, corte civil fixo em 15/09/2026 e amount=123.45000001 para medir o resumo financeiro válido, com ausência de provenance e extras raw. A fixture B2b é distinta e também ensaia overflow; a comparação de tempos é por escala e pipeline, não uma porcentagem controlada entre datasets iguais. App completa: preflight, migration UI, download real, confirmação, promoção, validação e render financeiro. Edge 154.0.4258.53; Windows 10.0.26200; 13th Gen Intel(R) Core(TM) i7-13620H; 16 CPUs lógicas; 34,0 GB RAM.

Medianas, salvo heap/gap que mostram o máximo observado entre repetições:

| Fatos | Startup até migration | Migration screen até render | Promoção até ready DOM | Ready DOM até render financeiro | Promoção até render observado | Open(4) até commit nativo | Após commit até render | Heap máximo amostrado | Maior gap |
| ----- | --------------------- | --------------------------- | ---------------------- | ------------------------------- | ----------------------------- | ------------------------- | ---------------------- | --------------------- | --------- |
| 1000  | 160,0 ms              | 494,0 ms                    | 260,0 ms               | 46,0 ms                         | 339,0 ms                      | 115,0 ms                  | 165,0 ms               | 12,3 MB               | 88,0 ms   |
| 10000 | 412,0 ms              | 1897,0 ms                   | 1579,0 ms              | 212,0 ms                        | 1823,0 ms                     | 1052,0 ms                 | 774,0 ms               | 48,6 MB               | 327,0 ms  |
| 90072 | 2180,0 ms             | 16146,0 ms                  | 13777,0 ms             | 2141,0 ms                       | 15978,0 ms                    | 9403,0 ms                 | 6642,0 ms              | 245,0 MB              | 2419,0 ms |

Todas as repetições; tempos em ms, heap em MB decimais:

| Fatos / repetição | Startup | Screen → render | Promoção → ready DOM | Ready → render financeiro | Promoção → render | Commit nativo | Após commit → render | Heap amostrado | Gap    |
| ----------------- | ------- | --------------- | -------------------- | ------------------------- | ----------------- | ------------- | -------------------- | -------------- | ------ |
| 1000 / 1          | 153,0   | 492,0           | 260,0                | 46,0                      | 339,0             | 115,0         | 165,0                | 11,9 MB        | 78,0   |
| 1000 / 2          | 177,0   | 538,0           | 263,0                | 46,0                      | 341,0             | 121,0         | 165,0                | 12,3 MB        | 81,0   |
| 1000 / 3          | 160,0   | 494,0           | 254,0                | 44,0                      | 329,0             | 115,0         | 159,0                | 8,9 MB         | 88,0   |
| 10000 / 1         | 413,0   | 1837,0          | 1535,0               | 208,0                     | 1776,0            | 968,0         | 788,0                | 48,6 MB        | 247,0  |
| 10000 / 2         | 412,0   | 1947,0          | 1607,0               | 221,0                     | 1870,0            | 1073,0        | 774,0                | 39,7 MB        | 327,0  |
| 10000 / 3         | 291,0   | 1897,0          | 1579,0               | 212,0                     | 1823,0            | 1052,0        | 751,0                | 38,9 MB        | 303,0  |
| 90072 / 1         | 2162,0  | 16441,0         | 14109,0              | 2113,0                    | 16263,0           | 9403,0        | 6833,0               | 243,9 MB       | 2400,0 |
| 90072 / 2         | 2180,0  | 16146,0         | 13777,0              | 2167,0                    | 15978,0           | 9300,0        | 6642,0               | 245,0 MB       | 2248,0 |
| 90072 / 3         | 2258,0  | 16066,0         | 13710,0              | 2141,0                    | 15887,0           | 9438,0        | 6423,0               | 193,4 MB       | 2419,0 |

Ready é observado pela primeira montagem da shell financeira (.page-heading), permitida somente após contexto validado; primeiro render financeiro é observado por MutationObserver. Render observado final inclui scheduling/asserts Playwright. Open(4)→commit nativo é um subtrecho, não o tempo integral de engine.open; após commit inclui reabertura/verificações/leitura de bootstrap/leitura do hook/cálculos/render. Screen→render inclui a interação automatizada de download/consentimento. Heap é amostra V8/CDP, não RSS, e inclui a leitura raw de conferência pelo harness após ready; não isola o consumo exclusivo da App. Os tempos de render e o gap são capturados antes dessa conferência raw. Gap é intervalo observado do timer de 50 ms, não promessa de interatividade.

B2b histórico open total: 161,5 / 1.435,9 / 12.091,5 ms. Engine isolada repetida nesta regressão: 1000: 155,9 ms; 10000: 1329,9 ms; 90072: 13243,5 ms. O aumento da integração é explicado pelas leituras de validação/publicação e render adicionais. Algoritmo de cópia/verificação B2b não foi redesenhado. Igualdade raw integral preservada em todos os tamanhos; na rodada final não houve OOM, número parcial ou timeout.

**ACEITÁVEL PARA WEB DESKTOP ATUAL**, como atualização local explícita e excepcional, com tela busy e safety. O cenário 90k continua caro, com heap/gaps relevantes; não é fluxo instantâneo nem promessa para equipamentos modestos.

# 20. Regressions

A1, A2a, A2b, A2c, B1, B2a e B2b: PASS na regressão final. Expectativas financeiras não foram relaxadas. Casos que assumiam App v3 receberam fixture explícito de consentimento e bridge test-only para scope v4; testes de protocolo/repository legacy mantêm v3 real.

Rodadas intermediárias não foram consideradas gates finais: 335/340 e 96/101 encontraram integração/harness parcial; dirigido de seis casos corrigidos passou 6/6. A rodada 357/359 apontou contagem de put ao invés de RW e click numa safety já desabilitada em recovery. Instrumentação passou a contar uma RW e exigir R=1/recibo=1; recovery prova safety desabilitada, orientação, zero writes e origem intacta. Outra rodada intermediária chegou a 355/359: a observação de render expôs o corte civil variável do benchmark (dados de setembro, relógio em outubro) e um timeout simultâneo de stale safety; houve também timeout no benchmark de 90k. Corrigiu-se somente a fixture/mensuração, e stale safety + performance 1k passaram isoladamente 2/2. A regressão final inteira foi repetida com um worker para reduzir interferência entre arquivos. Casos CAS/multi-tab continuam concorrentes internamente. Uma rodada subsequente terminou 353/359 após 7,5 horas de tempo de parede, com interrupções extensas, timeouts em etapas distintas e net::ERR_NETWORK_IO_SUSPENDED no navegador. Ela foi registrada como falha, não aceita como gate. A rodada final foi repetida integralmente com proteção temporária contra suspensão automática do Windows (SetThreadExecutionState somente enquanto o processo de teste existia), sem mudar código de produto ou critérios financeiros. Essa repetição terminou 358/359: todos os casos B2c/performance/old-client passaram, mas a asserção UI de edição no cenário B1b de ~90k fatos aguardou somente 5 s enquanto o modal seguia em Salvando. A espera dessa única asserção passou a usar 120 s, limitada pelo mesmo timeout total de 120 s que o teste já declarava. Nenhum limite global foi aumentado; igualdade financeira/raw, revision/CAS, backup e ausência de erros continuam exigidos. O cenário corrigido passou dirigido 1/1 antes da nova rodada completa. Sem novos skips.

Comandos finais: npm.cmd test; npm.cmd run build; npm.cmd run test:e2e -- --workers=1 --reporter=line,json. PLAYWRIGHT_PORT=5193; B2B_OLD_ARTIFACT aponta ao artefato temporário verificado. Resultado completo local em test-results/b2c-final.json (ignorado). B2c dirigido incluído na suíte: 40/40, mais smoke migration/PWA real; old-client B2c 2/2; performance 3/3 com nove repetições.

Não existem scripts separados lint ou typecheck. Build executa tsc -b. Prettier --check apenas arquivos alterados e git diff --check são gates antes do commit. Avisos não bloqueantes existentes: chunk ExcelJS >500 kB e FORCE_COLOR/NO_COLOR.

# 21. C01

**MITIGADO globalmente.** Engine/fence e App integrada provados para cliente real 0157797, old SW/assets, BC off, lease/CAS, seis writers, import/restore, dirty/blocked/cancel e recovery, sem segunda authority.

Não certificamos um inventário externo de todos os clientes/assets já publicados. O fechamento integrado B2 ainda é uma etapa separada. Não declarar compatibilidade universal de release a partir de um único checkpoint histórico.

# 22. Release limitations

Certificação desta fase: Edge desktop sintético no ambiente registrado. Não certifica Safari/mobile, computador fraco, perda elétrica/queda do SO, dados pessoais nem clientes históricos fora do artefato verificado. Crash browser/perfil ensaiado não é prova de toda falha física.

Após promoção v4, cliente v3 histórico é deliberadamente bloqueado. Não oferecer downgrade/reset/fallback. Guardar safety antes de atualizar dados existentes. Recovery comprometido requer procedimento preservador em perfil isolado, sem writer privilegiado sobre uma base inválida.

# 23. Files

Arquivos desta entrega:

- IMPLEMENTACAO-B2C.md
- src/App.tsx
- src/components/dashboard/OverviewPage.tsx
- src/components/settings/RestoreBackupDialog.tsx
- src/components/settings/SettingsPage.tsx
- src/components/settings/StorageStartup.tsx
- src/components/transactions/TransactionTable.tsx
- src/components/transactions/TransactionsPage.tsx
- src/hooks/useTransactions.ts
- src/services/scopedStorage.ts
- src/services/scopedTransactionRepository.ts
- src/services/storageBootstrap.test.ts
- src/services/storageBootstrap.ts
- src/services/workspaceRepository.ts
- tests/a2b-conflict-ui.spec.ts
- tests/a2c-unsaved.spec.ts
- tests/b1b-money-ui.spec.ts
- tests/b1c-civil-origin.spec.ts
- tests/b2b-scoped.spec.ts
- tests/b2c-app.spec.ts
- tests/b2c-old-client.spec.ts
- tests/b2c-performance.spec.ts
- tests/b2c-sessions.spec.ts
- tests/dashboard.spec.ts
- tests/helpers/appTest.ts
- tests/helpers/b2cData.ts
- tests/helpers/b2cExports.ts
- tests/helpers/b2cHarness.ts
- tests/helpers/localData.ts
- tests/helpers/sessionHarness.tsx
- tests/helpers/uiRepositoryHarness.ts
- tests/local-read.spec.ts
- tests/pwa.spec.ts
- tests/recovery.spec.ts
- tests/restore-download-adversarial.spec.ts
- tests/restore.spec.ts

PNGs gerados automaticamente pela regressão foram repostos exclusivamente aos bytes HEAD e não fazem parte do commit. Sem mudanças em package.json/lock, tipos B2a, schema de stores, backup format, calculadores B1, estilos, principal ou B1.

# 24. Decision

**B2c CONCLUÍDO**, com todos os gates finais verdes; Personal scoped v4 ativo, migration explícita, sessões protegidas, recovery mínimo e JSON v2 preservado. Classificação de performance limitada a web desktop atual; C01 global permanece MITIGADO pelos limites de inventário publicados.

Commit autorizado: feat: ativa workspace local scoped B2c. Staging seletivo de somente os arquivos acima. Nenhum início de P1/cloud/auth/Supabase/Business/Investments/IA, merge ou avanço para fechamento integrado B2. Próxima etapa é separada e não será executada neste trabalho.
