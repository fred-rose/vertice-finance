# Evidências A2b — concorrência local

26/09/2026. HEAD `7f80ff2 feat: endurece leitura local e recovery A2a`. Somente análise/reprodução e documentos. Nenhuma edição de produção/testes, implementação CAS, staging, commit ou mutation campaign.

## Método

Node v24.15.0; Edge headless 153.0.4234.48; IndexedDB real. Instrumento temporário fora do repository em `C:\Users\patai\AppData\Local\Temp\vertice-a2b-plan-Ok991g`: instrument.cjs, extra.cjs e resultados JSON. Foram executados dois comandos Node autorizados, ambos com exit code 0. Bundle esbuild `write:false` importa módulos reais do workspace: repositoryHarness, repository, useTransactions, SettingsPage, React/ReactDOM. Nenhum build/dist, screenshot ou arquivo de teste foi criado no workspace.

Servidor HTTP efêmero em 127.0.0.1, HTML mínimo sem CSS/PWA. Primeira execução usou porta 60539; a segunda escolheu outra porta livre. Cada cenário começa em BrowserContext novo, com duas Pages na mesma origem; portanto duas instâncias do módulo, duas memórias de cliente e o mesmo armazenamento. Não foi aberto perfil pessoal/persistente. Ao terminar cada cenário o contexto foi fechado; servidor e navegador encerrados em finally.

Preparação: página A chama readForBackup/restore reais para instalar backupFixture já existente. As duas páginas chamam load e guardam o resultado local em `window.stale`. Fixture tem três transações (`a-expense` 500, `z-income` 2000, `t-transfer` 1000), abertura 5000/2000, plannedIncome 3000 e conta “Conta principal”. Relógio fixado em 15/09/2026 15:00 UTC nas páginas principais. Todos os comandos usam IDs e dados sintéticos.

Nos cenários C6/C7 foi montado um componente de observação mínimo que chama o **hook real** e renderiza **SettingsPage real**, passando snapshot e callbacks como App. `window.h` permite observar estado e executar callbacks. Esse instrumento não substitui repository/IndexedDB/BroadcastChannel: o canal é nativo em C6. Não foi montado App completo nem certificada a aparência/rotas/PWA nessa execução; a integração de App foi inspecionada. Em C7 desabilitou-se BroadcastChannel somente na página B para isolar focus. Em C7-inflight a Promise de retorno da primeira leitura real foi retida até liberação explícita; não houve simulação dos dados retornados nem sleep para ordenar commits.

Duas contraprovas adicionais alteraram somente bancos sintéticos: inserir uma chave de metadata sem alterar código; depois, em contexto novo, elevar nativamente DB 2→3 sem migrador e sem writes financeiros. Isso **não implementa A2b**: testa se a chave sozinha é respeitada pelo cliente atual e se a plataforma bloqueia sua reabertura depois de versionchange.

## Resultados concluídos

| Nº  | Cenário                      | Observação efetiva                                                                                                                                                                                 |
| --- | ---------------------------- | a-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | C1 distintos, A depois B     | Ambos aceitos. IDs finais a-expense/from-a/from-b/t-transfer/z-income; cinco rows; sem lost update                                                                                                 |
| 2   | C1 mesmo ID                  | A altera amount 500→700; B envia row antiga com descrição “B stale edit”; final amount 500, descrição de B; nenhum conflito                                                                        |
| 3   | C1 simultâneo                | Promise.all dispara save em Pages diferentes; parallel-a e parallel-b sobrevivem; cinco rows                                                                                                       |
| 4   | C2 settings                  | A muda nome para “Account A”; B muda plannedIncome para 4444 usando settings antigas; final nome “Conta principal”, renda 4444                                                                     |
| 5   | C3 delete/edit               | A remove a-expense, contagem 2; B salva row antiga com descrição “resurrected”; contagem 3 e mesmo ID presente                                                                                     |
| 6   | C4 restore/save              | Restore retorna verificado com renda 9999 e despesa 900; B envia edição antiga; final despesa 500 e renda 9999                                                                                     |
| 7   | C4 restore/import            | Mesmo alvo verificado; B importa stale-import; final quatro rows, renda 9999 e despesa 900                                                                                                         |
| 8   | C4 restore/settings          | Mesmo alvo verificado; B envia settings antigas; final renda 3000, despesa 900; nenhum conflito                                                                                                    |
| 9   | C5 import/save               | A importa batch-1/batch-2; B adiciona stale-save; seis rows; todo lote e nova row sobrevivem                                                                                                       |
| 10  | C6 BroadcastChannel entregue | A salva nome “Account A” pelo hook; B.h.snapshot passa a esse nome; input de B ainda “Conta principal”; submit real restaura nome antigo; zero alertas                                             |
| 11  | C7 focus concluído           | Canal ausente em B; snapshot inicialmente antigo. Evento focus atualiza hook para “Account A”; draft continua antigo; submit sobrescreve A                                                         |
| 12  | C7 refresh em andamento      | Retorno de load retido depois da leitura real; h.loading continua false; saveSettings antigo aceito antes da liberação; final nome antigo                                                          |
| 13  | Metadata isolada             | A grava chave **vertice_local_concurrency** com protocol 1/revision 42; cliente atual B salva settings normalmente; metadata permanece 42                                                          |
| 14  | Fence nativo                 | Com conexões reais do repository abertas, IDB abre versão 3; onversionchange atual fecha conexões. Próximo save do cliente v2 rejeita com cadeia Error→VersionError; rows/settings iguais ao antes |
| 15  | Dois BrowserContexts         | Mesma origem, primeiro grava context-one; load do segundo retorna zero rows. Bancos não compartilhados                                                                                             |
| 16  | Referência atual             | A remove categoria shopping (sem uso); save de B baseado no catálogo antigo é rejeitado: “Selecione uma categoria compatível com o tipo.”; três rows preservadas                                   |
| 17  | Controle precondition A1     | A obtém safety; B acrescenta between-safety-and-restore; restore de A rejeita phase changed; quatro rows preservadas                                                                               |
| 18  | Três clientes                | A/B/C carregam mesma base; settings com renda 4100, 4200 e 4300 são aceitas em série; final 4300                                                                                                   |

São **18 cenários/controles, não 18 testes adicionados à suíte**. Os três subcasos C4 usam contextos distintos para não contaminar resultados. Chamadas sequenciais aguardaram commit antes da seguinte; o subcaso simultâneo não fixa qual save vence a ordem de execução. Os cenários provam que serialização nativa e validade financeira não detectam por si a intenção obsoleta.

## Procedimento reproduzível resumido

1. Empacotar em memória os módulos reais e servir HTML vazio numa origem localhost temporária. Usar browser.newContext e duas context.newPage; injetar mesmo bundle nas duas páginas.
2. Na primeira, restaurar backupFixture com safety válido; em ambas, guardar load em variáveis independentes. Não copiar a nova leitura de A para o stale de B.
3. C1: salvar IDs diferentes e observar sobrevivência; em outro contexto editar amount do mesmo ID em A, depois enviar o objeto retido de B com outra descrição.
4. C2: clone de settings A renomeia conta; clone de settings B muda renda; observar final e aceitação. C3: remover ID em A, comprovar ausência, salvar objeto retido de B, comprovar reaparecimento.
5. C4: A restaura alvo com renda 9999 e despesa 900 e aguarda retorno verificado; só então B envia save/import/settings guardados anteriormente. Repetir em contextos novos.
6. C5: importar dois IDs em A, salvar ID distinto em B, conferir todos os seis IDs.
7. C6: montar hook+SettingsPage reais nas duas páginas. Salvar nome por h.saveSettings em A; aguardar B.h.snapshot refletir nome novo e conferir que input preserva antigo. Submeter “Salvar configurações” em B e reler DB. Não suprimir broadcast neste caso.
8. C7: repetir com BroadcastChannel indisponível em B; disparar focus explicitamente e aguardar refresh. Para janela em andamento, reter somente retorno da primeira chamada load, observar loading false e executar callback antigo antes de liberar.
9. Controle legacy: inserir metadata via API nativa, chamar writer atual, reler metadata; em contexto separado abrir versão 3, observar fechamento de conexões e rejeição do save v2 com cause nativa.
10. Controle de isolamento: usar dois BrowserContexts com mesma URL e comprovar ausência da row do primeiro no segundo. Controles adicionais: remover categoria não utilizada, alterar dados entre safety/restore e usar três páginas para settings.

As asserções do instrumento exigiram os resultados relatados; qualquer divergência abortaria a execução. Resultados completos foram guardados no diretório temporário. Não se modificaram expectativas dos testes do projeto para obter sucesso.

## Leitura do código e classificação

Repository relê/valida snapshot inteiro em save/import/saveSettings, mas a interface não aceita expectedRevision. `put` de save não distingue criação e edição; settings são substituídas integralmente. `remove` exclui por ID sem ler versão; removeDemo percorre demos atuais. Restore compara conteúdo do safety na própria readwrite e depois verifica com leitura estrita. Esses controles são compatíveis com os resultados 1–9/16–18.

Hook publica changed depois da escrita e restored depois do restore verificado (também em verify falho). O canal provoca refresh; sequence ordena somente publicação de respostas. SettingsPage preserva draft inicial; App remonta por restoreVersion, não por cada changed. Isso explica C6/C7 sem supor que mensagens foram perdidas.

Achados consolidados no plano: B01 overwrite de transação/settings, B02 ressurreição, B03 write-after-restore, B04 vínculo entre formulário e versão, B05 incompatibilidade de writer antigo: cinco ALTO. B06 perda potencial de draft em reabertura/reload: MÉDIO, PENDÊNCIA A2c, não reproduzido nesta análise. Nenhum CRÍTICO ou BAIXO contabilizado. Criações independentes sem perda e validações preservadas são controles, não achados adicionais.

## Limites e fontes

- Nenhuma implementação de CAS foi executada. A prova de suficiência da proposta é uma análise da fronteira transacional; seus testes/aceites ainda precisam ser implementados.
- Nenhum ensaio de crash físico, quota real, Safari/mobile, perfil suspenso por minutos ou upgrade blocked foi realizado nesta análise. Esses casos constam do plano futuro, sem alegação de aprovação atual.
- C6/C7 usam hook/SettingsPage reais num host de observação, sem CSS; não são execução de toda a interface. A futura suíte deve usar App real para tokens de todos os formulários.
- BrowserContexts isolam perfis; duas Pages no mesmo contexto são a topologia de concorrência local. Fonte e controle negativo: [Playwright — Isolation](https://playwright.dev/docs/browser-contexts).
- Escritas readwrite sobrepostas são serializadas; isso não valida snapshots antigos de clientes. Upgrade exige fechar conexões e versão inferior é rejeitada. Fontes: [IndexedDB — transaction scheduling](https://w3c.github.io/IndexedDB/#transaction-scheduling) e [opening a database](https://w3c.github.io/IndexedDB/#opening-a-database-connection).

## Preservação

Conferência final: **94/94 arquivos recebidos com SHA-256 idêntico**, diff rastreado idêntico ao inicial, HEAD em `7f80ff2` e staging vazio. Somente PLANO-A2B.md e este documento foram acrescentados. Produção, testes, capturas, dependências, configurações e documentos anteriores não foram editados. Sem staging ou commit; A2b não implementado e A2c não iniciado.
