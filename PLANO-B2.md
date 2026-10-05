# 1. Estado encontrado

Planejamento de 05/10/2026. **B2 NÃO IMPLEMENTADO. Proposta para aprovação, sem autorização implícita para executar migração.**

| Item                   | Evidência verificada                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Base oficial           | `0157797478ac27c8339444b604caaefd9e22dc95` — `docs: encerra fase B1`                                                                  |
| B1                     | `Dashboard-Financeiro-B1`, branch `plan/b1-money-dates-origin`; HEAD esperado, árvore limpa, staging vazio e FECHAMENTO-B1 versionado |
| Novo worktree          | `C:\Users\patai\OneDrive\Documentos\Dashboard-Financeiro-B2`                                                                          |
| Nova branch            | `plan/b2-workspace-local`                                                                                                             |
| Estado inicial B2      | HEAD exatamente na base oficial, árvore limpa e staging vazio; branch/diretório não existiam                                          |
| Principal              | Não utilizado para leitura de arquivos, edição, instalação ou testes; somente listado por `git worktree list`                         |
| Entrega desta execução | Somente PLANO-B2.md, sem staging/commit, instalação, suites ou implementação                                                          |

Fontes consultadas: ROADMAP-VERTICE-2-POS-A2, PLANO-B1 incluindo seção 24, FECHAMENTO-B1, IMPLEMENTACAO-B1A/B1B/B1C e código/testes do checkpoint. Prioridade: código/testes > roadmap pós-A2 > fechamento B1 > documentação histórica. DECISOES-VERTICE-2, ARQUITETURA-VERTICE-2-REVISADA e AUDITORIA-ARQUITETURA-VERTICE-2 não estão versionados/disponíveis neste checkout; não foram copiados do principal. Nenhum AGENTS.md aplicável foi encontrado.

Inventário real, não inferido:

| Área                 | Código/contrato atual                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Banco                | `src/services/transactionRepository.ts`: `indexedDB.open("vertice-finance", 3)`; Promise de conexão em cache                                 |
| Stores/índices       | `transactions`, keyPath `id`; `settings`, chaves externas; nenhum createIndex no repository                                                  |
| Configuração/revisão | `settings["personal"]`; `settings["__vertice_local_concurrency__"] = {protocol:1,revision}`; revisão inteira segura não negativa             |
| Bootstrap            | oldVersion 0 cria stores, settings reais/defaults e revisão 0, sem demo                                                                      |
| v1→v2                | Cursor migra account/category/destinationAccount para IDs; política histórica de createdAt/source; compatibilidade de stores existente       |
| v2→v3                | Valida snapshot, rejeita colisão de chave reservada, inicializa revisão 0 sem normalizar linhas v2                                           |
| v3                   | Metadata obrigatória; não reparar ausência/corrupção nem fabricar defaults                                                                   |
| Leitura              | snapshotRequests faz getAll de transações, get/count de personal e get/count de metadata na mesma readonly; aguarda complete                 |
| Writers              | save/remove/import/saveSettings/removeDemo/restore; write compara revisão e incrementa no mesmo RW com dados                                 |
| Restore              | Safety + revisão + sameBackupSnapshot, substituição atômica, verificação posterior de conteúdo/revisão, sem segunda escrita corretiva        |
| Backup               | `backup.ts`: JSON v2 raw; settings/transações, extras e metadados históricos preservados; sem revisão operacional                            |
| FinanceSnapshot      | DTO global `{transactions,settings}`, sem scope; FinanceSettings contém contas/categorias/metas/fixas                                        |
| Invalidations        | `useTransactions`: sequence, restoreVersion, BroadcastChannel vertice-updates/focus; App captura revision/version nas sessões                |
| Dirty                | Registro síncrono; editores mantêm token original e ficam readonly quando invalidados; retry não reativa automaticamente                     |
| Upgrade aberto       | onversionchange fecha conexão e limpa cache; onblocked marca tentativa abandonada; request nativo segue pendente e upgrade tardio é abortado |

Testes inspecionados: a2b-migration/concurrency/conflict-ui, local-read, repository/restore/restore-adversarial, helpers localData, dirty/PWA e smokes B1b/B1c. A2b já testa fechamento de conexão e VersionError após upgrade para 4, porém **não implementa nem prova a migration scoped B2**. Contagens 487 unitários/245 E2E/build PASS pertencem ao fechamento B1; não são novas execuções deste planejamento.

# 2. Escopo B2

Workspace local explícito, scoping, migração do snapshot global, fence persistente dos clientes v3 e uma única autoridade financeira gravável. Preparar User → Workspace → Mode com proprietário local implícito, sem cadastro. Uma inicialização válida produz um Personal implícito; workspace não exige tela de escolha.

Preservar A1/A2/B1, Money em c somente nos cálculos, R$ Number nos DTOs, datas civis, proveniência, atomicidade e CAS. Integrar somente os estados/identificação mínimos para migração, destino de restore e invalidation. Não transformar B2 em remodelagem financeira.

# 3. Fora de escopo

Login, User autenticado, memberships, permissões, Supabase/backend, cloud/sync, billing, Business/Investments, IA, conectores, histórico de orçamento, front premium/Three/P1, catálogo genérico, normalização de contas/categorias/metas, backup v3 e export multiworkspace. Não transportar trabalho visual preexistente.

Nesta execução não editar src/tests/package/roadmap/relatórios anteriores, criar migrations/DBs, abrir IndexedDB pessoal, instalar dependências, executar suítes ou implementar qualquer contrato abaixo. Worktrees principal/B1 ficam intactos.

# 4. Modelo Workspace

workspaceId UUID é gerado sincronamente por crypto.randomUUID dentro da versionchange, depois de validar/revalidar a fonte e antes dos adds scoped/manifest. Checar API/contexto seguro no preflight; ausência bloqueia com mensagem, sem ID por timestamp/Math.random. Não aguardar WebCrypto assíncrono dentro da transação. Somente o UUID comprometido é autoridade; tentativa abortada pode gerar outro ID no retry. Duas aberturas concorrentes não comprometem dois defaults.

Metadata do workspace em ["workspace",workspaceId]: workspaceId, mode personal e revision. Protocol/layout pertencem à authority, sem duplicação por workspace. ownerKind foi REMOVIDO: não tem consumidor atual nem semântica de autorização. Proprietário local é implícito ao perfil/origin; User/membership/associação futura ficam fora de B2.

Registry e CAS permanecem no mesmo store. defaultWorkspaceId persistido identifica o Personal inicial. Contexto ativo é do handle, não campo financeiro. Mode imutável desde criação; B2 não oferece CRUD/selector multiworkspace, mas prova isolamento com A/B sintéticos. [API UUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID).

# 5. Estratégias avaliadas

| Persistência                               | Custo/risco                                                                                                                    | Adequação e decisão                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| A: DB por workspace                        | Scope físico simples; várias conexões/versões, registry separado, promoção entre bancos sem transação conjunta, maior recovery | Possível com consumidor futuro; rejeitar como menor B2     |
| B: DB único, workspace em envelopes/chaves | Range por workspace, CAS atômico com metadata, upgrade/fence no mesmo commit; exige disciplina contra leituras globais         | **Recomendada**; facilita escopo futuro sem prometer cloud |
| C: stores por workspace                    | Criação de workspace exige upgrade exclusivo, fecha todas as abas, versionamento cresce por cadastro                           | Rejeitar; identidade não deve ser schema                   |
| D: registry central + DBs financeiros      | Multiplica dois protocolos e coordenação cross-DB; ainda precisa fence global                                                  | Rejeitar sem requisito concreto                            |

| Migração concreta                                        | Segurança/crash/old writer                                                                                            | Rollback, futuro e backup                                                                                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: mesmo DB, v3→v4, novos stores scoped e arquivo legacy | Transação versionchange une cópia, verificação e promoção; v3 não reabre após commit; blocked não promove             | Abort restaura v3; após commit não há downgrade; vários scopes por chave; JSON v2 por Personal                                                       |
| 2: novo DB scoped + fence v4 da origem                   | Copiar com v3 ativo perde writes entre cópia/fence; bump antes de cópia pode deixar fonte bloqueada e destino ausente | Para ser seguro precisa bloqueio exclusivo da origem, recópia final/versionamento, journal durável e recovery cross-DB; quota duplicada; maior custo |

Sentinela sozinha não bloqueia cliente v3, que nunca a consulta. Novo protocolo na metadata pode fazê-lo rejeitar comandos, mas requer mesmo bloqueio exclusivo para estabilizar cópia e compromete leitura/diagnóstico legado se substituir metadata válida. Nenhuma opção depende de BroadcastChannel para segurança.

# 6. Estratégia escolhida

**Um único IndexedDB `vertice-finance`, futuro v4; novos stores scoped e originais preservados como arquivo.** Não é necessário criar segundo banco nem um journal de promoção entre bancos.

Decisão de projeto, inferida das garantias da API e do código atual: realizar cópia/verificação/promoção dentro do upgrade exclusivo, em vez de copiar fora e tentar reparar a janela. Upgrade só começa depois do fechamento das demais conexões/transações. O commit publica schema/dados novos juntos; abort mantém a versão anterior. Abertura explícita de versão inferior falha. [Especificação IndexedDB: upgrade transactions](https://w3c.github.io/IndexedDB/#upgrade-transaction), [open database](https://w3c.github.io/IndexedDB/#open-a-database-connection).

O bloqueio temporário de writers durante o upgrade é reversível; **o fence persistente v4 só se torna efetivo no commit após verificar a cópia**. Fonte nunca é apagada. Essa escolha satisfaz uma autoridade gravável sem estados duráveis “destino válido, fonte ainda ativa”.

# 7. Modelo de persistência

Nomes propostos, congelar após aprovação:

| Store futuro                 | Chave/conteúdo                                                            | Papel                                                             |
| ---------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| scopedTransactions           | keyPath `["workspaceId","record.id"]`; `{workspaceId,record:Transaction}` | Identidade composta; record financeiro raw sem campo novo         |
| scopedSettings               | keyPath workspaceId; `{workspaceId,record:FinanceSettings}`               | Um agregado financeiro por workspace                              |
| workspaceMeta                | Chaves externas `"authority"` e `["workspace",workspaceId]`               | Layout/default/manifest de migração; registry/mode/revision       |
| transactions/settings atuais | Chaves/valores originais, sem alteração v3                                | Arquivo de migração, fora do caminho dos writers v4               |

Index `byWorkspace` em scopedTransactions, keyPath workspaceId, não unique: range `IDBKeyRange.only(workspaceId)` para load/export/restore; get/update/delete sempre por chave composta. Não adicionar índices temporais/catálogos sem necessidade. Nenhum getAll global seguido de filtro como proteção de scope.

Envelope evita sobrescrever extras históricos chamados workspaceId/mode dentro de record. DTO FinanceSnapshot continua financeiro; resultado do repository recebe scope separado. Arquivo legacy não é fallback gravável nem saldo alternativo. Browsers não oferecem ACL por store: read-only é contrato do código v4; fence de versões bloqueia especificamente os clientes publicados conhecidos, não JavaScript arbitrário da mesma origin.

**Um único schema físico v4, SEMPRE cinco stores:** scopedTransactions, scopedSettings, workspaceMeta, transactions (keyPath id) e settings (chaves externas), com os mesmos índices/keyPaths em fresh e migrated. Fresh cria os dois stores legacy vazios, scopedSettings defaults, workspace Personal UUID/revisão 0 e authority sourceVersion=0. Migrated preserva os dois originais intactos e authority sourceVersion=3. Ausência de qualquer store/índice/keyPath obrigatório é erro, nunca variante de bootstrap. Sem store por conta/categoria/meta.

Retenção: **MANTER TEMPORARIAMENTE**, por toda a fase/release B2, sem expiração nem limpeza automática. Consumidor concreto: diagnóstico readonly de origem, revisão e igualdade inicial, mais evidência independente nos ensaios de migration/recovery. Não é mecanismo de rollback nem recovery automático após writes v4. 90k fatos ficam duplicados no disco; a fonte torna-se stale após R+1. Retirada só em futura migration/versionamento explicitamente aprovada depois de ensaios/backup; B2 não agenda nem executa exclusão. Remover agora apagaria a evidência que este release pretende inspecionar; mantê-la para sempre também não é requisito.

Chave composta nested é admitida pela API; manter ["workspaceId","record.id"], sem transactionId redundante no envelope. Sem autoIncrement; ID ausente/inválido falha com DataError e abort. Edge real deve testar add/put, primaryKey do cursor, índice por workspace, duplicate key, structured clone/extras, restore e igualdade A/B. Compatibilidade normativa não substitui ensaio no navegador. [Key paths](https://w3c.github.io/IndexedDB/#key-path).

# 8. Autoridade gravável

| Estado                        | Durável?                                   | Quem pode gravar                                               |
| ----------------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| legacy-active                 | v3 válido                                  | Repository v3; nenhum handle scoped publicado                  |
| migration-in-progress         | Apenas execução da versionchange           | Migrador exclusivo; nenhum writer financeiro externo           |
| scoped-active / legacy-fenced | Um estado durável v4 com manifest coerente | Somente writers scoped v4; arquivo legacy não recebe writes    |
| recovery-required             | Erro diagnosticado                         | Nenhum writer da aplicação até validação/recuperação explícita |

Authority mínima em chave "authority": {layout:"scoped",protocol:1,defaultWorkspaceId,sourceVersion:0|3}. sourceVersion descreve a origem imediata do upgrade B2, não inventa a versão histórica anterior a A2. Fresh=0; migração de v3=3. Presença de archive é derivada de sourceVersion===3, não de existência dos stores (todos existem). Não persistir sourceRevision/sourceCount/status/fenced/hasLegacyArchive redundantes. Fence deriva da versão comprometida; revisão/count iniciais são lidos do archive preservado para diagnóstico. V4 sem authority/workspace válido falha fechado.

| Campo                 | Consumidor/invariante                                                      | Quando muda; derivação/staleness                                                              |
| --------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| layout + protocol     | Classificador valida contrato conhecido antes de ler/escrever              | Constantes B2; alteração exige migration futura, sem segunda flag de authority                |
| defaultWorkspaceId    | Bootstrap/hook encontra registro [workspace,id] e settings correspondentes | Só criação B2; sem selector/CRUD de default; não derivar de qualquer primeiro cursor          |
| sourceVersion         | Diagnóstico distingue archive migrado de stores fresh vazios               | Só criação, 0 ou 3; não muda com writes financeiros; em fresh ambos legacy devem estar vazios |
| workspaceId + mode    | Handle valida chave/identidade e modo Personal                             | Só criação; chave e valor correspondentes; sem owner fictício                                 |
| revision do workspace | CAS/read/write atômicos                                                    | Incrementa por comando; R inicial migrado ou 0 fresh, sem cópia na authority                  |

Não usar localStorage como autoridade; metadata não vira segundo snapshot. Os campos financeiros ficam somente scopedSettings/records. Retirada futura do archive exigirá rever sourceVersion e seu consumidor, não inferir ausência como instalação nova.

Uma autoridade significa uma base/layout atual para os fatos; durante migração pode haver zero writers de usuário. Futuras instâncias A/B compartilham base, mas fatos/CAS são independentes. O arquivo antigo permanecer contendo o snapshot inicial não significa autoridade concorrente.

# 9. Fence do writer v3

Escolha: **bump atômico do mesmo banco para v4**, acompanhado de manifest de diagnóstico. Fonte v3 atual abre com versão explícita 3 e fecha/cache invalida no onversionchange. Cliente já aberto drena transações anteriores; somente então a cópia começa. Depois, reabrir 3 resulta VersionError; usar conexão fechada falha antes de iniciar nova transação. Cliente que recusa fechar gera blocked e impede promoção, não dois writers.

Obrigatório comprovar isso com bundle real de `0157797`, incluindo save/remove/import/settings/removeDemo/restore, reload e worker antigo. Não modificar o cliente antigo nos testes para que respeite um flag novo. Transação v3 que concluiu **antes** do upgrade deve estar na cópia; tentativa **depois** deve falhar e não alterar sequer o arquivo legacy.

Sentinela documenta migrado e direciona recuperação; não é o fence de segurança. Não baixar versão, deletar banco, limpar stores nem abrir v3 via wrapper que oculta VersionError. Cliente futuro abre versão suportada explicitamente e rejeita versão maior; ferramenta de diagnóstico abre versão atual somente readonly. [Semântica de abertura](https://developer.mozilla.org/en-US/docs/Web/API/IDBFactory/open).

# 10. Fluxo de migration

Futura implementação, somente após aprovação:

1. Probe de diagnóstico pode abrir sem versão somente readonly: abortar onupgradeneeded oldVersion=0 para não bootstrapar acidentalmente. Fechar sempre a conexão de probe depois da readonly/classificação, inclusive em erro; onversionchange fecha/cache invalida. Nunca reutilizá-la como writer. Validar schema/versão, não preencher corrupção. Fresh abre explicitamente 4 e cria o schema uniforme/defaults. V4 existente abre explicitamente 4 e valida authority, sem copiar legacy.
2. **Política B para v1/v2: abrir explicitamente 3, executar exatamente o migrador histórico A2, aguardar commit/open success, fechar, e só depois iniciar preflight e open(4).** Não chamar open(4) em v1/v2 e presumir eventos separados. Cliente B2 não entrega handle/writer/UI financeira durante a etapa v3; clientes antigos podem operar no intervalo e serão revalidados. Abort A2 mantém v1/v2; A2 comprometido + abort B2 deixa v3 válido, como única autoridade. Não backfillar source/createdAt em v3.
3. Preflight readonly v3 coerente: validar snapshot+CAS, gerar JSON v2 e validar roundtrip. Iniciar download e exigir confirmação explícita de que o usuário guardou a cópia. Isso é declaração do usuário, não prova de gravação física; safety adicional à preservação/atomicidade. Cancelamento, erro de geração/download ou ausência de confirmação bloqueiam o pedido. Ensaio de release deve obter/reler o arquivo e restaurar em destino isolado; não afirmar que a aplicação comprova isso em cada dispositivo.
4. Aplicar dirty/busy guard da própria aba, fechar preflight, pedir open(4) com identidade própria da tentativa. Protocolo de cancelamento abaixo. Nada de handle scoped antes de commit e validação.
5. Para fonte existente v3, dentro da versionchange exclusiva conferir fonte/stores, reler raw+R, validar e comparar com safety. Fresh oldVersion=0 não lê fonte/CAS/safety inexistentes: valida criação nova e prepara zero fatos/defaults/R=0, seguindo depois a mesma verificação/commit. Mudança após preflight aborta para nova safety. In-flight v3 já drenado compõe a fonte; não se perde write confirmado.
6. Só agora gerar UUID síncrono e criar os três stores scoped/índice. Em migrated manter ambos legacy intactos; fresh cria também legacy vazios. Colisão de nomes reservados/schema aborta, sem substituir stores. add das linhas/envelopes raw; sem Money/datas/timestamps novos nem migração de unknown settings keys para finanças.
7. Encadear requests dentro de callbacks ativos. Esperar sucesso de TODOS os adds antes de verificar destino. Verificar keys, scope, contagem e igualdade raw completa por ID/campos/extras/settings/referências, usando validação atual sem normalizar. Não depender de totais (podem dar overflow) nem de hash sozinho. Cursor pode verificar por chave contra a fonte preservada sem materializar dois arrays completos.
8. Após barreira de sucesso da cópia e verificação, adicionar workspace metadata com R e authority mínima. Esperar seus requests também. Toda falha de validação/request/quota aborta a mesma transação; não suprimir erro com preventDefault para permitir commit parcial. catch em callbacks deve chamar tx.abort, nunca apenas registrar/retornar deixando commit automático. Exceção não capturada no evento de request/upgrade é caminho de abort pela API e será ensaiada; exceção em complete/open success é pós-commit e não reverte dados.
9. Nenhum handle se publica por request individual. Após open success (upgrade comprometido), fechar/reabrir explicitamente 4 e validar em readonly coerente. R ainda igual: verificar igualdade inicial; R maior por outro cliente: validar estado corrente sem comparar com archive stale; R menor/inválido: recovery. Falha de callback/app antes de reabrir deixa v4 íntegro, que próximo cliente valida.
10. Operar apenas scoped, mantendo archive readonly para diagnóstico. Outro cliente já pode validar/escrever depois do commit; não inventar lock global até primeira aba reabrir. R=MAX segue política readonly da seção 12.

## Cancelamento mínimo da tentativa de abertura

IDBOpenDBRequest não possui abort/cancel. onblocked informa e marca a tentativa cancelled; rejeita resultado da aplicação, mas mantém listeners até request nativo terminar. Cancelar pela UI/timeout antes do commit tem a mesma marca. Guardar currentAttempt por identidade/generation, não somente boolean global.

- late onupgradeneeded: se cancelled ou tentativa não atual, abortar request.transaction imediatamente, antes de UUID/criação/cópia; durante callbacks de migration voltar a conferir abandono e abortar enquanto transação ainda ativa.
- late success: se cancelled/não atual, fechar request.result e não publicar/cachear handle. Se cancelamento chegou depois do commit, v4 pode estar comprometido: não prometer rollback, classificar estado durável no próximo pedido.
- onerror/onabort/finalização: limpar cache/estado somente se pertence à mesma tentativa; evento velho não limpa retry novo. Finalizar/rejeitar uma vez, preservando a causa.
- retry é explícito, nova identidade e novo preflight/safety quando necessário. Request abandonado pode continuar na fila até outras conexões fecharem; não alegar liberação imediata da fila. Testar blocked→cancel→fechamento 5s depois, ausência de upgrade tardio, late success sem handle e corrida com retry.

Dois open(4) são serializados: se primeiro compromete, segundo elegível abre mesma v4 sem onupgradeneeded e lê mesmo UUID. Se segundo foi abandonado/blocked, fecha em late success; usuário deve retry. Se primeiro aborta, outro elegível pode migrar após revalidar sua safety; só UUID finalmente comprometido importa.

Sem await de download/timers/rede/Promises externas durante upgrade. crypto.randomUUID é síncrono; WebCrypto assíncrono não é usado. [Interface de open request](https://w3c.github.io/IndexedDB/#request-api), [algoritmos de upgrade](https://w3c.github.io/IndexedDB/#upgrade-a-database).

# 11. Crash matrix

| Boundary/falha                       | Origem                                            | Destino                                                       | Writer permitido / reload                                             | Retomada e rollback                                                                   |
| ------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Antes da criação/cópia               | v3 válida                                         | Ausente                                                       | Só v3; B2 pendente                                                    | Repetir preflight/safety                                                              |
| Após safety, antes upgrade           | v3 pode mudar                                     | Ausente                                                       | Só v3                                                                 | Mudança aborta pedido; nova safety, sem perder write                                  |
| blocked por aba antiga               | v3                                                | Ausente                                                       | Só legacy; scoped não publicado                                       | Marcar abandono; abortar late upgrade; fechar late success; retry explícito           |
| Após início/antes criação stores     | v3 no estado comprometido; conexão antiga fechada | Nenhum comprometido                                           | Durante upgrade nenhum externo; reload após abort v3                  | Reabrir legacy sem reparar dados, repetir                                             |
| Durante copy                         | v3 preservada                                     | Parcial não comprometido                                      | Nenhum externo; abort retorna v3                                      | Transação reverte cópia/schema, sem append duplicado                                  |
| Depois copy antes verify             | v3 preservada                                     | Completo não comprometido                                     | Igual ao anterior                                                     | Verificar ou abortar integralmente                                                    |
| Depois verify antes manifest/fence   | v3 preservada                                     | Verificado não comprometido                                   | Sem scoped publicado                                                  | Não existe promoção separada; abort mantém v3                                         |
| Durante manifest/fence/commit        | Resultado transacional v3 OU v4 coerente          | Nenhum parcial comprometido                                   | Reload classifica versão+manifest                                     | V3 retoma; v4 valida/reabre; nunca assumir pelo último evento JS                      |
| Depois fence antes promote           | Boundary durável eliminado                        | Scoped+manifest já juntos, v4                                 | Legacy bloqueado; v4 só após validação                                | Reabrir v4; não baixar versão                                                         |
| Depois promote antes reopen          | Arquivo legacy v4                                 | Scoped comprometido, possivelmente com writes v4 concorrentes | Nenhum handle publicado nessa aba; outras abas podem validar e operar | Reload valida versão/scope/revisão atual; igualdade inicial só com R ainda inalterado |
| Depois scoped com novos writes       | Arquivo do momento R                              | Scoped revisão ≥R                                             | Somente scoped                                                        | Nunca restaurar arquivo inicial automaticamente                                       |
| Quota/request/exception antes commit | v3 integral                                       | Não comprometido                                              | Legacy após abort; nenhum scoped                                      | Liberação de espaço e nova safety/retry                                               |
| V4 committed, destino inválido       | Legacy preservado como evidência                  | Inválido                                                      | Recovery readonly, sem fallback writer                                | Camada de falha/diagnóstico readonly; backup válido em perfil isolado                 |

Barreira copy→verify→metadata exige sucessos observados, não apenas requests enfileirados. Manifest enfileirado enquanto último add falha não pode autorizar commit. Ensaiar falha no último add, exception uncaught no evento, catch que aborta explicitamente, e crash físico durante versionchange. Resultado observável normal após restart é v3 integral ou v4 coerente; armazenamento perdido/corrompido exige recovery, não promessa absoluta contra disco/eviction. Se request success chegou mas app fechou antes de reopen, v4 já comprometido permanece válido. Cancelamento pós-commit não desfaz promoção.

Abort antes do commit preserva alterações e versão anteriores; confirmar versão após reload no teste, não pelo contador local. [IDBTransaction.abort](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/abort). Commit de schema não é promessa de imunidade a falha de disco/eviction do navegador; backup continua necessário. Rollback permitido antes do commit é abort; depois é forward fix compatível com v4 ou recuperação explícita preservando evidência, nunca downgrade/reset.

# 12. CAS/revision

Revisão por workspace, armazenada em workspaceMeta. Workspace migrado começa com a revisão R existente; fresh começa em 0. Migração não é uma edição financeira e não consome R; primeiro writer scoped incrementa R+1 quando R ainda admite incremento seguro (limite abaixo). Copiar o número não significa revisão global entre bancos, servidor ou scopes.

Precondition financeira: workspaceId + expectedRevision; comando também exige vínculo efêmero com handle/lease original (seção 13), não aceita apenas o par reproduzido. LocalRead/WriteReceipt carregam workspaceId e revision fora do FinanceSnapshot/backup. Handle de repository é criado para um scope imutável; writer rejeita token sem scope, scope divergente, modo não suportado ou revisão inválida. Não buscar revisão atual implicitamente quando token faltar.

Transação RW inclui scopedTransactions, scopedSettings e workspaceMeta: ler authority/workspace/settings/linhas do scope; validar; conferir token; aplicar mudança; incrementar registro CAS desse workspace. Create usa add composto; update/delete exigem existência composta. No-op mantém consumo de token A2b; erro/overflow de revision aborta sem consumo.

Restaurar A altera somente revisão A, nunca B. Mesmo ID/revision em B não autoriza token A. IDs de workspace nunca reutilizados; geração persistida não é necessária neste escopo. Lease opaca é obrigatória para identidade de sessão, separada da revisão persistida; não criar geração financeira universal. Futuro reset/recriação de identidade exigirá decisão específica.

**R=0/17/MAX_SAFE_INTEGER:** migration preserva exatamente R. Com 0/17, próximo writer produz 1/18. Com MAX, migration pode concluir e leitura/export continuam; workspace fica readonly por esgotamento de revisão, com mensagem específica e TODOS os seis writers bloqueados antes de mutação (inclusive restore/no-op). Não classificar como corrupção, resetar R, consumir incremento inseguro ou usar archive como writer. Recuperação opcional é export financeiro válido e restore consentido em Personal novo de perfil/origin isolados, com identidade/revisão próprias; não reset do workspace existente. Fixture MAX cobre antes/depois migration e bloqueio dos seis writers.

# 13. Sessions/invalidation

Capturar workspaceId, revision, handle imutável e lease opaca própria da sessão na abertura de editor/import/settings/restore. Scope não pode ser resolvido novamente pela variável “active” ao concluir operação assíncrona. Troca/fence/recovery/restore invalidam a sessão, mantêm inputs/draft em readonly e revogam seu handle/lease; retry readonly não libera gravação nem renova revisão.

Novo hook recebe repository scoped explicitamente; cache de conexão física não se confunde com scope. Sequence/lease descartam callbacks de handle antigo; disposal é definitivo, inclusive A→B→A. Lease é referência/capacidade runtime ligada ao handle original, revogável e não derivável de workspaceId/revision. Repository novo A não aceita lease emitida pelo antigo A, mesmo com R=3 igual. Comandos/closures assíncronos conservam o handle original; nunca reenviar payload/token antigo ao repository global ativo nem reconstruir lease por seus campos. Guard runtime valida identidade do emissor e estado ativo antes de enfileirar e na transação antes da primeira mutação; CAS/scope validam dados separadamente. Não serializar/structuredClone a capacidade opaca como se fosse precondition financeira. Não é autenticação contra scripts da origin.

Testes A→B→A conservam A/R idênticos: velho token+lease rejeitados por novo A, callback velho não pode emitir lease nova, antigo handle disposed rejeita mesmo fora do hook. Resposta de save/restore já comprometido no A original não pode atualizar UI do novo A/B. Versão de sessão muda na troca/invalidation, não só quando número de revisão muda. Verificar lease antes de enfileirar e no callback transacional antes da mutação. Write já linearizado antes da invalidation pode concluir no scope original; confirmar essa ordem, sem alegar cancelamento retroativo de commit.

Versionchange no cliente novo invalida writer e fecha conexão sem recarregar/desmontar draft sujo. Cliente B1 antigo não recebe novo código: fence funciona mesmo sem avisá-lo; seus guards A2c atuais devem manter conteúdo quando comando falha. BC/focus avisam/releem metadata, sem autoridade; não tornar perda do evento um bypass. Restore de outro scope não invalida A por engano.

# 14. Transactions/referências

Persistência scoped usa envelope e chave composta; Transaction.id continua string original dentro do workspace. A/id-x e B/id-x são permitidos, sem colisão. Record não recebe workspaceId/mode por spread nem nova origem. DTO entregue a calculadores permanece financeiro.

Referências accountId/categoryId/destinationAccountId são locais ao mesmo FinanceSettings carregado pelo handle. Validar destino/tipo/existência ali; nunca resolver conta/categoria por busca global. Transferência A→B workspace é rejeitada: B2 suporta transferência entre contas do mesmo workspace, não entre domínios.

Um payload com accountId x pode ser válido em A e B; a identidade semântica é (workspaceId,x). Por isso token/handle importam mesmo quando strings coincidem. Referência externa opaca/namespace B1 permanece documental; não converter IDs para Number nem implementar matching.

# 15. Settings/metadata

Um FinanceSettings completo por workspace em scopedSettings. Contas/categorias/metas/fixas não precisam stores próprias: há consumidor real da separação de scope, não da normalização financeira. Preservar extras e raw subcentavo, B1 validators e JSON v2.

workspaceMeta separa finanças de registry/CAS/authority. Chave personal e CONCURRENCY_KEY antigas ficam intactas em settings arquivo; não migrar chaves desconhecidas para finanças nem destruí-las. Leitura nova valida presença real do registro scoped e metadata; não defaultar em corrupção. DefaultSettings só em bootstrap realmente novo.

# 16. Mode

Registro do workspace contém mode personal; imutável desde criação, regra mais simples que detectar “primeiro uso”. Não oferecer mudança de modo sobre dados existentes. Legacy migra para personal sem inferência por conteúdo. Handle valida modo; enum/API B2 aceita apenas Personal com consumidor atual.

Business/Investments futuros exigirão workspace próprio, contrato/layout/versão e aprovação; não reaproveitar snapshot Personal por toggle. OwnerKind adiado/removido do schema B2; futura associação precisa consumidor e contrato próprios. Login futuro não adota dados, não troca autoridade e não cria remote revision automaticamente.

# 17. Backup v2

**PRESERVAR JSON v2 para UM workspace Personal explicitamente selecionado pelo fluxo.** Arquivo mantém version 2, exportedAt, settings e transactions em R$, incluindo metadados históricos/extras; não acrescentar scope obrigatório, revisão, Money/BigInt ou novo enum. Não exportar conjunto A+B no mesmo v2.

Scope existe no contexto do export, filename/preview e LocalRead, não prova a identidade de origem dentro do arquivo. Limite essencial: v2 não contém workspaceId, então **não permite detectar automaticamente se um arquivo veio de A ou B**. Restaurar exige destino explícito e confirmação de substituição; informar origem não declarada. Nenhuma promessa de prova de autoria/identidade que o formato não oferece.

Arquivo pode ser restaurado conscientemente em outro Personal como cópia completa; não remarca source como import nem carrega permissões. Fluxo só aceita o destino fixado na abertura; troca invalida safety/operação. Export financeiro raw não consulta Money derivado, permitindo snapshot válido com agregado em overflow.

# 18. Restore

Preservar A1: parse/preview determinísticos, safety do workspace destino e entrega da cópia antes da confirmação, comparação CAS+raw, substituição atômica scoped e verificação pós-commit de revision/conteúdo.

Safety inclui scope+revision no contexto em memória, sem mudar JSON v2. onRestore fecha sobre handle original; destino exibido/confirmado pelo usuário e não trocado por activeWorkspace global. Rejeitar divergência entre sessão/handle/lease/safety/token/destino, mesmo se A/B tiverem snapshot/revisão iguais; NÃO existe mismatch de origem detectável no conteúdo do arquivo v2. Sem identificação no v2, confirmação autoriza substituir esse destino, não afirma origem do arquivo.

Eliminar somente linhas do range byWorkspace do destino, nunca `scopedTransactions.clear()` global. Settings.put apenas chave destino; CAS incrementa workspace destino na mesma RW. Pós-commit reler pelo mesmo handle; se falha, readonly/recovery sem restore compensatório. Outras abas do mesmo scope invalidam drafts; demais scopes conservam estado. Metadata/registry/mode não são restaurados do arquivo financeiro.

# 19. Recovery

| Caso                               | Política planejada                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fonte v3 válida/destino ausente    | Preflight+safety e upgrade atômico; nunca dois handles                                                                                                   |
| Destino parcial após falha         | Não deve persistir na estratégia escolhida; v3 após abort. Se v4 parcial existir, corrupção/layout desconhecido: bloquear, não completar silenciosamente |
| Destino válido/origem não fenced   | Não é estado legal v4; em segundo DB inesperado, não escolher por versão/data/totais; diagnóstico sem autoimport                                         |
| Origem fenced/destino inválido     | Recovery, arquivo preservado; sem reabrir legacy writer/downgrade                                                                                        |
| Duas bases aparentemente ativas    | Recusar decisão automática quando um conflito conhecido for detectado; não enumerar/apagar bases arbitrárias. Produção B2 não cria segundo DB            |
| Falta de espaço                    | Abort, versão/dados anteriores preservados; informar, safety e retry explícitos                                                                          |
| VersionError no velho              | Resultado esperado de fence; atualização orientada com dirty guard, sem reparar versão                                                                   |
| VersionError no novo/versão futura | Não suportado: readonly/diagnóstico; não reabrir sem versão como writer                                                                                  |
| blocked/aba antiga                 | Marcar tentativa abandonada, abortar late upgrade/fechar late success, retry explícito; request nativo não cancelável                                    |
| Metadata/settings inválidos        | Bloquear sem defaults; preservar base, orientar recuperação em perfil isolado com backup válido                                                          |

**V4 comprometido + scoped inválido + legacy válido:** mostrar versão e camada que falhou (schema/authority/workspace/settings/fatos), preservando evidência e draft; não mostrar finanças legacy como snapshot corrente. Leitura diagnóstica opcional do archive identifica sua revisão/contagem e validade, rotulada histórica/stale, sem dump raw novo. Não criar recovery handle privilegiado nem autorizar restore normal no mesmo workspace inválido: A1 exige safety válido do destino e essa condição não pode ser fingida. Orientar restauração de JSON v2 previamente validado em perfil/origin isolados e novo Personal válido, com confirmação/safety desse destino. Sem backup válido, parar em diagnóstico/suporte, sem promessa de recuperar todos os dados. Forward fix só futura entrega auditada; nunca auto-recopiar archive, gravar no legacy ou preencher defaults.

Quota/uso de StorageManager são apenas estimativas; não provar capacidade em bytes antes da operação. Manter espaço para cópia/arquivo e journal interno; falha quota é tratada por abort. [StorageManager.estimate](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate). Não autoapagar fotos/dados/cache ou pedir reset. Não criar dump genérico/reconstrução automática de corrupção como subprojeto B2.

# 20. Import

Preview, mapeamento, validações, lotes, dedup e corte B1 são do workspace capturado ao abrir. Sessão fixa settings/snapshot/revision/scope/handle; mudar destino invalida conclusão, mantendo draft para consulta/correção sem writer.

Lote atômico no range escolhido. Assinatura dedup compara apenas fatos desse workspace; mesmo lançamento em A não elimina import em B. IDs/account/category iguais em A/B são fixtures obrigatórias. XLSX época/date1904 continua efêmera, source import e Instant do lote preservados; B2 não amplia M06.

Arquivo grande/file.text/ExcelJS são fronteiras externas: após retorno, verificar sessão/handle antes de criar comando. workspaceId+revision cobrem precondition financeira; lease opaca vinculada ao emissor cobre sessão A→B→A, sem formato/geração persistidos novos. Verificar também identidade antes de publicar resultado na UI.

# 21. Multi-tab/PWA

Duas abas novas migram pelo mesmo upgrade serializado e chegam ao mesmo UUID comprometido. Uma não gera workspace extra ao receber v4 após a outra. Duas abas no mesmo workspace concorrem por CAS; em scopes diferentes não misturam dados, mesmo com revisão numericamente igual.

BC pode carregar workspaceId/tipo/revision como aviso, nunca liberar gravação. Focus relê authority+scope; resposta atrasada não substitui snapshot de outro handle. Worker antigo serve assets antigos mas o bundle v3 continua fenced; não usar versão SW como prova de versão de dados.

Guards A2c antes de update/reload/pedido de migration na aba atual. Outra aba não pode ser obrigada a perder draft; versão antiga que não fecha impede upgrade. Sem fechar à força, reload automático ou BC obrigatório. Após commit, cliente antigo falha mesmo com BC suprimido. Ensaiar conexão recusando versionchange e cliente publicado que fecha normalmente.

# 22. Versioning

**Futuro `vertice-finance` v4; nenhum novo database.** Protocol scoped 1 é contrato de metadata, diferente de DB version e backup v2. Versão atual continua 3 nesta execução documental.

v1/v2 abrem explicitamente 3 pelo migrador A2; commit, close, preflight/safety e só depois abertura explícita 4. Frontend B2 não publica writers durante estágio v3. Abort de primeira etapa mantém v1/v2; primeira etapa comprometida mas B2 abortado deixa v3 válido como única autoridade. Fresh bootstrap v4 tem workspace/revisão 0 sem arquivo migrado; versão ≥4 conhecida abre/valida sem reler/reaplicar legado.

V5 futura deve manter barreira de clientes v4 e manifest/schema coerentes. Não fazer rollback de frontend para B1 gravável após v4: ele falha fechado; lançar correção forward compatível. Restore v2 restaura finanças no layout atual, não DB version/protocolo.

# 23. Golden cases

| Fixture                                             | Assert planejado                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| V3 vazio válido                                     | Personal/defaults existentes, R preservado, um UUID estável, zero fatos; diferente de settings ausente   |
| Uma transação/várias contas/categorias/metas/fixas  | Igualdade raw de todos campos/settings e mesma semântica B1                                              |
| Transferência                                       | IDs/pernas/destino preservados; não receita/despesa; saldos/total ordinários iguais                      |
| Source/createdAt ausentes ou explícitos/offset      | Sem backfill e nenhuma perda de extras, inclusive extras chamados workspaceId/mode                       |
| Settings R$1e-8, ruído tolerado                     | Raw igual, sem zerar; derivados Money podem permanecer indisponíveis                                     |
| R=17 e R=MAX_SAFE                                   | Migration preserva R; next normal=18; limite continua bloqueando writers sem repair                      |
| A/B com transaction/account/category id x e R igual | Keys/scopes distintos, CAS independente, token A rejeitado em handle B                                   |
| Backup v2 e restore/export                          | Um Personal por arquivo, ausência de metadata operacional; safety/destino corretos                       |
| 90.072 fatos/soma overflow                          | Migration raw não calcula total obrigatório nem recovery monetário; contagem/igualdade e export intactos |
| Source inválido/missing settings/corrupt metadata   | Abort/recovery, fonte e versão preservadas, sem defaults                                                 |
| Unknown settings keys                               | Arquivo intacto; não entram como finance settings nem desaparecem                                        |
| v1/v2 históricos                                    | Mesma transformação A2 existente, uma vez; depois equivalência v3→scoped sem nova síntese                |
| Mudança depois safety                               | Abort e nova safety; write antigo comprometido não perdido                                               |

# 24. Testes planejados

Não executados nesta fase. Antes de implementar: instalar lockfile existente somente no worktree B2 quando autorizado; repetir baseline `npm.cmd test`, `npm.cmd run build`, `npm.cmd run test:e2e`. Não copiar node_modules/arquivos sujos do principal. Lint/typecheck dedicados não existem; build inclui tsc -b. Checks finais incluem git diff --check e formato somente nos arquivos autorizados.

Unitários: constructors/workspace/mode, keys/envelopes/referências, tokens e lease disposal, manifest/classificação, fixtures/equivalência raw. Money/civil/backup/validation B1 permanecem goldens, sem alterar resultado para acomodar scoping.

Navegador real IndexedDB: nova instalação/v1/v2/v3, valid/invalid/blocked/quota/VersionError, rollback de schema/dados, retry idempotente/UUID estável, scopes A/B, seis writers e CAS, export/restore/import e snapshots entre transações. Incluir write v4 de outra aba entre commit e reabertura: dado novo permanece, sem falsa divergência com arquivo R nem recópia. Harness adapta seed/raw readers aos stores scoped; não confundir alteração de infraestrutura de teste com relaxamento de asserts.

Fault injection em cada boundary da seção 11: antes criação, durante copy, após copy/antes verify, verify/fence, durante manifest/commit, commit/reopen e primeira leitura. Abort em callbacks testa rollback. Crash real fechar página/contexto/processo durante requests testa restart: final permitido v3 integral ou v4 coerente. Novo BrowserContext vazio não simula recovery da mesma base; usar contexto/perfil temporário persistente do ensaio, nunca perfil pessoal. Não fabricar estado impossível e chamá-lo crash natural; corrupção artificial tem recovery separado.

**Old-writer obrigatório:** artefato reproduzível extraído por git archive do checkpoint completo 0157797478ac27c8339444b604caaefd9e22dc95 em diretório temporário isolado (não novo worktree nem alteração B1/principal). Na implementação autorizada, npm ci com package-lock daquele commit no temporário e build de harness/cliente daquele source, registrando hash do commit, lock e checksum do bundle. Saída/cache no temporário. Não importar repository atual por tests/helpers/localData e chamá-lo B1; esse helper resolve source corrente. Servir assets/harness antigos sob mesma origin/base IndexedDB do cliente novo, em páginas com globals independentes; também ensaiar bundle/PWA antigo real. Dependências/artefatos históricos devem ser reproduzíveis antes de claim; indisponibilidade bloqueia certificação. Abrir duas páginas da mesma origin e BrowserContext. V3 mantém conexão e drafts; cliente novo prepara safety e migra. Executar, no bundle antigo, save/remove/import/saveSettings/removeDemo/restore e load após commit/reload: todos falham sem modificar fonte ou destino. Assert VersionError/connection closed e hashes/equivalência raw/revisions. Repetir com BC desligado e worker/assets antigos. Transação v3 em curso deve concluir antes da cópia e aparecer no destino.

Inventário de queries (origem B1): getAll transactions em snapshotRequests (linha 270); count personal/metadata (273/275); clear global só restore (419); delete por id em remove/removeDemo (471/521); cursor v1→v2 (177). Todos reads/writes scoped passam a range/key explícitos; count/get de settings/meta usam chave do destino. Cursor histórico permanece só etapa A2. Não basta proibir clear: getAll/delete/cursor/count globais também são gates. Para CADA save/remove/import/saveSettings/removeDemo/restore em A, fixture B com mesmos IDs/revisão deve manter byte/conteúdo raw/settings/revisão iguais, inclusive falha/quota; read/load/export de A nunca inclui B.

Controle negativo: raw connection v3 que ignora versionchange impede upgrade; timeout/blocked cancela e não promove tarde. Liberar conexão e retry explícito migra uma vez. Teste concorrente de dois clientes novos não duplica workspace. Sensibilidade somente em bundle isolado: retirar filtro de scope/fence deve fazer asserções de isolamento/old writer falharem; nunca mutar source publicado.

Regressão completa A1/A2/B1 e smokes de same-tick/route/modal/beforeunload/PWA, revisão original, draft em foco/meia-noite e troca/fence. Restaurar A não limpa B; import/file/safety pendentes A→B→A não completam no destino atual. Nenhum novo skip. Edge baseline é necessário; claims Safari/mobile requerem ensaio próprio antes de distribuição nesses ambientes.

# 25. Findings

| Finding             | Responsabilidade B2 / gate                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 arquitetural    | Ainda não resolvido por este plano. Fechar com upgrade/fence real do escritor v3, atomicidade, equality e old-writer/crash tests; diferente dos C01/C02 de A2c |
| H08                 | Contrato B1 preservado; scope/revision entram na composição/handle; acabamento/contexto final permanece P1                                                     |
| M01                 | A2c dirty preservado; testar compatibilidade release/schema/assets e versionchange sem descarte                                                                |
| M07                 | Recovery local atravessa layout scoped/upgrade; sem alegar RPO/RTO cloud                                                                                       |
| H06/H03/H07/M06/L01 | Preservar statuses B1: Money resolvido atual, leitura preservada, proveniência mitigada, XLSX parcial, vocabulário P1                                          |

C02/H05/H13 Business, H09/H10 cloud, H11 sync e H12 IA não entram. Planejamento não fecha finding nem substitui teste.

# 26. Divisão de implementação

**Três commits futuros**, sem promoção no commit intermediário. A afirmação anterior de que três necessariamente criariam layout promovido com integração global foi rejeitada: engine dormente não abre v4 pelo App. Dois commits concentrariam migration/repository/seis writers/UI/sessions/recovery/restore e todos os testes num B2b excessivo para revisão.

| Commit                                              | Escopo e consumidor                                                                                                                                                    | Gate/caminho de produção/rollback                                                                                                                                                                                                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B2a — contratos/types/keys                          | Tipos mínimos, envelopes/chaves, authority e preconditions/lease; unitários reais de contratos                                                                         | App/repository v3 intactos; sem bump/upgrade chamado. Nenhum framework/workspace fictício ou módulo sem teste consumidor. Revert só código                                                                                                                           |
| B2b — engine de storage/migration/repository scoped | Engine v4 não ativada no App; readers/seis writers scoped, CAS, algoritmo de migration/cancel/verify; testes browser A/B, crash e old-writer exercitam fábrica isolada | Produção continua usando repository/open v3; novo engine consumido pelo harness/testes, sem import com efeito colateral, fábrica pública global alternativa ou feature flag genérica. Nenhum bootstrap v4 no mount/App/SW. Revert código sem DB de usuário promovido |
| B2c — integração/ativação e fechamento              | Hook/App, sessões/lease, import/export/restore, recovery e mensagens/BC/dirty/PWA mínimos; somente agora selecionar engine v4 no caminho de produção                   | Ativação só com seis writers/restore e invalidation integrados, regressão completa e gates old-writer/crash/performance/backup verdes. Depois promoção real, rollback somente forward compatível                                                                     |

Restore transacional scoped é parte do engine B2b; fluxo/consentimento/safety e callbacks de UI integram B2c. Evitar duas autoridades públicas concorrentes: testes invocam engine isolado explicitamente, aplicação publicada B2a/B2b invoca somente v3. Sem release B2b que faça promotion nos dados pessoais. Cada commit deve ser revisável/testável com consumidores presentes; divisão é plano, não autorização de implementar/commitar nesta revisão.

# 27. Critério de entrada

B1 oficialmente selado, worktree B2 limpo de código na base, PLANO-B2 revisado/aprovado explicitamente e nova autorização de implementação. Congelar estratégia same-DB v4, schema/envelopes, política safety/backup v2/destino, revisão R e matriz crash/old writer antes de codificar.

Baseline real no worktree isolado; bundles antigos reproduzíveis e assertions independentemente sensíveis; fixtures raw/goldens preparadas; rollback forward/recovery documentados. Gate de release: obter/reler safety JSON v2 e ensaiar restore/equivalência em destino isolado sintético, sem alterar origem. Gate de cada migração: gerar/validar roundtrip, iniciar download e obter confirmação explícita do usuário; não equivale a comprovar armazenamento físico ou restore pessoal, que a web genérica não observa. Recomendar ensaio isolado antes de promover base pessoal; jamais certificar que foi feito só porque houve click/download iniciado. Nenhuma base pessoal/remota usada no desenvolvimento. Aprovação deve aceitar custo de arquivo legacy duplicado e necessidade de fechar conexões/atualizar cliente antigo, sem apagar dados.

# 28. Critério de saída

B2 concluído somente com workspace Personal explícito/estável, dados migrados equivalentes e uma autoridade gravável; old writer v3 fenced inclusive após reload; seis writers/CAS scoped, backup v2/restore safety por destino e referências A/B isoladas; sessões invalidadas nunca ganham token novo por retry; crash/blocked/quota seguros e sem promoção tardia.

Golden financeiro/raw e A1/A2/B1 verdes, suites/build/checks reais, old-writer e crash tests entregues; documento de implementação com resultados/arquivos/risco de release. Nenhum cloud/front premium/B2 Business iniciado. Plano atual sozinho não cumpre esses gates.

# 29. Riscos

Upgrade longo/arquivo duplica espaço; getAll e verificação podem duplicar heap, já relevante na fixture 90k. Medir em Edge real 1k/10k/90.072: duração preflight/safety, upgrade copy/verify/commit, reopen/primeira leitura, bytes estimados e pico de heap/RSS do processo, responsividade antes/depois e cancelamento/quota. Registrar hardware/browser, baseline v3 e repetições; definir e aprovar orçamento de latência/memória a partir dessas medidas antes da ativação B2c, sem números fictícios. Gate: igualdade completa, rollback seguro, nenhuma OOM/timeout/inatividade/commit parcial e orçamento aprovado atendido na máquina-alvo. Se getAll+arrays de origem/destino+safety estourar, copiar/verificar por cursor e descartar buffers intermediários; cursor não elimina o custo existente do safety. Se engine atômico continuar inviável, parar para redesenho aprovado, nunca dividir em commits de dados parciais. Browser pode encerrar processo/transação longa; não há prazo/progresso garantidos. Usar cursor quando a medição exigir, sem alterar igualdade/raw ou introduzir workers/engine. Não prometer memória limitada apenas por tamanho de arquivo; falha/OOM não autoriza commit sem verify.

Transação IndexedDB fica inativa se esperar tarefas externas; callbacks devem encadear requests e abortar em erro. Browser/eviction/falha de disco não são cobertos só pela garantia transacional. Download iniciado não significa backup entregue. Perfil/origin/PWA diferentes usam bases diferentes; não prometer migração entre origens automaticamente.

Conexão antiga que não fecha bloqueia progresso, mas não integridade. Bundle com open sem versão escaparia da barreira: inventário/teste de clientes suportados é gate, e código arbitrário da origin não é fronteira de segurança. V4 corrompido não pode baixar versão nem inferir defaults pelo arquivo.

Scope ausente, clear global, lookup global, callback atrasado ou token somente numérico podem misturar A/B. V2 não identifica origem: destino/consentimento precisam ser explícitos. Arquivo legacy vira histórico stale após novos writes; jamais auto-recopiar. UUID não reutilizado, handle disposed definitivo e checagem de scope/CAS são obrigatórios.

H08/M06 e front P1 não devem crescer escondidos em B2. Documentação histórica ausente é lacuna de rastreabilidade já registrada em B1, não motivo para copiar o principal ou bloquear este plano. Principal/B1 preservados; este worktree usa apenas commits oficiais.

# 30. Decisões após revisão

**APROVADO COM AJUSTES nesta revisão adversarial; implementação ainda exige autorização separada.**

1. Manter mesmo vertice-finance, futuro v4; nenhuma segunda base gravável.
2. Schema uniforme de cinco stores em fresh/migrated; envelope/chave nested e índice por workspace mantidos.
3. Archive temporário por todo B2, diagnóstico readonly e stale após novos writes; sem limpeza automática nem remoção nesta fase.
4. UUID gerado sincronamente na versionchange depois de validar fonte; só ID comprometido é autoridade; mode Personal imutável, ownerKind removido.
5. Authority mínima layout/protocol/defaultWorkspaceId/sourceVersion; CAS+workspace no mesmo workspaceMeta, sem segundo snapshot.
6. V1/v2: abrir 3, commit, close, safety/preflight, abrir 4; nenhuma operação financeira B2 no estágio v3.
7. Upgrade copy/verify/metadata/fence atômico, request chaining/barreiras de sucesso e abort explícito nos catches; cancel lógico com late upgrade abort/late success close e identidade de tentativa.
8. Fence de todos os paths do cliente B1 pelo open explícito 3/close; bundle histórico e inventário de demais clientes publicados obrigatórios; BC não é requisito de integridade.
9. CAS preserva R inclusive MAX; MAX migra readonly por esgotamento, sem corrupção/reset. Scope/revision e lease de sessão são verificações distintas e obrigatórias.
10. JSON v2 permanece de um Personal, sem origem identificável. Destino/handle/lease/safety/consentimento explícitos; nenhum clear/query/referência global em scoped.
11. Safety é gerada/validada, download iniciado e confirmação do usuário; restore isolado comprova ensaio de release, não prova genérica de arquivo pessoal salvo.
12. Recovery v4 inválido não cria writer privilegiado/defaults/recópia; diagnóstico readonly e backup válido para novo destino isolado.
13. Três commits: B2a contracts; B2b engine testado sem ativação no App; B2c integração completa e ativação v4. Performance/backup/crash/old-writer são gates de ativação.
14. C01 arquitetural é RESOLVÍVEL apenas após evidências de implementação para todos os clientes publicados inventariados; nesta revisão permanece mitigado/aberto para B2. P1/cloud/Business fora.

Nesta execução: apenas edição documental de PLANO-B2.md, HEAD mantido 0157797, staging vazio, sem instalação/suítes/IndexedDB/migration/commit. Worktrees B1/principal não utilizados operacionalmente.

# 31. Revisão adversarial pré-implementação

Revisão de 05/10/2026 no worktree B2, branch plan/b2-workspace-local, HEAD 0157797. Entrada conferida: somente ?? PLANO-B2.md e staging vazio. Leitura integral do plano/roadmap/FECHAMENTO-B1, confronto com código/tests do mesmo checkpoint e documentação normativa. **Não houve teste IndexedDB real nesta revisão**: será gate da implementação, respeitando a proibição de alterar DB/testes agora.

## Decisão e severidade

**APROVADO COM AJUSTES. Zero CRÍTICOS, 2 ALTOS, 7 MÉDIOS e 1 BAIXO.** São lacunas/decisões do plano original, não bugs reproduzidos numa implementação B2 inexistente. Ajustes incorporados nas seções anteriores; não há reprovação estrutural nem motivo comprovado para trocar de database.

| ID     | Severidade | Achado real no plano anterior / consequência                                                                                                                                                     | Correção e gate                                                                                                                                                      |
| ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RB2-01 | ALTO       | Seções 12/13/20 diziam token mínimo scope+R e lease local, sem contrato de vínculo do emissor: um par A/R reproduzido em novo handle A podia cumprir a precondition sem provar a sessão original | Capacidade opaca ligada ao handle, revogação definitiva, nada de rebind ao active; teste A→B→A com A/R idênticos e callbacks tardios                                 |
| RB2-02 | ALTO       | Seção 26 rejeitava três commits com premissa falsa de promoção obrigatória intermediária, concentrando storage/migration/seis writers/integração/recovery num B2b grande demais                  | Três commits; engine testado dormente no B2b e ativação integrada só B2c                                                                                             |
| RB2-03 | MÉDIO      | Seção 7 dava três stores fresh e cinco migrated sob mesma v4; seção 29 aceitava duplicação sem término/consumidor explicitados                                                                   | Cinco stores sempre; archive temporário durante B2, diagnóstico readonly real, remoção futura exige aprovação/migration                                              |
| RB2-04 | MÉDIO      | Inventário/fluxo/recovery falavam em cancelar pedido blocked, embora IDBOpenDBRequest não seja abortável                                                                                         | Cancelamento lógico, late upgrade abort antes de qualquer escrita, late success close, geração de tentativa e retry explícito; código B1 já demonstra padrão correto |
| RB2-05 | MÉDIO      | V1/v2 passariam por v3 sem fixar open(3) e commit separado versus um único open(4)                                                                                                               | Escolha explícita de etapa A2 até 3 comprometida/fechada; depois safety/open4; sem handle B2 v3                                                                      |
| RB2-06 | MÉDIO      | Confirmação de cópia/backup entregue no gate misturava ensaio verificável de release com prova física de cada download pessoal                                                                   | Distinguir gerar/iniciar/observar/declaração de salvo/restore ensaiado; UI pede confirmação, não certifica disco                                                     |
| RB2-07 | MÉDIO      | ownerKind local sem consumidor e manifest com status/fenced/count/revision redundantes permitiam estados contraditórios/stale                                                                    | ownerKind removido, authority mínima; CAS só no workspace, dados históricos deriváveis do archive rotulado                                                           |
| RB2-08 | MÉDIO      | Recovery v4 inválido com legacy válido não especificava por que restore A1 no mesmo destino não pode obter safety válido                                                                         | Sem handle privilegiado; camada da falha + diagnóstico readonly; backup válido em destino isolado; sem backup, suporte/diagnóstico                                   |
| RB2-09 | MÉDIO      | R=MAX aparecia como fixture/writer bloqueado sem decisão sobre concluir migration/estado apresentado                                                                                             | Migration preserva MAX e conclui readonly por esgotamento; seis writers bloqueados, export disponível, sem reset/corrupção                                           |
| RB2-10 | BAIXO      | Restore dizia reject scope mismatch sem nomear o objeto, apesar de reconhecer v2 sem workspaceId                                                                                                 | Mismatch apenas de sessão/handle/lease/safety/token/destino; arquivo não comprova origem                                                                             |

## Prova estática do fence e limites

src/services/transactionRepository.ts: constante LOCAL_DATABASE_VERSION=3 e ÚNICA indexedDB.open em src, linha 123. onversionchange fecha conexão e limpa cache por identidade (213–217); onblocked só marca cancelled/rejeita, guard onupgradeneeded aborta (133–136), success abandonado fecha (209–211). Não há open sem versão em código de produção deste checkpoint. Helpers de teste rawLocal usam open sem versão para diagnóstico; não são writer publicado. Após close pending não se criam novas transações; transações anteriores terminam antes do upgrade exclusivo.

| Caminho B1                | Acesso comprovado                                                | Após commit v4                                                                           |
| ------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| load / readForBackup      | readLocalSnapshot → openDatabase (explicitamente 3)              | Nova abertura VersionError; conexão fechada não inicia transação                         |
| save / remove / import    | write → openDatabase, CAS+dados mesma RW                         | Mesmo fence; nenhuma fábrica alternativa                                                 |
| saveSettings / removeDemo | write → openDatabase                                             | Mesmo fence, sem dependência de BC                                                       |
| restore                   | write → openDatabase, verificação readForBackup → mesma abertura | Falha sem segunda escrita compensatória; validar também callback iniciado antes do fence |

tests/a2b-migration.spec.ts já contém blocked com duas conexões/abertura tardia/retry (163+) e connection close/VersionError após upgrade (225+). tests/a2b-concurrency cobre seis writers e revisão MAX (512+); restore-adversarial cobre requests/rollback. Isso sustenta a premissa B1, **não prova migration B2 pronta**. Inventário Git adicional nesta revisão, sem acessar outros worktrees: 971f195/A1 e 7f80ff2/A2a abrem explicitamente 2; 7ac117a/A2b, 732274d/A2c, 2b32caa/B1a, a02dc0b/B1b, 9a8514e/B1c e 0157797 usam explicitamente 3. Todos os repositories inspecionados registram onversionchange/onblocked. Versões inferiores são recusadas ao reabrir v4; isso é evidência estática dos checkpoints, não inventário certificado dos assets efetivamente publicados nem ensaio executado. Inventariar quaisquer outros assets/clientes ainda publicados e servir os bundles históricos reais; se algum escritor suporta open sem versão/versão 4, o fence proposto não o cobre e C01 não fecha. BC desligado e SW servindo B1 são testes obrigatórios. Scripts arbitrários da origin não fazem parte da garantia de fence/autorização.

## Decisões mantidas e simplificações

Same-DB v4 MANTIDA, desenho AJUSTADO nos contratos. Upgrade exclusivo permite promoção/cópia juntos; novo DB reintroduziria coordenação/fence cross-DB sem benefício provado. Nested compound key MANTIDA por semântica normativa, com prova Edge futura obrigatória. Um workspaceMeta para authority/registry/revision é suficiente e permite CAS na mesma RW; não novo store CAS. DTOs/backup JSON v2/raw B1/Money/calendário continuam intactos.

Removidos ownerKind, protocolo duplicado por workspace, flags status/fenced/hasLegacyArchive redundantes, contagem/revisão de origem duplicadas no manifest, duas variantes físicas v4 e argumento de que engine dormente seria promoção insegura. Não adicionar User, membership, auth, framework de migrations, writer privilegiado de recovery, transactionId redundante nem geração persistida de sessão.

Uniformidade + archive + divisão são decisão conjunta: dois stores vazios fresh custam pouco frente à validação/upgrade futuros de duas variantes; archive migrado custa dados duplicados mas tem consumidor diagnóstico; B2b valida engine/schema e esse custo em isolamento antes da ativação B2c. Não remover archive apenas para caber: falha de quota aborta e exige decisão/ensaio, jamais apagar fonte automaticamente.

## Gates adicionais e riscos aceitos

Barreira de requests e crash matrix agora distinguem enqueue/success/commit/reopen, exception no request/upgrade versus exception pós-commit, cancellation antes versus depois do commit e write concorrente com R maior. Atomicidade não promete imunidade a falha física, eviction ou perda de draft. Dois clientes novos chegam ao UUID comprometido; tentativa abandonada não ganha handle só por existir v4.

Artifact old-writer vem do Git completo 0157797 em temporário com lock/build/checksum próprios, mesma origin/perfil temporário para persistência, globals separados. Harness novo importando repository novo não conta como cliente antigo. No ensaio de crash, reabrir o MESMO perfil/base; contexto vazio não prova recovery.

90.072 registros exigem medição copy/verify/safety/heap/quota/reopen no browser-alvo. Sem baseline/orçamento medido aprovado, não certificar performance nem ativar B2c; não inventar benchmark nesta revisão. Cursor evita arrays duplicados quando necessário, sem chunk commits que rompam atomicidade. Retenção ocupa aproximadamente duas cópias financeiras mais overhead, não garantia exata em bytes.

Safety: gerado ≠ download iniciado ≠ download observado em harness ≠ declaração de arquivo salvo ≠ restore ensaiado. Plano exige declaração honesta e ensaio verificável de release, preservando a fonte atomicamente; nenhum sinal browser genérico certifica guarda pessoal. Recovery continua limitado sem backup válido; sourceVersion/archive não são fallback financeiro.

## Divisão final e C01

**3 commits futuros:** B2a contracts/types/keys; B2b engine de storage/migration/repository scoped usado em testes, sem ativação App; B2c integração/restore/session/recovery e ativação v4 só com todos os gates. Nenhum commit criado nesta revisão.

C01 arquitetural **RESOLVÍVEL** para o conjunto completo de clientes publicados inventariados: declarar RESOLVIDO somente após old-writer em todos os caminhos, BC ausente/SW antigo, ausência de dois writers, equality/crash/quota/blocked/late request, scoped CAS e isolamento passarem no navegador real. Cobertura parcial deixa MITIGADO. Não depende de garantir scripts arbitrários nem recuperação de disco inexistente; planejamento isolado mantém status anterior.

Bloqueadores documentais após ajustes: nenhum. Antes de implementar: aprovação/autorização explícita da fase e baseline isolado. Antes de ativar/promover: gates de backup, artefatos antigos, regressões, crash e orçamento de performance aprovados; ainda não executados nesta revisão.

Validação desta entrega: somente PLANO-B2.md, branch/HEAD preservados, staging vazio e arquivos tracked intactos. Sem código/tests/DB/migration/version change/P1/commit, sem acesso operacional B1/principal.
