# Objetivo

Planejar a menor A2b que impeça comandos baseados em estado antigo de sobrescrever dados locais mais novos, inclusive após delete e restore. **Somente planejamento, em 26/09/2026. Nenhuma implementação, staging ou commit.** Checkpoint: `7f80ff2 feat: endurece leitura local e recovery A2a`.

Recomendação: revisão global do escopo local atual, CAS em toda escrita, intenção explícita de criação/edição e revisão vinculada à origem do comando/formulário. Uma mudança de versão IndexedDB de 2 para 3 deve impedir que o cliente anterior, que ignora CAS, continue gravando. Sem nova store, sem normalização de settings, sem tombstone, sem Workspace ou sync. A versão do backup continua 2.

# Estado atual

HEAD confirmado em `7f80ff2`, sem descendente A2b e com staging vazio. O workspace recebido contém 17 arquivos rastreados modificados, 6.438 inserções e 1.898 exclusões externas a A2b, além de arquivos não rastreados. Foram inventariados 94 arquivos por SHA-256. Não confundir esse diff com esta entrega.

Foram consultados DECISOES-VERTICE-2.md, as seções de concorrência/migração/contratos/roadmap da ARQUITETURA-VERTICE-2-REVISADA.md, C01/H02 e recomendações relacionadas da AUDITORIA-ARQUITETURA-VERTICE-2.md, PLANO-A2A.md e IMPLEMENTACAO-A2A.md. As decisões I09/I11 exigem revisão/existência; a arquitetura sugere revisão por entidade, mas a granularidade é reavaliada abaixo para este MVP. Os estados históricos de H01/H03/H04 não descrevem bugs atuais: A1/A2a estão fechados.

Código atual prevalece: [repository](src/services/transactionRepository.ts), [hook](src/hooks/useTransactions.ts), [App](src/App.tsx), [SettingsPage](src/components/settings/SettingsPage.tsx), formulários de transação/importação e [backup](src/features/transactions/backup.ts). No checkpoint, repository:240/248 fazem leitura estrita; :252 implementa restore com precondition; :309/335/360 validam o estado atual antes de save/import/saveSettings. Nenhum comando recebe a versão que originou a intenção. `remove` e `removeDemo` não validam o snapshot anterior. `save` usa `put`, tanto para criar quanto para editar.

Inspecionados repository/local-read/recovery/restore-concurrency-adversarial/restore-adversarial/restore.spec. O caso `restore-concurrency-adversarial.spec.ts:153` já documenta settings antigas aceitas após restore. Não é uma regressão A2a. As validações do checkpoint são antecedentes; nesta análise não foi reexecutada a suíte completa.

# Problemas reproduzidos

**Resposta principal: SIM.** Dois clientes carregam o mesmo estado válido, A escreve, B escreve depois com intenção antiga e não recebe conflito. Foram concluídas 18 reproduções/controles com módulos reais, Edge e IndexedDB nativo. Procedimento, resultados e limites: [A2B-EVIDENCIAS.md](A2B-EVIDENCIAS.md).

| ID  | Achado                                                                                                                           | Classificação | Severidade | Reproduzível       |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------- | ------------------ |
| B01 | Edição antiga perde alteração de valor no mesmo ID; settings antigas desfazem nome de conta                                      | BUG REAL      | ALTO       | SIM                |
| B02 | Delete seguido de save antigo recria o mesmo ID por `put`                                                                        | BUG REAL      | ALTO       | SIM                |
| B03 | Restore verificado é seguido por save/import/saveSettings antigos aceitos                                                        | BUG REAL      | ALTO       | SIM                |
| B04 | Broadcast/focus atualizam o hook, mas o draft antigo de Settings continua submetível; refresh pendente também não bloqueia write | DÍVIDA A2b    | ALTO       | SIM                |
| B05 | Uma chave de revisão isolada não protege contra o cliente 7f80ff2, que a ignora                                                  | DÍVIDA A2b    | ALTO       | SIM                |
| B06 | Reabrir/recarregar formulário para resolver conflito pode perder conteúdo não salvo                                              | PENDÊNCIA A2c | MÉDIO      | NÃO nesta execução |

Contagem: **0 críticos, 5 altos, 1 médio, 0 baixos**. B04 é a integração necessária entre intenção e CAS, não autorização para persistir drafts. B05 é contraprova da estratégia insuficiente de acrescentar apenas metadata; não afirma que A2b já exista. B06 é plausível pelo estado React/DOM volátil, não um conflito A2b já implementado/reproduzido.

Controles sem bug: duas criações com IDs distintos sobrevivem; lote importado e nova transação também; referência inexistente é rejeitada contra o cadastro atual; a precondition A1 continua bloqueando restore sobre safety desatualizado. Não classificar toda concorrência como perda.

# Inventário de writers

`T` = transactions; `S` = settings. As referências de linha são do checkpoint. Todas as alterações financeiras devem participar de A2b.

| Writer            | Stores / modo atual | Lê / valida estado anterior                                                            | Expected revision / CAS atual      | Risco de sobrescrita / ressurreição                                                                                          | Broadcast atual                                      | Alteração A2b                                                                               |
| ----------------- | ------------------- | -------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| save :309         | T+S / readwrite     | Snapshot completo / SIM                                                                | NÃO / NÃO                          | `put` sobrescreve mesmo ID e recria excluído                                                                                 | Hook envia changed após commit; repository não envia | CAS; create com ausência/add, update com existência/put                                     |
| import :335       | T+S / readwrite     | Snapshot completo / SIM; dedup contra registros atuais                                 | NÃO / NÃO                          | `add` rejeita ID duplicado; intenção anterior ao restore é aceita; pode reintroduzir conteúdo com novo ID                    | changed após commit                                  | CAS do lote, manter dedup/atomicidade; sem retry automático                                 |
| saveSettings :360 | T+S / readwrite     | Snapshot completo / SIM; verifica compatibilidade da proposta                          | NÃO / NÃO                          | Substitui todo personal; perde campos editados por outra aba e pode reintroduzir cadastro removido sem referência impeditiva | changed após commit                                  | CAS do blob inteiro, token do draft                                                         |
| remove :324       | T / readwrite       | NÃO / NÃO                                                                              | NÃO / NÃO                          | Exclui versão mais nova do mesmo ID; não ressuscita diretamente                                                              | changed após commit                                  | T+S, CAS, snapshot válido, existência do alvo                                               |
| removeDemo :374   | T / readwrite       | Percorre rows / não valida snapshot                                                    | NÃO / NÃO                          | Pode excluir demos criadas/restauradas depois da confirmação; não recria                                                     | changed após commit                                  | T+S, CAS, snapshot válido, conjunto sob mesma transação                                     |
| restore :252      | T+S / readwrite     | Rows+personal / compara com safety previamente validado; releitura estrita após commit | NÃO / CAS por conteúdo do snapshot | Precondition protege a substituição; não bloqueia writers posteriores e não distingue ciclo de conteúdo A→B→A                | restored após verificação; também em falha verify    | Acrescentar CAS por revisão à precondition, avançar revisão no mesmo commit e verificar par |

Todas as operações de escrita A2b usarão T+S. Não há outro writer normal autorizado a ignorar o protocolo. `onupgradeneeded` é writer de bootstrap/migração: terá tratamento específico. Fixtures que usam IndexedDB diretamente são instrumentos, não APIs financeiras da aplicação.

# Cenários concorrentes

| Caso                               | Resultado atual observado                                                                       | Contrato A2b                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| C1: save A / save B, IDs distintos | Ambos aceitos; cinco rows, sem lost update                                                      | Mesmo token: um aceita e avança; outro conflita, mesmo sendo mudança independente |
| C1: editar mesmo ID                | A muda 500→700; B muda descrição usando row de 500; final 500                                   | B rejeitado, valor 700 preservado                                                 |
| C1: chamadas disparadas juntas     | Duas criações aceitas, ambos os IDs sobrevivem                                                  | Exatamente uma aceita por revisão de base; ordem vencedora não fixada             |
| C2: settings A / settings B        | Nome de A volta ao original; renda de B é gravada                                               | Rejeitar blob de B e manter integralmente A                                       |
| C3: delete / stale save            | Contagem 3→2→3; mesmo ID ressuscita                                                             | Revisão anterior ao delete não grava; update de ID ausente também rejeita         |
| C4: restore / stale writer         | Save reverte valor 900→500; import adiciona row; settings reverte renda 9999→3000               | Todos os tokens anteriores ao restore rejeitados                                  |
| C5: import / save                  | Seis rows sobrevivem; nenhuma perda dos IDs distintos                                           | CAS conservador detecta que a intenção de B é antiga                              |
| C6: duas abas + BroadcastChannel   | Hook B recebe nome novo; formulário conserva nome antigo; submit desfaz A sem alerta            | Refresh não promove token do draft antigo                                         |
| C7: focus                          | Mesmo defeito depois do refresh; durante leitura atrasada loading permanece false e write passa | A segurança depende de CAS e do token fixado, não do foco/loading                 |
| Três clientes                      | Três settings aceitas em série; última renda 4300                                               | Dos três comandos com revisão r, apenas um pode consumir r                        |

Separação obrigatória: (A) transações simultâneas são serializadas nos escopos sobrepostos; (B) a memória dos clientes pode ser antiga; (C) uma operação que começa depois do commit de outra ainda pode ser semanticamente obsoleta; (D) restore já compara safety; (E) comandos normais não comparam a base de intenção. A2b atua principalmente em C/E.

A serialização de readwrite não compara a intenção do usuário. A especificação garante exclusividade nos escopos sobrepostos e permite apoiar o CAS na mesma transação. Upgrade é exclusivo e aguarda conexões anteriores fecharem; abrir versão menor gera VersionError. [IndexedDB: scheduling](https://w3c.github.io/IndexedDB/#transaction-scheduling), [upgrade](https://w3c.github.io/IndexedDB/#upgrade-transaction) e [abertura](https://w3c.github.io/IndexedDB/#opening-a-database-connection).

# BroadcastChannel e focus

Hook:53 recebe mensagem e chama refresh; restored também altera restoreVersion. :66 envia changed depois do repository concluir e então relê. Restore envia restored após verificar; falha verify também invalida outras abas. Repository sozinho não publica mensagens. Foco dispara refresh; sequence descarta respostas antigas de leitura, não serializa decisões financeiras.

Não existe confirmação de que todos os clientes releram antes de um submit. A mensagem pode não estar disponível, não ter sido tratada ou chegar após a intenção; crash após commit pode impedir envio. Atrasar `load` do receptor reproduziu write durante refresh. A entrega efetiva também não basta: SettingsPage:23 guarda clone inicial em useState e App o remonta por restoreVersion, não a cada changed.

A2b preserva broadcast/focus como atualização visual. Não envia payload financeiro nem trata mensagem como lock. Sem entrega, CAS continua obrigatório. Não promover a revisão de um draft quando apenas o snapshot de fundo mudou.

# Estratégias avaliadas

| Alternativa                          | Benefício                                                                                   | Custo / insuficiência                                                                                                                  | Decisão                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Revisão global do escopo local       | Um token cobre settings, referências, lote, delete e restore; menor conjunto de comparações | Conflito entre mudanças independentes                                                                                                  | ESCOLHIDA para A2b                                                 |
| Revisão por entidade + settings blob | Permite edições independentes                                                               | Exige revisões de dependências, existência/delete, token de restore ou geração; muitas combinações                                     | Adiar até evidência de conflitos excessivos                        |
| Revisão por workspace futuro         | Isola partições futuras                                                                     | Workspace não existe; criar agora ampliaria o escopo                                                                                   | Global local agora, particionável em B2                            |
| Command version / ID de comando      | Evolução de protocolo e idempotência                                                        | Não diz qual estado fundamentou comando; sem CAS ainda sobrescreve                                                                     | Não implementar outbox/recibos duráveis                            |
| Timestamp                            | Fácil de gerar                                                                              | Relógio move, empata e difere entre clientes; não prova ordem de commit                                                                | Rejeitar                                                           |
| Snapshot esperado completo / hash    | Pode detectar divergência sem contador                                                      | Carrega/compara snapshot inteiro; não detecta A→B→A ou restore idêntico como mudança de geração; hash externo pode expirar transaction | Não usar como único controle; manter comparação A1                 |
| Lock/Broadcast/focus                 | Reduz corrida de execução e melhora percepção                                               | Lock serializa intenção antiga, não a torna atual; mensagens não são persistência                                                      | Não é substituto de CAS                                            |
| Token UUID por commit                | Opaco, comparação simples, sem overflow                                                     | Não oferece sucessor verificável; ainda exige protocol fence e transação                                                               | Viável, mas Number seguro é suficiente e mais fácil de inspecionar |

Meta A, transação B: com revisão global B conflita. É um conflito conservador aceito para MVP local com poucos escritores; sua frequência real não foi medida. Não afirmar que é rara por estatística inexistente. Remover esse custo exigiria a complexidade de dependências por entidade, especialmente para saldo inicial, categorias e restore. Testes devem explicitar esse comportamento para não o chamar depois de regressão.

# Estratégia escolhida

1. Uma revisão global **local**, opaca para a UI, persistida fora de personal, abrangendo todo o estado financeiro atual.
2. Todos os seis writers exigem expectedRevision; nenhum overload sem revisão, valor padrão, retry que troca token ou consulta automática para preencher argumento omitido.
3. A revisão viaja com o snapshot que originou o formulário/comando. Não basta acrescentar `expectedRevision = hook.snapshotAtual.revision` no instante do submit.
4. Create e update têm intenções explícitas. A API pode conservar o nome save, mas deve exigir `kind: create | update`; nunca inferir por existência e transformar update ausente em create.
5. Versão IndexedDB **3**, mesmas stores, uma chave reservada `settings["__vertice_local_concurrency__"]`, valor conceitual `{ protocol: 1, revision: 0 }` na migração/bootstrap válidos. Chave namespaced evita colisão com `meta` genérico e campos adicionais do usuário.

O bump não é necessário para criar uma chave. É necessário para bloquear o writer v2 comprovadamente alheio a CAS. O experimento inseriu revision 42 em S; o cliente 7f80ff2 gravou normalmente e deixou 42 intacto. Outro experimento elevou apenas a versão a 3: conexões do repository fecharam em versionchange e a tentativa seguinte do cliente v2 falhou com VersionError, sem mudança financeira. Essa é uma barreira local pequena; não é a migração de Workspace B2 nem implementação de update PWA A2c.

Compatibilidade futura: a revisão pertence à partição local atual, não ao usuário global nem ao servidor. B2 poderá criar uma revisão por workspace ao migrar o escopo. Cloud exigirá seu próprio protocolo/revisões; não comparar contador local com versão remota. Nenhum workspaceId fictício será inserido agora.

# Revision/CAS

## Tipo, leitura e retorno

Usar Number inteiro seguro, não negativo, começando em 0 **somente no bootstrap/migração explícitos**. Validar Number.isSafeInteger, faixa e protocol. Nunca incrementar MAX_SAFE_INTEGER, reiniciar, truncar ou usar relógio: rejeitar antes de qualquer write, com orientação de atualização/análise. Overflow é limite teórico de protocolo, não incidente observado. BigInt cria custo desnecessário para inspeção e JSON; UUID é alternativa futura, não requisito atual.

Manter `FinanceSnapshot` como dados financeiros, sem revisão. Definir na borda do repository um envelope conceitual `LocalRead { snapshot: FinanceSnapshot, revision: LocalRevision }`. `load` e `readForBackup` retornam esse envelope por leitura coerente de rows, personal/presença e metadata na mesma readonly, aguardando complete. O segundo mantém o validador estrito de backup A1; seus consumidores serializam **somente snapshot**. Alteração de assinatura é explícita e terá adaptações nos testes/callers; não mudar o formato financeiro nem relaxar validação.

Writes recebem token obrigatório e retornam recibo transitório da revisão efetivamente commitada, mais resultado quando necessário (count do import). Não é recibo persistente/idempotência cloud. Restore retorna o envelope verificado. Não ligar receipt r+1 a dados de outra leitura r+2; snapshot e revisão publicados sempre pertencem à mesma leitura. Após erro, nenhuma revisão imaginada é publicada.

## Fronteira da transação

Preparar/copiar payload e token antes do primeiro await; validações puras podem ocorrer antes, mas nenhuma decide a concorrência fora da readwrite. Abrir DB; criar **uma** readwrite sobre T+S. Enfileirar leituras da revisão/presença de metadata, personal/presença e rows. No callback que reúne os resultados:

1. Verificar formato/presença da revisão atual e formato do token esperado. Metadata ausente/inválida em v3 é estado inválido; não equivale a 0.
2. Comparar revisão atual com expectedRevision. Divergência rejeita sem modificar dados/revisão.
3. Validar o snapshot anterior integralmente conforme A2a, incluindo para remove/removeDemo. Isso não os converte em ferramentas de reparação.
4. Verificar existência/ausência e regras específicas do comando; preservar regras de datas de comando versus estrutura.
5. Enfileirar writes financeiros e o avanço de revisão na mesma readwrite. Um lote avança uma vez, não por row. Esperar complete; no erro, aguardar abort com causa preservada.

Sem await externo, timer, download, hash assíncrono, fetch ou broadcast entre as etapas dessa readwrite. Não usar duas transações separadas para dados e contador. Dada a serialização e comparação no mesmo escopo, dois clientes com r não conseguem ambos gravar r+1: o segundo observa r+1 e rejeita. Três clientes obedecem ao mesmo argumento.

Política de no-op: comando aceito consome uma revisão mesmo se resultado financeiro for idêntico (settings iguais, import totalmente deduplicado, removeDemo sem demos). Simplifica retry/ordem e garante que restore idêntico invalide tokens. Remove de ID ausente é conflito, não sucesso; não consome revisão. Invalidade, erro de quota/constraint/abort ou conflito não incrementam. Não repetir automaticamente comando cujo resultado é desconhecido; reler e pedir revisão humana.

## Erros

Uma classe `LocalConflictError`, `code = stale-state`, mensagem segura; nenhum payload financeiro ou hierarquia de classes por writer. expected/actual podem ficar internos ao diagnóstico, sem necessidade de exibi-los. Update/delete sem alvo e create com ID já existente são conflito de comando, preservando a causa nativa quando existir. Token ausente é erro de contrato, nunca autorização para usar a revisão atual.

Metadata local ausente/inválida usa erro seguro de leitura/estado inválido, com causa interna, mantendo recovery A2a. Conflito não é corrupção: não zerar o snapshot nem inventar recovery permanente se a releitura for válida. Restore mantém `RestoreError.phase`: conflito de revisão/conteúdo da safety é changed; falha transacional é write; falha após commit é verify.

# Delete e ressurreição

Invariante: **nenhum comando baseado em revisão anterior à exclusão pode gravar; edição exige que o ID ainda exista**. Delete consome revisão sob T+S. Update valida existência depois do CAS; create usa add e rejeita ID existente. Não resolver conflito transformando update em create, gerando ID novo ou substituindo seu expectedRevision pelo mais recente.

No cliente, confirmar delete usa o token capturado ao abrir a confirmação, não a revisão atualizada enquanto o diálogo estava aberto. RemoveDemo captura o mesmo tipo de base; a lista de demos a excluir é lida sob CAS, preservando demais rows.

Não é necessário tombstone para essa garantia entre clientes A2b: o contador nunca volta e os writers v2 estão bloqueados por versão. Restore/import iniciados conscientemente sobre revisão atual podem reintroduzir conteúdo de um backup/arquivo; isso é ação nova, não ressurreição silenciosa por edição antiga. Não prometer impedir modificações via DevTools/código externo que ignora o repository.

# Restore + stale writer

Safety deve conter **snapshot e revisão da mesma readonly**. O arquivo entregue ao usuário contém somente o snapshot JSON v2; o token fica na sessão do diálogo. Nunca reler uma revisão separada depois do download e anexá-la à safety antiga.

Na readwrite do restore: exigir revisão da safety igual à atual **e manter sameBackupSnapshot**. Validar estado atual; depois executar clear de T, adds, put de personal e avanço da metadata como uma unidade. Não limpar S nem apagar chaves desconhecidas. Não importar uma revisão do arquivo, nem reiniciar para 0. Restore idêntico também avança: caso contrário clientes anteriores permaneceriam autorizados.

Após complete, releitura estrita de snapshot+revisão. Conferir conteúdo alvo e a revisão commitada. Mudança posterior válida ainda pode tornar essa verificação conservadoramente verify; preservar diagnóstico A1, não compensar com segunda restauração. Um comando realmente novo baseado na revisão pós-restore pode gravar; um token anterior não pode. Escrita externa sem protocolo pode causar verify e continua fora da garantia de CAS.

Prévia, safety obrigatório, confirmação, precondition, rollback, causas, R1/R2 e orientação A2a permanecem. Ajustar apenas transporte da revisão/assinaturas e expectativas de versão intencionalmente alteradas. O teste legado que hoje exige aceitação de settings antigas pós-restore passará a exigir conflito e igualdade bruta do estado restaurado. O teste A1 de escritor cru concorrente permanece evidência do limite/verify, não vira escritor cooperante por conveniência.

# Bootstrap/migração de revision

Decisão explícita: **DB version bump SIM (2→3); nova store NÃO; nova chave em settings SIM; nova database NÃO.** Não inicializar revisão em load nem lazily no primeiro comando. Toda inicialização ocorre na transação nativa e exclusiva de upgrade, após verificar a base. Leitura financeira continua sem repair.

| Estado de entrada                                                                   | Ação planejada                                                                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| DB inexistente, oldVersion 0                                                        | Bootstrap legítimo cria T/S, personal default e metadata r=0 na mesma upgrade                                             |
| v1 reconhecido                                                                      | Manter migração legada existente, só no ramo oldVersion<2; validar resultado e criar metadata no mesmo upgrade            |
| v2 válido, metadata reservada ausente                                               | Validar stores/personal/rows, adicionar apenas metadata r=0; preservar todos os bytes lógicos financeiros e outras chaves |
| v2 inválido ou store ausente                                                        | Abortar upgrade; não criar personal/store faltante, não filtrar rows; origem v2 permanece e recovery mostra erro seguro   |
| v2 com chave reservada já ocupada                                                   | Falhar conservadoramente, sem substituir ou confiar em conteúdo não reconhecido; colisão exige análise                    |
| v3 íntegro                                                                          | load readonly normal; nunca executar migrador v1 novamente                                                                |
| v3 sem metadata, null, número fracionário/negativo/não finito/protocol desconhecido | Erro/recovery, sem reset nem inicialização automática                                                                     |
| DB superior à versão suportada                                                      | Erro seguro com VersionError na cause; sem downgrade                                                                      |

Zero aqui significa primeiro número de um protocolo **novo**, não saldo ou história financeira reconstruída. A ausência em v2 é reconhecida pelo evento de migração de schema; em v3 já não é legacy. O fence conclui antes de aceitar comandos A2b: até o upgrade, writers antigos podem terminar operações; depois do upgrade concluído não podem reabrir v2. A migração valida o estado após as conexões antigas fecharem.

O `onupgradeneeded` atual percorre registros e cria stores faltantes em qualquer upgrade. **Não basta trocar o literal 2 por 3.** Separar bootstrap, ramo legado e v2→v3 evita reexecutar normalização em registros A2a e fabricar defaults em corrupção. Essa mudança delimitada é necessária ao fence, não reabertura de A2a.

Conexão antiga não cooperante pode bloquear upgrade. Não escrever por caminho alternativo; explicar que deve fechar abas antigas e tentar novamente. Se a tentativa for dada como cancelada/rejeitada em onblocked, marcar isso e abortar eventual onupgradeneeded tardio; apenas fechar em onsuccess permitiria upgrade silencioso após falha anunciada. Não presumir que rejeitar a Promise cancela IDBOpenDBRequest.

Interrupção/abort do upgrade preserva versão e dados anteriores; próxima abertura repete a migração inteira. Não há checkpoints entre databases nem dados copiados para outra fonte. Testar crash real controlado, quota e abort. Não apagar o DB para rollback: ele permitiria reabertura legada. Para voltar ao aplicativo antigo seria necessária migração reversa explícita; não está neste plano.

Não bloquear indefinidamente uma base legacy válida: conexões cooperantes fecham, upgrade conclui e dados ficam disponíveis; blocked dá ação e retry. Corrupção financeira ou de metadata permanece recovery conforme A2a, sem prometer reparação. PWA antiga pode continuar servindo JS v2, mas recebe VersionError ao tentar usar v3; atualizar a aplicação é necessário, sem reload automático nem proteção de draft nesta fase.

# Backup JSON e revision

**Revision NÃO entra no backup JSON v2.** É controle local de concorrência, não dado financeiro. `FinanceSnapshot`, parser/serializador e equivalência financeira continuam descrevendo o estado financeiro. O envelope do repository é desembrulhado explicitamente antes de serializeBackup/download/preview.

Não guardar revisão em personal: isso vazaria para backups, seria substituído no restore e misturaria protocolo com dados. Nova store também não é necessária: a chave namespaced em S já participa das transações. Chaves desconhecidas de S continuam preservadas e fora do snapshot financeiro.

Campos adicionais financeiros já aceitos, mesmo se chamados revision/meta, não passam a controlar o protocolo nem devem ser apagados. Somente a chave reservada externa a personal tem autoridade. Restaurar arquivo antigo produz nova revisão local corrente; exportar/importar em outro perfil não transporta autorização de escrita. localSchema 3 e backupFormat 2 são contratos distintos.

# UX mínima de conflito

Mensagem: **“Os dados mudaram desde o início desta edição. Sua alteração não foi salva. Atualize os dados e revise antes de tentar novamente.”** Não afirmar que outra aba foi a causa exclusiva nem que a atualização já ocorreu se a releitura falhou.

Capturar token ao criar a unidade de intenção: abrir editor (novo/edição), montar draft de settings, abrir/importar a prévia, abrir confirmação de delete/removeDemo. Guardar junto ao objeto/estado dessa sessão. Callback repassa esse token obrigatório. As leituras de fundo podem atualizar métricas, mas não atualizar token/payload de formulário antigo. O token da safety é o da leitura para download.

Ao conflitar: rejeitar, não emitir mensagem de sucesso, não reenviar, não fazer merge. Hook tenta refresh para atualizar dados confirmados; a sessão conflitante permanece invalidada para submit com o mesmo draft. Se refresh falhar, manter gate/recovery A2a. Oferecer ação explícita de reabrir/atualizar a edição a partir de snapshot+token novos, avisando que conteúdo não salvo será descartado; fechar/cancelar continuam disponíveis. Nada de relabel automático de draft antigo com revisão nova.

Após sucesso, novos comandos usam leitura coerente atual. Se settings permanecer montado, vincular o draft aplicado à revisão do receipt correspondente ou reinicializá-lo explicitamente a partir de nova leitura; nunca associar draft antigo a uma revisão posterior alheia. Import/formulário/diálogo encerrados naturalmente descartam sua sessão. Delete/update precisam preservar alvo e base até a confirmação.

**PENDÊNCIA A2c:** persistência, proteção contra reload/update PWA, resgate/rebase/merge de conteúdo digitado. A2b captura uma precondition e bloqueia intenção obsoleta; não cria armazenamento de drafts. Capturar token de formulário é requisito de integridade A2b, não implementação de draft persistence.

# Testes necessários

Nenhum teste foi criado/editado nesta análise. Instrumentos temporários não integram a suíte. Na implementação:

| Camada         | Casos mínimos / evidência                                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit           | Validador de revisão/protocol, igualdade/tipo/faixa, overflow sem wrap, erro seguro; repetir apenas regras novas, não espelhar toda implementação                                        |
| Repository/IDB | Dois ou três clientes com r: um commit, demais stale-state; comparar valores/chaves/revisão antes/depois, sem sleeps como ordenação                                                      |
| Writers        | CAS de save create/update, import com/sem dedup, saveSettings, remove e removeDemo; token omitido nunca recebe fallback                                                                  |
| Existência     | Create sobre ID existente rejeita; update/delete sobre ausente rejeitam; delete→stale update não recria ID; remoção indireta de cadastro respeita referências                            |
| Independência  | Meta A/transação B e dois IDs novos produzem conflito global esperado; após revisar/reabrir, novo comando válido pode concluir                                                           |
| Restore        | Safety coerente, revisão+conteúdo em changed; restore idêntico incrementa; restore entre load/save, seguido de save/import/settings/delete/removeDemo antigos; R1/R2 e rollback intactos |
| Atomicidade    | Falha antes/depois do put da revisão e no meio de lote: dados e contador revertem juntos; Promise só resolve em complete ou rejeita depois de abort                                      |
| No-op/retry    | Import deduplicado e settings iguais consomem revisão; repetição com token consumido rejeita; nenhuma atualização parcial ou retry automático                                            |
| Migração       | Novo/v1/v2 válido, v2 corrupto/vazio/store ausente, unknown keys, colisão reservada, v3 metadata ausente/inválida, upgrade abortado/interrompido/blocked, duas abas iniciando upgrade    |
| Duas versões   | Bundle 7f80ff2 aberto antes do upgrade e reabertura posterior: fecha/versionchange, write legado falha; não liberar A2b enquanto fence não concluiu                                      |
| UI real        | C6/C7 com App real, SettingsPage, edição, importação e delete; entregar/atrasar/suprimir mensagem e completar focus refresh; token de draft permanece antigo                             |
| Conflito       | Mensagem, ausência de sucesso, refresh, falha de refresh, reabrir explicitamente e nova intenção; impedir laço de “tentar de novo” que reaplica o mesmo draft                            |
| Backup         | Nenhuma revisão operacional no JSON; roundtrip/metadados adicionais inalterados; destino novo usa sua revisão, não a origem                                                              |

**Topologia:** duas Pages do mesmo BrowserContext, mesma origem, para competir pelo mesmo IndexedDB. Executar também dois BrowserContexts na mesma origem como controle negativo de isolamento: não compartilham o banco. Não apresentar esse segundo teste como concorrência local. Para duas versões usar dois bundles nas páginas do contexto compartilhado. A documentação oficial descreve contexts como perfis isolados, e o controle executado confirmou a separação. [Playwright — Isolation](https://playwright.dev/docs/browser-contexts).

Sensibilidade: B01/B02/B03 têm contraprova anterior registrada. Em A2b, retirar pontualmente a comparação deve fazer o caso stale falhar; omitir incremento em restore deve fazer o teste pós-restore falhar; usar token vivo do hook deve fazer C6 falhar. Planejar mutações pequenas e reversíveis apenas se autorizadas na implementação, sem campanha ampla. Asserções não podem aceitar tanto sucesso quanto conflito por conveniência.

Atualizar conscientemente testes que fabricam v2 e abrem literal 2: distinguir fixtures de migração de fixtures v3 atuais, manter v2 vazio como caso de erro sem defaults. VersionError usa versão maior que a suportada. Helpers novos devem tornar protocol/token explícitos; não inventar revisão dentro do helper de save para ocultar casos stale. Manter testes crus A1 separados de writers cooperantes.

Validação futura: unitários, TypeScript aplicação e tests/config, build, direcionados de concorrência/migração/A1/A2a, depois suíte completa, formatação e diff check. Validar também HEAD+A2b isolado para não depender de PWA/visual/Three unstaged. Nenhum número de testes futuro é imposto.

# Arquivos prováveis

| Arquivo                                                                          | Mudança delimitada                                                                                                       |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| src/services/transactionRepository.ts                                            | Envelope/revision/conflict, todos os writers com CAS, intenção create/update, leitura de meta, fence e migração          |
| src/hooks/useTransactions.ts                                                     | Transportar tokens explícitos, refresh após conflito, distinguir conflito de erro de leitura; não promover base do draft |
| src/App.tsx                                                                      | Vincular sessões de editor/importação/remoção e integrar callbacks; staging parcial futuro, PWA fora                     |
| src/components/settings/SettingsPage.tsx                                         | Base imutável do draft, conflito/reabertura explícita, pós-sucesso coerente                                              |
| src/components/settings/RestoreBackupDialog.tsx                                  | Safety envelope; serializar só snapshot; revision da safety no restore                                                   |
| src/components/transactions/TransactionsPage.tsx                                 | Token/ID da confirmação de exclusão                                                                                      |
| AddTransactionModal.tsx / TransactionForm.tsx / ImportModal.tsx                  | Transporte da sessão/precondition e mensagem/ação de conflito, somente onde necessário                                   |
| tests/helpers/repositoryHarness.ts / localData.ts                                | Expor contratos e fixtures de versões/controlar token sem mascarar stale                                                 |
| tests de repository/local-read/recovery/restore e novos de concorrência/migração | Adaptar assinatura/versionamento preservando os asserts A1/A2a; regressões acima                                         |
| README.md / IMPLEMENTACAO-A2B.md futuro                                          | Contrato, compatibilidade v3, limites e resultados; README parcial                                                       |

`src/types/finance.ts` não precisa carregar revisão. Tipos locais pequenos podem ficar no repository; só extrair arquivo de tipos local se houver necessidade real de dependências. `backup.ts`/parser/serializador/fórmulas/catálogo não têm mudança financeira necessária. Não criar camada genérica de commands/event bus/workspace.

# O que fica fora

A2c/draft persistence/dirty form/PWA update safety; servidor/auth/Supabase/cloud/C1/Workspace/Business/IA; ledger/CRDT/outbox/tombstones/sync multidispositivo; nova database/store; novos contratos monetários; normalização de settings; reconstrução de base inválida/force restore/skip safety; visual/Three/dependências e documentos gerais históricos.

A barreira de versão protege writers antigos conhecidos. Não implementar serviço financeiro no service worker nem atualização automática de abas. Explicitar a necessidade de código compatível é parte da implantação A2b, sem resolver preservação de formulário durante atualização.

# Riscos

| Tentativa de quebrar a proposta / falha                            | Resposta e limite                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duas/três abas salvam com r                                        | Mesma readwrite T+S; um consome r; os outros rejeitam                                                                                                               |
| Restore entre load e write; restore idêntico; conteúdo A→B→A       | Revisão avança em cada comando, nunca volta pelo backup; token anterior rejeitado                                                                                   |
| Settings/draft paralelo recebe refresh                             | Token preso à origem; se for substituído pelo token vivo, a proposta falha. Caso obrigatório C6                                                                     |
| Aba suspensa por minutos / broadcast perdido / focus não executado | CAS independe de notificação. Snapshot visual pode ficar velho até refresh, mas write antigo não passa                                                              |
| Crash após commit antes do broadcast                               | Dados+revisão duráveis juntos; próxima escrita antiga conflita. UI pode não saber o resultado até reler                                                             |
| Crash/abort entre write financeiro e revisão                       | Mesma transação reverte ambos; testar sem prometer durabilidade frente a falha física além do navegador                                                             |
| Reload depois de conflito                                          | Lê snapshot+revisão atuais; não reenvia comando. Draft perdido é B06/A2c                                                                                            |
| Migração interrompida                                              | Versão/dados/meta não são promovidos parcialmente; retry nativo, sem limpar banco                                                                                   |
| Revision ausente em v2 vs v3                                       | Só v2 entra no migrador explícito; v3 falha conservadoramente                                                                                                       |
| Writer v2 ignora chave / não fecha conexão                         | Fence bloqueia reabertura; conexão bloqueante impede migração, com orientação; não existe modo “continuar mesmo assim”                                              |
| Falso conflito de mudanças independentes                           | Custo aceito da granularidade global; medir em uso antes de introduzir revisões por entidade                                                                        |
| Laço de conflitos                                                  | Não retokenizar/repetir draft; reabrir explicitamente a partir de estado atual. Outra escrita durante revisão pode gerar novo conflito legítimo                     |
| Revision drift / update parcial                                    | Nenhum writer financeiro fora de T+S; no-op e incremento têm política única; readonly não escreve                                                                   |
| Duplicate insert / stale import                                    | Mesmo ID usa add e rejeita; dedup por assinatura continua comportamento atual. Nova importação conscientemente revisada com duplicatas permitidas continua possível |
| Overflow                                                           | Falha antes de enfileirar writes; nunca wrap/reset. Não adicionar BigInt para um limite teórico                                                                     |
| Metadata removida/manipulada por DevTools ou script alheio         | Ausência/forma inválida detectada; adulteração coerente arbitrária não é resolvida por contador. Fora da garantia do repository                                     |
| Delete físico de toda database/perfil                              | Pode perder dados e reiniciar origem; não é comando suportado nem recuperação A2b. Não oferecer reset                                                               |
| Locks longos e custo de ler snapshot inteiro                       | A2a já lê inteiro nos três writers; remove passa a fazê-lo. Sem benchmark/otimização especulativos nesta fase                                                       |
| Navegadores/versões/PWA em produção                                | Experimentos em Edge headless; Safari/mobile e distribuição do release não certificados. Testar compatibilidade/fence antes de liberar                              |

Não implementar writer novo pela metade mantendo APIs sem token “por compatibilidade”. A migração do protocolo é uma entrega conjunta: todos os seis writers, callers, sessões e restore. A documentação histórica sobre revisões por entidade permanece direção possível; o contador global é uma simplificação local explícita, não revisão remota universal.

# Critérios de aceite

1. C1 mesmo ID, C2, C3 e C4 mudam de aceitação silenciosa para conflito com estado bruto preservado.
2. Todos os seis writers exigem token; nenhuma API ou branch ignora CAS. Create/update têm existência explícita.
3. Token pertence ao snapshot que originou intenção; C6 continua seguro mesmo depois de refresh completo, não apenas quando a mensagem é perdida.
4. Comparação, validação, efeitos e incremento estão na mesma readwrite T+S; sem await externo; falhas preservam contador e dados.
5. Restore preserva safety/precondition por conteúdo e revisão, atomicidade, verificação e R1/R2; invalida tokens anteriores mesmo quando idêntico.
6. Versão 3 bloqueia clientes v2 conhecidos; upgrade blocked não permite writes A2b nem migração tardia invisível após cancelamento.
7. Migração válida preserva IDs/campos/referências/totais/unknown keys; ausência/corrupção de personal não recebe defaults nem reparo; versão 3 sem metadata não vira legacy.
8. Load/readForBackup são readonly após abertura/migração e publicam snapshot+token coerentes; FinanceSnapshot e backup JSON v2 não ganham revisão operacional.
9. Conflito é claro, sem sucesso falso/retry/merge automático; reabertura explícita cria intenção nova. A2c continua pendente.
10. Datas estruturais, bootstrap legítimo, recovery e comandos bloqueados em estado inválido A2a permanecem; fixtures de versão são adaptadas sem afrouxar proteção.
11. Regressões reais incluem Pages compartilhando IDB e controle separado de BrowserContexts; instrumentação não pode encobrir CAS omitido.
12. Apenas mudanças A2b entram na implementação/commit posterior; trabalho preexistente fica preservado. Nenhum Workspace/cloud/dependência nova ou tombstone.

**Pode implementar A2b depois deste plano: SIM**, neste contrato completo. A escolha decorre das perdas reproduzidas e das contraprovas à revisão sem fence e ao token atualizado automaticamente. Não é autorização para implementação nesta execução. A2c não é pré-requisito para rejeitar stale writes; sua proteção de conteúdo não salvo permanece separada.
