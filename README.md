# Vértice · Finanças pessoais

Dashboard local para registrar gastos, receitas e transferências, acompanhar o resultado mensal e identificar mudanças relevantes. React, TypeScript, Vite, Tailwind CSS, Framer Motion, Recharts e Lucide.

## Executar

```sh
npm install
npm run dev
```

No PowerShell com scripts bloqueados, use `npm.cmd` no lugar de `npm`. Abra o endereço informado pelo Vite. Os dados são vinculados ao navegador e à origem (protocolo, endereço e porta): `localhost` e `127.0.0.1` usam bancos diferentes.

```sh
npm run build
npm test
npm run test:e2e
```

O build verifica TypeScript. Os testes de navegador usam o Microsoft Edge instalado, iniciam o preview em `http://127.0.0.1:5173` e precisam de um build atualizado e dessa porta livre. Os testes usam contextos isolados, sem acessar o perfil pessoal do navegador. `npm run format` aplica Prettier.

Se a porta 5173 estiver ocupada, use outra porta livre para os testes sem encerrar seu servidor. No PowerShell:

```powershell
$env:PLAYWRIGHT_PORT = '5187'
npm.cmd run test:e2e
```

## Primeiro uso

O banco novo começa sem transações fictícias. Você pode adicionar a primeira transação, importar uma planilha ou configurar suas contas. Não é obrigatório preencher todas as configurações para começar.

Em **Configurações**:

- Edite ou adicione contas, tipo, saldo inicial e a data desse saldo.
- O saldo inicial representa o início da data escolhida. Lançamentos a partir dela são aplicados ao saldo da conta. A data padrão de 01/01/1900 com saldo zero permite incluir todo o histórico até que você informe um ponto de partida.
- Cadastre categorias de gasto e receita; configure limites mensais por categoria.
- Registre renda prevista e despesas fixas para avaliar o espaço para gastos variáveis.
- Registre metas, valor já separado e prazo. Metas são informativas, sem geração automática de transações.
- Configure um limite de atenção para o saldo total das contas.
- Salve as configurações antes de navegar para outra tela.

## Telas e navegação

| Endereço          | Função                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `#/`              | Visão Geral: resumo, alertas, tendência, categorias, recentes e saldo das contas                |
| `#/transacoes`    | Histórico completo, filtros, páginas de 20 registros, edição, exclusão, importação e exportação |
| `#/configuracoes` | Contas, categorias, orçamento por categoria, planejamento inicial e metas                       |

Orçamentos, Metas e Patrimônio não têm telas dedicadas nesta etapa. Limites por categoria e configuração inicial de metas ficam em Configurações. Não há backend, login, integração bancária ou execução automática de recorrências.

## Cálculos e contexto

- **Saldo líquido do mês:** receitas menos despesas do período. Não inclui saldo inicial nem transferências.
- **Saldo das contas hoje:** saldo inicial mais movimentações desde a data configurada. Transferências reduzem a origem e aumentam o destino.
- As somas monetárias usam centavos inteiros. Agregações não são persistidas.
- Médias e projeções monetárias são arredondadas ao centavo. Limiares financeiros dos alertas usam centavos, inclusive a queda mínima de 15% e R$ 50 nas receitas.
- Saldo anterior à data inicial de uma conta é indisponível, não zero. Um total de contas incompleto não dispara alerta de saldo baixo.
- O mês atual é comparado até o mesmo dia do mês anterior, limitado ao último dia disponível naquele mês. Meses passados usam todos os registros do período.
- Ausência de registros não comprova ausência de gastos. Comparações não afirmam que os dados estão completos.
- O gráfico usa seis meses; meses sem movimentos financeiros são lacunas. Com menos de dois meses registrados, mostra uma explicação em vez de um gráfico vazio.
- A média histórica usa até três meses anteriores que tenham registros financeiros. Detecção de categorias atípicas exige pelo menos dois meses, crescimento acima de 20% e diferença de ao menos R$ 50.
- Até três alertas são ordenados por prioridade: déficit, saldo abaixo do limite, orçamento, queda de receitas, categorias e mudanças no consumo. Um alerta de orçamento substitui o alerta de anomalia da mesma categoria.
- Orçamento gera atenção a partir de 80% de utilização. Zero desativa o limite.
- A projeção de saídas é linear, pelo ritmo dos dias corridos. Só aparece no mês atual, a partir do sétimo dia e com gastos em pelo menos três datas diferentes. É estimativa, sensível a gastos pontuais e registros incompletos.
- Mês sem registros ou somente com transferências não gera elogio financeiro. Queda de gastos e melhora de sobra só geram alertas positivos em meses encerrados.
- Renda prevista, compromissos fixos e metas não alteram os totais realizados. Para isso, cadastre as transações correspondentes.

## Importação CSV e XLSX

1. Selecione um arquivo de até 5 MB e 5.000 transações. A primeira linha deve conter os nomes das colunas.
2. Para XLSX com várias abas, selecione a aba desejada. CSV permite escolher o delimitador; UTF-8 e Windows-1252 são aceitos.
3. Relacione data, valor e descrição. Tipo, categoria, conta, destino e recorrência são opcionais conforme o conteúdo.
4. Escolha separador decimal e formato de data. Datas ISO também são aceitas.
5. Sem coluna de tipo, escolha todos os registros como gasto/receita ou negativo como gasto e positivo como receita.
6. Sem coluna de conta/categoria, selecione os valores padrão. Quando mapeadas, contas e categorias devem corresponder a um nome ou ID cadastrado. Transferências exigem destino.
7. Confira a prévia. Qualquer linha inválida bloqueia o lote inteiro. Até 30 linhas são exibidas, mas todas são validadas.
8. Por padrão, registros idênticos são ignorados tanto no arquivo quanto no banco. A identidade considera tipo, centavos, categoria, descrição, conta, destino, data e recorrência. Desmarque a opção para manter repetições legítimas.

O processamento ocorre no navegador. XLSX usa [ExcelJS](https://github.com/exceljs/exceljs), carregado sob demanda somente ao ler XLSX. Esse módulo gera um aviso de tamanho no build (aproximadamente 940 kB minificado / 271 kB gzip), sem entrar na carga inicial do dashboard. Fórmulas de planilha não são executadas pelo aplicativo.

### Exportação

Transações exporta todos os resultados do filtro em CSV, reimportável pelo mesmo assistente. Configurações permite exportar todas as transações e uma cópia JSON com contas, categorias, metas e lançamentos. A restauração automática desse JSON ainda não está implementada; ele serve como cópia completa para recuperação técnica. O CSV não inclui saldos iniciais nem configurações.

## Persistência e migração

Banco IndexedDB `vertice-finance`, versão 2, stores `transactions` e `settings`. A atualização de v1 preserva IDs, valores e lançamentos, migra `account/category/destinationAccount` para `accountId/categoryId/destinationAccountId` e identifica a demonstração legada pelo prefixo original `demo-`.

Dados demonstrativos antigos continuam visíveis até a pessoa clicar em **Remover demonstração** e confirmar. Essa operação remove apenas os registros marcados como demonstração, preservando lançamentos reais e configurações. `src/data/demo.ts` permanece como fixture de desenvolvimento e não é importado pela aplicação.

O estado muda após a confirmação da gravação. Importações são atômicas. Outras abas recebem atualização via BroadcastChannel e há releitura ao retornar o foco. Dados continuam locais ao navegador; exporte cópias para protegê-los contra limpeza de dados do navegador.

Carregar, salvar e importar usam o mesmo fallback validado quando a chave `personal` está ausente. Configurações existentes inválidas são rejeitadas sem substituição silenciosa. Erros de validação chegam aos formulários; falhas de escrita aguardam o rollback e preservam a causa técnica no erro. Um erro no meio da importação reverte todo o lote, preservando os registros anteriores.

Exclusões e remoção da demonstração também preservam a causa original das falhas e exibem mensagens úteis nos diálogos. Falha durante a remoção da demonstração reverte as exclusões do lote inteiro. Datas numéricas fora do intervalo válido de importação recebem a mesma orientação de data inválida das demais linhas.

## Arquitetura

```text
src/
  App.tsx                         Composição de páginas, ações e diálogos
  components/
    dashboard/                    Visão Geral, navegação e indicadores
    transactions/                 Formulário, histórico, importação e tabela
    settings/                     Configuração inicial e planejamento
    charts/                       Tendência mensal
    ui/                           Diálogo compartilhado com gestão de foco
  features/
    dashboard/                    Cálculos puros e testes financeiros
    transactions/                 Validação, importação/exportação e testes
  hooks/                          Estado compartilhado pela raiz e navegação
  services/                       Contrato de repositório e implementação IndexedDB
  types/                          Transações discriminadas e contratos financeiros
  data/                           Catálogo inicial e fixture de demonstração
  utils/                          Formatação brasileira de moeda e datas
tests/                            Fluxos reais com Playwright
artifacts/                        Capturas geradas pelos testes
```

O hook recebe um repositório por injeção. Uma implementação futura de API pode substituir IndexedDB sem mover lógica financeira para componentes. Nenhuma biblioteca adicional de estado global foi necessária.

## Verificação

Testes unitários cobrem centavos, transferências, comparativos, calendário, categorias desconhecidas, prioridades de alertas, orçamento, média, projeção, contas, validação e importação.

Playwright cobre cadastro de receita/gasto/transferência, edição, exclusão, persistência, CSV, XLSX real, configurações, migração v1, remoção seletiva da demonstração, sincronização entre abas, falha de gravação, console e responsividade em 320, 390, 768, 1024 e 1440 px, além do foco do modal.

`tests/repository.spec.ts` executa o repository real contra IndexedDB no navegador, incluindo settings ausentes/corrompidos, falhas síncronas e assíncronas no lote, duplicatas e transferências editadas/excluídas. O harness é empacotado somente em memória durante o teste. Os testes de interface também verificam estados vazios e erros de configuração alterada depois da abertura do formulário ou da prévia de importação.

Não há ESLint configurado. A verificação disponível combina TypeScript estrito e Prettier. Detalhes e limites da revisão financeira estão em [AUDITORIA-FINANCEIRA.md](AUDITORIA-FINANCEIRA.md).

## Próximas etapas

Recorrência automática, restauração completa de backup, gestão dedicada de orçamentos/metas e patrimônio podem evoluir depois da validação do uso pessoal. OFX, backend e integrações bancárias ficam para fases posteriores.
