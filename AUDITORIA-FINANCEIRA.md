# Vértice — revisão do núcleo financeiro

Data: 15/09/2026. Escopo: confiabilidade do MVP existente, sem novas funcionalidades ou mudança de identidade visual.

## Revisão final atual

**Resultado: 135 testes aprovados — 105 unitários e 30 de navegador.** Build, TypeScript da aplicação e dos testes e verificação de formatação aprovados. Nenhuma dependência foi adicionada.

O código recebido já continha `resolveSettings`, preservação de erros em salvar/importar, tratamento de saldo indisponível, operações em centavos e 95 testes unitários. Esses testes foram executados antes das novas alterações e passaram. As correções existentes foram analisadas e preservadas; a lista histórica ao fim deste documento não deve ser confundida com os arquivos alterados nesta execução.

### Falhas adicionais encontradas e corrigidas

| Falha                                                                                                                                       | Correção e evidência                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Exclusão de transação podia retornar uma exceção nativa sem mensagem tratada; exceção no cursor de remoção da demo perdia a causa original. | Captura explícita com `abort(error)` e espera pelo rollback. Dois testes no IndexedDB real verificam `cause`, preservação de todos os registros e releitura após recarregar. A falha da demo ocorre na segunda exclusão, depois de uma já enfileirada. |
| Os diálogos de exclusão e remoção da demo descartavam mensagens úteis produzidas pelo repository.                                           | Os dois diálogos exibem a mensagem tratada, mantendo um fallback genérico. Dois testes completos confirmam a mensagem de armazenamento cheio e os dados preservados após recarregar.                                                                   |
| Datas numéricas inválidas na importação podiam produzir `Invalid time value`.                                                               | Validação do resultado da conversão antes de `toISOString`; a linha recebe a orientação existente de data válida. Quatro testes cobrem `NaN`, infinitos e um serial fora do intervalo.                                                                 |
| A porta fixa dos testes estava ocupada pelo servidor existente.                                                                             | `PLAYWRIGHT_PORT` permite escolher outra porta livre. O padrão continua 5173; esta revisão executou os testes na 5187 em contextos isolados.                                                                                                           |

### Arquivos alterados nesta execução

1. `src/services/transactionRepository.ts` — tratamento de falhas síncronas nas exclusões.
2. `src/components/transactions/TransactionsPage.tsx` — mensagem útil no diálogo de exclusão.
3. `src/App.tsx` — mensagem útil na remoção da demonstração.
4. `src/features/transactions/importExport.ts` — proteção da conversão de datas numéricas inválidas.
5. `src/features/dashboard/calculations.test.ts` — seis casos adicionais nos limites financeiros.
6. `src/features/transactions/importExport.test.ts` — quatro casos de datas numéricas inválidas.
7. `tests/repository.spec.ts` — dois casos de falha de exclusão, causa e rollback.
8. `tests/dashboard.spec.ts` — dois fluxos de erro e persistência na interface.
9. `playwright.config.ts` — porta de testes configurável.
10. `README.md` — instruções da porta alternativa e comportamentos verificados.
11. `AUDITORIA-FINANCEIRA.md` — este relatório atualizado.

Os comandos de verificação também regeneraram o build em `dist/`, `tsconfig.tsbuildinfo`, `test-results/` e as três capturas existentes em `artifacts/`. Não houve mudança visual nem alteração de `calculations.ts`, do hook ou das fórmulas financeiras já corretas. A pasta continua sem Git; esta relação registra as edições efetuadas nesta execução, não um diff contra commit.

### Testes adicionados: 14

- Financeiros (6): projeção bloqueada no dia 6 e permitida no dia 7 mesmo com três datas de gastos; orçamento em R$ 79,99 e R$ 80,00 para limite de R$ 100; anomalia exatamente em 20% e um centavo acima, com diferença monetária mínima suficiente.
- Importação (4): datas numéricas `NaN`, `Infinity`, `-Infinity` e `1e20`, mantendo linhas válidas na prévia e mensagem útil na linha inválida.
- Repository (2): falha síncrona em `remove` e na segunda exclusão de `removeDemo`, verificando causa original, rollback integral e persistência após recarregar.
- Interface (2): erro de exclusão e de remoção da demo chegando ao diálogo, sem mensagem técnica nem perda de lançamentos.

### Verificação final desta execução

| Comando/verificação                                             | Resultado                                                                                                                                                                                                                                           |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm.cmd test`                                                  | 105/105: 76 financeiros e 29 de validação/importação.                                                                                                                                                                                               |
| `npm.cmd run build`                                             | TypeScript e build aprovados. Permanece apenas o aviso de tamanho do chunk ExcelJS carregado sob demanda.                                                                                                                                           |
| `$env:PLAYWRIGHT_PORT='5187'` seguido de `npm.cmd run test:e2e` | 30/30 em 27,4 segundos: 16 de repository e 14 de interface.                                                                                                                                                                                         |
| TypeScript dos testes e configuração Playwright                 | `tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM,DOM.Iterable tests/dashboard.spec.ts tests/repository.spec.ts tests/helpers/repositoryHarness.ts playwright.config.ts`: aprovado. |
| Prettier                                                        | Código, testes, configurações e documentação verificados.                                                                                                                                                                                           |
| Lint                                                            | Não há ESLint configurado; não foi alegada execução de lint inexistente.                                                                                                                                                                            |

A primeira tentativa dentro da sandbox foi impedida por acesso do esbuild à configuração; a execução autorizada fora dessa restrição passou. A primeira execução de navegador foi impedida pela porta ocupada. Na suíte ampliada, dois seletores dos testes novos precisaram incluir o rótulo “Demonstração” da célula; a execução final completa passou sem testes desativados.

### Conclusão e limites

Os testes cobrem os itens solicitados: receitas, despesas, saldo líquido, economia, centavos, contas, transferências editadas/excluídas, comparações de calendário, categorias/orçamentos, seis meses de histórico com lacunas, média, projeção, prioridade dos insights, importação/duplicatas, migração v1, settings ausentes/corrompidos, estados vazios e persistência após recarregar. A suíte confirma a conservação do total das contas na transferência de R$ 1.000 com bases temporais coerentes, sem alterar receita, despesa ou resultado.

Continuam os limites operacionais descritos abaixo: dados locais podem ser perdidos ao limpar o navegador; exportação JSON não tem restauração automática; projeções dependem de registros completos; o total de contas não inclui patrimônio externo; saldos iniciais precisam estar conciliados; testes de navegador foram executados no Edge/Chromium. Não há pendência técnica encontrada no escopo testado. Isso não substitui a conciliação dos saldos iniciais e dos primeiros lançamentos reais.

## Histórico da revisão anterior

As seções seguintes preservam o registro que já existia no projeto. Seus números e arquivos se referem à etapa anterior; o resultado atual está acima.

### Estado encontrado naquela retomada

Os ajustes de fallback, erros, saldo desconhecido, centavos e importação já estavam escritos. Havia 93 testes unitários passando, mas a implementação estava incompleta: TypeScript e build falhavam na tipagem do lote importado, os testes novos do IndexedDB ainda não tinham sido executados e faltava verificar os novos comportamentos na interface.

A pasta não possui repositório Git. `git status` e `git diff` não funcionam; não há branch, histórico de commits ou classificação confiável entre arquivos modificados e não rastreados. A relação abaixo registra os arquivos trabalhados nesta revisão, incluindo a etapa interrompida; não representa um diff contra um commit.

## Bugs encontrados e correções

| Problema                                                                                                             | Correção                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Carregar settings ausentes funcionava, mas salvar/importar podiam validar `undefined`.                               | `resolveSettings` centraliza fallback e validação para as três operações. Configuração existente inválida não é substituída silenciosamente.                     |
| Abort do IndexedDB podia esconder o erro de validação ou encerrar a promessa antes do rollback.                      | Preservação do erro original; conclusão somente em `oncomplete`/`onabort`; erros nativos recebem mensagem útil e `cause`.                                        |
| Exceção síncrona no meio da importação podia escapar do tratamento do lote.                                          | Captura e abort explícito da mesma transação, revertendo as escritas já enfileiradas.                                                                            |
| Saldo indisponível era convertido em zero na interface e no cálculo do alerta de saldo baixo.                        | Formatação explícita de indisponibilidade e total de contas que retorna `null` quando incompleto.                                                                |
| Médias/projeções monetárias e limites de alertas estavam expostos a resíduos decimais.                               | Cálculos em centavos e arredondamento do resultado monetário. Inclui regressões de queda de receita de exatamente R$ 50 e de exatamente 15% (`334,40 → 284,24`). |
| Redução de despesas podia gerar mensagem positiva apesar de déficit no período.                                      | Mensagem positiva condicionada a resultado não negativo em mês encerrado.                                                                                        |
| Número de data Excel com fração de horário podia ser arredondado para o dia seguinte.                                | Parte inteira do serial, preservando o dia.                                                                                                                      |
| Descartar linhas vazias antes da prévia deslocava a identificação dos registros inválidos.                           | Preservação das posições das linhas; linhas inteiramente vazias são ignoradas na validação.                                                                      |
| A implementação interrompida produzia uma união TypeScript incompatível ao combinar transação bruta e normalizada.   | Preservação explícita de ID, origem e data de criação junto ao resultado validado.                                                                               |
| Tooltip oculto do gráfico mantinha coordenadas de desktop após reduzir a tela e gerava rolagem horizontal em 320 px. | Contenção de overflow somente no contêiner do gráfico. Teste também verifica o tooltip ativo após a animação.                                                    |

Transferências, fórmulas básicas de receita/despesa e migração não foram reescritas: foram verificadas e preservadas. O hook e as validações existentes já propagavam os erros úteis quando o repository os mantinha.

## Arquivos trabalhados

### Código de produção

| Arquivo                                     | Alteração                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/services/transactionRepository.ts`     | Fallback validado, propagação de erros, rollback e normalização das escritas.    |
| `src/features/dashboard/calculations.ts`    | Centavos, médias/projeções, total de contas incompleto e coerência dos insights. |
| `src/features/transactions/importExport.ts` | Datas Excel com horário e preservação de posições de linhas vazias.              |
| `src/utils/format.ts`                       | Rótulo para saldo indisponível.                                                  |
| `src/components/dashboard/OverviewPage.tsx` | Exibição de saldo indisponível nas contas.                                       |
| `src/components/settings/SettingsPage.tsx`  | Mesmo tratamento na prévia das configurações.                                    |
| `src/components/charts/TrendChart.tsx`      | Média financeira arredondada em centavos.                                        |
| `src/styles.css`                            | Contenção pontual do tooltip; identidade visual preservada.                      |

### Testes, dependências e documentação

| Arquivo                                          | Alteração                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `src/features/dashboard/calculations.test.ts`    | Ampliação para 70 testes financeiros.                                                      |
| `src/features/transactions/importExport.test.ts` | Ampliação para 25 testes de validação/importação.                                          |
| `tests/repository.spec.ts`                       | Novo: 14 testes do repository real com IndexedDB do navegador.                             |
| `tests/helpers/repositoryHarness.ts`             | Novo: expõe o código real somente ao contexto isolado dos testes; bundle em memória.       |
| `tests/dashboard.spec.ts`                        | Quatro novos cenários de interface e reforço da verificação do tooltip; 12 testes ao todo. |
| `package.json`                                   | `@types/node` em desenvolvimento para verificar TypeScript dos testes de navegador.        |
| `package-lock.json`                              | Lockfile correspondente; nenhuma dependência nova de runtime.                              |
| `README.md`                                      | Regras financeiras, persistência e instruções de verificação atualizadas.                  |
| `AUDITORIA-FINANCEIRA.md`                        | Este registro da revisão.                                                                  |

Os comandos também regeneraram `dist/`, `tsconfig.tsbuildinfo`, `test-results/` e capturas em `artifacts/`. Esses são artefatos de execução, não alterações funcionais adicionais.

## Cobertura verificada

- Receitas e despesas isoladas/combinadas, saldo líquido, taxa de economia sem receita, centavos e variação percentual com base zero/negativa.
- Saldo inicial de R$ 5.000 + receita de R$ 2.000 − despesa de R$ 500 = R$ 6.500.
- Transferência de R$ 1.000: origem −R$ 1.000, destino +R$ 1.000, resultado e total das contas inalterados. Edição, exclusão e direção inversa; exclusão dos indicadores de receitas/despesas, categorias, orçamento, tendência e projeção.
- Datas antes/no/depois do saldo inicial; saldo indisponível e total incompleto.
- Meses completos/parciais, fevereiro, ano bissexto, virada de ano, seis meses cronológicos e diferença entre zero registrado e lacunas.
- Agregação por categoria, orçamento a 50/80/100/125%, categorias desconhecidas, médias de zero a três meses e projeção com quantidade mínima de dias/registros.
- Insights de déficit, saldo baixo, orçamento, receita, gastos, anomalia, projeção e melhora; prioridade e máximo de três mensagens.
- CSV/XLSX, valores negativos e decimais, datas inválidas, linhas vazias, contas/categorias/destinos inválidos e duplicatas internas/persistidas.
- IndexedDB: primeira inicialização, settings ausentes/inválidos, salvar/editar/excluir/recarregar, migração v1 incluindo transferência, remoção seletiva da demonstração e configurações incompatíveis.
- Importação atômica com falha assíncrona de chave e falha síncrona de armazenamento: nenhum registro parcial persiste; dados anteriores permanecem.
- Interface: banco vazio, mês sem registros, exclusão do último lançamento, erro do repository chegando ao cadastro/importação com dados preenchidos preservados, atualização entre abas e falha de gravação sem alterar saldo.
- Responsividade de 320 a 1440 px, tooltip financeiro, navegação móvel e foco do modal.

## Resultado final das verificações

| Verificação                        | Resultado                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `npm.cmd test`                     | 95/95 passando: 70 financeiros e 25 de validação/importação.                                                          |
| `npm.cmd run test:e2e`             | 26/26 passando: 14 de repository e 12 de interface; última execução completa em 48 segundos.                          |
| `npm.cmd run build`                | Aprovado, incluindo TypeScript estrito da aplicação; apenas aviso de tamanho do ExcelJS.                              |
| TypeScript dos testes de navegador | Aprovado com `tsc --noEmit`, `strict`, ES2022, DOM e resolução Bundler.                                               |
| Prettier                           | Formatação verificada.                                                                                                |
| Lint                               | ESLint não está configurado; não foi alegada execução de uma ferramenta inexistente.                                  |
| Marcadores de trabalho incompleto  | Nenhum TODO/FIXME/HACK, `console.log`, teste `.skip`/`.only` ou supressão TypeScript encontrado em `src/` e `tests/`. |

Nenhum teste permanece falhando. Na retomada, corrigimos a falha de TypeScript; durante a verificação, corrigimos a injeção do harness em página SVG, um seletor do novo teste de importação e a espera da animação do tooltip. Esses eram problemas de infraestrutura/teste, separados dos bugs de produto descritos acima. Nenhum teste foi desativado para obter aprovação.

**Conclusão:** revisão concluída no escopo do núcleo financeiro do MVP, com 121 testes automatizados aprovados. Os resultados sustentam os cenários cobertos; os limites operacionais abaixo continuam aplicáveis.

## Limites que permanecem

- Dados são locais ao navegador e à origem. Limpar armazenamento pode apagá-los; não há backend ou backup automático. A exportação JSON existe, mas a restauração automática desse formato continua fora do MVP.
- O saldo líquido mensal é receita menos despesa. O total das contas soma os saldos modelados; não representa investimentos ou patrimônio externo ao aplicativo.
- Saldos iniciais precisam representar o começo da data informada. Com datas iniciais diferentes entre contas, transferências anteriores ao ponto de partida de uma delas precisam estar refletidas naquele saldo inicial. Os testes de conservação usam bases temporais coerentes.
- Comparações dependem de registros completos; meses sem dados não provam gastos zero. O dia de corte anterior respeita o último dia disponível no calendário. Projeção é linear, não uma previsão garantida.
- Fallback não reconstrói configurações personalizadas perdidas. Registros vinculados a contas ausentes são rejeitados, preservando os dados para recuperação.
- Testes de navegador executados no Microsoft Edge/Chromium instalado, em contextos isolados; outros motores não foram certificados nesta revisão.
- O build mantém aviso do chunk ExcelJS (~940 kB minificado / 271 kB gzip), carregado sob demanda. O aviso não é erro de TypeScript nem falha financeira.
- Sem Git, não há histórico local versionado para comparação ou recuperação.

## Próximo passo recomendado

Versionar este estado validado e realizar uma conciliação curta com lançamentos conhecidos: conferir saldos iniciais, cadastrar/importar um conjunto pequeno, comparar cada conta com o extrato e exportar uma cópia. Nenhuma nova funcionalidade é necessária para essa validação de uso.
