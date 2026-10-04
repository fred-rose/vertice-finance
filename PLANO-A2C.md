# Objetivo

Planejar a proteção de trabalho não salvo e a atualização/reload seguro do PWA do Vértice 2.0. Checkpoint: `7ac117a feat: protege concorrencia local com CAS A2b`. Execução de 27/09/2026, somente leitura, reproduções em ambiente temporário e documentação. Nenhuma implementação A2c.

**Decisão: estratégia A — guards de trabalho não salvo, sem persistência durável de drafts.** Registro global mínimo de bloqueadores; aviso antes de descarte controlado; `beforeunload` condicional; conferência de segurança em todos os caminhos de reload do PWA. Em restore/recovery involuntário, conservar a edição invalidada **somente em memória, para consulta/cópia**, sem manter autorização de escrita. Essa retenção transitória não recupera uma página recarregada.

A1 continua autoridade do restore; A2a, da disponibilidade de dados confirmados; A2b, da autorização de cada escrita. Draft não entra em saldo, métrica, backup financeiro nem Service Worker. Não mudar repository, CAS, revisão, stores ou IndexedDB v3.

# Estado atual

HEAD e índice conferidos: `7ac117a`, staging vazio. O workspace contém 17 arquivos rastreados com mudanças anteriores e arquivos não rastreados de PWA/visual/Three/documentação. Os 100 arquivos recebidos foram inventariados por SHA-256 antes dos instrumentos. Não confundir o PWA presente no working tree com conteúdo do commit A2b: `src/pwa/register.ts`, `PwaControls.tsx`, configuração e testes PWA ainda pertencem ao trabalho anterior não commitado.

Consultados DECISOES-VERTICE-2.md, as seções de compatibilidade, PWA, autoridade de draft e A2c da ARQUITETURA-VERTICE-2-REVISADA.md, PLANO-A2B.md, IMPLEMENTACAO-A2B.md e IMPLEMENTACAO-A2A.md. As referências históricas a DB v2 e ausência de CAS não descrevem o código atual. A2b está fechado e sua correção `setSaved(false)` continua presente.

Pontos atuais relevantes:

- `App.tsx:43`: `restoreVersion` fecha editor/importação/removeDemo; Settings remonta pela key em `:223`. Snapshot ausente também fecha sessões em `:49` e desmonta páginas financeiras.
- `useTransactions.ts:27`: refresh válido publica dados; erro remove snapshot. Broadcast `changed` e focus relêem; `restored` também incrementa restoreVersion. Nenhum desses eventos renova o token de uma edição A2b.
- `SettingsPage.tsx:32`: draft/baseRevision locais; `saved` é feedback, não comparação de conteúdo. `:548` oferece descarte explícito após conflito.
- `TransactionForm.tsx:39`: FormData no submit; vários campos vivem no DOM com defaultValue/defaultChecked. Só observar useState não detectaria toda edição.
- `usePage.ts`: hashchange publica a nova página sem guard. `Dialog.tsx`: X, Escape e clique no backdrop chamam fechamento quando não busy. O formulário de transação não possui botão Cancelar; restore e confirmações possuem.
- Não há dirty registry, listener beforeunload ou armazenamento de drafts no código atual.

# Problemas reproduzidos

Procedimentos, controles e limitações estão em [A2C-EVIDENCIAS.md](A2C-EVIDENCIAS.md). Dados sintéticos, App real, Edge headless, IndexedDB nativo e, nos cenários PWA, Service Worker real. Não foi executada novamente a auditoria de integridade A1/A2a/A2b.

| ID  | Achado / limite                                                                                                                   | Classificação | Severidade | Reproduzido                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------- | ---------------------------------- |
| C01 | Atualizar PWA na própria aba descarta Settings dirty; a instrução genérica para salvar não bloqueia a ação                        | BUG REAL      | ALTO       | SIM                                |
| C02 | Edição iniciada depois da autorização de update pode ser perdida no controllerchange; não há segunda conferência                  | BUG REAL      | ALTO       | SIM; janela temporal instrumentada |
| C03 | Reload elimina Settings e transação nova/editada, sem aviso; banco confirmado permanece intacto                                   | DÍVIDA A2c    | MÉDIO      | SIM                                |
| C04 | Sair de Settings e voltar pela navegação descarta edição                                                                          | BUG REAL      | MÉDIO      | SIM                                |
| C05 | X/Escape/backdrop de transação e fechamento de importação descartam trabalho sem decisão específica                               | DÍVIDA A2c    | MÉDIO      | SIM                                |
| C06 | Restore externo e recovery desmontam edição sem oportunidade de consultar/copiar o conteúdo                                       | DÍVIDA A2c    | ALTO       | SIM                                |
| R01 | Crash, processo encerrado e unload sem evento confiável podem perder estado mantido apenas em memória                             | RISCO ACEITO  | MÉDIO      | NÃO; limite de plataforma          |
| R02 | Worker novo pode controlar documento antigo e remover assets antigos do precache; compatibilidade de releases continua necessária | RISCO ACEITO  | MÉDIO      | NÃO para chunks incompatíveis      |
| R03 | Após conflito, “Atualizar edição” descarta conteúdo conscientemente, com aviso já existente                                       | RISCO ACEITO  | BAIXO      | SIM                                |

C06 não é regressão financeira: os gates anteriores fazem o que devem. A2c acrescenta tratamento do trabalho digitado, sem suspender os gates. Sync, merge automático, recuperação durável de crash e colaboração são FORA DE ESCOPO, não defeitos adicionais contabilizados.

Contagem: **0 críticos, 3 altos, 5 médios e 1 baixo**, incluindo os três riscos aceitos R01–R03. São seis achados a tratar (C01–C06: três altos e três médios). Foram confirmados 24 cenários distintos, incluindo controles de preservação; isso não significa 24 bugs nem uma suíte completa aprovada.

Resposta aos dez fluxos:

| Fluxo                    | Comportamento observado / evidência                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Reload manual            | Perda reproduzida em Settings/create/update/import; sem beforeunload; banco inalterado                                         |
| Atualização PWA          | Conferida separadamente com waiting worker e ação da UI; ver C01                                                               |
| Aplicação de nova versão | Perda confirmada tanto em waiting→controllerchange quanto no reload sem waiting após outra aba ativar; ver C01/C02             |
| Troca de rota            | Settings perde; modal de transação sobrevive à mudança programática de hash. Links de fundo ficam inertes sob showModal        |
| Fechar modal             | X/Escape/backdrop perdem transação; importação perde seleção/prévia. Busy já bloqueia fechamento                               |
| Restore                  | Restore válido em outra Page + mensagem restored desmonta Settings/editor/importação; restauração local exige safety/confirmar |
| Recovery                 | Remoção sintética de personal + refresh exibe recovery e desmonta Settings/editor; não escreve reparo                          |
| Conflito A2b             | Draft permanece, submit bloqueado, DB/revision preservados; só a ação explícita Atualizar edição descarta                      |
| BroadcastChannel changed | Não apaga o draft de Settings no cenário observado; submit antigo conflita corretamente                                        |
| Focus refresh            | Mesmo controle acima para leitura válida. Leitura falha entra no caso recovery                                                 |

# Inventário de drafts

“Refresh” abaixo é leitura válida por changed/focus, não restore. PWA update significa reload da própria aba; chegada da oferta e controllerchange sem autorização não equivalem a reload.

| Unidade                                     | Estado local / trabalho não salvo                                       | Token A2b                                  | Refresh válido                                                         | Restore/recovery atual                              | Rota atual                                        | Reload próprio     |
| ------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------- | ------------------ |
| Nova transação                              | Tipo em React; valor/descrição/data/contas/categoria/recorrência no DOM | Capturado em App ao abrir; kind create     | Mantém instância; opções recebem props novas                           | Fecha                                               | Host em App sobrevive ao hash; UI de fundo inerte | Perde              |
| Editar transação                            | Mesmos campos e entidade de origem                                      | ID, kind update e revisão de abertura      | Mantém draft/token                                                     | Fecha                                               | Como create                                       | Perde              |
| Importação                                  | File, sheets, mapping, opções, seleção, preview, resultado              | Revisão de abertura em App                 | Não remonta; preview pode recalcular com referências/duplicatas atuais | Fecha                                               | Host em App sobrevive ao hash                     | Perde              |
| Settings                                    | Clone de FinanceSettings, baseRevision, saved/error/conflicted          | Preso ao draft; receipt após sucesso       | Draft não é substituído pelo snapshot novo                             | Remonta no restore; desmonta no recovery            | Sair destrói                                      | Perde              |
| Delete                                      | Alvo, revisão, busy/error/conflicted; sem texto editável                | Capturado ao abrir confirmação             | Conserva intenção antiga                                               | Componente da página remonta/desmonta               | Sair da página destrói                            | Cancela intenção   |
| RemoveDemo                                  | Revisão de confirmação, busy/error                                      | Capturado em App                           | Preserva token                                                         | Fecha                                               | Host em App sobrevive                             | Cancela intenção   |
| Restore backup                              | Backup validado, preview, safety snapshot+revision, fases/erro          | Safety da leitura coerente, não do arquivo | Não remonta; safety pode ficar stale e A1/A2b rejeitam                 | Host fora do gate; não presumir renovação de safety | Host em App sobrevive                             | Cancela preparação |
| Filtros/paginação/mês, instalação e efeitos | Estado visual, sem comando pendente                                     | Não                                        | Pode atualizar                                                         | Pode reinicializar                                  | Parte se perde                                    | Reinicializa       |

| Unidade                  | Proteção planejada                                                                                                                        | Persistência                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Create/update e Settings | Dirty, guard de saída/reload/PWA; consulta volátil após invalidação forçada                                                               | Nenhuma durável                                         |
| Importação               | Trabalho preparado/opções alteradas; busy; guard de descarte e consulta da preparação invalidada na mesma página                          | File/preview só na memória já necessária ao fluxo       |
| Restore                  | Preview pronto é preparação protegida; processamento/commit/verify são busy. Cancelar continua sem escrita, agora com aviso se há preview | Nenhuma; nunca persistir arquivo/safety automaticamente |
| Delete/removeDemo        | Não são dirty por abrir. Somente operação em curso bloqueia navegação/update programados                                                  | Nenhuma                                                 |
| Estado visual            | Não participa do dirty registry                                                                                                           | Nenhuma nova                                            |

# Dirty state

Separação de autoridade:

| Tipo                           | Autoridade / uso                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| A — dado financeiro persistido | IndexedDB pelo repository; somente writers existentes                                   |
| B — snapshot confirmado        | Envelope LocalRead validado, associado à sua revisão; fonte das métricas e backup       |
| C — draft UI                   | Conteúdo digitado, inclusive incompleto/inválido; nunca resultado financeiro confirmado |
| D — token A2b                  | Precondition da origem; não é indicador dirty nem relógio                               |
| E — visual                     | Filtros, foco, animação, notice; não bloqueiam por si                                   |
| F — preview                    | Preparação de import/restore; só vira dado confirmado após comando protegido            |

Dirty é diferença entre a **projeção editável atual** e a base da própria sessão. Capturar defaults uma vez, inclusive data, contas e categorias; não recalcular base a cada render, refresh ou virada do dia. Dirty não exige validade: texto incompleto também é trabalho.

- Transação nova: campos vazios e defaults iniciais são clean. Comparar tipo, strings de valor/descrição/data, IDs selecionados e booleano recorrente. Editar e desfazer exatamente fica clean. Preservar strings digitadas: não converter vazio em zero nem arredondar para decidir se há trabalho. Uma grafia numérica diferente pode continuar dirty; é um aviso conservador explícito, sem alterar parseAmount/regras financeiras. Categoria/destino ativo e troca de tipo precisam de testes próprios.
- Transação existente: base é a projeção UI da entidade ao abrir; kind/target/baseRevision ficam separados e imutáveis. Não comparar com a entidade recebida posteriormente por refresh.
- Settings: comparar estrutura dos campos editáveis, IDs, listas/ordem e valores da sessão, ignorando ordem de propriedades de objetos. Acrescentar/remover conta/categoria/meta/despesa fixa entra na comparação. A normalização já feita pelos handlers permanece; não introduzir nova normalização financeira. Incluir estado textual local adicional caso a UI passe a mantê-lo.
- `saved=false` não significa dirty. Submit que falha conserva base/draft; sucesso só redefine base com o **payload aplicado e receipt daquela operação**. Não usar snapshot de um refresh posterior. A correção pós-recheck permanece.
- Import: clean sem arquivo e com opções iniciais. Arquivo selecionado ou opções alteradas é trabalho protegido, mesmo antes de uma prévia válida; parse em curso é busy. Sucesso confirmado/Concluir encerra essa preparação. Deduplicação/no-op aceitos seguem receipt A2b, sem retry automático.
- Restore: clean antes de preview válido; seleção/processamento usa busy. Preview pronto/safety obtida é preparação protegida, não alteração financeira. Falha de parse sem preview não cria dirty fictício. Cancelar descarta a preparação, não restaura nada.
- Delete/removeDemo: não dirty. Busy, intenção de escrita e trabalho digitado são estados distintos.

Registro global mínimo: identificador de sessão, tipo/label, `hasUnsavedWork` e `busy`. Cada formulário calcula seu estado e detém conteúdo/base/token; o registro não recebe valores, linhas, arquivos ou snapshots. Atualizar uma referência consultável sincronamente no mesmo handler que aceita input, além da publicação React: o guard não pode depender de um useEffect atrasado. Cleanup deve ser idempotente e associado à instância correta, inclusive em StrictMode.

# PWA atual

`vite.config.ts:10` usa VitePWA `registerType: prompt`, `injectRegister: false`, `skipWaiting: false`, `clientsClaim: true`, precache de assets e limpeza de caches. Registro manual em `src/pwa/register.ts`; não usa virtual registerSW/updateSW.

`registerPwa` detecta installing→installed, waiting já existente e controllerchange. Verifica update ao ficar online, receber focus, retornar à visibilidade e por intervalo de uma hora; throttle de 60 segundos. Falha de check não interrompe operações financeiras.

`update()` exige oferta e não estar updating; retorna se encontrar qualquer `dialog[open]`. Não consulta Settings nem dirty. Sem waiting, chama location.reload diretamente. Com waiting, marca requestedReload, envia SKIP_WAITING e espera controllerchange; então recarrega sem reavaliar formulários. Timeout de 15 segundos limpa a intenção e informa erro.

Sem requestedReload, controllerchange apenas publica oferta/estado offline, preservando o documento. Portanto **não foi identificado skipWaiting automático nem reload automático de outra aba nesse código**. A lacuna é a segurança do pedido local e da janela até a ativação, não toda a estratégia PWA.

# Estratégias avaliadas

| Estratégia                                 | Benefício                                                                          | Limite / decisão                                                                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Só beforeunload                            | Pequeno aviso de reload/saída                                                      | Não cobre hash/modal/remount; móvel não garante evento. Insuficiente                                                                                                  |
| Só guard PWA                               | Corrige Settings/update                                                            | Não cobre saída interna, manual ou invalidação. Insuficiente                                                                                                          |
| React atual apenas                         | Sem storage adicional                                                              | Remount perde os owners. Insuficiente sem guards e retenção volátil                                                                                                   |
| sessionStorage seletivo                    | Recuperação por aba após reload                                                    | Exige formato, limites, leitura falha, descarte/expiração, compatibilidade e proteção contra base recriada. Não necessário para os oito objetivos mínimos deste plano |
| localStorage                               | Sobrevive ao fechamento e é simples                                                | Compartilhado por origem, dados sensíveis retidos e colisão entre abas; durabilidade não pedida. Rejeitado                                                            |
| IndexedDB de drafts                        | Capacidade e transações para arquivos/estruturas                                   | Stores/protocolo/limpeza/migração para um requisito não escolhido. Rejeitado                                                                                          |
| Registry + guards + retenção só na memória | Cobre ações controladas e trabalho durante invalidação, com limite claro no unload | ESCOLHIDA; sem recuperação pós-reload                                                                                                                                 |
| Registry + persistência geral              | Recuperação mais ampla                                                             | File/preview/safety, quotas e histórico de drafts ampliariam desnecessariamente A2c. Rejeitado                                                                        |

Comparação de armazenamento, caso um requisito futuro realmente exija recuperar após reload:

| Meio           | Ciclo de vida / isolamento                                             | Tamanho/atomicidade                                                         | Offline / limpeza / sensibilidade                                               |
| -------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Memória React  | Documento/aba atuais; sem recuperação contratual após destruição       | Limitada ao processo; atualização local, sem commit durável                 | Funciona offline; libera ao encerrar/descartar; scripts da origem ainda acessam |
| sessionStorage | Origem + sessão da aba; reload preserva, opener pode começar com cópia | Strings síncronas; sem transação entre chaves; quotas/políticas podem negar | Offline; limpeza explícita e fim da sessão; não é cofre criptografado           |
| localStorage   | Origem, compartilhado entre abas e sessões                             | Strings síncronas; sem transação de múltiplas chaves                        | Offline; retenção manual, risco de conteúdo antigo e sensível duradouro         |
| IndexedDB      | Origem, compartilhado, durável conforme browser                        | Structured clone/arquivos, transações; quota/evicção continuam limites      | Offline; limpeza e versão explícitas; não é proteção contra script da origem    |

O comportamento de sessão e a possibilidade de SecurityError são documentados em [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage). Não escolher storage por conveniência nem vender qualquer opção como garantia contra encerramento físico.

# Estratégia escolhida

**A, sem persistência durável**, com quatro partes delimitadas:

1. Owners de edição calculam dirty/prepared/busy e registram apenas esses indicadores.
2. Guard único de ações da UI confirma descarte; PWA bloqueia update com trabalho/busy, sem salvar ou descartar automaticamente.
3. Beforeunload condicional para a navegação que pertence ao navegador.
4. Em invalidação involuntária por restore/recovery, manter os owners voláteis acima do ponto de desmontagem e trocar a sessão para consulta sem submit. Não armazenar todo FinanceSnapshot num registry.

A parte 4 é necessária pela reprodução C06. Um simples listener no form não preservaria conteúdo depois do gate. Models de transação/Settings/import pertencem a seus hosts de sessão em App; a visualização financeira continua condicional ao snapshot. Capturar input durante a edição, não tentar extraí-lo num cleanup depois que o DOM sumiu. Manter somente a sessão corrente de cada tipo; nenhuma coleção histórica, persistência entre abas ou fila de comandos.

Registro global e owners são mecanismos diferentes: o primeiro responde “há trabalho/busy?”; os segundos já são responsáveis pelo draft e podem oferecer sua projeção textual para consulta após invalidação. Não criar event bus genérico.

# Persistência ou não

**Persistência de draft: NÃO. Storage escolhido: nenhum; somente memória da página.**

Schema change: **NÃO**. IndexedDB version bump: **NÃO**. Nova store: **NÃO**. Novo storage: **nenhum**.

| Pergunta                                                    | Contrato                                                                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Recuperar após reload manual?                               | Não. Avisar antes quando o navegador permitir; se confirmar, descarta                                                             |
| Recuperar após update PWA?                                  | Não necessário: update próprio fica bloqueado até salvar/descartar o trabalho                                                     |
| Preservar ao fechar aba ou próxima sessão?                  | Não                                                                                                                               |
| Sobreviver dias/process kill?                               | Não há garantia; página pode manter memória enquanto viva, sem histórico                                                          |
| Remount forçado por restore/recovery?                       | Consulta volátil, marcada inválida, enquanto o documento continuar vivo                                                           |
| Chaves de storage / protocolo / createdAt / TTL / migração? | Não se aplicam: nenhum blob persistido, store ou chave nova                                                                       |
| Identidade em memória?                                      | Sessão da aba + tipo + modo + ID alvo quando houver; nova transação ganha ID de sessão, não nova identidade financeira antecipada |
| Limpeza?                                                    | Save confirmado, descarte explícito, fechamento autorizado ou fim do documento; invalidação conserva apenas até copiar/descartar  |

Nenhum draft é automaticamente recuperado, reenviado ou associado à revisão corrente. Não há loop de restauração, expiração por relógio ou incompatibilidade de formato entre releases. Se recuperação pós-reload virar requisito, reabrir a decisão de storage explicitamente em outro planejamento, não acrescentá-la durante esta implementação.

# Navegação e fechamento

Hash router permanece simples. Guardar página/hash aceitos separadamente do hash solicitado. Interceptar links internos conhecidos antes da transição; cobrir também hashchange, Voltar/Avançar e mudança direta de hash sem desmontar a página aceita antes da decisão. Ao cancelar, restaurar o hash aceito sem criar entradas/loops de history; ao confirmar, executar exatamente uma transição e descartar somente a sessão afetada. Definir e testar esse comportamento no hook usePage, sem instalar outro router.

Settings dirty impede saída silenciosa. Modal global que sobreviveria à rota pode permanecer, mas não deve permitir uma transição que destrua outro owner dirty; a navegação do fundo continua inerte enquanto showModal estiver aberto. Filtros/mês não pedem confirmação.

X, Escape, backdrop e Cancelar, onde existir, convergem para a mesma solicitação de fechamento. Untouched fecha direto. Dirty/prepared mostra escolha **Continuar editando** / **Descartar e fechar**. Usar confirmação inline no próprio diálogo; para Settings/rota, um único diálogo de confirmação do shell. Não empilhar modais nativos. Repetir Escape durante a confirmação deve cancelá-la/voltar à edição, nunca confirmar descarte implicitamente.

Busy impede sair/update programados até a operação terminar. Depois de sucesso não emitir aviso de perda para o conteúdo já aplicado. Falha mantém edição e proteção. Voltar ao conteúdo original remove dirty, sem necessariamente liberar busy ou uma prévia ainda preparada.

# Reload

Instalar beforeunload somente enquanto houver trabalho não salvo/preparação/busy; chamar preventDefault e definir returnValue por compatibilidade. Remover o listener ao limpar todos os bloqueadores. Não depender de mensagens customizadas, keydown de F5/Ctrl+R ou interceptação de botões do navegador.

O aviso depende de interação anterior e não é confiável em todos os encerramentos mobile; o texto é controlado pelo navegador. Não prometer proteção de crash/kill. [MDN beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event).

Se o usuário confirmar reload/saída, o draft acaba. BFCache/restauração do browser pode conservar estado incidentalmente, mas não é contrato da aplicação. Ao voltar, carregar repository antes de aceitar comandos; CAS continua exigindo token de origem caso uma sessão em memória tenha sobrevivido.

Reload durante um write pode deixar resultado desconhecido para a UI. A2c não reenvia nem cria idempotência nova: reler o estado confirmado. Um aviso não substitui a atomicidade existente.

# Update PWA

Oferta de versão nova não encerra formulário nem congela o aplicativo. Usuário pode continuar editando.

- **Sem trabalho/busy:** Atualizar permite ativar worker waiting e recarregar quando seguro. Um modal realmente untouched pode fechar como parte dessa ação autorizada; não é dirty por estar aberto.
- **Com trabalho/busy:** não enviar SKIP_WAITING por esse pedido, não recarregar e não criar atualização automática enfileirada. Mostrar “Há uma atualização disponível. Salve ou descarte suas alterações antes de atualizar.” Para busy, “Aguarde a operação terminar.”
- **Após salvar/descartar:** liberar o botão; ainda exigir novo clique. Cancelamentos repetidos não causam reload posterior.
- **Entre pedido e controllerchange:** consultar novamente o registry. Se houve nova edição/busy, cancelar autorização de reload e manter oferta “Versão pronta; conclua sua edição antes de recarregar”. O worker pode já estar ativo; não há rollback de SW. Não perder conteúdo.
- **Sem waiting porque outra aba já ativou:** aplicar a mesma conferência antes do location.reload direto. Não tratar ausência de waiting como autorização.
- **Timeout/erro/redundant:** limpar a intenção pendente, manter página e permitir tentativa explícita posterior. Evento tardio só pode recarregar se ainda houver autorização válida e a página estiver segura.
- **Cliques repetidos:** uma operação local em curso; nenhuma sequência de reloads. Dispose cancela listeners/timer/intenção.

Conferência imediata, antes de SKIP_WAITING, e final, antes de location.reload, são obrigatórias. O beforeunload é defesa adicional, não o guard principal do PWA. Não simular um clique do usuário em “salvar” nem aceitar automaticamente perda de trabalho.

# Service Worker

Continuar com worker de assets, prompt, skipWaiting false e registro manual. Nenhuma leitura/escrita de finanças, draft, token, safety ou dirty payload no worker. Preferencialmente nenhuma mudança no gerador/worker; proteção reside na página.

SKIP_WAITING só segue autorização da UI local segura. Ativação é compartilhada; não confundir worker ativo com documento recarregado. A documentação explica que skipWaiting pode colocar um worker novo no controle de documentos antigos: [lifecycle oficial](https://web.dev/articles/service-worker-lifecycle).

Workbox remove entradas de precache que não estão no manifesto novo durante activate. Os ensaios usam duas versões identificáveis do mesmo código; não certificam evolução incompatível de chunks. Manter compatibilidade de assets das páginas abertas é responsabilidade da entrega do release; falha de lazy import deve preservar conteúdo e informar erro, sem fallback de reload forçado. [Workbox precaching](https://developer.chrome.com/docs/workbox/modules/workbox-precaching).

# Multi-aba

**Garantia é por documento, não veto distribuído à ativação do worker.** Se A está dirty e B está clean, B pode solicitar ativação e recarregar B. A recebe controllerchange e permanece no documento com seu draft. A só recarrega mediante sua própria ação e seu guard. Uma aba background não precisa responder a B para manter essa regra.

Não adicionar canal de coordenação dirty/PWA e não reutilizar `vertice-updates` para isso. BroadcastChannel não oferece prova de ausência de abas suspensas/antigas; criar votação com timeout daria falsa garantia ou bloquearia updates indefinidamente. Guard local + ausência de reload de terceiros é suficiente para o contrato escolhido, com o limite de compatibilidade de assets documentado.

O worker pode deixar waiting por autorização de outra aba clean ou pela evolução natural do lifecycle quando não há cliente antigo. Não prometer que “qualquer dirty em qualquer aba mantém waiting globalmente”. Abas com versões anteriores ao A2c também não adquirem guards retroativamente. O requisito é não destruir trabalho no documento A2c, e não impedir toda mudança do SW compartilhado.

O canal financeiro conserva somente sua semântica atual changed/restored. Restore de outra aba invalida a sessão de edição por esse fluxo, independentemente de PWA.

# Integração com A2b

Preservar `{kind, targetId, baseRevision}` e base de edição durante a vida da sessão. Draft de revisão 10 nunca passa a 12 porque o repository atualizou. Registry não tem API para substituir token. Dados de consulta invalidada não são encaminháveis ao writer.

Fluxos normais ainda submetem o token original e deixam CAS decidir. Uma diferença observada de revisão pode sinalizar “Esta edição começou com dados anteriores”, mas não autoriza rebase. Depois de LocalConflictError, manter submit desabilitado e conteúdo disponível para consultar/copiar; nada de retry, merge, novo ID ou recriação automática de entidade removida.

“Atualizar edição” de Settings mantém o sentido A2b: descartar e abrir uma intenção nova a partir de snapshot/revisão atuais, agora passando pelo guard de descarte se houver trabalho. Cancelar conserva conteúdo e revisão antigos. Copiar é ação explícita de texto; não há botão que injete todo o draft antigo numa revisão nova. Nova edição exige leitura atual e revisão humana.

Após sucesso: base é o payload aplicado; token é seu WriteReceipt. Uma leitura de fundo r+2 não pode promover o draft r+1. saved/error são feedback separados. Submit rejeitado não limpa dirty e não mostra confirmação anterior.

# Restore/recovery

**Restore solicitado nesta aba:** se existir outro draft dirty, antes de abrir/confirmar a operação que o descartará, exigir salvar separadamente ou descartar explicitamente. Cancelar essa decisão deixa a edição intacta. A confirmação do restore, seu safety e a verificação continuam A1; não usar draft como safety. Preview de restore pode ser cancelado sem qualquer write.

**Restore em outra aba, restore verify falho ou recovery por leitura:** não é possível vetar o evento externo e não se deve segurar um snapshot inválido como atual. O gate A2a entra imediatamente; sessões de edição tornam-se invalidadas. Seus owners sobrevivem apenas como conteúdo volátil de consulta, claramente rotulado “Não salvo — edição anterior à recuperação/restauração”. Sem métricas calculadas a partir dele, sem formulário financeiro ativo, sem submit/import/save.

Exibir consulta/cópia e descarte fora do painel financeiro validado. Para transação/Settings, mostrar somente campos da edição; para import, mostrar opções e prévia já preparada, sem recomputá-la como autorização atual nem executar o lote. Limitar a retenção às sessões correntes existentes; não acumular versões. A2a retry não reativa automaticamente uma sessão invalidada, mesmo se a base voltar a parecer igual. Fechar/descarte e abertura explícita criam uma sessão nova.

Safety de restore não pode atravessar invalidação como autorização reutilizável: descartá-la e exigir nova leitura/download se o fluxo puder continuar. Em recovery inválido, safety continua falhando; não há force restore, skip safety ou reset. Preparação/arquivo de restore fica somente em memória e jamais é restaurada automaticamente.

Se a pessoa optar por sair com conteúdo invalidado ainda em consulta, o mesmo aviso de descarte se aplica. Não exigir que ela “salve” num banco inválido para liberar update: oferecer copiar e descartar conscientemente. Conteúdo se perde em crash/kill, conforme limite declarado.

# UX

| Situação                      | Ação mínima                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| Saída com edição              | “Há alterações não salvas.” Continuar editando / Descartar e sair                                   |
| Fechar import/preparação      | Explicar perda das opções/prévia; continuar ou descartar; arquivo original do usuário não é apagado |
| Update bloqueado              | Salvar ou descartar primeiro; nunca salvar automaticamente                                          |
| Worker ativo, reload adiado   | Informar que a versão está pronta e aguarda conclusão da edição                                     |
| Conflito A2b                  | Conservar mensagem atual; copiar/consultar; Atualizar edição com descarte consciente                |
| Restore/recovery involuntário | Separar dados confirmados indisponíveis de texto não salvo; consulta sem submit                     |
| Operação em andamento         | Aguardar; não chamar de dirty nem prometer que cancelou um commit                                   |

Não incluir revisões numéricas, schema, registry, CAS ou detalhes de IndexedDB no fluxo normal. Conteúdo copiado só por gesto do usuário; se clipboard não estiver disponível, permitir seleção manual. Sem logs/telemetria de conteúdo financeiro.

# Testes

Planejar testes novos; nenhum teste de produção foi criado/editado nesta análise. Não fixar um total artificial de casos. Executar primeiro os casos A2c, depois unit, TypeScript aplicação e tests/config, build, E2E e formatação; futura árvore isolada deve conter os pré-requisitos PWA explicitamente delimitados.

| Camada               | Casos de aceitação                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit dirty           | Untouched clean; editar/desfazer; strings vazias/zero/grafias; create/update; tipo/categoria/destino/recorrência; Settings listas e ordem de objetos; base congelada no refresh; saved false sem dirty |
| Unit registry        | Múltiplos owners, última edição síncrona, unregister correto/StrictMode, busy distinto, sessão invalidada, um owner não limpa outro                                                                    |
| Unit lifecycle       | Sucesso usa payload/receipt; falha conserva base; invalidação nunca retokeniza; descarte libera memória; nenhum teste de formato/expiração durável porque não há storage                               |
| App real / navegação | Settings dirty com links, hash direto, Voltar/Avançar; cancelar preserva DOM/hash/token; confirmar executa uma vez; filtros não avisam                                                                 |
| App real / modal     | Create e edit: X/Escape/backdrop; untouched fecha direto; confirmação inline e foco; busy não fecha; Cancelar nos fluxos onde existe                                                                   |
| App real / reload    | Desktop com interação: beforeunload cancelar e aceitar; F5/Ctrl+R pelo navegador quando suportado; accepted reload começa só do repository, sem draft restaurado                                       |
| App real / import    | Arquivo/opções/prévia; inválidos também protegidos; sucesso limpa; alteração de props não promove token; fechar/reload avisa; sem persistir File                                                       |
| App real / restore   | Preview clean/preparado; cancelamento sem writes; dirty Settings antes de restore; safety obrigatório; restore remoto/verify conserva consulta, invalida submit                                        |
| App real / recovery  | Missing/invalid/transitório durante edição; métricas/form financeiro desaparecem; conteúdo de consulta permanece; retry não reativa intenção; sem reparo                                               |
| A2b integração       | Broadcast/focus preservam draft; stale submit conflita sem writes/revision; Atualizar edição cancelado conserva token; alvo removido não vira create; sucesso→conflito sem confirmação residual        |
| PWA nativo           | Duas builds reais; waiting sem reload; clean aplica; Settings/create/edit/import/restore preparados bloqueiam; clean dialog não basta para bloqueio; busy bloqueia                                     |
| PWA corrida          | Reter mensagem/ativação, começar edição depois do clique, liberar controllerchange: não recarregar; cobrir também caminho sem waiting, timeout tardio, clique duplo e dispose                          |
| Multi-aba            | A dirty, B aplica; A background/foreground conserva documento/conteúdo/token; A decide depois. Canal financeiro ausente não enfraquece CAS nem guard local                                             |

Não substituir todos os testes PWA por mocks: usar browser real e worker gerado. Instrumentação temporal deve reter/liberar uma etapa observável, sem sleeps como prova. Antes/depois de ações que não escrevem, comparar rows/personal/metadata/revision. Não aumentar timeout para esconder regressão.

Preservar regressões A1 (safety, rollback, changed, verify, R1/R2), A2a (missing/invalid, unknown != zero, causas, recovery) e A2b (seis writers, fence, tokens e pós-recheck). Não reabrir seus contratos para simplificar testes A2c.

Mobile/Safari: testes automatizados de viewport não certificam lifecycle iOS. Planejar verificação manual em Safari/iOS PWA de background/retorno/fechamento, navegação e waiting/update. Registrar explicitamente onde beforeunload não aparece. Sem promessa de sobrevivência a background kill ou aparelhos físicos certificados nesta fase.

# Arquivos prováveis

| Arquivo                                                               | Mudança futura delimitada                                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/App.tsx`                                                         | Hosts de sessão volátil, guards de ações e consulta invalidada; preservar integrações existentes |
| `src/hooks/usePage.ts`                                                | Transição de hash aceita/solicitada com confirmação sem desmontagem prematura                    |
| `src/components/dashboard/DashboardLayout.tsx`                        | Encaminhar links conhecidos ao guard, se o hook sozinho não interceptar antes da mudança         |
| `src/components/pwa/PwaControls.tsx`                                  | Feedback/botão conforme bloqueadores; não receber payload financeiro                             |
| `src/pwa/register.ts`                                                 | Receber consulta de segurança e conferi-la em todos os reloads; estados pendentes/timeout        |
| `src/components/settings/SettingsPage.tsx`                            | Base/dirty independentes de saved; descarte guardado; owner de sessão acima do gate              |
| `src/components/transactions/TransactionForm.tsx`                     | Captura fiel de campos DOM, comparação de base e retenção da sessão invalidada                   |
| `src/components/transactions/AddTransactionModal.tsx`                 | Conectar owner/dirty/busy ao fechamento                                                          |
| `src/components/transactions/ImportModal.tsx`                         | Proteção da preparação e retenção volátil sem submit após invalidação                            |
| `src/components/settings/RestoreBackupDialog.tsx`                     | Guard de preparação; busy; invalidação de safety, sem alterar restore A1                         |
| `src/components/transactions/TransactionsPage.tsx`                    | Só integração de busy/fechamento se necessária; filtros/delete não viram dirty                   |
| `src/components/ui/Dialog.tsx`                                        | Única rota de close e confirmação inline acessível; sem reescrever visual                        |
| Hook/context pequeno novo, por exemplo `src/hooks/useUnsavedWork.tsx` | Registry de indicadores e beforeunload, sem conteúdo financeiro                                  |
| Hosts/helpers locais de sessão, somente onde necessários              | Ownership e projeção editável; não framework genérico de drafts                                  |
| `tests/a2c-*.spec.ts`, testes unit do guard; `tests/pwa.spec.ts`      | Regressões delimitadas e reais, preservar testes anteriores                                      |
| README / futuro IMPLEMENTACAO-A2C.md                                  | Contrato de descarte/reload e limites                                                            |

`useTransactions` deve conservar gates e semântica A2b. Preferir consumir error/snapshot/restoreVersion já expostos; nenhuma alteração necessária no repository. `vite.config.ts`/SW não precisam de mudança de protocolo para esta proposta.

Pré-requisito de entrega: o PWA atual é trabalho preexistente não commitado. Uma futura implementação/commit A2c deve identificar e validar a base PWA necessária em árvore isolada; não incluir toda a PWA/visual/Three/dependências por engano nem fingir que A2b já os contém. A delimitação do commit desses pré-requisitos não é executada neste planejamento.

# O que fica fora

Persistência durável de draft, autosave financeiro, recuperação depois de crash, sync cloud/multidispositivo, Supabase, Workspace, Business, IA, CRDT/outbox, merge/rebase automático, histórico de versões, colaboração, alterações Money/backup/repository/CAS/revision, schema/store/database novos, redesenho da PWA e alterações visuais gerais.

Draft não entra no backup JSON v2. SW não conhece finanças. Nenhum armazenamento adicional, dependência nova ou bump de IndexedDB é necessário.

# Riscos

| Tentativa adversarial / falha                 | Resposta contratual e limite                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Update chega com draft dirty                  | Só oferta; edição continua; pedido bloqueado                                                    |
| Update chega após save                        | Base limpa pelo receipt, não pelo aviso; clique novo pode aplicar                               |
| Dirty muda entre clique e ativação            | Rechecagem final adia reload; worker ativo não força descarte                                   |
| Duas abas / background                        | B pode ativar; A nunca recarrega por isso; sem quorum fictício                                  |
| F5/Ctrl+R/fechar aba                          | Aviso nativo quando disponível; aceitar termina memória                                         |
| Crash/kill/mobile sem beforeunload            | Perda possível e aceita; não chamar de recuperação garantida                                    |
| Rota/Escape/clique fora                       | Guard central da ação; cancelar não desmonta e não muda token                                   |
| Dirty falso positivo                          | Bases de UI estáveis; representações textuais diferentes podem avisar conservadoramente         |
| Dirty falso negativo                          | Cobrir DOM, checkboxes, selects, listas e alteração no mesmo tick do update                     |
| Restore/recovery no meio da edição            | Gate imediato; owner invalidado para consulta, nunca write                                      |
| Draft velho após revisão nova / alvo removido | Token antigo e kind/ID preservados; CAS/invalidated impedem reaplicação automática              |
| Draft aplicado mas não limpo                  | Atualizar base somente por sucesso real; teste confirma ausência de aviso residual              |
| Schema/app incompatível                       | Sem draft durável a migrar; fonte financeira continua protegida por versões/A2b                 |
| Atualizações repetidas / waiting por horas    | Sem auto-apply; revalidar no clique; timeout libera tentativa sem reload tardio                 |
| Cancelar várias vezes                         | Nenhuma autorização residual nem fila que execute ao ficar clean                                |
| Loop de recuperação de draft                  | Não há restauração automática; invalidação não volta a editável por refresh                     |
| Bytes antigos removidos do cache              | Risco de compatibilidade de release documentado; erro não autoriza reload com trabalho          |
| Pressão de memória                            | Manter apenas sessões atuais e limites existentes de import; liberar no descarte, sem histórico |

Os casos C01–C06 são o alvo de correção. R01/R02 são limites aceitos; R03 é descarte consciente já explicado pela UI. Nenhuma evidência nesta análise exige reabrir integridade A1/A2a/A2b.

# Critérios de aceite

1. Create/update, Settings, importação preparada e restore preview têm critérios objetivos; confirmação vazia e estado visual não viram dirty.
2. Todo fechamento/navegação controlado que descartaria trabalho oferece decisão antes de destruir o owner; cancelamento preserva campos, kind, ID e token.
3. Reload próprio do PWA passa pelo guard no pedido e imediatamente antes de recarregar, inclusive sem waiting e na corrida de controllerchange.
4. Update disponível não provoca interrupção nem auto-apply ao ficar clean; usuário pode aplicar depois de salvar/descartar.
5. Beforeunload só existe com bloqueadores; limites mobile/crash e ausência de recuperação pós-reload são declarados.
6. Restore/recovery não mantêm formulário financeiro gravável nem métricas antigas; edição involuntariamente invalidada pode ser consultada/copiada na mesma página até descarte.
7. Consulta invalidada, Broadcast/focus e retry nunca promovem revisão nem reativam submit. Nova intenção exige abertura explícita a partir de dados atuais.
8. Busy bloqueia ações programadas, sem garantir cancelamento de commits já iniciados; nenhum retry financeiro automático.
9. A dirty não é recarregada porque B ativou o SW; garantia por documento e risco de compatibilidade são testados/documentados.
10. Nenhum payload de draft no registry global, SW, canal financeiro, logs ou backup; nenhuma persistência durável, nova key/store/version de DB.
11. A1/A2a/A2b e correção sucesso→conflito permanecem verdes; decisões anteriores não são relaxadas.
12. Testes unit/App/PWA reais cobrem os cenários e falhas acima; nenhuma nova feature é exigida só para igualar contagem histórica de testes.
13. Apenas hunks A2c e pré-requisitos PWA explicitamente revisados podem compor a futura entrega; workspace misto preservado.

**Pode implementar A2c depois deste plano: SIM**, respeitando este contrato sem persistência durável e a delimitação dos pré-requisitos PWA. O menor conjunto suficiente é guard + aviso + retenção volátil durante invalidação; armazenamento persistente não é necessário para o objetivo escolhido. Esta decisão não implementa A2c nesta execução.
