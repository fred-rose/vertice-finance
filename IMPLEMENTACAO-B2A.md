# Implementação B2a — contratos de workspace

Entrega em 05/10/2026, exclusivamente em `Dashboard-Financeiro-B2`, branch `plan/b2-workspace-local`, base `5fcf837bfdded17b1015d3eecdd75446b679852e`. Worktree inicialmente limpo, plano versionado com seção 31 e aprovação documental confirmados. Escopo: contratos puros, tipos, chaves/envelopes e preconditions de scope/sessão. B2b/B2c/P1 não iniciados.

## Baseline real

Dependências ausentes: executado `npm.cmd ci --no-audit --no-fund` somente neste worktree, usando lockfile existente. Manifestos não alterados.

| Comando                | Resultado antes de código                      |
| ---------------------- | ---------------------------------------------- |
| `npm.cmd test`         | PASS — 487/487, 15 arquivos                    |
| `npm.cmd run build`    | PASS — TypeScript, Vite e PWA                  |
| `npm.cmd run test:e2e` | PASS final — 245/245, Edge headless, 2 workers |

A primeira E2E terminou 244/245: `Settings draft antigo com broadcast` encontrou dois elementos `role=status`, incluindo erro de preparação offline. O build PWA ainda finalizava quando esse preview iniciou; não houve alteração de código. Caso dirigido passou 1/1 e repetição completa com build concluído passou 245/245 antes de iniciar B2a. Não alterados testes/seletores existentes para contornar a falha.

## Contratos adicionados

Tipos e constantes em [src/types/workspace.ts](src/types/workspace.ts); implementações puras em [src/utils/workspace.ts](src/utils/workspace.ts).

| Contrato               | Implementação/decisão                                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WorkspaceId            | String branded; construtor runtime exige UUID v4 canônico em minúsculas, variantes 8/9/a/b. Uppercase, espaços, versões diferentes e nil rejeitados, sem normalização silenciosa nem geração automática                 |
| Mode                   | Apenas `personal`, validado runtime; imutável em metadata/handle. Business/Investments não habilitados                                                                                                                  |
| Authority              | Exatamente layout scoped, protocol 1, defaultWorkspaceId e sourceVersion 0 ou 3. Missing/extra/inherited fields rejeitados; retorno frozen. Existência do workspace/stores será verificada pelo storage B2b             |
| Workspace metadata     | Exatamente workspaceId/mode/revision; revisão inteira segura >=0, incluindo MAX; sem ownerKind/protocol/layout duplicados                                                                                               |
| Scoped envelopes       | `{workspaceId,record}` com scope externo validado e wrapper frozen. Record original por referência, sem spread, conversão, backfill, clone ou freeze do DTO; extras workspaceId/mode e subcentavo preservados           |
| Compound keys          | Arrays `[workspaceId,transactionId]`, parser runtime e chave `['workspace',workspaceId]`. IDs financeiros seguem contrato string não branca B1; espaços de IDs válidos, zeros e Unicode preservados                     |
| Scope                  | `assertSameWorkspace` exige UUIDs válidos e igualdade; IDs financeiros locais não recebem novos brands/normalização                                                                                                     |
| Financial precondition | Objeto frozen com workspaceId/expectedRevision; dois campos obrigatórios, sem revisão implícita nem lease persistida                                                                                                    |
| Lease/capability       | Objeto opaco frozen por identidade, criado uma única vez por handle; marca nominal inacessível ao consumidor. JSON.stringify e structuredClone rejeitam uso acidental; spread/objeto equivalente não passa o guard      |
| Handle                 | Objeto frozen sem DB/snapshot/writer: workspaceId/mode/lease, active getter, canUse, assertSession, assertCommand e dispose. Estado de revogação fica na closure; dispose definitivo/idempotente, sem reactivate/remint |
| Revision MAX           | Estado de leitura válido; canIncrementRevision retorna false, sem incrementar/resetar. Bloqueio transacional dos writers futuros pertence a B2b                                                                         |
| Schema futuro          | Constantes dormentes v4, cinco stores, keyPaths aprovados, índice byWorkspace e authority key. Sem import no caminho de produção atual                                                                                  |

`assertCommand` separa identidade da sessão e precondition financeira, rejeitando lease de outro handle e scope diferente. Não compara com revisão persistida nem simula CAS: B2b precisa comparar a revisão e chamar o guard na transação antes da mutação; B2c deve conservar handle/lease originais nos callbacks. `canUse` permite ao consumidor descartar resposta tardia. A→B→A com mesma revisão não revalida lease antiga. Guard não concede autenticação/autorização contra scripts da origin.

Envelopes não duplicam validação financeira B1. Record permanece raw/mutável como DTO existente; o consumidor de storage continua responsável por capturar/validar seu snapshot financeiro. Chaves são tuples novas compatíveis com o futuro uso em IndexedDB, sem range/query/cursor implementado agora.

## Testes B2a

[src/utils/workspace.test.ts](src/utils/workspace.test.ts): **109/109**. UUID/case/invalid values, mode, authority fresh/migrated, metadata válida/inválida/MAX, raw extras/subcentavo, keys determinísticas/isoladas/IDs lossless, referências locais, preconditions ausentes/erradas, lease por identidade, clone/JSON/spread, dois handles ativos iguais, dispose duplo, método capturado, A→B→A e callback tardio sem publicação. Seis asserts `@ts-expect-error` compilados por `tsc -b` provam brands/keys/precondition/capability e mode readonly; a função dessas provas nunca é executada.

Uma execução inicial de build encontrou a posição de `@ts-expect-error` do campo workspaceId após Prettier dividir o objeto em linhas. A diretiva foi movida para o campo que causa o erro; build final passou sem suprimir o erro de tipo ou relaxar contrato.

## Validação pós-implementação

| Comando                                                                   | Resultado                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------ |
| `node.exe node_modules/vitest/vitest.mjs run src/utils/workspace.test.ts` | PASS — 109/109                                         |
| `npm.cmd test`                                                            | PASS — 596/596, 16 arquivos (487 anteriores + 109 B2a) |
| `npm.cmd run build`                                                       | PASS — tsc -b, Vite e PWA                              |
| `npm.cmd run test:e2e`                                                    | PASS — 245/245, Edge headless, sem skips novos         |
| Prettier --check somente quatro arquivos da entrega                       | PASS                                                   |
| `git diff --check` / staged check                                         | PASS                                                   |

Pós: uma tentativa E2E na porta 5192 encerrou durante inicialização do preview, sem executar testes e sem diagnóstico adicional no output. Nova execução completa na porta 5193: PASS — 245/245, Edge headless, sem skips novos. Nenhuma suíte existente/skip/config foi alterado; dois workers conforme configuração versionada. Perfis sintéticos, sem usar base pessoal ou outros worktrees.

Não existem scripts dedicados `lint` ou `typecheck`; build executa TypeScript e cobre as provas de tipo novas. Aviso Vite preexistente de chunk ExcelJS >500 kB e avisos NO_COLOR/FORCE_COLOR mantidos, sem atualização de dependência. Suites não certificam Safari/mobile físicos.

## Invariantes e regressões

**A1 PASS; A2a PASS; A2b PASS; A2c PASS; B1 PASS**, comprovados pelas suítes completas finais. Backup JSON v2, Money, CivilDate, DTOs financeiros, CAS e fluxo financeiro atual preservados.

Repository `LOCAL_DATABASE_VERSION=3` permanece inalterado e é o único caminho de produção. Novos módulos só são consumidos pelos testes de contratos nesta fase; nenhum import em App/hook/repository/PWA. Não há indexedDB.open, store/range real ou migration nos arquivos B2a. Nenhum dado pessoal migrado ou banco externo utilizado.

Precisão sobre a suíte histórica: o teste A2b preexistente `versionchange fecha conexão A2b e próxima leitura preserva VersionError` abre versão 4 em uma base sintética para testar fence. Ele já existia, integra a baseline expressamente pedida e não cria layout scoped B2 nem muda a versão da aplicação. **B2a não abre v4 nem ativa o storage futuro.**

## Arquivos da entrega

Somente quatro arquivos novos, staging seletivo:

- `src/types/workspace.ts`
- `src/utils/workspace.ts`
- `src/utils/workspace.test.ts`
- `IMPLEMENTACAO-B2A.md`

Inalterados: transactionRepository.ts, App.tsx, useTransactions.ts, restore/import, BroadcastChannel, finance.ts, backup.ts, Money/CivilDate, styles, package.json/package-lock, configs, testes anteriores, PLANO-B2 e documentos anteriores. PNGs regenerados pelas suítes foram repostos exatamente aos bytes do HEAD, sem mudança visual na entrega; artefatos ignored de build/testes não são commitados.

## Limites e fechamento

B2a concluído no escopo autorizado. Nenhum bloqueador B2a. C01 arquitetural não foi fechado: migration/fence scoped/crash/quota/storage reais e integração de sessões continuam gates B2b/B2c, conforme plano aprovado. Testes atuais demonstram contratos e preservação do caminho atual, não migration pronta.

Um único commit previsto: `feat: adiciona contratos de workspace B2a`, limitado aos quatro arquivos validados. Principal/B1 intocados; nenhum merge/cherry-pick/deploy. B2b/B2c/P1 não iniciados. Encerrar após conferência do commit, staging vazio e worktree B2 limpo.
