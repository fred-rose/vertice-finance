> **STATUS ATUAL — 22/09/2026:** A verificação pós-commit usa `readForBackup()` estrito, exige `settings["personal"]` persistido e não fabrica defaults. As referências a `load()` nessa etapa descrevem a implementação anterior à correção R1. Consulte [Correções pós-review](#correções-pós-review) ao final; o fallback global de `load()` permanece inalterado.

# Implementação A0/A1 — baseline e restauração JSON v2

21/09/2026. Escopo: somente baseline reproduzível e recuperação do snapshot pessoal local. Não houve nova dependência, database, store, versão de schema, backend, workspace, IA, sync remoto ou alteração de fórmulas financeiras. Nenhum commit foi executado.

## Estado inicial

O repositório já tinha 17 arquivos rastreados modificados e arquivos não rastreados de arquitetura, PWA, refinamento visual e Three.js. Último commit: `38c1563 chore: valida nucleo financeiro do MVP`. Essas mudanças foram preservadas; o diff contra HEAD não representa apenas A0/A1. Foram registrados hashes SHA-256 dos 74 arquivos preexistentes para separar esta entrega do estado recebido e das capturas regeneradas pelos testes.

Inspeção: status, diff, stat, histórico, cinco documentos arquiteturais/técnicos indicados, tipos, repository, hook, import/export, validação, Settings, App, cálculos pertinentes e testes existentes. Não foi encontrado AGENTS.md no projeto. A intenção segue Decisões → Revisada → Auditoria → Original; o comportamento existente foi confirmado no código e nos testes.

Ambiente observado: Windows/PowerShell, Node `v24.15.0`, npm `11.12.1`, Vitest `3.2.7`, Vite `6.4.3`, Playwright com Microsoft Edge/Chromium instalado. Dependências já estavam instaladas; package.json e lockfile não foram alterados por esta entrega.

| Verificação antes de mudanças funcionais                         | Resultado                                                         |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `npm.cmd test`                                                   | 105/105: 76 financeiros, 29 de importação/validação               |
| `npm.cmd run build`                                              | TypeScript e build aprovados; PWA gerada                          |
| TypeScript estrito de todos os testes/configuração               | Aprovado                                                          |
| `PLAYWRIGHT_PORT=5197`, `npm.cmd run test:e2e`                   | 47/47 em aproximadamente 1,4 min, incluindo PWA e efeitos visuais |
| Prettier, mesma superfície do script existente em modo `--check` | Aprovado                                                          |
| ESLint                                                           | Não configurado; não foi inventada execução de lint               |

Unit/build inicialmente não iniciaram dentro da sandbox: esbuild recebeu `Access is denied` ao resolver vite.config.ts. As execuções com permissão ampliada passaram. Isso foi impedimento ambiental, não falha financeira preexistente. Não houve teste preexistente falhando após essa correção de ambiente.

Warnings preexistentes: chunks maiores que 500 kB, incluindo os módulos opcionais ExcelJS/Three; `NO_COLOR` ignorado porque `FORCE_COLOR` está definido nos processos de navegador; Git avisa sobre conversão LF/CRLF. Não foram ocultados nem tratados alterando limites de warning.

Divergências históricas: AUDITORIA-FINANCEIRA.md registra ausência de Git e 30 testes de navegador; hoje existe Git e o baseline tem 47. README registrava 37 E2E na etapa PWA. Os documentos arquiteturais descrevem restore como futuro; esta entrega o implementa sem reescrevê-los. A revisão planejava a separação estrutural de datas para A2, mas a parte indispensável à releitura de um restore futuro válido precisou entrar em A1, conforme autorização explícita do escopo.

### Reprodução

Na instalação existente, usando uma porta livre e contextos isolados:

```powershell
npm.cmd test
npm.cmd run build
node_modules\.bin\tsc.cmd -b
node_modules\.bin\tsc.cmd --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM,DOM.Iterable tests/dashboard.spec.ts tests/repository.spec.ts tests/restore-repository.spec.ts tests/restore.spec.ts tests/helpers/repositoryHarness.ts tests/pwa.spec.ts tests/visual.spec.ts tests/three.spec.ts playwright.config.ts
$env:PLAYWRIGHT_PORT = '5197'
npm.cmd run test:e2e
node_modules\.bin\prettier.cmd --check src tests *.ts *.json index.html README.md IMPLEMENTACAO-A0-A1.md
```

O build precisa preceder E2E: Playwright usa o preview de `dist/`. Os testes fixam o relógio em 15/09/2026; não acessam o perfil financeiro real. A fixture nova usa IDs e datas fixos, saldos conhecidos, receita, despesa, transferência, orçamento, meta e compromisso fixo. Não exige dados privados nem serviço externo. Não foi criada infraestrutura genérica de benchmark.

## Formato JSON v2 observado

O exportador existente produz `{version: 2, exportedAt, settings, transactions}`. `exportedAt` é timestamp ISO gerado na exportação; não é uma configuração persistida. Valores são números em reais, conforme v2; não houve conversão global de Money nem criação de v3.

- `settings`: accounts, categories, goals, plannedIncome, fixedExpenses, lowBalanceThreshold.
- Contas: id, name, type, initialBalance, initialBalanceDate.
- Categorias: id, name, color, type, monthlyBudget opcional.
- Metas: id, name, targetAmount, currentAmount, deadline.
- Compromissos: id, description, amount.
- Transações: id, type, amount, categoryId, description, accountId, date, recurring, createdAt/source opcionais; destinationAccountId obrigatório em transferências.

IDs legados textuais são preservados; não se exige UUID. Origem existente é manual/import/demo. Campos JSON adicionais nos registros e settings são preservados e comparados sem serem interpretados. Campos técnicos opcionais ausentes continuam ausentes. Propriedade opcional com undefined é equivalente à ausência, como no exportador JSON. Não são inventados metadados que o formato não captura.

## O que foi implementado

Leitor/validador puro de v2, prévia, arquivo pré-restore obrigatório, confirmação destrutiva separada, preparação em memória, comparação do estado atual com a cópia de segurança, substituição atômica e verificação pós-commit. A interface usa o Dialog existente, classes visuais existentes, foco, busy e reduced motion.

O repository ganhou `readForBackup()` e `restore(snapshot, safetySnapshot)`. A aplicação só invoca restore depois da entrega local iniciada. O repository não tenta provar um download: essa responsabilidade é da UI; seus testes o chamam diretamente em contexto isolado.

## Arquivos alterados

| Arquivo                                                | Mudança desta entrega                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| src/features/transactions/backup.ts — novo             | Validação estrutural, parse, prévia, comparação e serialização verificável            |
| src/features/transactions/validation.ts                | Calendário civil independente do fuso; opção estrutural e índices de referências      |
| src/features/transactions/importExport.ts              | Reuso do download; revogação de ObjectURL também quando click falha                   |
| src/services/transactionRepository.ts                  | Leitura estrita para segurança, restore atômico, precondição e verificação            |
| src/hooks/useTransactions.ts                           | Publicação do estado verificado e invalidação de abas; erro pós-commit explícito      |
| src/components/settings/RestoreBackupDialog.tsx — novo | Seleção, prévia, download, confirmação, processamento e erros                         |
| src/components/settings/SettingsPage.tsx               | Entrada para restore e texto atualizado, preservando a página                         |
| src/App.tsx                                            | Composição do diálogo, sucesso e descarte de editores ligados ao snapshot substituído |
| src/features/transactions/backup.test.ts — novo        | 54 testes unitários de contrato                                                       |
| tests/helpers/backupFixture.ts — novo                  | Snapshot sintético compartilhado nos testes                                           |
| tests/helpers/repositoryHarness.ts                     | Exportações somente para testes do código real                                        |
| tests/restore-repository.spec.ts — novo                | 16 testes em IndexedDB real                                                           |
| tests/restore.spec.ts — novo                           | 17 testes da interface e downloads                                                    |
| README.md                                              | Instruções de restauração e limites                                                   |
| IMPLEMENTACAO-A0-A1.md — novo                          | Este relatório                                                                        |

São 8 arquivos preexistentes editados e 7 novos, incluindo este relatório. Alterações recebidas em App/README foram mantidas. Arquivos de arquitetura, AUDITORIA-FINANCEIRA.md, fórmulas, schema, PWA e identidade visual não foram reescritos.

## Fluxo de restore

Selecionar JSON → parse e validação completa → prévia → ler estado persistido atual → serializar e conferir roundtrip → iniciar download local → habilitar confirmação → clonar/validar preparação → abrir transação → conferir estado ainda igual à cópia baixada → substituir → aguardar complete → reler repository → comparar campos → publicar sucesso.

Selecionar outro arquivo invalida a cópia de segurança associada ao fluxo e substitui apenas o draft. Cancelar/fechar/Escape antes da confirmação não escreve. Durante processamento, o diálogo bloqueia fechamento e ações duplicadas. Não há porcentagem inventada.

## Backup pré-restore

`readForBackup()` lê as duas stores em uma transação readonly e exige settings reais. Não usa o snapshot potencialmente obsoleto do React nem chama o fallback de configurações. `serializeBackup()` valida, serializa no formato existente, relê o JSON e confere equivalência para não perder silenciosamente um campo não representável.

O arquivo é `vertice-backup-pre-restore-<timestamp>.json`, sem nomes de contas ou valores no nome. Blob/ObjectURL usa a infraestrutura existente; URL é revogada após o click, inclusive quando ele lança erro. Arquivo/conteúdo não são enviados a servidor, registrados em logs nem gravados no cache da aplicação.

A confirmação só é habilitada quando geração/serialização e início do download retornam sem erro. Falha de leitura, serialização ou download bloqueia a restauração. A garantia é **cópia gerada e entrega local iniciada**, não prova de que o usuário guardou fisicamente o arquivo. A UI pede conferir o download e mantê-lo até verificar a recuperação. Bloqueios silenciosos ou cancelamento posterior pelo navegador não têm confirmação universal.

## Validação estrutural

JSON real, raiz, versão, timestamp da exportação, arrays/campos obrigatórios, tipos, IDs textuais não vazios e unicidade dentro de cada coleção. Confere os limites monetários já existentes, nomes/categorias/tipos/cores, compromissos e metas, calendário, origem e timestamp técnico quando presente.

Set/Map validam contas e categorias por ID. Receita/despesa exige categoria do tipo correspondente. Transferência exige categoria `transfer`, duas contas existentes e diferentes; destino em receita/despesa é incompatível com a união discriminada atual. Dados não são normalizados silenciosamente nem recebem IDs novos. O retorno normalizado do validador de comando não substitui os campos restaurados.

O exportador atual serializa o que está em memória sem uma validação estrutural completa. Portanto um arquivo v2 gerado a partir de estado já corrompido não é automaticamente restaurável só por ter versão 2. Não houve alteração silenciosa de formato para contornar corrupção.

## Tratamento de datas

`validDate` mantém YYYY-MM-DD e mínimo contratual 1900-01-01, mas testa o calendário com UTC, sem depender do fuso local. Dia impossível continua inválido. Datas estruturais futuras são aceitas no parse, preparação, load e leitura do backup. Timestamps exigem data/hora real e fuso explícito.

Cadastro/edição/importação de transações continuam rejeitando caixa realizado futuro. Alteração de configurações mantém a regra existente de data inicial até hoje. Validação de transações já persistidas durante saveSettings usa modo estrutural: um registro futuro recuperado não torna toda configuração ilegível. Não houve reformulação de calendário, recorrência ou fórmulas.

## Garantias de atomicidade

Database **vertice-finance v2**, stores **transactions** e **settings**, sem upgrade. O snapshot é preparado em memória antes da transação definitiva.

Uma única transação readwrite cobre as duas stores. Dentro dela, getAll/get leem o estado atual; comparação com a cópia pré-restore precisa passar antes do clear. Depois `transactions.clear()`, `transactions.add()` para cada registro e `settings.put(..., "personal")` são enfileirados juntos. A chave personal é substituída; não se apagam eventuais chaves de settings fora do contrato do snapshot.

Erros síncronos no agendamento/iteração acionam abort na mesma transação. Erros nativos assíncronos propagam para transaction.onerror e o abort automático. A promessa só termina em oncomplete ou onabort; nunca no último add. A causa útil é preservada internamente, inclusive erro original, sem enviar stack/payload à UI. Se um abort já está pendente, não se perde seu evento por tentar abortar novamente.

Falha durante a transação reverte também o clear e escritas já enfileiradas. Os testes observam novamente o estado e recarregam o navegador. Não há exclusão fora da transação seguida de tentativa de reconstrução. Atomicidade é do IndexedDB; não foi certificado desligamento físico, defeito de disco ou perda total do armazenamento da origem.

## Verificação pós-restore

Somente depois de oncomplete é feita uma nova chamada ao `transactionRepository.load()` real. A comparação indexa transações por ID e verifica **todos os campos**, settings inteiros, catálogos, metas, compromissos, abertura, tipos, montantes, datas, destino e metadados JSON. Ordem das propriedades e ordem por chave primária não alteram equivalência; ordem dos arrays de settings é preservada.

Não se limita a contagem. Os testes verificam também as fórmulas existentes: abertura 5.000/2.000, receita 2.000, despesa 500, transferência 1.000 → saldos 5.500/3.000, total 8.500, receita 2.000/despesa 500/resultado 1.500. Nenhuma fórmula foi duplicada ou modificada em produção; identidade integral das entradas conserva seus resultados para o mesmo corte.

Se load falhar ou qualquer campo divergir após o commit, `RestoreError.phase=verify` informa que **a gravação ocorreu**. O diálogo remove as ações destrutivas, mantém a orientação de recuperação e o hook sinaliza erro. Não há rollback compensatório nem segundo restore automático. A evidência técnica usa causa/código `RESTORE_SNAPSHOT_MISMATCH`, sem conteúdo financeiro em logs.

## Tratamento de falhas

Erros de arquivo e versão são distintos. A fase de cópia de segurança tem erro próprio e confirmação desabilitada. Preparação inválida, estado alterado após download, falha na escrita e falha pós-commit são diferenciadas. UI não apresenta detalhes nativos de quota, stack ou campos privados; causas permanecem nos objetos de erro do repository.

Uma tentativa falha antes do commit exige nova cópia de segurança antes de reconfirmar. Depois de erro pós-commit, conferir/recuperar manualmente o arquivo anterior: se o estado ainda for estruturalmente legível, o usuário pode reabrir o fluxo conscientemente; se estiver ilegível, A1 bloqueia outra substituição e é necessária recuperação técnica, coberta pela pendência A2 abaixo.

## Base parcialmente inválida

**ADIADA PARA A2.** A exportação bruta de recuperação não foi implementada. O formato v2 representa um snapshot válido com settings personal; não define envelope de registros corrompidos, configurações ausentes, chaves não reconhecidas ou valores IndexedDB que não têm representação JSON equivalente. Tratar esse dump como v2 restaurável inventaria uma garantia. A2 deve definir o envelope, diagnóstico e tratamento seguro dos tipos não JSON, com caminho próprio na tela de erro.

A1 protege esse estado: readForBackup não inventa defaults e rejeita settings ausente/inválido, referências ou registros inválidos e perda na serialização. Sem cópia v2 íntegra, não habilita restore. Mesmo usando uma cópia antiga diretamente no repository, a precondição transacional detecta a alteração e aborta. Há testes reais com transação existente e personal ausente ou `{}`: registros e configuração danificada permanecem exatamente como estavam, sem clear.

O fallback histórico do load comum para personal ausente continua sendo pendência H04/A2; esta entrega **não o apresenta como recuperação correta**. O restore não usa esse fallback para proteger nem substituir dados. Corrigir toda a leitura/edição de uma base danificada excederia o recorte autorizado; bloquear A1 é a saída conservadora explicitamente permitida.

## Concorrência entre abas

Precondição mínima de A1: a cópia baixada tem que corresponder ao estado relido **dentro da mesma transação readwrite** que fará a substituição. Gravação de outra aba antes dessa leitura invalida a confirmação; a cópia deve ser refeita. Isso elimina a janela de apagar dados que surgiram entre download e confirmação sem estarem na cópia.

Após o commit verificado, o hook emite `restored` no BroadcastChannel já existente, sem payload financeiro. Abas relêem o banco; a página Settings é remontada para não conservar o draft antigo. Editores/importadores abertos ligados ao snapshot substituído são fechados. A UI pede salvar edições e fechar outras abas antes de restaurar. O teste de duas abas comprova atualização dos valores de Settings.

**Limite concreto:** não há lock global nem CAS geral em todas as operações. Uma escrita de cliente antigo ou já enfileirada que execute depois do commit ainda pode modificar o estado; se ocorrer antes da releitura pode provocar erro de verificação, e se ocorrer depois é concorrência posterior à operação. Mensagem de invalidação não é barreira transacional nem atinge aba congelada imediatamente. A2b precisa resolver revisão de edição/exclusão/settings e ressurreição por escritor antigo. Não foi criada uma implementação parcial de sync ou um novo mecanismo complexo de locking para esconder esse limite.

## Performance

Validação e comparação são lineares em registros, catálogos e campos, com Set para unicidade e Map/Set para referências e IDs. Não há busca completa de contas/categorias por transação no restore nem na releitura. Prévia é memoizada no diálogo e percorre datas uma vez por arquivo selecionado.

JSON.parse/stringify, structuredClone e enfileiramento IndexedDB ocorrem na thread principal. Processamento é sinalizado antes das etapas demoradas; não há progresso percentual fictício. Memória contém arquivo/texto, snapshot, cópia pré-restore, preparação e resultados de leitura quando necessários. Serialização confere roundtrip, ao custo de uma cópia temporária. Backups muito grandes podem bloquear a UI ou esgotar memória; não foi medido um limite de capacidade.

Não foi aplicado ao backup o limite de 5 MB/5 mil linhas da importação CSV/XLSX. Nenhum limite arbitrário de transações, worker, parser streaming, cache materializado ou benchmark foi criado. Medição de volume/aparelhos fica futura.

## Testes adicionados

- **54 unitários:** v2, roundtrip, IDs/campos/metadados, prévia/vazio, opções legadas, versão/shape, referências, destinos, dinheiro, catálogos, datas/timestamps, futuro versus comando e serialização sem perda.
- **16 IndexedDB real:** substituição e saldos, equivalente/vazio, futuro/reload, seis falhas de escrita, falha de preparação, precondição concorrente, duas falhas pós-commit, duas bases inválidas.
- **17 UI:** prévia/cópia/sucesso/reload/exportador existente, três fechamentos/foco, troca de arquivo/cancelamento, cinco arquivos inválidos, três falhas na cópia, rollback, mudança após download, divergência pós-commit e duas abas/mobile.

Downloads dos testes são lidos nos arquivos temporários do contexto Playwright e conferidos por parse/equivalência, sem imprimir conteúdo financeiro. Injeções ficam exclusivamente nos testes; não há flags de falha nem endpoint de teste no produto. O harness empacota o repository real em memória, como a suíte preexistente.

## Auto-red-team

E = estado anterior preservado; V = restore completo e verificado; M = commit ocorreu, verificação falhou, recuperação manual pelo pré-restore.

| Cenário solicitado                | Exercício e resultado                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| 1 JSON inválido                   | Unit/UI: E, confirmação bloqueada                                                       |
| 2 Referência quebrada             | Unit/repository/UI: E                                                                   |
| 3 Versão incompatível             | Unit/UI: E                                                                              |
| 4 ID duplicado                    | Unit/UI: E                                                                              |
| 5 Data civil impossível           | Unit/UI: E                                                                              |
| 6 Data futura válida              | Unit + repository + reload: V; comando continua bloqueado                               |
| 7 Falha antes da primeira escrita | Preparação e clear injetados: E                                                         |
| 8 Falha após limpar store         | Segundo add e put settings injetados: E                                                 |
| 9 Exceção síncrona no meio        | Error/QuotaExceededError injetados: E, reload preservado                                |
| 10 Erro assíncrono IndexedDB      | ConstraintError nativo por chave repetida durante add: E                                |
| 11 Quota excedida                 | DOMException simulada no segundo add e no put: E; não esgotou disco real                |
| 12 Cancelar prévia                | UI + releitura/reload: E                                                                |
| 13 Fechar diálogo                 | Botão e Escape/foco: E                                                                  |
| 14 Reload após sucesso            | Repository/UI: V                                                                        |
| 15 Reload após falha              | Repository/UI: E                                                                        |
| 16 Snapshot equivalente           | Duas restaurações, mesmos IDs e estado: V                                               |
| 17 Sem cópia de segurança         | Falha de leitura/serialização/download: E, bloqueado                                    |
| 18 Destino inexistente            | Validação estrutural: E                                                                 |
| 19 Settings incompatíveis         | Unit + base danificada real: E                                                          |
| 20 Divergência pós-commit         | Mesma contagem, montante alterado na releitura; erro de load: M, uma única substituição |

Também: abort explícito depois de operações enfileiradas, cópia desatualizada, metadados opcionais e exportação real do formato antigo. Nenhum cenário aceita estado parcialmente atualizado por restore.

## Resultado final

**239 testes aprovados: 159 unitários e 80 de navegador.** O baseline era 152 testes (105 + 47); foram acrescentados 87 (54 + 16 + 17).

| Verificação final                                      | Resultado                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| Unitários                                              | 159/159, aproximadamente 0,84 s                                      |
| Build de produção                                      | Aprovado, incluindo TypeScript; PWA gerada                           |
| TypeScript explícito da aplicação e todos os testes    | Aprovado                                                             |
| E2E completo, 2 workers, Edge, porta 5197              | 80/80, aproximadamente 1,5 min                                       |
| Prettier                                               | Aprovado para código, testes, configurações, README e este relatório |
| git diff --check                                       | Sem erros de whitespace                                              |
| skip/only, TODO/FIXME e console.log/error em src/tests | Nenhum encontrado                                                    |

Permanecem os warnings do baseline. O principal passou de 299,33 kB / 92,02 kB gzip para 309,24 kB / 95,01 kB gzip; os módulos opcionais não foram reorganizados. Isso é medida do build, não benchmark de tempo de restauração.

Durante o desenvolvimento, TypeScript identificou um import não utilizado no teste novo, removido. O primeiro teste UI pós-commit não injetava divergência na releitura correta por depender da ordem de listeners complete; foi corrigida a injeção, sem enfraquecer a asserção. Uma repetição ficou presa no download e terminou cancelada por timeout; a repetição seguinte passou em 1,7 s. Esses resultados intermediários não foram ocultados nem convertidos em teste ignorado.

Nenhum teste existente foi removido, desativado, marcado skip/only ou enfraquecido. Os 47 E2E e 105 unitários do baseline permanecem na suíte.

## Limitações restantes

Download iniciado não prova salvamento físico; origem/perfil continua sendo a fronteira local. Base danificada pode exigir recuperação técnica. Concorrência geral e clientes antigos não têm revisão. Backups grandes não foram benchmarkados. Testes de navegador usam Edge/Chromium, não certificam Safari, aparelhos físicos ou falha de energia. Snapshot completo substitui dados, não os mescla. Rascunhos não salvos não são backup.

## Pendências explicitamente deixadas para A2/B

A2: exportação bruta/recuperação de corrupção, retirada segura do fallback em base não vazia, CAS/revisões por comando, tratamento de drafts/atualização PWA. B: Money/datas/origem canônicos e workspace/migração com proteção contra escritor legado. Nada disso foi iniciado nesta entrega.

## Compatibilidade do backup

Formato permanece v2, valores em reais e mesmos campos suportados. Mantidos IDs textuais e metadados opcionais; JSON com BOM aceito. Extensão/MIME não substituem inspeção do conteúdo. Novo timestamp é produzido a cada exportação, sem modificar timestamps das transações. A cópia de segurança também é v2 e é lida pelo mesmo parser. Arquivo estruturalmente inválido não é “consertado” ou promovido a válido por ter saído do exportador antigo.

## Conclusão

A0/A1 implementa restauração completa com prévia, cópia prévia entregue localmente, commit atômico e releitura verificável. As proteções são comprovadas pelos testes descritos, dentro dos limites de armazenamento, concorrência e navegador explicitados. O próximo passo não foi implementado.

Mensagem de commit sugerida, **não executada**: `feat: adiciona restauracao segura do backup v2`.

Artefatos de execução: dist/, tsconfig.tsbuildinfo, test-results/ e capturas já previstas em artifacts/. Não incluir builds, resultados, screenshots temporárias ou downloads de teste no commit funcional. O diff total inclui mudanças anteriores de dependências/PWA/visual; selecionar somente os arquivos A0/A1 desta lista ao preparar a revisão, preservando a origem das alterações compartilhadas em App/README.

### Conferência final de Git e escopo

`git status --short` e `git diff --stat` foram inspecionados. O stat total contra HEAD é:

```text
23 files changed, 6677 insertions(+), 1923 deletions(-)
```

Esse número inclui as 17 alterações recebidas, principalmente package-lock.json, e **não inclui arquivos novos não rastreados**. Não atribuir essas milhares de linhas a A0/A1. A entrega possui os **8 arquivos editados e 7 novos** discriminados na tabela acima.

Comparação dos 74 hashes iniciais: 60 arquivos preexistentes inalterados; 8 arquivos de implementação/documentação editados; 6 capturas regeneradas pelos testes (`dashboard-desktop.png`, `onboarding-desktop.png`, `refinamento-desktop.png`, `refinamento-mobile.png`, `refinamento-modal-mobile.png`, `three-desktop.png`). dashboard-mobile.png já tinha alteração no Git, mas manteve o mesmo hash do início de A0.

Hashes de DECISOES-VERTICE-2.md, ARQUITETURA-VERTICE-2-REVISADA.md, AUDITORIA-ARQUITETURA-VERTICE-2.md, ARQUITETURA-VERTICE-2.md e AUDITORIA-FINANCEIRA.md permaneceram iguais. Também preservados: package.json/lock, vite.config.ts, cálculos e testes existentes, componentes visuais/PWA e schema v2. Nenhuma limpeza, instalação, migração futura ou commit foi executado.

# Correções pós-review

22/09/2026. Correção restrita a R1/R2; o texto anterior permanece como registro da implementação original.

## R1

- **Causa:** a verificação pós-commit chamava `load()`, cujo fallback podia fabricar settings padrão quando `personal` estava ausente.
- **Correção:** a única linha alterada no repository troca essa chamada por `readForBackup()`. A leitura existente usa uma readonly coerente das duas stores, exige settings reais e valida o snapshot. Ausência/invalidez resulta em `RestoreError.phase = "verify"`; não há segunda escrita. O `load()` global e a unidade readwrite permanecem inalterados.
- **Testes:** regressão adversarial original passa sem alterar cenário ou expectativa. Os dois testes de mismatch/read-error passaram a injetar falha em `readForBackup`, pois `load` deixou de participar da verificação; todos os asserts de fase, uma única substituição, dados persistidos e reload foram mantidos. Restore completo, rollback, precondition e futuro estrutural passaram nos direcionados.

## R2

- **Causa:** `JSON.parse` pode produzir Infinity a partir de `1e400`; esse número sobrevive no IndexedDB, mas perde sua representação ao reexportar. O defeito não se limita a metadata.
- **Correção:** `assertFiniteNumbersDeep` percorre todos os valores de objetos e arrays, exigindo `Number.isFinite` para qualquer número. É chamada no início de `validateBackupSnapshot`, antes da validação específica. Assim, cobre o parser, a preparação direta do restore e a leitura/serialização estrita. Rejeita Infinity, -Infinity e NaN sem converter, arredondar, remover ou normalizar valores. Nenhum novo framework de serialização foi criado.
- **Campos conhecidos inspecionados e testados com tokens JSON `1e400` e `-1e400`:** `transactions[].amount`, `settings.accounts[].initialBalance`, `settings.categories[].monthlyBudget`, `settings.goals[].targetAmount`, `settings.goals[].currentAmount`, `settings.plannedIncome`, `settings.fixedExpenses[].amount`, `settings.lowBalanceThreshold`. Todos já exigiam finitude em `validateTransaction` ou no helper `monetary` de `validateSettings`; suas regras de faixa, sinal e centavos foram preservadas. O campo técnico `version` também foi testado contra overflow e continua exigindo exatamente 2. Não há outro campo numérico no contrato persistido atual.
- **Campos adicionais testados:** `metadata.external` positivo/negativo, `metadata.nested.value`, `metadata.values` com overflow dentro do array e validação direta de Infinity/-Infinity/NaN. Metadata válida com provider, confidence e objeto nested continua aceita e preservada; números finitos adicionais não recebem limites monetários indevidos.
- **Reexportação:** os testes passam por texto JSON → parser → serialize → parser e comparam snapshots semanticamente. Em IndexedDB real, metadata válida também passou por restore, reload, leitura estrita e reexportação. Os novos casos de amount positivo/negativo comprovam erro de parser com zero transactions abertas, zero clear e estado anterior integral. A regressão R2 original passou sem alteração de expectativa.
- **Cobertura acrescentada:** 26 casos unitários e 3 casos de navegador. Somente o ponto de injeção dos dois testes antigos de verificação foi adaptado, sem retirar asserts.
