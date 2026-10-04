# Evidências do planejamento A2c

Data: 27/09/2026. HEAD: `7ac117a97fda236850938a84ead59200614044af` (`feat: protege concorrencia local com CAS A2b`). Escopo: reproduzir perda de trabalho não salvo e definir o contrato em [PLANO-A2C.md](PLANO-A2C.md). Nenhuma implementação A2c, edição de produção/testes, staging ou commit.

## Estado encontrado na retomada

| Estado       | Evidência e fechamento                                                                                                                                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONCLUÍDO    | Inspeção, inventário de drafts, definição de dirty, estratégia A sem persistência, contratos de navegação/reload/PWA/A2b/restore/recovery/multi-aba, riscos e testes futuros. As 22 seções obrigatórias já existiam no plano. Havia 23 cenários confirmados nos resultados temporários. |
| EM ANDAMENTO | Consolidação de PLANO-A2C.md; duas células de reprodução PWA ainda apontavam genericamente para evidência, apesar dos resultados já disponíveis.                                                                                                                                        |
| PENDENTE     | Criar este documento, consolidar contagens, completar o cenário específico import + reload pedido na retomada e conferir preservação final. Tudo concluído nesta retomada.                                                                                                              |
| FALHANDO     | Nenhum bloqueio ativo. Três tentativas anteriores tinham erro do instrumento, explicados abaixo; não eram falhas do produto.                                                                                                                                                            |

`PLANO-A2C.md` existia; `A2C-EVIDENCIAS.md` ainda não. Produção/testes correspondiam aos hashes iniciais e staging estava vazio. Não restava decisão arquitetural sem resposta; faltava o fechamento documental e uma reprodução específica. Os cenários já concluídos não foram repetidos.

## Ambiente e método

- App real do working tree, incluindo PWA preexistente ainda não commitado. Não atribuir esse PWA ao commit A2b.
- Edge headless `154.0.4258.37`, via Playwright existente; contextos isolados, origem HTTP loopback temporária, dados sintéticos. Nenhum perfil pessoal do navegador ou banco do usuário utilizado.
- IndexedDB nativo. Setup e alterações externas usam o repository real, exposto por bundle temporário do harness já existente; corrupção para recovery usa exclusivamente a base sintética desse contexto.
- Para PWA, duas builds temporárias com a configuração Vite/PWA atual e `NODE_ENV=production`. A única diferença intencional entre releases é uma meta tag no HTML (`a2c-release=1/2`) para gerar revisão de precache distinguível. Registro, waiting, SKIP_WAITING, ativação e controllerchange são nativos.
- Nos cenários não PWA, service workers bloqueados para isolar o ciclo de vida da UI. Reload realizado por `page.reload()`; não equivale a certificar teclas físicas F5/Ctrl+R ou Safari.
- Data da Page fixada em 15/09/2026 para fixtures visíveis. Não altera regras de validação do projeto.
- Cada cenário observa conteúdo antes/depois. Quando indicado abaixo, compara também todas as rows de transactions e keys/values de settings, incluindo personal e metadata/revision. Isso não é auditoria financeira ampla.
- Listeners registram e rejeitam diálogos nativos inesperados. “Sem aviso” refere-se à ausência de confirmação de descarte observada; PWA e restore já apresentam instruções textuais genéricas.

Resultados: **24 cenários distintos confirmados**, contando perdas e controles que preservam trabalho: 23 anteriores à retomada e um complementar. Nenhuma suíte completa, mutation testing ou teste permanente novo foi executado/criado nesta etapa.

Artefatos temporários desta sessão: `C:\Users\patai\AppData\Local\Temp\vertice-a2c-plan-whIon4`. Contém `baseline.json`, `results.json`, `import-results.json`, `pwa-results.json`, `resume-results.json`, bundle do harness e builds `release1/2`. Os scripts temporários `a2c-plan-instrument.cjs`, `a2c-plan-import.cjs`, `a2c-plan-pwa.cjs`, `a2c-plan-resume.cjs` e `a2c-plan-build-production.cjs` ficam em `%TEMP%`; não integram o projeto nem sua suíte. Os passos abaixo permitem repetir as observações após a limpeza do diretório temporário.

## Resultados consolidados

| #   | Cenário / identificador do instrumento | Resultado observado                                                                    | Controle adicional                                                                       |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | `manual-reload-settings`               | Nome alterado sem salvar volta a Conta principal após reload                           | Sem confirmação nativa; DB inalterado                                                    |
| 2   | `manual-reload-create`                 | Descrição/valor digitados desaparecem; modal não reabre                                | Sem confirmação nativa; DB inalterado                                                    |
| 3   | `manual-reload-edit`                   | Edição não salva desaparece; entidade persistida não muda                              | Sem confirmação nativa; DB inalterado                                                    |
| 4   | `settings-route`                       | Configurações → Visão Geral → Configurações perde nome digitado                        | Links reais; sem confirmação nativa                                                      |
| 5   | `modal-route-control`                  | Mudança programática do hash mantém modal e descrição                                  | Controle negativo; links do fundo ficam inertes sob modal                                |
| 6   | `modal-close-X`                        | X descarta transação digitada; reabrir começa vazio                                    | Sem confirmação nativa; DB inalterado                                                    |
| 7   | `modal-close-Escape`                   | Escape descarta transação digitada                                                     | Sem confirmação nativa; DB inalterado                                                    |
| 8   | `modal-close-outside`                  | Clique no backdrop descarta transação digitada                                         | Sem confirmação nativa; DB inalterado                                                    |
| 9   | `import-close`                         | Escape e reabertura eliminam arquivo selecionado e prévia                              | DB inalterado; repetição corrigida em import-results                                     |
| 10  | `settings-broadcast-conflict`          | Changed preserva draft; salvar com token antigo conflita e preserva draft              | DB/revision não mudam na rejeição; Atualizar edição descarta com aviso textual existente |
| 11  | `settings-focus-conflict`              | Focus com base válida tem o mesmo comportamento acima                                  | DB/revision não mudam na rejeição                                                        |
| 12  | `external-restore-settings`            | Restore válido externo + restored substitui Settings e perde draft                     | Nova base restaurada aparece                                                             |
| 13  | `external-restore-create`              | Mesmo evento fecha editor com conteúdo digitado                                        | Não há reabertura automática                                                             |
| 14  | `external-restore-import`              | Mesmo evento fecha importação preparada                                                | Repetição corrigida em import-results                                                    |
| 15  | `recovery-settings`                    | Missing personal + focus exibe recovery e remove edição                                | DB inalterado após corrupção deliberada; nenhum reparo automático                        |
| 16  | `recovery-create`                      | Mesmo caso remove modal digitado e exibe recovery                                      | Gate A2a funciona; DB inalterado após corrupção                                          |
| 17  | `restore-preview-reload`               | Reload perde prévia de JSON válido e fecha diálogo                                     | DB inalterado: preparação não é restore                                                  |
| 18  | `pwa-settings-dirty`                   | Chegada de waiting preserva draft; clicar Atualizar perde nome não salvo               | Documento só recarrega no pedido; release 2; DB inalterado; sem confirmação nativa       |
| 19  | `pwa-other-tab-and-no-waiting`         | B aplica; A preserva documento/draft. Depois, Atualizar em A, sem waiting, perde draft | Mesma identidade de documento em A até seu clique; waiting ausente confirmado            |
| 20  | `pwa-modal-control`                    | Pedido de update com modal aberto retorna sem aplicar                                  | Documento/draft preservados; worker continua waiting                                     |
| 21  | `pwa-intent-to-activation-race`        | Edição iniciada após pedido e antes de ativação desaparece no controllerchange         | SKIP_WAITING retido/liberado; worker e reload reais; release 2                           |
| 22  | `local-restore-cancel`                 | Cancelar prévia elimina preparação, mas preserva Settings atrás do diálogo             | Sem confirmação nativa; DB inalterado                                                    |
| 23  | `local-restore-apply`                  | Safety + Restaurar este backup aplicam backup e eliminam Settings não salvo            | Restore explicitamente confirmado; safety obrigatório; aviso textual já existente        |
| 24  | `import-reload`                        | Reload fecha importação; reabrir apresenta arquivo vazio e nenhuma prévia              | Complemento da retomada; sem confirmação nativa; DB inalterado                           |

## Procedimentos de reprodução

### Reload, rota e fechamento

1. Inicializar fixture válida com conta “Conta principal” e uma transação “Gasto restaurado”. Abrir App real.
2. Em Configurações, mudar Nome da conta sem salvar. Recarregar: volta o nome persistido. Em execução separada, clicar Visão Geral e voltar a Configurações: mesma perda.
3. Em Adicionar transação, digitar descrição “Trabalho ainda não salvo” e valor 85. Recarregar ou fechar por X/Escape/backdrop; reabrir: edição desapareceu. Repetir reload editando a transação existente.
4. Como controle, com modal preenchido mudar `location.hash` para Configurações via instrumento: modal e descrição permanecem, pois seu host pertence a App. Isso não demonstra navegação clicável no fundo do modal.
5. Em Transações → Importar, selecionar CSV com uma linha válida, aguardar “Importar 1 transações” habilitado. Fechar por Escape e reabrir: arquivo e prévia não permanecem. O complemento da retomada troca Escape por reload e confirma a mesma perda.

O modal de transação atual **não tem botão Cancelar**. Não registrar a ausência desse botão como bug A2c. Cancelar foi exercitado no diálogo de restore, onde existe.

### Conflito, BroadcastChannel e focus

1. Abrir Settings e digitar “Draft A”. Em outra Page do mesmo contexto, carregar repository e salvar Settings com nome “Mais recente B” usando sua revisão válida.
2. Publicar `changed` pelo BroadcastChannel nativo `vertice-updates`; em execução separada, disparar focus para chamar o handler real de refresh.
3. Verificar que o campo continua “Draft A”. Clicar Salvar configurações: aparece “Sua alteração não foi salva”; edição permanece. Comparar DB/revision antes/depois da rejeição: iguais.
4. Verificar a instrução “Atualizar descarta o conteúdo não salvo desta edição.” Clicar Atualizar edição: campo passa a “Mais recente B”. Esse descarte já é explícito; não classificar o simples conflito como perda silenciosa.

Esses controles cobrem Settings com leitura válida. Não inferir que qualquer mudança de props é inócua em todos os formulários: import recalcula preview, enquanto o token continua preso à abertura.

### Restore e recovery

1. Preparar separadamente Settings, nova transação ou importação. Em Page administrativa isolada da mesma origem, executar restore real com safety válida e nome de conta “Restaurado em B”; publicar `restored` nativo. Settings remonta; editor/import fecham; conteúdo digitado não pode mais ser consultado na UI.
2. Para recovery, com Settings ou nova transação em edição, remover somente `settings.personal` na base sintética por transação IDB. Disparar focus. App mostra Tentar novamente e remove formulário financeiro. DB após refresh é igual ao DB já corrompido: não houve defaults/reparo.
3. Para restore local, manter Settings não salvo e abrir Restaurar backup JSON. Selecionar backup válido com nome “Conteúdo do backup”. Cancelar preserva Settings e descarta apenas a prévia. Em execução separada, baixar backup de segurança e clicar Restaurar este backup: Settings passa ao conteúdo restaurado, perdendo edição anterior.
4. Com prévia válida, recarregar antes de aplicar: diálogo/preparação desaparecem e DB permanece igual.

Restore local confirmado não é um write acidental; já existe aviso de que alterações não salvas ficam fora do backup. A lacuna de maior severidade C06 é o desaparecimento involuntário de conteúdo após restore externo/recovery. O gate financeiro correto deve permanecer imediato.

### PWA nativo

1. Servir release 1 e aguardar controller nativo. Alterar Settings sem salvar, trocar servidor para release 2 e chamar `registration.update()` como disparador de verificação.
2. Aguardar worker waiting e botão Atualizar. Conferir que a identidade do documento e o campo digitado não mudaram: chegada do update não recarrega automaticamente.
3. Clicar Atualizar: observar `a2c-release=2`, nome persistido no campo e DB inalterado. A instrução genérica para salvar não impediu a perda.
4. Em contexto separado com duas Pages, deixar A em edição e aplicar o update em B. A mantém documento e draft. A passa a oferecer Atualizar sem waiting; clicar em A provoca reload direto e perda. O clique em B também confirma o caminho de aplicação sem dirty, sem necessidade de repetir esse caso.
5. Controle de modal: abrir transação preenchida com update waiting. Como a UI de fundo é inerte, invocar programaticamente o clique no botão Atualizar existente. O callback real retorna pelo guard `dialog[open]`; conteúdo permanece e worker continua waiting. Esse controle comprova o guard atual, não uma ação normal acessível atrás de modal.
6. Corrida temporal: reter apenas a chamada nativa `postMessage({type:'SKIP_WAITING'})`, sem simular controllerchange. Clicar Atualizar estando clean, ir a Settings, digitar, então liberar a mensagem original antes do timeout. O worker ativa realmente e a Page recarrega com perda. A instrumentação torna a janela determinística; não mede sua frequência em uso normal.

O código inspecionado confirma a causa: o pedido verifica apenas modal aberto; `controllerchange` com `requestedReload` chama `location.reload()` sem reavaliar edição. O caminho sem waiting também recarrega diretamente. Não foi encontrado skipWaiting automático no worker configurado.

## Rastreabilidade no código

| Arquivo                                           | Relação com os resultados                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/pwa/register.ts`                             | Detecção, oferta, guard dialog, SKIP_WAITING, timeout, controllerchange e reload direto |
| `src/components/pwa/PwaControls.tsx`              | Oferta e orientação genérica para salvar; sem dirty registry                            |
| `vite.config.ts`                                  | Prompt, skipWaiting false, clientsClaim true, precache e limpeza                        |
| `src/App.tsx`                                     | Hosts globais, fechamento no restoreVersion/snapshot ausente, key de Settings           |
| `src/hooks/useTransactions.ts`                    | Changed/focus refresh, restored/restoreVersion e gate por erro                          |
| `src/hooks/usePage.ts`                            | Hashchange sem decisão de descarte                                                      |
| `src/components/settings/SettingsPage.tsx`        | Draft/baseRevision, saved separado, conflito e Atualizar edição                         |
| `src/components/transactions/TransactionForm.tsx` | Inputs DOM/defaultValues, tipo local e FormData                                         |
| `src/components/transactions/ImportModal.tsx`     | Arquivo, opções/prévia locais e revisão de abertura                                     |
| `src/components/settings/RestoreBackupDialog.tsx` | Preview, safety, cancelar e confirmação do restore                                      |
| `src/components/ui/Dialog.tsx`                    | X/Escape/backdrop e proteção busy já existente                                          |

## Limites e ajustes do instrumento

- O primeiro carregamento de configuração via Vite API deixou `NODE_ENV` em development e compilou o registro PWA desabilitado. Os ensaios de UI sem SW continuam válidos, mas essa build não forneceu evidência PWA. A rodada PWA foi refeita com production e presença de SKIP_WAITING no bundle confirmada.
- Duas tentativas iniciais de import usaram um seletor/rota incorreto. Foram corrigidas apenas nos scripts temporários e ambas confirmadas em `import-results.json`. A tentativa de Cancelar transação era inaplicável. Esses três registros `INSTRUMENT_FAILURE` em `results.json` não são defeitos do produto nem casos aprovados.
- Uma primeira solicitação de execução expirou na análise automática de permissão antes de iniciar o instrumento; a execução posterior foi autorizada. Isso não constitui resultado do App.
- As builds PWA diferem pelo marcador HTML, não por mudança incompatível de código. Não houve certificação de deploy com chunks antigos removidos, Safari/iOS, processo morto, restauração de sessão ou aparelhos físicos.
- Background/focus foram usados como gatilhos controlados; não se mediu suspensão prolongada de aba pelo sistema operacional. Limites mobile e compatibilidade de releases permanecem riscos documentados no plano, não bugs reproduzidos.
- Os seis casos C01–C06 são agrupamentos de comportamento; R01–R03 são riscos/limites aceitos. Total do plano: 0 críticos, 3 altos, 5 médios e 1 baixo. A perda observada é de trabalho da UI; não foi observada corrupção de dados confirmados nos controles executados.

## Preservação do workspace

Baseline SHA-256 dos 100 arquivos não ignorados existentes antes do trabalho permite conferir preservação byte a byte. A entrega contém somente os dois novos documentos A2c. O diff rastreado preexistente continua com 17 arquivos, 6438 inserções e 1898 remoções; índice vazio e HEAD `7ac117a`.

Nenhuma alteração em repository, CAS, revision, backup, Money, schema, stores ou DB version. Nenhuma mudança nos arquivos de produção ou testes existentes. A2c continua **planejado, não implementado**.
