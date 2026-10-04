# Escopo

Implementação local da estratégia A de [PLANO-A2C.md](PLANO-A2C.md): proteção de trabalho não salvo, sem persistência durável. Trabalho iniciado em 27/09/2026 e retomado em 28/09/2026. Checkpoint `7ac117a`. Nenhum commit ou staging.

Schema change: **NÃO**. IndexedDB version bump: **NÃO**. Nova store/storage: **NÃO**. Backup: **JSON v2 preservado**. Nenhum draft no worker, backup, canal financeiro ou registry global. B1 não iniciado.

# Estado anterior

C01–C06 foram reproduzidos no planejamento; detalhes em [A2C-EVIDENCIAS.md](A2C-EVIDENCIAS.md). Na retomada da implementação já existiam registry, guards, retenção volátil, 25 testes unitários novos e testes de UI/PWA. Unitários: 246/246; 22 cenários de UI já tinham passado. Faltavam concluir a preparação dos testes PWA, validar os últimos dois casos de restore/recovery, executar E2E completo e escrever este relatório. Este trabalho não reiniciou o planejamento nem reabriu contratos financeiros anteriores.

O PWA era trabalho preexistente do working tree, não parte de A2b. A2c integra `src/pwa/register.ts` e `src/components/pwa/PwaControls.tsx`, e amplia `tests/pwa.spec.ts`. Preserva configuração Vite/worker, assets, dependências e implementação visual/Three. Os testes visual/Three recebem somente a confirmação de descarte agora necessária para fechar um formulário preenchido.

# Bugs corrigidos

| Caso | Correção                                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------- |
| C01  | Settings dirty participa do guard de update da própria aba                                                  |
| C02  | Surgimento de dirty/busy revoga autorização pendente; controllerchange reconsulta segurança antes de reload |
| C03  | Beforeunload condicional para edição/preparação/busy; reload aceito descarta sem recuperação automática     |
| C04  | Rota solicitada não desmonta Settings antes da confirmação; cancelar conserva edição                        |
| C05  | X/Escape/backdrop/Cancelar convergem para decisão de fechamento; Escape durante confirmação volta à edição  |
| C06  | Owners sobrevivem ao gate apenas para consulta, com invalidação irreversível da sessão e sem submit         |

A primeira execução completa detectou uma regressão introduzida pela integração A2c: após restore local bem-sucedido, efeitos concorrentes podiam criar e limpar a sessão de Settings no mesmo ciclo, deixando a página sem formulário. A renovação de sessões clean foi centralizada em um único efeito; sessões dirty/busy continuam retidas. O teste A1 existente permaneceu inalterado e passou após a correção, junto com 28 cenários relacionados.

# Dirty registry

`unsavedWork.ts` contém somente IDs, lease de ownership, escopo e indicadores `hasUnsavedWork`, `busy`, `invalidated`. `useUnsavedWork.tsx` faz registro/cleanup em layout effect. Atualizações de input e início de busy escrevem indicadores sincronamente; subscribers podem consultar imediatamente. O listener de beforeunload também acompanha a atualização síncrona.

Um lease antigo não remove nem atualiza uma sessão substituta. Cleanup é idempotente; remontagem restaura os indicadores do owner. Não há API de revisão, payload financeiro ou coordenação entre abas nesse registry.

# Transaction dirty

Projeção completa do formulário DOM via FormData, somada ao tipo, conserva strings digitadas, contas, categoria/destino, data e recorrência. Base capturada uma vez; data/defaults e referências de seleção da sessão ficam estáveis. Editar e desfazer exatamente limpa dirty; vazio não vira zero. Parse e validação financeira permanecem existentes.

O owner pertence a AddTransactionModal; TransactionForm conserva a projeção em memória antes de eventual remoção do DOM. FormData não é recapturado durante busy, pois fieldset disabled omitiria campos. Kind, entidade e revisão de abertura continuam na sessão original de App. Sucesso confirmado encerra a edição; falha conserva proteção.

# Settings dirty

Comparação estrutural com propriedades ordenadas e listas na ordem original; inclui IDs e todos os campos editáveis. `saved`, `error`, `conflicted` e dirty continuam distintos. Handlers atualizam dirty no mesmo fluxo do input.

Sucesso usa exclusivamente payload validado/aplicado e WriteReceipt daquela operação para redefinir base e revisão. Refresh não limpa dirty nem promove token. Atualizar edição após conflito exige descarte se houver trabalho; cancelar conserva draft, conflito e token. Restore iniciado na página também passa por decisão de descarte.

# Import

Arquivo selecionado mantém preparação protegida, inclusive se inválido. Opções e preview vivem no mesmo owner; leitura é busy. Sucesso libera preparação; falha/conflito conserva. File não é persistido. Após invalidação, usa a última prévia preparada, sem recalcular como autorização da base nova nem disponibilizar importação.

# Restore preview

Antes de preview válido, sessão clean; leitura/download/restore são busy. Preview válido é trabalho protegido. Cancelar/X/Escape/backdrop passam pelo mesmo guard.

Mudança de geração por restore/recovery elimina safety. Uma geração monotônica local impede resultado assíncrono antigo de restabelecer autorização. Novo download exige nova leitura; safety A1, precondition e verificação continuam no caminho existente. Nenhum force restore, skip safety ou reset.

# Modal guard

Dialog implementa confirmação inline, sem outro diálogo nativo empilhado: Continuar editando / Descartar e fechar. Conteúdo fica montado enquanto a confirmação aparece. Escape cancela a confirmação e restaura foco. Tratamento explícito de Escape evita que repetições acionem fechamento nativo fora do guard.

Confirmações de delete/removeDemo untouched não são dirty. Busy desses comandos é registrado sincronamente; Cancelar usa o mesmo pedido de close e não cancela commit em andamento.

# Route guard

`usePage` conserva hash/página aceitos separados da solicitação. Links são interceptados; hash direto e Back/Forward são tratados antes do desmonte de Settings. Cancelar restaura hash aceito sem nova entrada; confirmar executa uma transição. Busy impede navegação destrutiva, sem aplicar a solicitação automaticamente depois.

Filtros, mês e paginação não participam do dirty state. Sessões globais de transação/import sobrevivem à troca de hash, como já ocorria.

# beforeunload

Instalado somente com unsaved work/preparação/busy; removido quando todos os owners liberam. Usa preventDefault e returnValue por compatibilidade. Não intercepta F5/Ctrl+R. Teste real cobre cancelar e aceitar reload após interação; reload aceito volta ao estado confirmado sem recuperar draft.

# PWA clean/dirty

Registro manual, prompt e skipWaiting false preservados. Oferta não interrompe edição. Clean pode aplicar; dirty/busy impede SKIP_WAITING e reload. Modal aberto sozinho não bloqueia. Limpar trabalho libera botão, sem atualização enfileirada; novo clique obrigatório.

Sem waiting, o reload direto também consulta segurança. Timer, erro de postMessage, redundant e dispose cancelam autorização; cliques repetidos não acumulam pedidos simultâneos.

# Corrida controllerchange

O registro assina os indicadores durante o pedido. Dirty/busy novo revoga autorização mesmo se voltar a clean antes da ativação. Controllerchange autorizado consulta novamente os indicadores antes de location.reload. Documento preservado informa versão pronta/edição pendente.

Os testes PWA de Settings e transação disparam input real e tentativa de update na mesma execução JavaScript, sem await entre eles. Verificam também que beforeunload já está protegido nesse tick e que o worker continua waiting, sem escrita financeira.

Teste real retém apenas a mensagem SKIP_WAITING e depois libera sua chamada nativa; worker gerado e controllerchange são reais. Nenhum sleep é usado como prova dessa corrida. Unitários cobrem timeout/evento tardio, erro, redundant, dispose, duplo clique e caminho sem waiting.

# Multi-aba

Garantia por documento: B clean pode ativar worker compartilhado; A dirty não recarrega por esse evento, conserva draft/token e decide depois. Não há quorum ou canal dirty. Canal financeiro permanece inalterado. O teste existente de duas abas continua exercitando save posterior e aplicação explícita na outra Page.

# Restore/recovery

Gate financeiro permanece imediato. Hosts em App conservam a sessão para consulta; dados antigos não alimentam métricas ou formulários financeiros ativos. Restore externo/falha de leitura invalida transação, Settings e import. Restore local exige descarte de outros owners antes de abrir o fluxo, inclusive quando o trabalho já está invalidado para consulta.

Consulta readonly permite seleção/cópia manual e descarte confirmado. Sessão untouched não deixa formulário vazio retido no recovery.

# Invalidated session

Invalidação é memorizada por sessão. Retry que volta a disponibilizar snapshot não reativa submit, import, save ou revisão. Nenhum payload da consulta pode ser reenviado pelo componente; nova edição depende de descarte/abertura explícita. Alvo removido nunca vira create.

# Integração A2b

Repository, CAS, revision, hook financeiro, Money, validação e formato de backup não foram alterados. Draft normal submete a revisão de origem e deixa CAS decidir. Sessão invalidada nem entra no writer. Sucesso→conflito continua limpando mensagem de sucesso anterior. Testes de conflito foram adaptados somente à decisão adicional de descarte.

# Testes

| Validação                                   | Resultado                                                                               |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| Unit completo `npm.cmd test`                | PASS — 246/246, incluindo 16 dirty/registry e 9 lifecycle PWA novos                     |
| Direcionados App real                       | PASS — 24 cenários, incluindo os dois complementos da retomada                          |
| Direcionados PWA real                       | PASS — clean, quatro preparações/edições dirty, busy e corrida; duas abas também passou |
| Build `npm.cmd run build`                   | PASS — aplicação e worker gerados; aviso existente de tamanho de chunks                 |
| TypeScript aplicação e estrito tests/config | PASS nas verificações executadas                                                        |
| E2E completo                                | PASS — 237/237, incluindo 24 A2c App e 14 PWA; nenhuma falha ou skip                    |
| Prettier e git diff --check finais          | PASS                                                                                    |

Novos arquivos: `src/hooks/unsavedWork.test.ts`, `src/pwa/register.test.ts`, `tests/a2c-unsaved.spec.ts`. Ampliação PWA em `tests/pwa.spec.ts`. Adaptações de descarte nos testes A2b, recovery, restore, visual e Three preservam suas verificações anteriores de integridade e apresentação.

Preparação PWA foi corrigida para concluir a verificação inicial antes de servir release 2; não foi aumentado timeout. Reload cancelado usa o evento nativo sem esperar uma navegação deliberadamente cancelada. Falhas iniciais de Escape foram corrigidas no produto e seus testes passaram depois. Nenhum teste foi removido ou marcado skip. Nenhuma campanha de mutation testing foi iniciada e não há mutation ativa em produção. A suíte completa inclui o teste preexistente de sensibilidade A2b que remove CAS somente de um bundle isolado; esse teste foi executado sem modificar o código de produção.

# Limites

Draft vive somente no documento. Crash, process kill, mobile background kill e reload aceito podem perder conteúdo. Beforeunload depende do navegador; não há mensagem customizada garantida nem certificação de Safari/iOS/hardware. Viewport móvel não certifica lifecycle.

Worker novo pode controlar documento antigo; compatibilidade de assets entre releases continua responsabilidade da entrega. As duas builds de teste diferem por marcador HTML; não certificam migração incompatível de chunks. Sem garantia distribuída de manter waiting enquanto qualquer aba antiga tiver trabalho.

# Git

HEAD `7ac117a`, índice vazio, sem commit. Baseline de cópias dos arquivos recebidos em `%TEMP%\vertice-a2c-implementation-BXFCT1\before` permite comparar esta implementação com o working tree misto, não só com HEAD. Comparação SHA-256 final dos 102 arquivos preexistentes identificou somente 17 arquivos de integração A2c alterados: 11 de produção e 6 de testes. Os sete screenshots regenerados pela suíte foram restaurados e conferidos byte a byte contra as cópias iniciais. Dependências, configurações, código visual/Three, serviços financeiros e documentos anteriores permanecem com seus bytes recebidos. Além desses 17 arquivos, foram adicionados três arquivos de produção, três de testes e este relatório.

Produção A2c: App, usePage, registry/hook novos, Dialog/InvalidatedWork, SettingsPage/RestoreBackupDialog, TransactionForm/AddTransactionModal/ImportModal/TransactionsPage e registro/controles PWA. Nenhuma dependência nova, schema, store ou versão de DB adicionada.

Inventário de produção adicionado/alterado nesta implementação:

- `src/App.tsx`
- `src/hooks/unsavedWork.ts` (novo)
- `src/hooks/useUnsavedWork.tsx` (novo)
- `src/hooks/usePage.ts`
- `src/components/ui/InvalidatedWork.tsx` (novo)
- `src/components/ui/Dialog.tsx`
- `src/components/settings/SettingsPage.tsx`
- `src/components/settings/RestoreBackupDialog.tsx`
- `src/components/transactions/TransactionForm.tsx`
- `src/components/transactions/AddTransactionModal.tsx`
- `src/components/transactions/ImportModal.tsx`
- `src/components/transactions/TransactionsPage.tsx`
- `src/components/pwa/PwaControls.tsx` (arquivo preexistente ainda untracked)
- `src/pwa/register.ts` (arquivo preexistente ainda untracked)

Inventário de testes adicionado/alterado:

- `src/hooks/unsavedWork.test.ts` (novo)
- `src/pwa/register.test.ts` (novo)
- `tests/a2c-unsaved.spec.ts` (novo)
- `tests/pwa.spec.ts`
- `tests/a2b-conflict-ui.spec.ts`
- `tests/recovery.spec.ts`
- `tests/restore.spec.ts`
- `tests/visual.spec.ts`
- `tests/three.spec.ts`
