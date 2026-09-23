> **STATUS ATUAL — 22/09/2026:** R1 e R2 foram corrigidos e revalidados. Não restam bloqueadores A1 conhecidos. O veredito **BLOQUEADO** abaixo representa o estado anterior às correções. Consulte [Recheck das correções](#recheck-das-correções) ao final deste documento.

# Resultado da revisão

22/09/2026. Auditoria do workspace recebido, antes de qualquer commit. Código de produção não foi corrigido. Nenhuma dependência instalada, schema alterado ou etapa A2 implementada.

**Veredito: BLOQUEADO — CORREÇÕES NECESSÁRIAS.**

**Bugs reais: 0 CRÍTICOS, 1 ALTO, 1 MÉDIO, 0 BAIXOS.** A transação de substituição passou nos experimentos de atomicidade e rollback. O bloqueio decorre de falso sucesso na verificação e de uma entrada aceita que torna a próxima cópia de segurança impossível. Pendências A2 e riscos aceitos estão separados e não entram nessa contagem.

## Fontes, ambiente e atribuição do diff

Leitura dos seis documentos exigidos, respeitando Decisões → Arquitetura revisada → Auditoria de arquitetura → Arquitetura original. AUDITORIA-FINANCEIRA é histórico; IMPLEMENTACAO-A0-A1 é autorrelato, confrontado com execução. Os documentos anteriores descrevem restore como futuro, contagens menores e, em um deles, ausência de Git: não representam o estado atual.

Ambiente: Windows/PowerShell, Node 24.15.0, npm 11.12.1, Edge 153.0.4234.48, Vite 6.4.3, Vitest 3.2.7; Playwright usa `channel: msedge`, contextos isolados e porta 5198. Não foi acessado o perfil financeiro pessoal do usuário. O harness empacota módulos reais com Vite em memória, usando IndexedDB nativo do navegador.

Antes dos experimentos foram executados `git status`, `git diff`, `git diff --stat`, `git log --oneline -10`; salvos diff binário, status, HEAD e SHA-256 dos **81 arquivos preexistentes**, além das capturas que os E2E regeneram. HEAD recebido: `38c1563 chore: valida nucleo financeiro do MVP`; o histórico disponível tem somente esse commit. Nenhum AGENTS.md aplicável foi encontrado.

O diff recebido tem **23 arquivos rastreados modificados, 6.677 inserções e 1.923 exclusões**, além dos não rastreados. Não é o diff exclusivo de A0/A1. A0/A1 tem participação direta confirmada nos oito arquivos editados declarados: README, App, SettingsPage, validation, importExport, transactionRepository, useTransactions e repositoryHarness. Os sete novos declarados também existem: backup.ts, backup.test.ts, RestoreBackupDialog, backupFixture, restore-repository.spec, restore.spec e IMPLEMENTACAO-A0-A1.

Há mudanças preexistentes distintas em package/lock, Vite/PWA, Three.js, CSS, componentes visuais, index/main e capturas. App e README misturam essas alterações com restore. Sem um commit ou cópia independente anterior a A0, o Git **não prova a autoria cronológica de cada hunk**; a atribuição é funcional e confrontada com o relatório, não uma reconstrução certificada do baseline anterior. Os hashes registrados pelo implementador não foram fornecidos como artefato independente. A revisão preservou o estado recebido, sem tentar separar commits.

Também foram incluídos no fluxo: tipos financeiros, catálogo/defaultSettings, Dialog, formulários/importação, helpers de datas, cálculos pertinentes, registro/configuração PWA e configuração Playwright. Só `settings["personal"]` compõe o snapshot financeiro no código atual; não se exige tratamento de chaves futuras.

# Achados

## R1 — Verificação pós-commit fabrica settings ausentes e declara sucesso

Categoria: **BUG REAL**

Severidade: **ALTO**

### Evidência

`src/services/transactionRepository.ts:124`, `resolveSettings`, usa `value ?? defaultSettings()`. `load`, linha 174, chama esse fallback. `restore`, linha 251, usa `transactionRepository.load()` para verificar o que foi persistido.

Quando o backup alvo tem as configurações padrão, a ausência real de `personal` é convertida exatamente no objeto esperado. `sameBackupSnapshot` recebe dois objetos iguais e o restore resolve, embora a chave exigida pelo próprio backup esteja ausente. A chamada seguinte a `readForBackup()` rejeita essa mesma base.

### Cenário de falha

Restaurar um snapshot válido com settings padrão e uma transação. Uma segunda conexão real enfileira `settings.delete("personal")` atrás da transação de restore, antes da leitura verificadora. A transação de restore commita integralmente; a exclusão concorrente commita; a verificação fabrica settings e informa sucesso.

Sequência observada: `restore-complete → settings-deleted → public-resolved`; leitura bruta: `personal = undefined`; nova cópia de segurança: bloqueada.

Não se afirma que IndexedDB perca espontaneamente uma chave, nem que a UI atual ofereça esse delete. A corrupção/alteração é injetada por uma segunda conexão para testar uma condição expressamente exigida nesta revisão. Impedir toda escrita posterior é A2; **declarar verificado um estado que a própria releitura já encontra incompleto é falha de A1**.

### Reproduzível?

**SIM.**

### Experimento/teste utilizado

`tests/restore-adversarial.spec.ts:250`, “verificação não pode fabricar settings ausentes após commit”. Repository, duas conexões e persistência reais; nenhum stub de `load`. O teste comprova chave ausente e backup bloqueado antes de exigir `phase === "verify"`. Recebe `resolved` e falha.

### Teste existente cobre?

**PARCIAL.** Os testes de base danificada cobrem ausência **antes** do restore. Os testes pós-commit usam settings personalizados da fixture, que diferem dos defaults e ocultam este falso positivo específico.

### Mutation test executado?

**NÃO APLICÁVEL.** O defeito aparece no código original. As mutações da comparação pós-commit são controles separados, descritos abaixo.

### Correção necessária antes do commit?

**SIM.**

### Mudança mínima recomendada

Fazer a verificação pós-commit exigir settings reais na mesma leitura coerente das duas stores, sem fallback. Pode ser um modo estrito de load ou a leitura estrita já existente, preservando a comparação integral e o erro `verify`. Não é necessário implementar a recuperação geral A2. Não corrigido nesta execução.

## R2 — Overflow numérico em metadado é aceito e impede a próxima recuperação

Categoria: **BUG REAL**

Severidade: **MÉDIO**

### Evidência

`src/features/transactions/backup.ts:150`, `parseBackup`, aceita `JSON.parse` seguido de validação dos campos conhecidos. `validateBackupSnapshot`, linha 62, preserva campos adicionais sem verificar sua representabilidade JSON. `equalValue`, linha 191, considera `Infinity === Infinity` igual. A checagem de roundtrip existe apenas em `serializeBackup`, linha 231, usada na cópia de segurança do estado **anterior**.

### Cenário de falha

Um JSON válido contém `settings.metadata.external: 1e400`. O parser JavaScript produz Infinity. O valor não pertence aos campos monetários conhecidos; passa na validação, sobrevive ao structuredClone/IndexedDB e é comparado como igual. O restore termina com sucesso.

Depois, `serializeBackup(await readForBackup())` falha: stringify converte Infinity em null, e o roundtrip diverge. A UI exige essa serialização para qualquer novo restore, inclusive recuperar o arquivo pré-restore. A exportação comum, que não faz roundtrip, serializa o campo como null. Valores monetários conhecidos continuam rejeitando infinitos; não foi demonstrada corrupção de saldos.

### Reproduzível?

**SIM.** Resultado observado: `{ accepted: true, exportable: false }`.

### Experimento/teste utilizado

`tests/restore-adversarial.spec.ts:325`, “JSON com overflow em campo adicional deve falhar antes de substituir”. Insere o token numérico no texto JSON, passa pelo parser e pelo repository reais e tenta gerar a cópia do estado persistido. Não usa `JSON.stringify(Infinity)` para construir a entrada, o que esconderia o caso convertendo-a antes para null.

### Teste existente cobre?

**PARCIAL.** O unitário de metadata NaN/BigInt prova a rejeição na serialização de saída; não prova que toda entrada aceita poderá ser exportada novamente.

### Mutation test executado?

**NÃO APLICÁVEL.** Reprodução no código original.

### Correção necessária antes do commit?

**SIM.** É uma correção localizada da admissão de backups, sem novo formato.

### Mudança mínima recomendada

Validar também a representabilidade dos campos adicionais do snapshot alvo antes da escrita, rejeitando números não finitos em qualquer profundidade. Alternativamente, conferir roundtrip do alvo antes de habilitar a confirmação. Não converter silenciosamente para null nem descartar metadata. Não é necessária a reforma global de Money. Não corrigido nesta execução.

## A2-01 — Escritor antigo pode sobrescrever depois do restore

Categoria: **PENDÊNCIA A2**

Severidade: **MÉDIO** no recorte desta revisão; o controle geral de concorrência já é prioridade arquitetural.

### Evidência

`transactionRepository.save/saveSettings` não implementa revisão/CAS. `useTransactions` usa BroadcastChannel como invalidação e `App` remonta Settings após mensagem `restored`; isso não bloqueia um cliente antigo que ignore a mensagem.

### Cenário de falha

B guarda settings antigos; A restaura e verifica; B salva o blob antigo depois. Os saldos iniciais e demais configurações voltam aos valores de B, com as transações restauradas ainda presentes.

### Reproduzível?

**SIM.**

### Experimento/teste utilizado

`tests/restore-concurrency-adversarial.spec.ts:153`, duas páginas, repository real; o escritor B representa cliente legado sem o hook de invalidação.

### Teste existente cobre?

**PARCIAL.** O E2E existente comprova atualização de Settings em aba cooperante, não CAS.

### Mutation test executado?

**NÃO APLICÁVEL.**

### Correção necessária antes do commit?

**NÃO como requisito A1.** Está explicitamente adiada para A2b; não foi usada como bloqueador.

### Mudança mínima recomendada

Manter a limitação documentada; implementar revisão/existência e tratamento de drafts na entrega A2 autorizada.

## A2-02 — Recuperação de base previamente inválida permanece indisponível

Categoria: **PENDÊNCIA A2**

Severidade: **MÉDIO**.

### Evidência

`readForBackup` exige `personal` real e snapshot válido; `safetyDownload` bloqueia confirmação quando a leitura/serialização falha. O fallback de load comum permanece, mas não é usado na captura de segurança. A exceção encontrada na verificação está registrada separadamente em R1.

### Cenário de falha

Base já inválida ou sem settings não consegue gerar a cópia exigida para restore. A1 recusa substituir; recuperação bruta/manual depende da próxima etapa.

### Reproduzível?

**SIM.**

### Experimento/teste utilizado

Os dois casos reais de base inválida de `tests/restore-repository.spec.ts`, com releitura bruta de IDs/settings, preservam exatamente a base danificada.

### Teste existente cobre?

**SIM.**

### Mutation test executado?

**NÃO APLICÁVEL.**

### Correção necessária antes do commit?

**NÃO.** O pedido atual aceita a decisão de adiar exportação bruta para A2.

### Mudança mínima recomendada

Nenhuma ampliação A2 nesta revisão; preservar o bloqueio conservador.

## RA-01 — Entrega local iniciada não comprova salvamento físico

Categoria: **RISCO ACEITO**

Severidade: **BAIXO** no contrato explicitamente comunicado.

### Evidência

`RestoreBackupDialog.safetyDownload` só grava `safety` depois de leitura, serialização e retorno de `download`. A mensagem diz que o download foi iniciado e pede conferir/guardar o arquivo. `importExport.download` agenda revokeObjectURL em finally.

### Cenário de falha

O usuário cancela o download, ou o navegador bloqueia a entrega sem lançar erro. O aplicativo não tem confirmação universal de gravação física. Isso não contradiz a garantia limitada apresentada na UI.

### Reproduzível?

**NÃO** foi exercitado cancelamento posterior pelo gerenciador de downloads; as exceções no caminho de entrega foram exercitadas.

### Experimento/teste utilizado

E2E existente captura e lê o arquivo real. Testes de falha de leitura/serialização/click e `tests/restore-download-adversarial.spec.ts` cobrem Blob, ObjectURL e revogação após erro de click; confirmação permanece desabilitada.

### Teste existente cobre?

**PARCIAL**, coerente com o limite do contrato.

### Mutation test executado?

**SIM.** Remoção da condição visual `!safety` fez o E2E falhar por botão habilitado antes da cópia. A guarda interna do handler continuou existindo nessa mutação; não se apresenta esse ensaio como bypass de ambas as guardas.

### Correção necessária antes do commit?

**NÃO.**

### Mudança mínima recomendada

Preservar texto e bloqueios existentes. Não prometer prova de arquivo fisicamente salvo.

# Fluxo real reconstruído

| Etapa                | Função / arquivo                                    | Entrada → saída                                | Persistência e falha                                                                                            |
| -------------------- | --------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Abrir                | SettingsPage → App                                  | Botão → RestoreBackupDialog                    | Sem escrita; Settings bloqueia ação durante seu save                                                            |
| Selecionar/ler       | `select`, RestoreBackupDialog                       | File → texto                                   | Reseta backup/safety antes de File.text; erro mantém confirmação bloqueada                                      |
| Parse/validar        | `parseBackup` / `validateBackupSnapshot`, backup.ts | Texto → BackupV2                               | Remove BOM inicial; JSON.parse, versão/timestamp/estrutura/referências; sem normalização; ressalva R2           |
| Prévia               | `backupPreview`, backup.ts                          | Snapshot → contagens/datas                     | useMemo; não toca banco                                                                                         |
| Capturar estado      | `readForBackup`, repository                         | IndexedDB → snapshot estrito                   | Uma readonly com getAll/get nas duas stores; aguarda complete; sem defaults                                     |
| Serializar segurança | `serializeBackup`, backup.ts                        | Snapshot atual → JSON v2                       | Valida, stringify, parse e comparação de roundtrip; falha bloqueia                                              |
| Entregar arquivo     | `download`, importExport.ts                         | JSON → Blob/URL/anchor.click                   | Somente local; finally agenda revoke após 1 s; exceção propaga                                                  |
| Habilitar            | `safetyDownload`, diálogo                           | Download retornou → `setSafety(current)`       | Não basta apenas escolher arquivo; busy/ref evitam chamadas sobrepostas                                         |
| Confirmar            | `restore`, diálogo → hook                           | Backup alvo + safety → Promise                 | Guarda `backup/safety/active`; yield de UI ocorre antes de abrir transação                                      |
| Preparar             | `restore`, repository                               | structuredClone dos dois snapshots → validados | Antes de abrir readwrite; falha prepare não limpa dados                                                         |
| Precondition         | callback `replace`, repository                      | getAll/get reais + previous → igualdade        | Dentro da mesma readwrite da substituição; changed aborta antes de clear                                        |
| Substituir           | `replace`, repository                               | prepared → clear/adds/put personal             | Requests enfileirados sincronamente na mesma transaction                                                        |
| Concluir             | `complete`, repository                              | Eventos IDB → done                             | Resolve em complete; rejeita em abort, preservando causa; error apenas registra causa                           |
| Verificar            | `restore` → `load` → comparação                     | Nova readonly → snapshot persistido comparado  | Após commit; erro verify sem segunda escrita. R1: fallback precisa ser removido dessa verificação               |
| Publicar             | `restoreBackup`, useTransactions                    | Snapshot verificado → React                    | Incrementa sequence, publica snapshot, limpa error, incrementa restoreVersion, emite restored                   |
| Invalidar editores   | App + handler BroadcastChannel                      | restoreVersion → remount/fechamento            | Settings remonta; editor/import/demo fecham; mensagem não retransmite em loop                                   |
| Final                | App / diálogo                                       | Sucesso ou erro de fase → UI                   | Toast somente após retorno; pré-commit mantém estado; pós-commit orienta recuperação e remove ações destrutivas |

`load()` usa validação estrutural das datas e **não substitui rows pelos retornos normalizados** de validateTransaction. Settings existentes retornam sem transformação. Campos source/createdAt opcionais não são preenchidos pelo restore; preenchimento sintético pertence apenas à migração histórica v1, que não foi alterada. Campos adicionais de registros/settings permanecem no clone, nos inserts, no load e na comparação. Campos extras do envelope raiz não pertencem ao FinanceSnapshot persistido; exportedAt é metadado da exportação.

No hook, falha pré-commit não publica snapshot novo. Falha verify sinaliza error e invalida releituras antigas; App oculta o conteúdo financeiro sob esse erro. Não há publicação de snapshot anterior como “restaurado”. Refresh explícito/foco pode carregar novamente o estado real; não há compensação automática. A sequência é proteção de respostas, não revisão de escrita A2.

# Lifecycle IndexedDB

**Conclusão: SEGURO para a unidade transacional de escrita testada.** A validação pós-commit tem o problema R1; isso não é commit parcial nem falha de rollback.

- Criada em `transactionRepository.restore`, linha 215: `db.transaction(["transactions", "settings"], "readwrite")`, database `vertice-finance`, versão 2.
- `complete(tx)` instala oncomplete/onerror/onabort antes de enfileirar leituras.
- `transactions.getAll()` e `settings.get("personal")` têm callbacks síncronos compartilhados. `pending` só libera substituição depois de ambos.
- Comparação, clear, todos os adds e put ocorrem no callback do último success. Não há await externo, Promise, microtask agendada, timeout ou callback async nesse trecho original.
- O await de openDatabase antecede a criação da transação. `await done` sucede o agendamento dos callbacks e não é usado para continuar inserindo dentro da transação.
- onerror não resolve nem rejeita cedo: preserva a causa do IDBRequest. onabort rejeita depois do rollback. oncomplete resolve done; a Promise pública ainda aguarda a leitura e comparação.
- Não há `tx.commit()` explícito; o commit automático ocorre depois dos requests. `InvalidStateError` ao abortar novamente uma transação já abortando é tolerado. Não foi observado evento perdido, Promise pendurada ou causa nativa ConstraintError apagada.

Instrumentação exclusivamente de teste confirma identidade de `store.transaction` em cada request. Sequência observada no sucesso:

```text
created (readwrite; settings + transactions)
queued rows → queued config
success rows → success config
queued clear → queued add-1 → queued add-2 → queued add-3 → queued settings
success clear → success add-1 → success add-2 → success add-3 → success settings
complete → [load/compare] → public resolve
```

No erro nativo do segundo add: `success clear → success add-1 → error ConstraintError → abort → public reject(write)`. Requests ainda pendentes podem receber AbortError; a causa inicial permanece ConstraintError.

| Falha exercitada                                  | Ponto confirmado                                      | Resultado                                                                            |
| ------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Antes dos requests destrutivos                    | Prepare inválido e clear que lança, testes existentes | Nenhuma substituição; prepare/write conforme etapa                                   |
| Síncrona no primeiro, segundo, último add         | Novo harness conta exatamente 1/2/3                   | Abort; snapshot anterior integral após leitura estrita e reload                      |
| Síncrona em settings.put                          | Todos os adds já enfileirados                         | Abort; ambas as stores anteriores                                                    |
| Abort no success do primeiro, segundo, último add | clear já recebeu success e o add selecionado também   | Clear e writes executados revertidos; ambas as stores anteriores                     |
| Abort no success de settings.put                  | clear, todos os adds e put já receberam success       | Rollback inclui settings já escrito na transação                                     |
| IDBRequest ConstraintError                        | Chave duplicada injetada no segundo add nativo        | onerror → onabort → reject; causa nativa preservada                                  |
| Erro após complete                                | Load rejeita ou amount diverge                        | verify; uma única substituição; dados novos persistem; sem tentativa de abort antigo |

Os testes novos são importantes porque os erros síncronos dos testes anteriores provam rollback de **requests enfileirados**; sozinhos não provam que clear já executara seu success. Os ensaios novos de abort em success cobrem essa diferença.

Controle de autocommit: uma transação isolada limpa a store, retorna ao event loop e tenta inserir após complete; o navegador lança **TransactionInactiveError**, com a store vazia já commitada. Além disso, a mutação temporária **no restore real** introduziu callback async e await de timer após clear: o trace terminou `success clear → complete → reject`, sem adds/settings. O teste de lifecycle falhou. A mutação foi revertida e o caso original passou.

O comportamento observado é compatível com as regras de atividade, commit e rollback da [especificação IndexedDB, lifecycle](https://w3c.github.io/IndexedDB/#transaction-lifecycle). O ensaio não certifica falha elétrica, flush físico, defeito de disco, quota real esgotada ou motores Safari/Firefox. DOMException de quota foi injetada; ConstraintError e rollback foram produzidos pelo IndexedDB real.

# Multi-aba

| Caso solicitado                                             | Experimento                                                          | O que A1 garante / limite                                                                                                                        |
| ----------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| A lê, B grava, A serializa/entrega cópia antiga, A confirma | Duas páginas; snapshot antigo serializado após save real de B        | changed antes de clear; registro de B preservado. A parte download síncrono não altera o snapshot capturado                                      |
| A copia, B grava, A abre restore                            | Duas páginas e E2E existente de alteração entre download/confirmação | changed; exige nova cópia; nenhum clear                                                                                                          |
| A abre restore, B enfileira escrita                         | Segunda conexão real criada durante clear, com write atrás do lock   | B grava somente após complete de A; se executar antes do load, comparação detecta verify; os três registros restaurados e o novo de B permanecem |
| A verifica, B salva draft antigo depois                     | Duas páginas, B sem hook cooperante                                  | Possível; pendência A2-01, não bloqueador A1                                                                                                     |

Não foi encontrada janela em que uma gravação financeira normal confirmada antes da precondition seja apagada sem detecção. A exceção de verificação de **ausência pós-commit** está em R1. BroadcastChannel não é lock; recomendações de fechar abas continuam pertinentes.

Comparação cobre settings inteiros, ID, amount, type, date, categoria, conta, destino, recurring, createdAt, source e extras. Testes adicionais variam cada campo, mantendo contagem. Mudança de exportedAt, ordem das propriedades, ordem de transações e undefined/ausência opcionais não altera igualdade. Arrays de settings mantêm ordem porque são usados na apresentação e no catálogo; o contrato do relatório explicita essa preservação. Não se impôs ordenação canônica nova ao produto.

# Validação estrutural

- Datas exercitadas: 2024-02-29 válida; 2026-02-29, 2026-04-31, mês 13/00, dia 00, texto parcial, espaços ao redor e timestamp no campo civil inválidos; 2027-01-10 e 9999-12-31 estruturalmente válidas. Mantido mínimo de 1900. Comandos continuam recusando futuro. saveSettings usa modo estrutural para validar **transações já existentes**, mas valida as configurações novas com regra de comando.
- Duplicidade de transactions/accounts/categories/goals/fixedExpenses e referências inválidas falham na preparação, antes de abrir a readwrite. Transferência usa categoria sentinela `transfer`; não é necessário cadastrá-la como categoria income/expense. Contas iguais, destino ausente e destino em income/expense são rejeitados.
- Nenhuma construção seletiva descarta propriedades dos registros restaurados. Teste adicional em IndexedDB/reload cobre extras em accounts, categories, goals, fixedExpenses, transactions e settings, com strings de espaços preservadas e metadados opcionais ausentes.
- Nenhum upload, endpoint, fetch de backup, console de finanças, eval de JSON ou innerHTML perigoso no caminho de produção. O eval existente nos testes injeta o **bundle de teste confiável**, não conteúdo do arquivo de backup. Nome do arquivo pré-restore contém apenas prefixo/timestamp. MIME/extensão não substituem parse.
- PWA guarda assets; não foi acrescentado payload financeiro a CacheStorage. O registro SW não acessa IndexedDB financeiro. A suíte PWA faz parte da reexecução completa.
- Validação/comparação de restore/load usa Set/Map; não foi encontrada busca linear de conta/categoria dentro do loop de transações desse fluxo. Comparação é linear no número de campos; clonagem, serialização/roundtrip e leituras mantêm várias cópias grandes simultaneamente. Sem benchmark não se afirma limite de capacidade ou necessidade de Worker. Trata-se de limite já declarado, não bug de integridade reproduzido.
- Build atual confirmado: main **309,24 kB / 95,01 kB gzip**, precache **883,22 KiB**. O valor anterior 92,02 kB gzip é histórico do relatório, não uma medição independente desta revisão. Crescimento declarado de 2,99 kB é compatível com código adicionado; nenhum import novo de biblioteca grande no caminho do restore. ExcelJS/Three permanecem opcionais.
- Nenhum Workspace, Supabase, auth, sync/outbox/tombstone, Money global, Context Engine, Empresas, Ledger, CAS geral ou schema novo foi implementado em A0/A1. Não foram exigidos como correção desta revisão.

# Mutation testing

**11 execuções temporárias de mutação; todas revertidas.** Dez atingiram o alvo esperado; uma tentativa inicial foi descartada como evidência específica porque quebrou a preparação do teste, e foi refeita com escopo correto. O controle isolado de autocommit é adicional, não inflaciona essa contagem.

Antes de cada mutação: bytes e diff direcionado salvos. Depois: restauração dos bytes em finally, SHA-256 e igualdade exata do diff anterior; o teste correspondente foi reexecutado no original e passou. Nunca usados checkout/reset/limpeza genérica. Mutações de UI foram testadas com rebuild, e o build original foi regenerado após a reversão.

| Proteção                         | Mutação temporária                           | Teste esperado       | Falhou?                                                                     | Revertida? |
| -------------------------------- | -------------------------------------------- | -------------------- | --------------------------------------------------------------------------- | ---------- |
| complete, tentativa exploratória | Resolve imediato em todas as transações      | lifecycle constraint | SIM, mas em readForBackup do setup; não conta como prova do restore         | SIM        |
| complete, alvo refinado          | Resolve imediato só em readwrite             | lifecycle constraint | SIM: esperado write, recebeu verify após abort real                         | SIM        |
| Abort de erro síncrono           | Retirar tx.abort                             | lifecycle sync-2     | SIM: esperado write/rollback, recebeu verify após commit parcial da mutação | SIM        |
| Substituir snapshot              | Retirar clear                                | restore completo     | SIM: mismatch pós-commit por registro antigo remanescente                   | SIM        |
| Precondition safety              | Desativar comparação de previous             | mudança após cópia   | SIM: esperado changed, houve sucesso indevido                               | SIM        |
| Verificação integral             | Desativar comparação de persisted            | pós-commit mismatch  | SIM: esperado verify, houve sucesso indevido                                | SIM        |
| Montante participa da igualdade  | Zerar amount dos dois lados só na comparação | pós-commit mismatch  | SIM: divergência deixou de ser detectada                                    | SIM        |
| Futuro estrutural válido         | Aplicar limite de hoje no modo estrutural    | datas futuras/reload | SIM: prepare rejeitou snapshot válido                                       | SIM        |
| Transaction ativa                | Callback async + await externo após clear    | lifecycle none       | SIM: clear commitou, faltaram adds/put, houve reject                        | SIM        |
| Settings na substituição         | Retirar settings.put                         | restore completo     | SIM: verificação detectou settings antigos                                  | SIM        |
| Confirmação após safety          | Retirar `!safety` do disabled                | E2E prévia/cópia     | SIM: botão enabled antes do download                                        | SIM        |

As mutações revelaram sensibilidade dos testes, sem provar cobertura universal. A primeira falha antecipada não foi usada para alegar proteção específica. O defeito R1 e o overflow R2 sobrevivem à suíte original e têm testes novos vermelhos.

# Resultado da suíte

Os 54 unitários e 33 E2E adicionados pela implementação foram lidos. Repository real e IDB real nos testes de integração; UI real, input file e download real nos testes de interface. O caso assíncrono de duplicidade realmente chama add nativo com ID repetido no segundo registro. A variável `cause` do teste antigo não era assertada; o teste adversarial novo exige ConstraintError e ordem error/abort/reject.

Os testes de mismatch que substituem temporariamente `r.load` são úteis para a comparação, mas isoladamente não comprovam o lifecycle. O E2E existente intercepta o resultado de getAll da **releitura seguinte ao clear**, e os novos traces/segunda conexão comprovam a ordem independentemente. Cancelar/fechar/Escape, trocar arquivo, falha de segurança e reload após sucesso/falha são cobertos. Nenhum teste antigo foi removido ou enfraquecido.

A execução final de `npm.cmd test` passou: **195/195 testes**, incluindo os 36 novos unitários. `npm.cmd run build`, TypeScript da aplicação (`tsc -b`) e TypeScript estrito de todos os testes/configuração passaram. Não foram reinstaladas dependências. As tentativas iniciais de execução sob sandbox falharam por acesso ao processo esbuild; a execução autorizada fora dessa restrição concluiu os checks.

O E2E completo executou **101 casos: 90 passaram, 5 falharam e 6 ficaram sem executar**. Duas falhas são as regressões R1/R2. As outras três foram timeouts em dois casos de dashboard e no beforeAll da PWA, que impediu os seis casos seguintes. Houve pausas anormais de execução de cerca de dez minutos; não se atribui sua causa ao produto sem evidência.

A repetição justificada dos dois arquivos afetados, **sem mudar código, configuração ou timeouts**, passou **21/21 em 46,7 segundos**. Consolidando a última execução de cada caso: **99 passaram e 2 falharam**, de 101 casos únicos. Todos os 80 E2E preexistentes passaram; dos 21 novos, 19 passaram e os dois testes de bugs continuam vermelhos. Isso não equivale a uma única execução completa verde. Não foram usados skip, only, test.fail ou mudança de expectativa para ocultar os bugs.

Comandos finais executados:

```powershell
npm.cmd test
npm.cmd run build
node_modules\.bin\tsc.cmd -b
$testFiles = @(rg --files tests -g '*.ts')
& node_modules\.bin\tsc.cmd --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM,DOM.Iterable @testFiles playwright.config.ts
npm.cmd run test:e2e -- --reporter=list,json
npm.cmd run test:e2e -- tests/dashboard.spec.ts tests/pwa.spec.ts --reporter=list,json
node_modules\.bin\prettier.cmd --check src tests *.ts *.json index.html README.md REVISAO-A0-A1.md artifacts/revisao-a0-a1-evidencias.json
git diff --check
```

Os testes usam `PLAYWRIGHT_PORT=5198`; os dois relatórios JSON foram consolidados no artefato de evidências. Prettier --check e git diff --check passaram. A busca final não encontrou test.skip, test.only, test.fail, TODO/FIXME ou console.log/error em src/tests. A preservação do workspace está registrada abaixo.

# Testes adicionais

| Arquivo novo                                           | Casos | Finalidade                                                                             |
| ------------------------------------------------------ | ----- | -------------------------------------------------------------------------------------- |
| `src/features/transactions/backup.adversarial.test.ts` | 36    | Datas civis, limite de comando, igualdade campo a campo, ordenação e preservação       |
| `tests/restore-adversarial.spec.ts`                    | 13    | Lifecycle, erros/abort, rollback de requests executados, autocommit e regressões R1/R2 |
| `tests/restore-concurrency-adversarial.spec.ts`        | 5     | Quatro cenários concorrentes e preservação completa de campos                          |
| `tests/restore-download-adversarial.spec.ts`           | 3     | Falhas em Blob/ObjectURL/click, revogação e bloqueio da confirmação                    |

Além desses quatro arquivos, a revisão adicionou somente este relatório e `artifacts/revisao-a0-a1-evidencias.json`. O artefato contém resultados por caso das duas execuções E2E, anexos JSON com traces/reproduções, logs dos mutantes e das execuções restauradas e hashes dos 81 arquivos originais. Scripts temporários de mutação não fazem parte da entrega.

# Rollback

**Demonstrado em IndexedDB real** para falhas síncronas, erro nativo assíncrono e abort explícito, inclusive depois do success de clear, de adds intermediários e de settings.put. A leitura estrita e o reload recuperam o snapshot anterior integral. A matriz e a ordem dos eventos estão na seção Lifecycle IndexedDB; nenhuma mutação ficou aplicada.

# Safety snapshot

A captura lê as duas stores na mesma readonly, exige settings reais e valida roundtrip antes de iniciar o download. Troca de arquivo invalida a cópia anterior. A precondition relê e compara o estado dentro da própria readwrite, antes de clear; mudança detectada exige nova cópia. Exceções na criação/entrega do arquivo mantêm a confirmação bloqueada. O limite de comprovação do salvamento físico é RA-01.

# Verificação pós-commit

A comparação ocorre após complete e não escreve compensação. Falha deixa os dados novos persistidos, informa a fase verify e impede apresentar sucesso. A exceção reproduzida é **R1**: o fallback de load esconde settings ausentes quando o alvo contém defaults. **R2** revela adicionalmente que igualdade em memória não basta para garantir reexportação de metadados aceitos.

# Riscos aceitos

RA-01 registra o limite do download iniciado. Ensaios em Edge não certificam outros motores, perda elétrica ou durabilidade física. Não houve benchmark de arquivos grandes. Esses limites não foram convertidos em bugs comprovados nem em escopo adicional.

# Pendências A2

A2-01: controle de escritor/draft antigo após restore. A2-02: recuperação bruta de base previamente inválida. Ambos foram separados dos bloqueadores A1; nenhuma implementação A2 foi feita.

# Escopo excedido

Nenhuma feature ou alteração de produção foi introduzida por esta revisão. O workspace recebido já incluía alterações visuais, PWA, Three, dependências e documentação além de A0/A1. A revisão não permite atribuir esses hunks a A0/A1 nem recomenda commit indiscriminado do workspace; a limitação de baseline está registrada no início.

# Preservação do Git e checkpoint de encerramento

As 11 mutações terminaram revertidas, com teste do original passando. As quatro capturas alteradas pelos E2E foram repostas a partir das cópias exatas anteriores à revisão. Os **81/81 arquivos preexistentes têm SHA-256 idêntico ao estado recebido**, e o diff binário rastreado final é idêntico ao inicial. HEAD permanece `38c1563`; nenhum commit foi realizado. Nenhum teste antigo foi editado.

A retomada localizou o fechamento da suíte como única etapa pendente: análise e experimentos foram preservados. A repetição já em andamento de dashboard/PWA completou os casos afetados por timeout. Não foram repetidos os experimentos nem o mutation testing. Último ponto concluído: relatório, evidências e conferência de preservação. Mutation ativa: **NÃO**. Trabalho de revisão restante: **nenhum**; as correções de R1/R2 pertencem a uma execução separada.

# Bloqueadores de commit

1. **R1:** impedir sucesso de verificação quando `personal` não existe na leitura pós-commit.
2. **R2:** rejeitar overflow não representável nos campos adicionais do backup alvo antes de substituir o banco.

CAS, exportação bruta, aparelhos adicionais, benchmark, Worker, refactor e features futuras não são bloqueadores A1 deste relatório.

# Veredito

**BLOQUEADO — CORREÇÕES NECESSÁRIAS.**

**A0/A1 não deve ser commitado neste estado.** Corrigir os dois casos em execução separada, após revisão humana, e exigir que os testes de regressão passem junto da suíte existente. A implementação transacional de escrita pode ser preservada.

# Recheck das correções

22/09/2026. Recheck restrito aos bloqueadores R1/R2; o relatório acima e as evidências da auditoria original foram preservados como histórico.

**R1: CORRIGIDO.** A verificação pós-commit agora chama a leitura estrita `readForBackup()`. O teste adversarial original manteve a conexão concorrente que remove `personal`, confirmou ausência real e passou esperando `phase = "verify"`. O fallback global de load, a transação de escrita e seus eventos não foram alterados. Os testes de falha de leitura/mismatch mantêm a exigência de uma única substituição, sem compensação automática.

**R2: CORRIGIDO.** A validação percorre a árvore inteira antes das verificações específicas, incluindo campos conhecidos, adicionais, objetos e arrays. Qualquer número deve ser finito. Os oito campos monetários existentes e o discriminador `version` foram testados com `1e400` e `-1e400` reais no texto JSON. Metadata com overflow direto/aninhado/em array é rejeitada; Infinity/-Infinity/NaN também são rejeitados na entrada direta do validador. Metadata válida permanece preservada e reexportável após persistência e reload.

As expectativas das regressões originais R1/R2 não mudaram. Os mocks dos dois testes de verificação passaram de load para readForBackup porque o método anterior deixou de ser chamado nessa etapa; os asserts foram preservados. Foram acrescentados 26 unitários e 3 E2E. Nenhum mutation testing novo foi necessário.

## Validação desta correção

| Verificação                                             | Resultado                                        |
| ------------------------------------------------------- | ------------------------------------------------ |
| Backup unitário direcionado                             | 116/116                                          |
| Repository/adversarial direcionados em IndexedDB real   | 32/32                                            |
| `npm.cmd test`                                          | 221/221                                          |
| `npm.cmd run build`                                     | PASS                                             |
| TypeScript aplicação (`tsc -b`)                         | PASS                                             |
| TypeScript estrito dos testes/configuração              | PASS                                             |
| E2E completo                                            | 104/104, uma execução de aproximadamente 1,7 min |
| Prettier --check, superfície de src/tests/config/README | PASS                                             |
| git diff --check                                        | PASS                                             |

R1 original: PASS; R2 metadata 1e400 original: PASS; amount ±1e400 antes de transaction: PASS; demais campos numéricos, metadata aninhada/array e preservação/reexportação: PASS. Nenhum timeout na execução final nem caso ignorado. Não houve mudança de timeout/configuração, skip, only ou test.fail.

Os direcionados precederam a suíte completa. Os comandos de navegador usaram `PLAYWRIGHT_PORT=5198`, Edge e dois workers conforme configuração existente. Comandos: `vitest run src/features/transactions/backup.test.ts src/features/transactions/backup.adversarial.test.ts`; `npm.cmd run test:e2e -- tests/restore-adversarial.spec.ts tests/restore-repository.spec.ts --reporter=list,json`; depois `npm.cmd test`, `npm.cmd run build`, `tsc -b`, `tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM,DOM.Iterable` sobre todos os `.ts` em tests e playwright.config.ts, e `npm.cmd run test:e2e -- --reporter=list,json`.

A tentativa inicial sob sandbox foi impedida por acesso do esbuild ao vite.config.ts; a execução com permissão ampliada passou. Uma primeira execução direcionada também descobriu uma cópia temporária de teste usada para preservar o estado inicial; a cópia recebeu extensão não executável e os direcionados foram concluídos sem essa interferência. Nenhuma dessas ocorrências exigiu alteração funcional/configuração. Warnings preexistentes de chunks grandes e NO_COLOR permaneceram.

## Escopo e Git

Produção: somente `src/services/transactionRepository.ts` (uma chamada) e `src/features/transactions/backup.ts` (verificação de finitude). Testes: somente `src/features/transactions/backup.adversarial.test.ts`, `tests/restore-adversarial.spec.ts` e `tests/restore-repository.spec.ts`. Documentação: apenas acréscimos a `IMPLEMENTACAO-A0-A1.md` e a este relatório.

Não foram alterados lifecycle readwrite, ordem de requests, eventos complete/abort/error, rollback, precondition, algoritmo de safety snapshot, download, BroadcastChannel, datas, schema, stores ou database version. A2 não foi iniciado. Capturas regeneradas pelos E2E foram repostas aos bytes anteriores; os demais arquivos recebidos foram preservados. Nenhum commit foi executado.

**Bloqueadores R1/R2 restantes: nenhum.** O bloqueio histórico causado por esses dois achados foi resolvido neste recheck. Riscos aceitos e pendências A2 da revisão continuam documentados e não foram convertidos em escopo desta correção.
