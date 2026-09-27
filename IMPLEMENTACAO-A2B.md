# Escopo

Implementação local de A2b conforme PLANO-A2B.md: revisão global, CAS, fence IndexedDB v3 e conflito mínimo na UI. Sem dependências novas, store nova, servidor, staging ou commit. Backup financeiro permanece v2.

# Estado anterior

Checkpoint `7f80ff2 feat: endurece leitura local e recovery A2a`. O workspace já continha alterações de visual, Three, PWA, dependências, screenshots e planejamento. A2B-EVIDENCIAS.md havia reproduzido perda de atualização, ressurreição e writers antigos após restore; Broadcast/focus não eram exclusão mútua.

# Bugs corrigidos

- Edição/settings antigos não sobrescrevem uma revisão nova.
- Delete seguido de update antigo não recria registro.
- Restore, inclusive idêntico, invalida intenções anteriores dos seis writers.
- Refresh não promove o token de draft antigo.
- Cliente v2 conhecido não reabre a base promovida para v3.
- Uma tentativa de upgrade rejeitada por blocked aborta quando finalmente recebe onupgradeneeded; não há migração tardia silenciosa.

# Revision global

`settings["__vertice_local_concurrency__"] = { protocol: 1, revision: 0 }`. Revisão Number, inteira, não negativa, segura. Sem clock, reset ou wrap. Overflow é rejeitado antes de qualquer escrita. Metadata não faz parte de personal, FinanceSnapshot ou JSON v2.

# CAS

`LocalRead { snapshot, revision }` e `WriteReceipt { revision }`. Load e readForBackup leem rows, personal/presença e metadata/presença na mesma readonly e esperam complete. Os seis writers exigem token explícito; não existe overload ou consulta para preencher token omitido.

Uma readwrite T+S lê os cinco requests, valida metadata, compara revisão, valida o snapshot A2a, verifica overflow e executa a regra do writer. Dados e revisão +1 são enfileirados na mesma transação, sem await externo dentro do trecho ativo. Só resolve após complete; abort reverte tudo. `LocalConflictError`, código `stale-state`, usa mensagem pública sem payload financeiro.

# IndexedDB v3

Mesmo banco `vertice-finance`, mesmas stores `transactions` e `settings`; versão 3. Um v3 sem metadata válida falha, sem defaults/reparo. Versão futura preserva VersionError na cadeia de cause.

# Fence v2

Conexões A2b fecham em versionchange e invalidam o cache. Clientes antigos com open(..., 2) recebem VersionError após upgrade. Em blocked, erro seguro orienta fechar outras abas. A requisição permanece marcada como cancelada: onupgradeneeded tardio aborta e eventual sucesso fecha conexão. Retry explícito abre uma tentativa nova; callbacks antigos não apagam seu cache. Falha síncrona de open também libera o cache rejeitado.

# Migração

| Origem                    | Comportamento                                                                    |
| ------------------------- | -------------------------------------------------------------------------------- |
| Banco novo, oldVersion 0  | Cria T/S, personal default e metadata 0                                          |
| v1 reconhecido            | Preserva transformação legada; valida resultado e adiciona metadata              |
| v2 válido                 | Valida snapshot e adiciona somente metadata; mantém IDs, valores e demais keys   |
| v2 inválido/store ausente | Aborta upgrade sem reconstrução, normalização ou defaults                        |
| Colisão da chave em v2    | Aborta sem sobrescrever, inclusive se já contiver valor aparentemente compatível |
| v3 inválido               | Erro/recovery sem reinicializar revisão                                          |

# Writers

| Writer       | Token e efeito                                                        |
| ------------ | --------------------------------------------------------------------- |
| save         | SaveIntent obrigatório com kind e expectedRevision; +1                |
| import       | expectedRevision; valida/deduplica lote; +1 mesmo se deduplicar tudo  |
| saveSettings | expectedRevision; blob integral compatível; +1 mesmo idêntico         |
| remove       | expectedRevision; ID precisa existir; +1                              |
| removeDemo   | expectedRevision; determina demos da leitura validada; +1 mesmo vazio |
| restore      | LocalRead da safety; CAS e igualdade financeira; +1 mesmo idêntico    |

# Create vs update

Create exige ID ausente e usa add. Update exige ID existente e usa put. IDs em situação incompatível produzem conflito sem consumir revisão. Nenhum novo ID é gerado para contornar conflito.

# Delete/resurrection

Delete exige existência, valida estado e consome token. Update com token antigo conflita; mesmo token atual não permite update de ID ausente. Sem tombstones.

# Restore

Safety mantém snapshot e revisão em memória. Dentro da readwrite, CAS e sameBackupSnapshot continuam obrigatórios. Clear/add de transactions, put de personal e incremento local são atômicos; outras keys de settings são preservadas. Após complete, readForBackup estrito verifica snapshot e revisão commitada. Divergência resulta em RestoreError("verify"), sem compensação. Safety desatualizada resulta em RestoreError("changed").

# Backup JSON

Parser, serializer, sameBackupSnapshot, FinanceSnapshot e formato v2 não foram alterados. O diálogo serializa exclusivamente `current.snapshot`; nenhuma revisão importada substitui o contador local. Campos financeiros adicionais válidos continuam preservados. Safety A1 permanece obrigatória inclusive no recovery.

# Broadcast/focus

São auxiliares de refresh, nunca autorização para write. Editor, importação, confirmação de delete/removeDemo e Settings guardam token da origem. Comandos conflitantes fazem refresh pelo hook e propagam o erro, sem retry. A invalidação de sessões após restore já existente em A1 continua; não há promoção de conteúdo antigo para um token novo.

# UX de conflito

Mensagem explica que os dados mudaram e a alteração não foi salva. O submit da sessão conflitante fica desabilitado; fechar/cancelar permite reabrir com estado atual. Settings oferece Atualizar edição, avisando que descarta conteúdo não salvo. Após sucesso, o draft aplicado fica associado à revisão do receipt, permitindo nova edição consciente sem reutilizar o token anterior.

# Testes

57 casos A2b novos em três arquivos:

- `tests/a2b-migration.spec.ts`: migração v2, corrupção, colisão, abort/retry, metadata v3, blocked com duas conexões, fence e versionchange.
- `tests/a2b-concurrency.spec.ts`: leitura coerente, CAS dos writers, três clients, isolamento como controle negativo, restores diferentes/idênticos contra todos os tokens anteriores, no-op, overflow, intenção create/update, token omitido, rollback financeiro+revision e verify por revisão.
- `tests/a2b-conflict-ui.spec.ts`: Settings com Broadcast/focus/supressão, descarte explícito, receipt após sucesso; create/edit/delete/import/removeDemo mantêm token de abertura e não gravam após conflito.

Concorrência real usa Pages na mesma origem e no mesmo BrowserContext. O teste de sensibilidade remove somente o guard CAS de uma string de bundle em uma página isolada: a proteção original rejeita e o bundle mutado reproduz lost update. Nenhum arquivo de produção foi mutado; a página é encerrada pelo runner.

Primeiro foram executados migration/fence, CAS, multiaba, restore e UI. A primeira rodada revelou BUG DE TESTE: a fixture confundia version:2 do backup com a versão da base; a opção foi renomeada databaseVersion. As expectativas permaneceram estritas. Reexecução de 40 casos afetados passou; oito casos UI e cinco restore-concurrency passaram. Mais nove contraprovas direcionadas passaram antes da suíte completa.

Validação final em 26/09/2026:

| Verificação                             | Resultado                                                              |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `npm.cmd test`                          | PASS: 221/221, quatro arquivos                                         |
| `npm.cmd run build`                     | PASS: TypeScript, Vite e generateSW; aviso conhecido de chunks grandes |
| TypeScript aplicação (`tsc -b`)         | PASS                                                                   |
| TypeScript estrito tests/helpers/config | PASS: noEmit, strict, ES2022, ESNext, Bundler, react-jsx               |
| `npm.cmd run test:e2e`                  | PASS: 205/205, dois workers, 2,5 minutos                               |
| Prettier --check                        | PASS: src, tests, configs TS/JSON, index.html, README e este relatório |
| `git diff --check`                      | PASS                                                                   |

Nenhum timeout precisou ser aumentado. Após corrigir a fixture, a suíte completa passou sem retries. A1/A2a, PWA, Three e visual preexistentes passaram junto dos 57 novos casos A2b.

# Regressões A1/A2a

Testes existentes foram adaptados ao envelope, tokens explícitos e v3 sem enfraquecer asserts financeiros/rollback. Fixtures v2 vazio e store ausente continuam v2; banco futuro passou para v4. Falhas de create usam add; removeDemo injeta delete da store, mantendo falha no segundo registro. O antigo teste que documentava aceitação de settings antigas pós-restore agora exige conflito. R1 (verify estrito sem fabricar personal), R2 (metadata Infinity), datas estruturais, bootstrap, recovery e causas nativas continuam cobertos.

# A2c deixado fora

Não foram implementados dirty form, persistência de draft, recuperação de conteúdo não salvo, merge ou update safety do PWA. Fechar/recarregar ainda pode descartar drafts.

# Riscos restantes

Revisão global pode gerar conflitos entre alterações independentes; política aprovada. Scripts alheios/DevTools que adulterem dados e contador de modo coerente não estão sob a garantia CAS. Limpeza física do perfil perde dados. Testes executados em Edge headless local; não certificam Safari/mobile nem distribuição do release. O limite Number.MAX_SAFE_INTEGER bloqueia novas escritas, sem reset automático.

# Git

Sem staging/commit. A2b modifica oito arquivos de produção: repository, hook, App, SettingsPage, RestoreBackupDialog, TransactionsPage, TransactionForm e ImportModal.

Hunks A2b em App: estados de sessão com revisão, captura ao abrir, transporte dos tokens e feedback de conflito. Import/render de PwaControls preexistentes preservados. Hunks README: contrato v3/CAS/fence/UX e atualização da seção de etapas; conteúdo prévio PWA/visual preservado.

Testes existentes adaptados: repository, local-read, recovery, restore-repository, restore-adversarial, restore-concurrency-adversarial, dashboard, restore, pwa e helper localData. Em pwa a única mudança é abrir a base atual v3. Três arquivos de teste novos e este relatório. Nenhuma alteração em backup.ts, finance.ts, cálculos, catálogo, dependências ou documentos arquiteturais/plano/evidências.

Baseline completo de 96 arquivos foi preservado fora do repositório. A comparação SHA-256 final identificou somente os 19 arquivos existentes intencionalmente tocados por A2b (oito de produção, dez de testes/helper e README); os outros 77 continuam idênticos ao início. Os três testes A2b e este relatório são novos. Sete screenshots regravadas pela suíte foram repostas byte a byte a partir da baseline. App/README foram comparados também com essa baseline para distinguir hunks A2b dos preexistentes.

HEAD final permanece `7f80ff2`; `git diff --cached` vazio. Nenhuma mutation ativa em produção, nenhum arquivo preexistente removido, nenhuma mudança em A2c, nenhum commit. O status continua misto por conter o trabalho autorizado A2b e as alterações que já estavam presentes antes desta execução.

# Correção pós-recheck

Corrigida a confirmação residual de Settings: uma nova tentativa de save limpa `error`, limpa `saved` e então inicia `busy`. A alteração de produção é somente a inclusão de `setSaved(false)` em SettingsPage; uma confirmação de sucesso volta a aparecer apenas se a nova operação concluir.

Adicionada regressão real de sucesso → conflito em `tests/a2b-conflict-ui.spec.ts`: A salva, B relê e salva uma alteração mais recente, e A tenta reenviar o mesmo draft com seu token anterior. O teste exige conflito, ausência da confirmação antiga, draft preservado e banco/revision inalterados após a rejeição. Antes da correção, falhou exatamente pela confirmação residual; depois, os nove testes direcionados passaram.

Nenhuma mudança no protocolo CAS/revision, repository, hook, migração, fence, restore ou backup. A2c continua fora do escopo.

Validação pós-correção: unit 221/221; build e TypeScript da aplicação PASS; TypeScript estrito tests/config PASS; E2E completo 206/206, incluindo A1/A2a; Prettier e `git diff --check` PASS. Nenhum timeout aumentado, nenhum commit e staging vazio.
