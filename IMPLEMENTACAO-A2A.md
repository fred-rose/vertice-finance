# Escopo

Implementação de A2a em 26/09/2026, seguindo PLANO-A2A.md e A2A-EVIDENCIAS.md. Leitura local segura, comandos sobre estado válido e recuperação acessível. `unknown != zero`. A0/A1 preservado; A2b/A2c fora. Sem staging ou commit.

# Estado anterior

HEAD recebido: `971f195 feat: adiciona restauracao segura do backup v2`; staging vazio. O workspace já continha mudanças PWA/visual/Three, dependências, documentos e capturas. Foram inventariados por SHA-256 os 89 arquivos rastreados ou não ignorados recebidos, com cópia temporária das capturas e dos arquivos mistos App/README para conferência de preservação.

Não foi encontrada implementação parcial A2a nem mutação temporária ativa. O teste antigo de v2 sem `personal` ainda exigia fallback. Os documentos A0/A1 foram consultados pelo estado final das correções R1/R2, sem reabrir os achados históricos já resolvidos.

# Bugs corrigidos

- **F01:** `personal` ausente/nulo deixava load/save/import utilizar configurações fabricadas. A fixture com abertura 5.000 + 2.000 e movimentos +2.000, −500 e transferência 1.000 agora falha na leitura após perder `personal`; não publica saldo 1.500 no lugar de 8.500.
- **F02:** falha de leitura escondia o acesso ao restore. Recovery agora existe em todas as rotas, com retry, diálogo A1 e orientação de preservação da origem.
- **F03:** load aceitava violações do contrato persistido. Passa a usar `validateBackupSnapshot`, rejeitando ID numérico, source/createdAt inválidos, categoria de transferência incompatível, destino em income, meta duplicada e metadata Infinity.
- **F04:** falhas nativas da leitura, inclusive store ausente, viram erro estável com causa interna, sem mensagem nativa/payload financeiro na UI.

# Novo contrato de load

Uma única leitura pública, sem modos. `readLocalSnapshot` enfileira transactions, valor de personal e `count("personal")` na mesma readonly e aguarda `complete`. Ausência da chave é diferente de valor explicitamente persistido como null/undefined. O snapshot inteiro passa no validador estrutural A1, sem completar, filtrar ou normalizar registros.

`LocalReadError.code`: `missing-settings`, `invalid-snapshot`, `storage-unavailable`. Falhas técnicas são preservadas em `cause`. A ausência comprovada é classificada diretamente. Nenhum dado financeiro é registrado em console.

`readForBackup` compartilha a primitive de leitura e mantém a validação estrita A1. Sua rejeição estrutural continua sendo `BackupValidationError`; nenhum fallback foi introduzido.

# Bootstrap legítimo

Criação real via `onupgradeneeded` continua persistindo defaults junto das stores. O load só conclui após a abertura e a readonly terminarem. Banco v2 já existente e vazio não autoriza bootstrap; remover `personal` e reabrir não o recria. Outra chave em settings permanece intacta.

O migrador v1 reconhecido permanece inalterado, inclusive sua criação histórica de settings quando a store não existia. Nenhuma garantia retroativa de proveniência é adicionada a bases já migradas. Database `vertice-finance`, versão 2, stores `transactions` e `settings` preservadas.

# Estado inválido/recovery

O hook usa `FinanceSnapshot | null`, começa sem snapshot e o descarta ao falhar a leitura ou a verificação pós-restore. Erro/loading não publicam defaults nem o último estado válido como atual. Sequence, refresh, focus e BroadcastChannel permanecem.

App monta páginas e formulários somente com snapshot válido. Erro desmonta editor/importação/remoção de demonstração. O status passa a “Carregando dados locais” ou “Dados locais indisponíveis” enquanto não há snapshot validado.

# Comandos bloqueados

Save/import/saveSettings leem e validam o snapshot anterior dentro da própria readwrite, incluindo a presença de personal. O callback do último request executa a ação sem await externo. Estado inválido aborta e não acrescenta linhas ou defaults. Save/import mantêm validação de comando, deduplicação e atomicidade; saveSettings valida também a compatibilidade estrutural da proposta com as transações existentes.

Os guards do hook impedem comandos financeiros enquanto loading/erro/snapshot ausente. Remove/removeDemo não foram transformados em reparadores e suas implementações de repository não mudaram. Não há revisão, CAS ou bloqueio de clientes antigos.

# Recovery UX

`LocalDataRecovery` oferece “Tentar novamente”, “Restaurar backup JSON” e “Como recuperar preservando os dados atuais”. Falha de acesso usa linguagem transitória; invalidez explica a indisponibilidade de saldos/configurações e a preservação dos registros.

RestoreBackupDialog abre sem SettingsPage. Preview, seleção de arquivo e cancelamento não escrevem. Falha de safety mantém confirmação bloqueada e oferece orientação: preservar o perfil/origem; usar backup JSON v2 válido em outro perfil limpo ou dispositivo com bootstrap normal; não há mescla nem recuperação de alterações posteriores ao backup. Sem backup válido, análise/extração técnica preservando a origem. Nenhuma recomendação para limpar o site e nenhum reset/force/skip safety.

# Clock/date

Nenhum validador/data/fórmula foi reescrito. Validação estrutural continua independente de hoje/fuso, incluindo transação, abertura e deadline futuras. Regras de comando continuam dependentes de hoje. Teste usa o mesmo banco sob 2020, 2026 e 2100 nos fusos São Paulo, Kiritimati e Los Angeles, em instante próximo à meia-noite UTC, comparando snapshot e estado bruto sem regravação.

# Regressões A1

O corpo do restore não foi alterado: preparação, safety, precondition, mesma readwrite, clear/adds/put, rollback/abort, complete e verificação estrita pós-commit preservados. Regressões originais R1/R2, lifecycle, metadata válida, futuro estrutural e download permanecem com expectativas inalteradas.

# Testes

| Verificação                                                 | Resultado                                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Direcionados A2a/repository/recovery/restore                | 107 casos aprovados, considerando a repetição isolada do observador corrigido |
| `npm.cmd test`                                              | 221/221 unitários, quatro arquivos; inclui os 116 de backup                   |
| `npm.cmd run build`                                         | PASS, incluindo geração PWA                                                   |
| TypeScript aplicação (`tsc -b`)                             | PASS                                                                          |
| TypeScript estrito de todos os tests/config                 | PASS                                                                          |
| `npm.cmd run test:e2e -- --reporter=list`                   | 146/146 em uma execução completa, aproximadamente 2,5 minutos                 |
| Prettier src/tests/config/index/README e relatório          | PASS                                                                          |
| `git diff --check`                                          | PASS                                                                          |
| R1/R2, rollback, precondition, lifecycle, metadata e futuro | PASS, expectativas A1 intactas                                                |

São 42 E2E novos (25 de leitura e 17 de recovery), além da atualização explícita do teste legado. Nenhum caso ignorado e nenhum timeout na execução final. O warning de chunks maiores que 500 kB e os avisos NO_COLOR/CRLF preexistentes não impediram os checks.

Comandos de navegador usaram `PLAYWRIGHT_PORT=5198`, Edge e a configuração existente de dois workers. Os direcionados foram `tests/local-read.spec.ts tests/recovery.spec.ts tests/repository.spec.ts tests/restore-repository.spec.ts tests/restore-adversarial.spec.ts tests/restore.spec.ts`; depois houve somente a repetição `tests/local-read.spec.ts --grep 'bootstrap real'`, antes da suíte completa.

TypeScript de tests/config: `tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM,DOM.Iterable`, passando todos os `.ts` de tests e `playwright.config.ts`. Prettier: `--check src tests *.ts *.json index.html README.md IMPLEMENTACAO-A2A.md`.

Novos testes em IndexedDB real/Edge:

- `local-read.spec.ts`: bootstrap/persistência/complete, chave removida/reload, matriz de 17 corrupções com load/backup/save/import/saveSettings e comparação bruta após cada tentativa, F01, três fusos × três relógios, store ausente e erros síncronos/abort com retry. O caso de undefined comprova chave presente e valor undefined no IndexedDB real.
- `recovery.spec.ts`: quatro corrupções × três rotas, ausência de métricas/formulários/status falso, prévia válida/inválida, safety bloqueado com zero clear/add/put/delete, cancelamento/Escape/foco, retry seguido de restore A1, falha de refresh com formulário aberto, falha transitória e recuperação em contexto novo mantendo a origem intacta.
- `repository.spec.ts`: o teste histórico de fallback foi explicitamente substituído pelo contrato de bloqueio/preservação/reload. Bootstrap continua coberto separadamente. Nenhuma expectativa A1 foi relaxada.

O red team curto foi executado nessa matriz antes da suíte final: v2 vazio, referências padrão/custom sem personal, null/undefined/{}, comandos, Infinity, store ausente, retry e safety bloqueado. Nenhuma mutation campaign foi executada.

Ocorrências intermediárias: o primeiro build sob sandbox falhou por acesso do esbuild ao diretório; a repetição autorizada concluiu. TypeScript detectou argumentos invertidos no novo teste F01, corrigidos antes da execução. Dos primeiros 107 direcionados, 106 passaram; o observador do teste novo de bootstrap estava registrado depois do handler que resolvia a Promise e sofria a ordem de microtasks entre listeners. O teste foi corrigido para registrar o observador ao criar a transaction, mantendo a exigência de complete antes de load. A repetição isolada passou. Nenhum ajuste de timeout, skip ou expectativa de proteção.

# Arquivos alterados

Produção:

- `src/services/transactionRepository.ts`
- `src/hooks/useTransactions.ts`
- `src/App.tsx`
- `src/components/settings/RestoreBackupDialog.tsx`
- `src/components/settings/LocalDataRecovery.tsx` (novo)

Testes:

- `tests/repository.spec.ts`
- `tests/local-read.spec.ts` (novo)
- `tests/recovery.spec.ts` (novo)
- `tests/helpers/localData.ts` (novo; bundle em memória e fixtures isoladas)

Documentação: README e este relatório. `backup.ts`, `validation.ts`, tipos, catálogo, fórmulas, schema, package/lock, vite/PWA/visual/Three e documentos arquiteturais não foram editados.

Hunks A2a em arquivos mistos: App adiciona import/painel recovery, consumo do snapshot nullable, gates de conteúdo/formulários, fechamento de formulários ao perder snapshot e status de leitura. O import e a montagem PwaControls recebidos permanecem. README substitui o parágrafo de fallback e acrescenta dois parágrafos de recuperação na seção de persistência; a seção PWA preexistente permanece.

# A2b/A2c deixados fora

Não há revision/CAS, tombstones, tratamento de stale writer/lost update ou coordenação de escritores. Não há draft safety, proteção nova de update PWA ou mudanças em Settings/PwaControls/register. Fechar formulários ao perder um snapshot confiável é gate A2a, não política de salvamento de drafts.

# Riscos restantes

Base corrompida continua sem overwrite porque não produz safety válido. Não há dump bruto nem reconstrução de informação perdida. Tipos arbitrários IndexedDB não ganham contrato universal de serialização. Clientes antigos/escritas posteriores e drafts/PWA permanecem A2b/A2c. Validar o snapshot anterior em comandos exige ler os registros atuais; não foi introduzido cache ou benchmark de grandes volumes. O teste de navegador usa Edge; não certifica aparelhos físicos/Safari ou perda de energia.

# Git

HEAD final permanece `971f195`; `git diff --cached` vazio. Sem staging, sem commit, sem mutation ativa. Status, diff, stat, log e diff check conferidos. O diff rastreado total continua misto: 21 arquivos, 6.665 inserções e 2.073 exclusões, incluindo trabalho anterior; cinco arquivos A2a novos estão não rastreados e não entram nessa estatística.

Dos 89 arquivos recebidos inventariados, somente seis foram editados por A2a: README, App, RestoreBackupDialog, useTransactions, transactionRepository e repository.spec. Os outros **83/83 têm SHA-256 idêntico** ao recebido. As seis capturas regeneradas pelos E2E foram repostas aos bytes originais recebidos; a captura dashboard-mobile já permanecia idêntica. As inclusões PWA de App e a seção PWA de README foram conferidas como preservadas.

Nenhum bloqueador A2a restante identificado pelos critérios e testes executados. O workspace preexistente permanece misto, sem limpeza ou inclusão em staging.

# Correções pós-recheck

As duas correções já estavam aplicadas ao retomar; faltavam a validação e este registro. A tentativa anterior de executar os testes não ocorreu por indisponibilidade de créditos na revisão automática de aprovação. Nesta retomada, a execução foi autorizada e não houve falha de teste nem necessidade de editar código ou testes.

- `openDatabase()` preserva `request.error` em `cause`, mantendo a mensagem intermediária segura. A regressão usa IndexedDB real com versão superior à do app e confirma `LocalReadError`, `storage-unavailable`, `DOMException VersionError` na cadeia, mensagem pública segura também na UI, dados preservados e ausência de downgrade/reparo. A versão de produção continua 2.
- O helper permite `includeOther: false`, preservando o comportamento anterior por padrão. O novo caso `missing-completely-empty` comprova transactions e settings realmente vazios, sem `personal` nem `other`; load/backup/save/import/saveSettings rejeitam e mantêm o estado bruto após cada tentativa, sem defaults ou novas chaves. O caso anterior com `other` permanece. Bootstrap legítimo continua persistindo `personal`.

Validação final desta retomada:

| Verificação                                              | Resultado                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| Direcionados `local-read.spec.ts` e `repository.spec.ts` | 43/43 PASS                                                    |
| Unitários                                                | 221/221 PASS                                                  |
| Build, incluindo PWA                                     | PASS                                                          |
| TypeScript aplicação e estrito tests/config              | PASS                                                          |
| E2E completos                                            | 148/148 PASS, em uma execução, sem timeout ou casos ignorados |
| Safety A1 e R1/R2                                        | PASS                                                          |
| Prettier e `git diff --check`                            | PASS                                                          |

Nenhuma mudança funcional adicional, alteração de schema/stores, avanço A2b/A2c ou mutation testing. Os três arquivos de código/testes das correções anteriores foram preservados; nesta retomada somente este relatório foi editado. Capturas regeneradas pela suíte foram repostas aos bytes recebidos. Staging vazio e sem commit.
