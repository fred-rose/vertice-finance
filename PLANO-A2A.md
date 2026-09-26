# Objetivo

Planejar a menor A2a que torne a leitura do estado local confiável: nenhum default silencioso para dados persistidos perdidos, nenhuma transação inválida descartada, leitura estrutural independente do relógio e acesso explícito à recuperação.

**Data:** 23/09/2026. **Checkpoint:** `971f195 feat: adiciona restauracao segura do backup v2`. **Status:** planejamento concluído; implementação NÃO iniciada; SEM COMMIT.

**Decisão de escopo confirmada pelo usuário nesta execução:** “Leitura segura + recuperação acessível, mantendo o bloqueio de sobrescrita da base corrompida e orientando recuperação preservando a origem”. Portanto, “recuperação acessível” significa painel e ações acessíveis mesmo quando load falha; não significa autorizar restore destrutivo sobre um estado incapaz de produzir o safety backup A1.

A1 permanece fechado. Não foi reproduzida regressão de restore, R1/R2 ou lifecycle. O relatório de execução está em [A2A-EVIDENCIAS.md](A2A-EVIDENCIAS.md).

# Estado atual

## Git e documentos

HEAD é exatamente `971f195f961ab155c7da5d7869c54f668803bb8b`, sem descendente A2. Histórico anterior: `38c1563`. Index recebido vazio. Não foi encontrado AGENTS.md no projeto.

Documentos consultados na ordem solicitada: Decisões → Arquitetura revisada → Auditoria da arquitetura → Revisão A0/A1 → Implementação A0/A1, priorizando as seções de leitura, recuperação, datas, compatibilidade e limites. Os dois relatórios A0/A1 já haviam sido lidos na preparação do commit; seus rechecks finais foram conferidos novamente. O código atual prevalece: H03 descreve o validador anterior; A1 já separou as datas estruturais dos limites de comando. H04 continua materializado no load comum.

As alterações rastreadas preexistentes são: README, três screenshots dashboard-desktop/dashboard-mobile/onboarding-desktop, index.html, package.json/package-lock.json, App, TrendChart, DashboardLayout, FinancialSummary, ImportModal, TransactionForm, Dialog, main, styles e vite.config. Permanecem também documentos arquiteturais/PWA/visual/3D, scripts, ícones, componentes e módulos PWA/visual, useVisualEffects, vite-env, testes PWA/visual/Three e artefatos não rastreados. A listagem completa do status recebido está no relatório de evidências.

Diff recebido: 17 arquivos rastreados, 6.438 inserções e 1.898 exclusões. Esse volume não é A2a. Os 87 arquivos recebidos foram inventariados por SHA-256 em memória para comparação final. Não houve limpeza, staging, edição dos documentos arquiteturais ou alteração do commit estável.

## Caminhos efetivos

| Caminho | Comportamento atual |
| --- | --- |
| openDatabase, repository:54 | Cria stores ausentes em onupgradeneeded; ao criar settings, grava defaultSettings em personal. Também executa o migrador v1 existente. |
| resolveSettings, repository:124 | validateSettings(value ?? defaultSettings(), true). null e undefined acionam fallback; {} não aciona. |
| load, repository:167 | Uma readonly coerente de transactions + settings; resolveSettings; valida cada transação em modo estrutural; retorna os registros originais. |
| save/import, repository:259/293 | Relê personal dentro da readwrite, mas chama o mesmo fallback. Valida o comando novo contra configurações que podem não estar persistidas. |
| saveSettings, repository:335 | Valida a proposta com regras de comando e as transações com modo estrutural; grava personal sem exigir que o personal anterior exista. |
| readForBackup, repository:189 | Leitura coerente + validateBackupSnapshot. Não usa fallback nem inventa configurações no banco v2 já aberto. |
| restore, repository:202 | Alvo e safety válidos; precondition e substituição na mesma readwrite; espera complete; verifica por readForBackup. |
| useTransactions:18/27 | Mantém um snapshot inicial em memória com defaults e array vazio; refresh publica dados do load ou mensagem de erro. Não persiste esses defaults ao iniciar. |
| App:151 | Loading → indicador; erro → alerta/Tentar novamente; sucesso → páginas financeiras. SettingsPage e sua ação de restore ficam no ramo de sucesso. |

Referências: [repository](src/services/transactionRepository.ts), [validação](src/features/transactions/validation.ts), [backup](src/features/transactions/backup.ts), [catálogo](src/data/catalog.ts), [tipos](src/types/finance.ts), [hook](src/hooks/useTransactions.ts) e [App](src/App.tsx). Os números de linha indicam o workspace inspecionado.

# Problemas reproduzidos

## Classificação consolidada

As contagens abrangem os sete achados abaixo, inclusive pendências separadas e risco aceito: **0 críticos, 3 altos, 3 médios e 1 baixo**. Bugs reais de A2a: F01 e F03. F02/F04 são dívidas A2a, não novas regressões A1.

| ID | Classificação | Severidade | Reproduzível | Correção A2a | Evidência e limite |
| --- | --- | --- | --- | --- | --- |
| F01 | BUG REAL | ALTO | SIM | SIM | personal ausente/null + referências padrão: load fabrica abertura e configurações; save/import continuam gravando. Reproduzido nesta execução. |
| F02 | DÍVIDA A2a | ALTO | SIM | SIM | load falha → Configurações/restore ocultos. Mesmo quando fallback deixa abrir o diálogo, safety estrito bloqueia. Corrigir acesso/orientação; manter a proteção A1. |
| F03 | BUG REAL | MÉDIO | SIM | SIM | load admite violações do contrato persistido que readForBackup rejeita. Reproduzidos sete exemplos abaixo. |
| F04 | DÍVIDA A2a | BAIXO | SIM | SIM | v2 sem store settings lança NotFoundError nativo; hook pode mostrar texto técnico. Normalizar erro de leitura, sem reparar schema. |
| F05 | RISCO ACEITO | MÉDIO | SIM | NÃO | Migrador v1 sem settings cria/persiste defaults; v2 não guarda proveniência que permita distinguir esse histórico depois. Reprodução sintética e teste legado existente. |
| F06 | PENDÊNCIA A2b | ALTO | SIM | NÃO | save usa put, settings não tem revisão; escritor antigo continua possível. Caso já reproduzido/documentado e presente em restore-concurrency-adversarial; não reexecutado nesta análise. |
| F07 | PENDÊNCIA A2c | MÉDIO | NÃO nesta execução | NÃO | registerPwa.update protege dialog aberto, não o formulário de Settings. Confirmado por inspeção e auditoria anterior; não foi simulado update de SW agora. |

## F01 — estado inventado na leitura e aceito em comandos

Fixture íntegra: aberturas de 5.000 e 2.000; receita 2.000, despesa 500, transferência 1.000. Total real da fixture: **8.500**. Remover personal e conservar as transações faz load devolver abertura [0, 0] e total **1.500**. Nenhuma leitura consegue deduzir os 7.000 perdidos; mostrar 1.500 como saldo total viola unknown != zero.

O fallback fabrica duas contas, sete categorias, datas iniciais 1900-01-01, saldo inicial zero, metas/despesas fixas vazias, renda prevista e threshold zero. Nomes, cores e orçamentos deixam de refletir o cadastro perdido. Metas não são reconstruídas: a lista vazia inventada aparenta ausência. A leitura não grava esse objeto; ele é um estado virtual diferente do persistido.

Se as referências usam IDs padrão, o erro fica silencioso. Se usam uma conta personalizada perdida, load rejeita a referência. Assim, a mesma perda de settings tem respostas diferentes conforme o catálogo atual do aplicativo.

No controle de escrita, save e import adicionaram duas despesas e personal continuou ausente. O problema não fica limitado ao dashboard. Um futuro catálogo padrão diferente também mudaria o resultado dessa releitura sem alterar o banco: consequência direta da chamada dinâmica ao catálogo, não um experimento de release executado.

null é dado inválido presente, não “chave ausente”; hoje também vira default. Um valor undefined explicitamente persistido precisará ser distinguido de chave ausente na classificação futura. {} e campo monetário obrigatório ausente já geram erro; não devem passar a ser corrigidos automaticamente.

## F02 — acesso à recuperação e autorização para sobrescrever são distintos

D/F exibiram erro e Tentar novamente, sem summary. Mudar o hash para Configurações não montou SettingsPage: zero botões de restore. Não houve loading infinito, nem dashboard de zeros nesse caminho de erro.

Em C, o fallback permitiu entrar em Settings; selecionar um backup válido abriu a prévia. A geração da cópia de segurança falhou e a confirmação permaneceu desabilitada. Esse bloqueio é correto e foi aceito no escopo: remover apenas o gate visual não torna o banco danificado restaurável por A1.

O mínimo de A2a é mostrar a recuperação sem renderizar métricas falsas, explicar a condição e oferecer o percurso seguro descrito adiante. Não alterar readForBackup para aceitar lixo nem dispensar o safety snapshot.

## F03 — validação de comando não é contrato completo de persistência

Foram aceitos por load e recusados por readForBackup, sem mudanças feitas pelas leituras:

1. ID de transação numérico 42.
2. source desconhecido.
3. createdAt inválido.
4. Transferência com categoryId food.
5. Receita com destinationAccountId.
6. Duas metas com mesmo ID.
7. Metadata com Infinity inserida diretamente no IDB.

validateTransaction valida o núcleo financeiro, mas não identidade/metadados do registro. Em transferência devolve categoryId normalizado; em receita devolve destino undefined. load descarta esse retorno e devolve o registro original. Portanto essas normalizações não consertam a leitura nem comprovam que a entrada persistida estava válida.

validateSettings também não valida toda a forma runtime, todos os IDs textuais nem unicidade de metas/compromissos. TypeScript não valida conteúdo vindo de IndexedDB.

Isso não reabre R2: o parser/restore A1 rejeitou corretamente o número não finito. O experimento inseriu a corrupção diretamente no armazenamento e encontrou o leitor normal mais permissivo.

# Matriz de estados

Política proposta: sucesso somente com snapshot persistido válido; defaults apenas no bootstrap real já existente. “Recuperar” abaixo significa abrir o painel, preservar a origem e permitir apenas os passos seguros; não significa reparo automático nem overwrite de corrupção.

| Caso | Estado e comportamento atual observado | Desejado | Risco | A2a | Bloquear uso financeiro | Recuperar | Defaults |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A0 | Banco inexistente antes de abrir; load cria v2 + personal e retorna vazio válido | Preservar bootstrap atômico e onboarding | Baixo | Proteger com teste | NÃO após commit do bootstrap | Opcional: importar backup em base nova válida | SIM, persistidos na criação |
| A1 | “DB novo” fabricado externamente já em v2, stores vazias e personal ausente; load inventa defaults, strict rejeita | Tratar como existente de história desconhecida; erro explícito | Alto: vazio não prova primeiro uso | SIM | SIM | SIM, sem apagar essa base | NÃO |
| B | DB com personal válido, sem transações; ambos leitores aceitam | Ler os settings existentes, mesmo com aberturas/metas não zero | Baixo | Preservar | NÃO | A1 normal disponível | NÃO substituir |
| C | Transações existentes/personal ausente; defaults se refs coincidirem; erro se não coincidirem | MissingSettings, nenhuma configuração fabricada | Alto | SIM | SIM | SIM | NÃO |
| D | Transações/personal = {}; ambos rejeitam | Estado inválido explícito, preservar todos os registros | Alto | Melhorar diagnóstico/acesso | SIM | SIM | NÃO |
| E | Transações/falta initialBalance obrigatório; ambos rejeitam | Igual bloqueio, classificar invalid-settings | Alto | Melhorar diagnóstico/acesso | SIM | SIM | NÃO |
| F | Personal válido/transação amount -1; ambos rejeitam conjunto | Rejeitar snapshot integral, não filtrar linha nem somar parcialmente | Alto | Preservar e padronizar erro | SIM | SIM | NÃO |
| G | Personal válido/accountId inexistente; ambos rejeitam | Integridade de referência explícita, sem criar conta zerada | Alto | Preservar | SIM | SIM | NÃO |
| H | Personal válido/categoryId inexistente; ambos rejeitam | Sem categoria inventada/remoção da linha | Médio | Preservar | SIM | SIM | NÃO |
| I | Transação em 2099-12-31, estruturalmente válida; ambos aceitam | Continuar legível, sem regra “até hoje” no load | Baixo | Regressão, sem refazer A1 | NÃO | NÃO necessário | NÃO |
| J | initialBalanceDate em 2099-01-01; ambos aceitam; saldo no corte atual é null | Manter estrutura válida e saldo indisponível antes da base | Baixo | Regressão | NÃO ao load; não mostrar saldo desconhecido | NÃO necessário | NÃO |

A pergunta “personal ausente em banco vazio deve continuar criando defaults?” tem resposta **NÃO para um v2 já existente**. Hoje nem sequer os persiste nesse caso. Banco genuinamente novo é A0, não A1. A diferença foi medida, não presumida.

Extensões reproduzidas: personal null tem o mesmo defeito de C; presença de outra chave com transactions vazio não impede fallback; deadline futura é aceita; sete corrupções de F03 passam apenas no load; ausência de store em v2 produz erro nativo. Todos os estados inválidos devem preservar dados e manter o painel acessível.

# Clock/date

**Seguro para a validação estrutural da leitura atual**, nos caminhos inspecionados e nove combinações reproduzidas. Não generalizar isso para cálculos, comandos, PWA ou todo uso de Date na aplicação.

| Caminho | Usa relógio/fuso atual? | Decisão |
| --- | --- | --- |
| load → validateSettings(..., true) | NÃO para a validade da abertura | Preservar. |
| load → validateTransaction(..., structural:true) | NÃO para a validade da transação | Preservar; fortalecer contrato completo. |
| readForBackup → validateBackupSnapshot | NÃO para estrutura; timestamps são analisados a partir do próprio texto | Reutilizar e preservar R1/R2. |
| validDate | new Date com input explícito e Z; compara calendário ISO UTC | Não é consulta a “hoje” nem ao timezone local. |
| goal.deadline | validDate apenas, inclusive no comando atual | Futuro permitido; não inventar limitação nova. |
| Cadastro/edição/importação | localDate() na regra de comando | Continuar recusando futuro de caixa conforme política atual. |
| saveSettings | Abertura proposta usa regra de comando; transações existentes usam modo estrutural | Preservar separação; edição de abertura futura restaurada pode continuar recusada pela regra de comando. |
| defaultSettings | Constantes; abertura em 1900 | Problema de proveniência, não de relógio. |
| Hook: createdAt | new Date na criação/importação | Escrita de metadado, não releitura. |
| serializeBackup/exportação | new Date para exportedAt | Novo timestamp do arquivo, não alteração do histórico. |
| App/format/cálculos | Mês atual, datas formatadas, asOf default, comparações/projeções | Mudança do corte pode mudar métricas, sem tornar snapshot inválido. Não extrair um Clock global em A2a. |
| PWA | Date.now para cadência de update | A2c/plataforma, fora da leitura financeira. |

Experimento: mesmo snapshot com transação 2099-12-31, abertura 2099-01-01 e meta 2099-12-31; relógio em 2026, depois 2020, depois 2100; fusos São Paulo, Kiritimati e Los Angeles. **9/9 load e 9/9 readForBackup idênticos ao alvo.** Na fronteira de meia-noite, o dia civil local diferiu entre os fusos e a leitura permaneceu igual. Comandos recusaram as datas em 2020/2026 e aceitaram em 2100.

O teste de A1 de datas futuras e o roundtrip atual confirmam que um alvo válido restaurado continua legível. Não há evidência para “corrigir novamente” H03 como se A1 não existisse. Restam testes de regressão com mudança efetiva de relógio/fuso, não uma reescrita temporal.

# Bootstrap legítimo vs corrupção

## Três categorias

A. **Estado válido:** settings persistidos e snapshot estruturalmente íntegro → load normal, sem normalizar, completar ou ignorar registros.

B. **Estado ausente seguramente inicializável:** database ainda inexistente, detectada na abertura/upgrade inicial → persistir defaults junto da criação existente. Só publicar sucesso após a transação de upgrade concluir.

C. **Estado existente inválido/indeterminado:** v2 sem personal, com personal inválido, referências inválidas ou schema inesperado → erro/recovery explícito, nenhuma escrita de reparação automática.

oldVersion = 0 sinaliza que a database ainda não existia quando foi aberta. É evidência melhor que contar rows; não prova que o usuário nunca teve dados naquela origem antes de uma remoção completa do armazenamento. Fonte: [MDN — oldVersion](https://developer.mozilla.org/en-US/docs/Web/API/IDBVersionChangeEvent/oldVersion). A criação/upgrade é transacional; preservar o commit/abort nativo: [IndexedDB — upgrade transactions](https://w3c.github.io/IndexedDB/#upgrade-transaction).

## O que os sinais realmente provam

| Sinal | Valor da evidência | Limite |
| --- | --- | --- |
| Ausência de transações | Nenhum lançamento presente | Pode haver saldo inicial, metas e categorias perdidos; pode ter havido exclusão de lançamentos. Não autoriza defaults. |
| Ambas as stores vazias em v2 | Estado atual vazio | Indistinguível de base antes utilizada e depois esvaziada/corrompida. |
| Outra chave em settings | Existência de conteúdo adicional | Nunca autoriza ignorar perda de personal; preservar a chave desconhecida. |
| db.version = 2 | Schema anunciado | Não prova personal íntegro nem sucesso histórico de bootstrap de outro cliente. |
| oldVersion = 0 no open atual | Database inexistente nesse início de criação | Não é um registro histórico durável depois da abertura. |
| oldVersion = 1 + layout legado reconhecido | Caminho de compatibilidade existente | Migração não é primeira execução; não prova informações que o contrato v1 nunca armazenou. |
| createdAt/source dos registros | Metadados das transações, alguns sintetizados na migração | Não servem de sentinel de integridade do settings. |

Não existe marker de inicialização, histórico de migrações nem proveniência do saldo-base no schema atual. Não propor sentinel, store ou versão nova para responder a uma pergunta que pode ser tratada conservadoramente: **defaults deixam de ser fallback de leitura em v2**.

O migrador v1 já cria settings quando a store não existia. O teste de compatibilidade `repository.spec.ts:81` documenta essa representação legada. Preservar esse contrato em A2a, sem transformar “v1” em permissão geral para reparar qualquer layout. v1 com settings já existente mas sem personal deverá falhar na leitura posterior, em vez de recorrer ao fallback. Schema desconhecido deve falhar de modo recuperável. Não se certifica retrospectivamente a origem da abertura zero em bases já migradas: F05.

Não é necessário criar uma migração nova. Tornar explícita a distinção entre bootstrap e migrador no código/comentário, se necessário para clareza, não deve alterar transformações de registros, stores ou versão. Uma incompatibilidade concreta do legado exige avaliação separada antes de tocar nesse caminho.

# Load vs readForBackup

| Dimensão | load atual | readForBackup atual | A2a proposta |
| --- | --- | --- | --- |
| Leitura do par de stores | Mesma readonly | Mesma readonly | Um primitive privado reutilizável, sem mudar a unidade transacional. |
| personal ausente/null | Defaults virtuais | Rejeita | Ambos rejeitam; load apresenta classificação de leitura. |
| Forma runtime/IDs/metadados | Parcial | Validador completo do snapshot v2 | Reusar validateBackupSnapshot no load, sem duplicar regras. |
| Datas futuras | Aceita estruturalmente | Aceita estruturalmente | Preservar. |
| Ajustes silenciosos | Retorna rows originais; não usa o retorno normalizado | Preserva campos, não fabrica defaults | Continuar sem transformação. |
| Metadata adicional | Tolerância ampla, inclusive Infinity | Finitude profunda; extras preservados | Mesmo piso estrutural; não inventar campos novos. |
| Representabilidade JSON universal | Não garante | Validação não é serializador universal | serializeBackup continua conferindo roundtrip; não prometer recuperação bruta de todo tipo IDB. |
| Consumidores de produção | Hook em mount, focus, BroadcastChannel e após comandos | Safety do diálogo e verificação pós-restore | Manter chamadas públicas; o painel usa o fluxo A1. |
| Escrita por leitura | Nenhuma após abrir v2 | Nenhuma após abrir v2 | Nenhum bootstrap dentro de load. A abertura nova/migração existente continuam distintas. |

**Primitive recomendado:** função privada que, após abrir o DB, leia rows, valor personal e presença da chave na mesma readonly, aguarde complete e devolva valores ainda não confiáveis. A presença pode ser lida por count("personal") no mesmo escopo, sem precisar varrer todas as chaves em todo load. Isso distingue missing de null/undefined explicitamente armazenado. Outros settings não são parte do FinanceSnapshot nem devem ser apagados.

Depois dessa leitura, load exige presença e usa o validador completo; readForBackup continua exigindo o snapshot real. Evitar refatorar o algoritmo de restore: manter seu caminho write/complete/readForBackup, precondition e tratamento verify.

**Não criar load(normal/strict/bootstrap).** Três modos permitiriam reintroduzir defaults pelo argumento errado e multiplicariam testes. load deve ter um contrato seguro único; bootstrap é responsabilidade da abertura comprovada, e readForBackup conserva seu papel específico.

## Erros mínimos

Uma única representação de erro de leitura com discriminador, mensagem segura e cause preservada é suficiente; pode ser uma classe `LocalReadError` se necessária para distinguir falhas no hook. Não criar hierarquia MissingSettingsError/CorruptSettingsError/CorruptTransactionError/ReferenceIntegrityError.

Códigos mínimos:
- `missing-settings`: chave ausente em banco existente.
- `invalid-snapshot`: chave presente inválida, transação/metadata/referência inválida.
- `storage-unavailable`: abertura, store ausente ou operação IndexedDB falhou.

Bootstrap bem-sucedido não é erro nem modo público. Se diagnóstico interno de settings/transação/referência for útil, usar cause/razão interna, sem expor payload e sem exigir subclassificação que a UI não utiliza. Não parsear mensagens em português para controlar comportamento.

Preservar `RestoreError.phase` e o significado de `BackupValidationError` do fluxo A1. Capturar também erros síncronos ao criar transaction, para NotFoundError não escapar como mensagem bruta. Não ocultar causa técnica no objeto de erro nem registrar dados financeiros em console.

# Recovery UX mínima

Esta seção incorpora a escolha expressa do usuário. **Não implementar recuperação destrutiva sobre base danificada em A2a.**

1. App deve montar um painel de leitura/recuperação no ramo de erro em qualquer rota. Configurações financeiras, cards e listas dependentes do snapshot não montam nesse estado.
2. Mostrar “Não foi possível validar os dados locais. Seus registros foram preservados; saldos e configurações estão indisponíveis.” Adaptar a mensagem para falha de acesso transitória.
3. Ações acessíveis: **Tentar novamente**, **Restaurar backup JSON** e **Como recuperar preservando os dados atuais**. O botão de restore abre o diálogo existente para selecionar/validar e ver a prévia, sem montar SettingsPage com defaults.
4. Se a nova leitura estrita for válida, o fluxo A1 normal pode prosseguir: safety backup, confirmação, precondition, escrita atômica e verificação.
5. Se a base continuar inválida, o safety deve continuar falhando. Mostrar a razão no contexto da recuperação e o próximo passo; não deixar apenas um botão cinza sem explicação. Nenhum clear, exclusão, “resetar”, preenchimento padrão ou retry destrutivo.
6. Orientação concreta: manter a origem/perfil atual intacto; guardar um backup JSON v2 válido já existente; para recuperar o conteúdo desse arquivo, abrir o app em outro perfil de navegador limpo ou outro dispositivo, concluir a inicialização normal e usar A1 ali. O estado da origem não é transferido automaticamente nem apagado.
7. Sem backup válido, informar que é necessária extração/análise técnica preservando a base. A2a não pode reconstruir openingBalance perdido, garantir exportação bruta nem sugerir limpar dados do site como solução.
8. Não apresentar “dados recuperados” apenas por ler a prévia ou iniciar o download. Sucesso exige o resultado verificado de A1.
9. O hook deve separar snapshot utilizável de erro/loading. Preferir ausência explícita do snapshot inicial, sem default financeiro de conveniência para alimentar UI. Último snapshot válido pode ser mantido internamente, mas não exibido como atual após erro. Guardar ações financeiras enquanto o estado não é válido; não implementar políticas de drafts nem resolução de escritores antigos.
10. Ajustar o status visual “Salvo neste navegador” quando os dados não puderem ser lidos/validados; não afirmar que um default em memória está salvo.

**Limite deliberado:** acesso ao painel/diálogo é recuperado; overwrite da base corrompida permanece bloqueado. Um fluxo futuro de recuperação na mesma base exigirá cópia bruta verificável, distinção entre dump e backup v2, preservação de tipos/chaves e precondition apropriada. Isso seria um contrato adicional, não um simples modo “force” no restore. Não incluí-lo ocultamente em A2a e não classificá-lo como A2b/A2c.

O passo em outro perfil/dispositivo é orientação de recuperação do backup existente, não recurso de Workspace, sync, login, nova database da aplicação ou migração criada nesta fase. O percurso do destino novo até o restore foi exercitado pelo controle B/A1; a orientação completa entre dispositivos não foi testada nesta execução.

# Testes existentes

| Arquivo/caso | Cobertura útil | Lacuna/ação |
| --- | --- | --- |
| repository.spec.ts:41 | Inicialização real, stores, CRUD/reload | Manter; acrescentar prova de personal persistido e ausência de fallback posterior. |
| repository.spec.ts:81 e dashboard.spec.ts:265 | Migração v1 e referências/metadados | Manter sem novas garantias históricas; verificar que o hardening não bloqueia o legado reconhecido. |
| repository.spec.ts:131 | Teste afirma load/save/import com fallback | **Contrato a mudar conscientemente.** Precria v2 sem personal; não representa bootstrap real. Substituir expectativa por bloqueio/preservação e cobrir criação legítima separadamente; não apagar o teste só para obter verde. |
| repository.spec.ts:179/305/326 | Referências incompatíveis, settings {} e rollback de comandos | Cobertura parcial; faltam ausência com rows/null, forma completa e estado de UI. |
| backup.test.ts + backup.adversarial.test.ts | Contrato estrutural, IDs/refs, finitude, metadados, datas futuras, comparação | Reutilizar como base. Não duplicar todos os asserts em novos unitários. |
| restore-repository.spec.ts:115 | Futuro estrutural, load/reload, comandos bloqueados | Cobre o núcleo de H03; faltam relógio efetivamente movido e fusos diferentes. |
| restore-repository.spec.ts:346 | Base danificada bloqueia safety/restore sem piorar estado | Preservar. A2a não deve converter esse teste em restore forçado. |
| restore-adversarial.spec.ts:250/325 | R1/R2 originais e lifecycle/rollback | Permanecem invariantes de regressão. |
| restore.spec.ts | Prévia/safety/erros/download/verify/two-tab | Entrada atual parte de base legível; falta abrir recuperação após load falho. |
| dashboard.spec.ts:50; calculations.test.ts | Abertura futura/unknown, cortes e fórmulas | Não equivale a corrupção persistida; manter funções sem nova regra monetária. |
| restore-concurrency-adversarial.spec.ts:153 | Escritor antigo após restore | Limite A2b, fora desta correção. |
| pwa.spec.ts | Atualização/instalação/offline | Não prova proteção de todo draft de Settings; A2c. |

A suíte não foi editada nem reexecutada integralmente nesta fase de planejamento. Os experimentos pontuais estão documentados separadamente.

# Testes novos necessários

## Unit

- Classificação de leitura: missing versus personal presente null/undefined versus snapshot inválido; cause preservada e mensagens sem conteúdo financeiro.
- Paridade da validação estrutural usada por load com o contrato existente; IDs/metadados/transferência e duplicidade de metas, sem normalizar a entrada.
- Defaults só como dados de bootstrap; nenhuma função de leitura chama defaultSettings como recuperação.
- Datas civis, abertura e deadline futuras; conservar regra de comando. Usar as fixtures existentes e evitar refazer os 116 casos de backup em outro arquivo.

## Repository / IndexedDB real

- Matriz A0/A1 e B–J deste plano, incluindo v2 vazio sem personal e com chave adicional.
- Perda de personal com saldo inicial não zero e IDs padrão; ausência com IDs personalizados; valor null/undefined. Conferir estado bruto, não apenas resultado de load.
- load/save/import recusam missing e não acrescentam rows/defaults; saveSettings não deve transformar estado anterior desconhecido em “configuração salva” por um caminho normal.
- Rejeitar os sete exemplos de F03; preserve todos os campos e registros, sem descarte de transação.
- Bootstrap real persiste personal; reabrir não o recria se for removido depois. Preservar o cenário legado v1 reconhecido; layout v2 incompleto gera erro seguro sem schema repair.
- Relógio retrocede/avança sobre o mesmo banco, três fusos e instante perto da meia-noite; load/readForBackup equivalentes. Deadline, abertura e transação futuras independentes.
- Restore válido → load normal → reload idênticos. Manter testes de atomicidade, rollback, precondition, R1/R2 e impossibilidade de safety sobre dados inválidos.
- Falha nativa síncrona/assíncrona vira erro estável, sem Promise pendurada.

## E2E

- Abrir diretamente overview, transações e Configurações com personal ausente/{}/null e com referência inválida: painel visível, métricas/formulários indisponíveis, recuperação acessível.
- Abrir o diálogo via painel, selecionar backup válido/inválido, cancelar/fechar/foco; nenhuma gravação nesses passos.
- Safety impossível mantém confirmação bloqueada e exibe orientação para preservar a origem; verificar zero clear/put destrutivo.
- Erro transitório seguido de leitura válida permite retry e fluxo A1 completo.
- Bootstrap em contexto separado + restaurar backup válido; conferir que o contexto de origem danificada permanece intacto. Nenhum botão apaga a origem.
- Falha de refresh depois de uma leitura bem-sucedida não apresenta o snapshot anterior como atual nem habilita comandos com estado inválido.
- Nenhum loading infinito nem indicação falsa de “salvo”; texto não promete download fisicamente guardado ou recuperação de campos perdidos.

Não fixar contagem artificial de novos testes antes da implementação. A cobertura acima deve ser parametrizada onde melhora a evidência. Na implementação, executar unitários, TypeScript, build, testes direcionados de repository/recovery e regressões A1; suíte E2E completa ao encerrar a alteração funcional.

# Mudanças de produção propostas

Sequência executável para uma autorização futura, sem implementação nesta análise:

1. **Fixar o contrato de leitura.** Remover fallback de resolveSettings nos caminhos de dados existentes. Ausente é missing; null/undefined presente é inválido. Não completar campos nem reconstruir contas.
2. **Compartilhar a leitura crua coerente.** Helper privado para ambas as stores + presença de personal, aguardando complete. Não chamar load de dentro de uma readwrite; não inserir await externo nos callbacks IDB.
3. **Endurecer load com o validador já existente.** Exigir snapshot completo por validateBackupSnapshot e classificar erro na borda. Preservar ordem/campos e validação temporal estrutural. readForBackup mantém seu contrato e R1/R2.
4. **Retirar dependências de fallback dos comandos atingidos.** save/import exigem settings realmente persistidos no próprio contexto transacional, mantendo a validação de comando do novo dado. saveSettings precisa rejeitar ausência/invalidez da configuração atual antes de substituir pelo draft; validar também as transações já persistidas sem normalizá-las. Uma checagem de integridade/presença não é expectedRevision/CAS; concorrência entre dois estados válidos fica A2b.
5. **Representar o estado de leitura no hook.** Snapshot só utilizável após sucesso; erro estruturado para a UI. Preservar sequence/BroadcastChannel e o contrato restoreBackup. Bloquear novas ações da UI com estado inválido, sem resolver drafts ou conflitos.
6. **Abrir a superfície mínima de recovery fora de SettingsPage.** Painel com retry, entrada A1 e orientação preservando origem. Ajustar o diálogo só para contextualizar safety indisponível; jamais adicionar force/skipSafety.
7. **Verificar regressões e preservar escopo.** Testes planejados e validações apropriadas; diff funcional sem dependências, CSS/visual/PWA, schema ou fórmulas novas.

Não tornar remove/removeDemo mecanismos de reparação de corrupção. Nenhum comando normal será oferecido na UI inválida. Comandos diretos de clientes antigos, existência/revisão no commit e corridas de writers continuam pendências A2b; A2a não promete fechar essas janelas.

Não extrair um framework de repositories, múltiplos modos de load, sistema genérico de diagnóstico, codec de todos os tipos IndexedDB ou Clock global. Não acrescentar uma rotina de exportação bruta como efeito colateral do painel: ela requer contrato e testes próprios.

# Arquivos que provavelmente serão alterados

| Arquivo | Motivo esperado |
| --- | --- |
| src/services/transactionRepository.ts | Leitura estrita, ausência/presença, erro normalizado e remoção dos usos de fallback; proteção mínima de saveSettings contra configuração anterior ausente/inválida. |
| src/hooks/useTransactions.ts | Snapshot indisponível e erro de leitura distinguível; guards de UI, preservando restore. |
| src/App.tsx | Montar recovery no ramo de erro, proteger apresentação e indicar estado corretamente. Arquivo continua misto com PWA preexistente. |
| src/components/settings/RestoreBackupDialog.tsx | Contexto/orientação de recovery quando safety não é possível; nenhum relaxamento do contrato. |
| src/components/settings/LocalDataRecovery.tsx, se necessário | Pequeno painel isolado por legibilidade; opcional, não uma nova página/sistema. |
| tests/repository.spec.ts | Corrigir o contrato do teste antigo de fallback e acrescentar matrizes de leitura/comandos. |
| tests/local-read.spec.ts / tests/recovery.spec.ts, se necessário | Organizar experimentos de relógio/forma e fluxos de UI sem misturar com auditoria A1. |
| README.md | Documentar leitura bloqueada, recuperação acessível e limites. Staging parcial futuro devido à seção PWA preexistente. |

`backup.ts` e `validation.ts` são dependências a reutilizar; não precisam obrigatoriamente de alteração se o validador completo puder ser chamado diretamente. Só extrair um helper de validação de settings se necessário para os comandos, conservando as regras e os testes A1. `catalog.ts`, `types/finance.ts`, fórmulas, packages/lock e schema não têm mudança necessária demonstrada. Erro de leitura pode ficar no repository; não poluir FinanceSnapshot com configurações fictícias ou metadados de recuperação.

# O que fica fora

- **A2b:** stale writer, lost update, revisão, CAS, tombstones, ressurreição após delete e coordenação de escritores.
- **A2c:** formulário sujo, draft/reload, update PWA e salvamento/descarte de rascunhos.
- **Recuperação adicional fora deste recorte:** dump bruto verificável, reimportação de dump, reparação da base danificada ou restore que dispense safety v2; novo contrato seria necessário.
- Schema migration nova, database/store/version/sentinel nova, Workspace, Supabase, sync, cloud, IA, Empresas, Money global, fórmulas, redesenho visual e novas dependências.
- Reescrever o migrador v1, inferir openingBalance desconhecido ou corrigir automaticamente registros históricos.
- Reabrir A1 sem regressão concreta. Os problemas apresentados pertencem ao load/UI históricos; o bloqueio do safety sobre corrupção é intencional.

# Riscos

- Fortalecer load fará alguns bancos hoje aceitos entrarem em recovery. É o objetivo quando a estrutura é inválida, mas precisa de UI simultânea; não entregar o endurecimento sem painel.
- O teste legado de fallback ficará incompatível por desenho. A implementação deve registrar essa mudança de contrato e acrescentar prova do bootstrap verdadeiro, sem reduzir cobertura.
- Recovery acessível não recupera dados sem backup nem habilita overwrite da origem danificada. O usuário escolheu preservar esse limite. Evitar linguagem que prometa reparação completa.
- Usar backup em outro perfil recupera somente o que está naquele arquivo; dados posteriores/corrompidos permanecem na origem para análise. Não prometer junção ou reconstrução automática.
- Ajustar o estado inicial do hook exige revisar consumidores para não passar null/undefined a componentes financeiros. Isso não requer mudar o tipo de saldo para zero.
- Helper de leitura deve conservar a transação coerente e complete/abort; alterações em saveSettings não podem introduzir await que expire a readwrite.
- Leitor completo foi projetado para snapshots financeiros v2; tipos extras IDB não representáveis ainda podem exigir recuperação técnica. Não prometer serialização universal porque validateBackupSnapshot passou.
- O legado migrado já não carrega proveniência suficiente de defaults. A2a não corrige retroativamente a história.
- As reproduções foram funcionais em Edge, com CSS/PWA fora do instrumento. A implementação futura exige validar a UI real e regressões no build; não certifica Safari/mobile/perda de energia.
- Working tree continua misto: o futuro diff/commit A2a deve separar App/README e preservar todo trabalho anterior.

# Critérios de aceite

1. Database realmente inexistente continua inicializando stores e personal persistidos; onboarding e primeira transação funcionam.
2. v2 existente sem personal, com ou sem rows/outras chaves, não recebe defaults em load/save/import; não há persistência automática de uma configuração inventada.
3. personal inválido, incluindo null/undefined presente/{}/campos obrigatórios ausentes, não vira default. saveSettings normal não apresenta a substituição desse estado como edição comum bem-sucedida.
4. Transação/identidade/referência/metadado inválido torna o snapshot indisponível; nenhuma linha é ignorada ou normalizada para manter dashboard ativo.
5. A estrutura de load/readForBackup não consulta relógio/fuso atual; não criar novo limite de futuro para leitura.
6. Transação, abertura e meta futuras continuam legíveis sob relógio para trás/frente e fusos testados. Cadastro/edição mantêm regras de comando.
7. Snapshot ausente/inválido nunca alimenta métricas com aberturas zero ou último estado disfarçado de atual. null de saldo antes da base permanece indisponível.
8. Erro de load mantém painel, retry, entrada de backup e orientação acessíveis em todas as rotas. **Conforme decisão do usuário, a base corrompida permanece protegida contra overwrite; orientação preserva a origem.**
9. Restore A1 continua exigindo safety válido, precondition, escrita atômica e verificação estrita; R1/R2 e rollback passam sem alteração de expectativa.
10. Nenhuma nova versão/store/schema/sentinel/dependência sem necessidade comprovada; nenhuma alteração monetária ou de fórmulas.
11. Nenhum mecanismo A2b/A2c entra no diff. Limites de cliente antigo e draft não são apresentados como resolvidos.
12. Arquivos e snapshots inválidos permanecem intactos após erro/cancelamento/safety bloqueado; mensagens úteis sem payload financeiro ou erro nativo cru.

**Pode implementar A2a agora: SIM, em uma próxima execução autorizada, exatamente neste recorte confirmado.** A arquitetura temporal necessária já existe; o trabalho é eliminar defaults de leitura, alinhar a validação, distinguir erro de snapshot e manter recuperação acessível sem relaxar A1. Se o objetivo mudar para sobrescrever a base corrompida no mesmo perfil, este plano não autoriza isso: será necessário definir primeiro a cópia bruta verificável e seu contrato de recuperação.

**Nesta execução:** somente PLANO-A2A.md e A2A-EVIDENCIAS.md. Produção/testes intactos, A2a não implementada, A2b/A2c não iniciadas, SEM COMMIT.
