# 1. Estado encontrado

Planejamento de 04/10/2026. **Nenhuma implementação B1 foi realizada.** As decisões abaixo são propostas para aprovação; não autorizam implementação automaticamente.

| Item | Estado verificado |
| --- | --- |
| Repositório principal | `C:\Users\patai\OneDrive\Documentos\Dashboard Financeiro` |
| Base oficial | `c7fc72c649b08d5a2e9a2603515196d2799ce559` — `docs: atualiza roadmap do Vertice apos A2` |
| Worktree criado | `C:\Users\patai\OneDrive\Documentos\Dashboard-Financeiro-B1` |
| Branch de planejamento | `plan/b1-money-dates-origin` |
| Estado inicial do novo worktree | Limpo; HEAD exatamente na base oficial; staging vazio |
| Principal | Alterações preexistentes preservadas; não foram copiadas para o worktree |
| Aplicação | React/TypeScript/Vite, Pessoal local, IndexedDB `vertice-finance` v3, backup JSON v2 |

Fontes prioritárias: [roadmap pós-A2](ROADMAP-VERTICE-2-POS-A2.md), decisões, arquitetura revisada, auditoria histórica, [A2b](IMPLEMENTACAO-A2B.md), [A2c](IMPLEMENTACAO-A2C.md), [README](README.md), código e testes. `DECISOES-VERTICE-2.md`, `ARQUITETURA-VERTICE-2-REVISADA.md` e `AUDITORIA-ARQUITETURA-VERTICE-2.md` são arquivos não versionados no principal: estão ausentes desse checkout. Foram consultados somente para leitura no principal, sem cópia. Não representam contratos publicados nesse commit. Em conflito, prevalecem código/testes e roadmap pós-A2.

O sistema já soma muitos valores em centavos, mas seus campos persistidos e resultados públicos são reais `number`. Não existe Money nominal com verificação das operações. Validação limita cada campo; não limita acumuladores. Clocks continuam independentes. `source` admite manual/import/demo; `createdAt` é opcional e pode ter sido sintetizado. A documentação histórica que cita DB v2 ou A1 como próximo trabalho está superada pelo checkpoint atual.

Esta execução lê testes, sem executar suítes nem instalar dependências. Resultados históricos de A2 não são resultados novos de B1. Somente este documento deve aparecer como novo no worktree; não há commit de planejamento.

# 2. Escopo B1

Menor conjunto necessário: kernel BRL em centavos com operações verificadas; adapters explícitos para reais legados; integração das operações monetárias existentes sem reescrita; CivilDate e período civil separados de Instant; corte explícito para calculadores/comandos; política de proveniência que preserve campos históricos; contrato documental de referências externas.

Preservar números financeiros válidos, semântica de transferências, imports existentes, CAS A2b, recuperação A1/A2a, proteção dirty/PWA A2c e backup v2. Preparar interfaces consumíveis por B2 e P1, sem iniciar essas fases. B1 define corte e calculadores aptos a recebê-lo; P1 consome o contrato na composição visual completa.

# 3. Fora de escopo

Workspace IDs, migração de banco, aumento de DB version, novos stores/índices, backup v3, Supabase, cloud, autenticação, sync, IA, Business, competência, patrimônio, investimentos, conectores, reconciliação automática, histórico de budgets, engine universal, cache, workers, reorganização geral de pastas, front premium, Three e alterações visuais/PWA preexistentes.

Não criar tipos, módulos ou tabelas vazios para recursos futuros. Nesta execução também não editar `src`, testes, package.json, README ou roadmap, nem instalar dependências ou criar commits.

# 4. Inventário Money atual

Os caminhos abaixo são evidência e candidatos para implementação futura, não arquivos alterados nesta execução. R$ significa reais; c significa centavos; porcentagem não é Money.

| Fluxo / evidência | Atual: unidade e transformação | Desejado / arredondamento | Limites, risco e compatibilidade |
| --- | --- | --- | --- |
| `types/finance.ts`, Transaction.amount | R$ number; magnitude positiva | Persistência R$; domínio c inteiro; sinal vem do tipo | 0,01 a 999.999.999,00; transferências não viram receita/despesa |
| Account.initialBalance | R$ number, pode ser negativo; data-base civil | R$ no registro; c assinado no cálculo | ±999.999.999,00; saldo antes da base continua indisponível |
| Category.monthlyBudget | R$ opcional; zero desativa | c não negativo; ausência preservada | Mesmo teto; não preencher campo ausente nem historizar budget atual |
| Goal.targetAmount/currentAmount | R$; target positivo, current ≥ 0 | c; diferença checked, faltante limitado a zero | Mesmo teto; current pode exceder target; percentual não deve ser capado sem evidência |
| plannedIncome, fixedExpenses, lowBalanceThreshold | R$; fixas positivas, outros ≥ 0 | c; soma e diferença checked | Teto por campo; planejamento não altera realizado |
| `validation.ts`: parseAmount/validators/signature | Texto → R$; valida finite, duas casas com tolerância; Math.round(n*100)/100; assinatura usa c | Kernel lexical → c; adapter numérico validado; assinatura conserva identidade | Não arredondar terceiro decimal; preservar separador escolhido e tolerância legada de leitura |
| TransactionForm | Texto brasileiro; parser, validação no comando | Texto original no draft; parse → c → R$ no writer | Não converter draft inválido em zero nem alterar dirty tracking |
| SettingsPage | Inputs number/valueAsNumber; NaN em campo vazio; soma fixas em c e subtrações em R$ | Adapter numérico na fronteira de validação; derivados em c | Não reformatar cada tecla; preservar erros e revisão do editor |
| `importExport.ts`: CSV | Decimal explícito; sinal determina tipo; Math.abs; preview validado | Parse lexical c assinado, inferir tipo antes de magnitude | Duas casas; negativos admitidos na entrada conforme modo, movimento final positivo; lote inválido bloqueado |
| XLSX | Number cru ou texto; validação posterior | Number → adapter legado; texto → parser com formato escolhido | Não inferir localização automaticamente; não executar fórmulas; conservar preview/mapeamento/dedup |
| Repository / hook | R$ nos snapshots e seis writers; CAS atômico | Continua R$; valida adapter sem gravar projeção do domínio | Não alterar stores, IDs, revisão, intenção create/update ou transação |
| totalIncome/totalExpenses/netBalance/summarize | Math.round(R$*100), reduce sem checked, /100; balance faz reconversões | Somar/subtrair c checked; resultados canônicos e adapter de apresentação | Soma pode exceder safe integer mesmo com linhas válidas; não produzir resultado aproximado |
| accountBalance/totalAccountBalance | c com saldo inicial e sinais; retorna R$ ou null | c checked; null mantém semântica de base indisponível | Transferência conserva total; erro de overflow distinto de ausência de base |
| aggregateCategories/monthlyData | Somas c; ordenação/participação; meses sem dados null | c checked e razões separadas | Preservar fallback categoria, ordem estável e lacunas; não representar null por zero |
| movingAverage/detectAnomalies | Soma de meses em c, média Math.round; limiar produto por 100/120 | Divisão racional arredondada; limiar racional exato | Intermediário pode exceder faixa segura; média positiva empate sobe, mesma semântica vigente |
| closingProjection | Math.round(total c * dias / dia) | multiply/divide exatos; resultado c validado | Mesmo mês, ≥7 dias, ≥3 datas de gasto; até 31 dias; não tornar projeção fato realizado |
| budgetUsed/percentageChange/savingsRate | Razões Number; null com denominador zero | Razões para exibição; decisões por comparação inteira exata | Produto percentual não é centavo; não usar percentual formatado para decidir alertas |
| generateInsights | Limiares 80/100%, 15% + R$50, 20%, 15% projeção; prioridades/strings | Comparações racionais exatas, diferenças c checked | Preservar operadores inclusivos/exclusivos e prioridades; tirar subtrações R$ de frases monetárias |
| SettingsPage derivados | Fixas soma c; renda disponível e falta para meta em R$; meta Math.round(razão*100) | c checked; razão visual preservada | Nenhum realizado novo; não dividir por target inválido |
| OverviewPage/FinancialSummary/CategoryBreakdown/TrendChart/TransactionsPage/TransactionTable/RecentTransactions | R$ para Intl/Recharts; cada composição pode ter clock próprio | Centavos até fronteira; formatador exato para texto; gráfico usa conversão controlada | Number de gráfico não volta a cálculo; texto nunca perde centavo; sem redesign |
| CSV export / JSON backup / restore | CSV toFixed(2); JSON v2 R$; restore preserva snapshot validado | V2 e CSV compatíveis; adapter somente em projeções e novos comandos | Reader/restore não normalizam/regravam dados históricos; campos desconhecidos JSON preservados |
| `calculations.test.ts`, importExport/backup tests, tests navegador | Fixtures R$ e asserts conhecidos | Manter goldens atuais + asserts c/overflow/origens/corte | Nenhum teste alterado agora; nova representação não justifica novos números |

# 5. Contrato Money recomendado

| Opção | Benefício | Custo / risco | Decisão proposta |
| --- | --- | --- | --- |
| A: persistir todos os campos em c agora | Unidade única também no banco | Migration/DB version, clientes antigos, restore/export v2 e rollback exigem coordenação; amplia B1 para B2 | Rejeitar em B1 |
| B: persistir R$ e calcular com c | Preserva dados, backup e repository; fecha operações existentes | Adapters explícitos em cada borda e tipos claros evitam misturar unidades | **Recomendada** |
| C: migrar alguns campos e manter outros em R$ | Pode servir a consumidor específico | Sem consumidor atual, cria duas convenções persistidas e versionamento parcial | Rejeitar agora |

`MinorUnits` nominal (`number` branded em centavos BRL), com construtor validado em runtime. BRL é invariável do produto atual, declarada no módulo/adapters/formatador; não carregar objeto com currency em cada valor. Operadores JS sobre branded numbers retornam number sem brand: apenas funções checked podem produzir MinorUnits; casts fora do construtor são proibidos por convenção/revisão e testes de compilação. Não prometer que brand sozinho impede aritmética insegura. Valor de transação é magnitude; saldos/resultados podem ser assinados. Não estender `Transaction.amount` para centavos mantendo o mesmo nome em registros legados. Usar tipos/nomes explícitos para DTO legado e resultados canônicos; funções existentes podem ter adapters de compatibilidade durante a integração, sem calcular novamente em reais.

Fluxo: DTO R$ validado → adapter → operações c → formatação/adapter compatível. Conversão inversa para writer é permitida apenas para campos no teto legado. Agregados até MAX_SAFE_INTEGER c nem sempre podem ser representados exatamente em R$ Number; não usar ida/volta por reais em cálculos nem prometer exatidão dessa conversão para todo agregado. Formatação monetária de agregado deve separar inteiro/fração de c e aplicar agrupamento/sinal brasileiro; gráfico recebe aproximação declarada somente para coordenadas, com texto/tooltip vindo do c original. Se integração existente exigir precisão não garantida, retornar erro, não truncar.

Repository continua responsável por snapshot/commit CAS e DTO legado. B2 consumirá Money, CivilDate, contexto, origin e adapters de serialização; sua migração/scoping/fence continua decisão posterior. B1 é reversível por código, sem conversão física a desfazer e sem restaurar snapshot antigo sobre writes novos.

# 6. Limites / operações checked

Campo persistido máximo: 99.999.999.900 c (R$999.999.999,00), incluindo magnitude do saldo inicial. Agregado: |minor| ≤ 9.007.199.254.740.991. Sem teto arbitrário de quantidade de registros substituindo verificação aritmética.

| Operação | Contrato mínimo |
| --- | --- |
| Construtor / fromLegacyReais | Finite; domínio de sinal; limite do campo; duas casas pela tolerância legada aplicável; candidato inteiro seguro. Não aceitar terceira casa significativa |
| checkedAdd(a,b) | Validar operandos; antes de somar, comparar com MAX-b/MIN-b conforme sinal; validar resultado; checkedSubtract usa negação segura e checkedAdd |
| checkedMultiply(a,b) | Operandos inteiros seguros; zero explícito; comparar magnitudes com floor(MAX/abs(b)) antes do produto; validar produto. Não efetuar produto inseguro para depois validar |
| Acumuladores | checkedAdd em cada passo. Ordem determinística; se prefixo exceder limite, erro mesmo que cancelamento posterior pudesse reduzir total. Não reordenar para esconder overflow |
| multiplyDivideRounded(a,n,d) | d positivo, inteiros válidos; quociente e resto exatos com BigInt **local** no helper racional, inclusive se produto couber mas divisão Number arredondar incorretamente; converter só resultado validado em faixa segura |
| Comparação de razões | Comparar a*n e b*d exatamente. Caminho Number checked seguro; fallback BigInt local apenas na operação; não persistir BigInt nem mudar todo modelo |
| Divisão / médias | Proibir denominador zero; onde ausência de base já retorna null, manter null. Arredondar ao centavo por quociente/resto |
| Rounding | Médias/projeções positivas: empate para cima. Geral assinado: nearest com empate para +infinito, equivalente a Math.round legado (-1,5 → -1); evitar nova política half-away global |
| Percentuais | Number finito para exibição, usando razões de inteiros seguros; null para base zero. Limiares usam racional exato, não esse resultado nem texto toFixed |
| Erros | Código detectável de overflow/valor inválido/divisão inválida; não NaN, Infinity, saturação ou zero. Read/backup estrutural válido não vira recovery só porque uma métrica excede capacidade |

BigInt local fica justificado apenas em arredondamento de divisão/multiply-divide e comparação racional com produtos inseguros. Exemplo de projeção real: total 300.000.000.000.001 c, dias=31, corte dia31; produto 9.300.000.000.000.031 excede MAX_SAFE, resultado exato é o total original. Esse total cabe em 3.001 lançamentos no teto vigente, distribuídos em pelo menos três datas. Checked Number puro teria de rejeitar um resultado válido. Comparações 100/120/85/115 também têm exemplos concretos na seção24; 80/100% de budget já têm denominador limitado por campo, então não justificam BigInt por si nem precisam multiplicação indiscriminada. Comparações simples a>=b não usam BigInt.

Mesmo produto seguro não garante divisão arredondada fiel: Math.round(MAX_SAFE_INTEGER/3) retorna 3.002.399.751.580.331 c, enquanto quociente/resto exatos dão 3.002.399.751.580.330 c (resto1). O helper de arredondamento racional deve usar quociente/resto exatos também nesse caso, podendo usar BigInt local diretamente para evitar um fast path incorreto. Correção desse erro IEEE extremo é C, não paridade P nem nova política de rounding. Soma acima do limite continua erro; BigInt não amplia faixa do resultado, DTO, JSON ou IndexedDB. Sem biblioteca externa.

Erro de validação de comando bloqueia gravação. Erro derivado não é LocalReadError nem corruption/recovery: lançar uma exceção pequena e identificável de cálculo monetário; capturá-la nas composições atuais que calculam valores durante render (Overview, resumo de TransactionsPage e derivados de SettingsPage). Um try/catch específico por bloco/composição dependente é suficiente; não criar framework Result/Either. Ao falhar, não renderizar os números/insights dependentes e mostrar mensagem mínima de cálculo indisponível; manter lista, edição, navegação e export de dados íntegros acessíveis. Repropagar erros não monetários. Null continua exclusivamente ausência/base indisponível onde já previsto, não overflow. Esses catches e smoke tests pertencem a B1b, antes de checks poderem lançar em produção; não esperar P1 para evitar crash. P1 integra o corte e a apresentação completa, sem exigir redesign em B1.


Limites por campo comprovados em validation.ts; B1 mantém estas políticas, sem teto novo uniforme para valores derivados:

| Campo | Limite atual em R$ | Limite B1 | Mudança? / justificativa |
| --- | --- | --- | --- |
| Transaction.amount (income/expense/transfer) | 0,01 ≤ n ≤ 999.999.999 | Mesmo intervalo; 1 a99.999.999.900 c no domínio | Não; magnitude positiva |
| Account.initialBalance | -999.999.999 ≤ n ≤ 999.999.999, zero aceito | Mesmo intervalo assinado | Não; negativo existe também em campo persistido |
| Category.monthlyBudget | Ausente ou 0 ≤ n ≤ 999.999.999 | Mesmo; zero desativa | Não |
| plannedIncome / lowBalanceThreshold | 0 ≤ n ≤ 999.999.999 | Mesmo | Não |
| fixedExpenses.amount | 0 < n ≤ 999.999.999, tolerância settings | Mesmo intervalo bruto; ressalva subcentavo abaixo | Não rejeitar legado pela nova representação |
| Goal.targetAmount | 0 < n ≤ 999.999.999, tolerância settings | Mesmo intervalo bruto; ressalva subcentavo abaixo | Não impor mínimo0,01 ocultamente |
| Goal.currentAmount | 0 ≤ n ≤ 999.999.999; pode exceder target | Mesmo | Não |
| Saldos/resultados agregados | Sem teto agregado checked atual | Inteiro seguro c, erro detectável acima | Sim; proteção H06, não teto por lançamento aplicado à soma |

Ressalva real: a tolerância de settings permite target/fixa positivos como R$1e-8, embora Math.round(n*100)=0. Exigir positividade após converter para c criaria rejeição nova de snapshot ou gravaria zero. B1 mantém validação estrutural/writer bruto e não normaliza settings; adapter não regrava o candidato. Onde o valor subcentavo não permite satisfazer o contrato monetário do consumidor (por exemplo denominador positivo de meta convertido a0), a projeção deve gerar erro derivado identificado e suprimir esse cálculo, preservando edição/export/restore do raw. Essa indisponibilidade é mudança deliberada C, com fixture; não chamar corrupção, não inferir NaN/0%, não endurecer validator de entrada silenciosamente. Valores normais com casas representáveis continuam P. Qualquer futura proibição desses valores no comando requer decisão separada.

# 7. Parsing

Kernel mínimo compartilhado: parser lexical de decimal → c, recebendo separador explícito, e adapter de Number legado → c. Política de sinal/zero/teto pertence ao campo, não a cinco parsers duplicados. Texto manual/CSV preserva regras atuais de grupos e remoção de R$/espaço; XLSX Number, backup e valueAsNumber passam pelo adapter numérico. Não interpretar string formatada a partir de Number nem inventar precisão já perdida.

| Entrada | Resultado lexical / política |
| --- | --- |
| `0` | 0 c; válido para budget/planned/threshold/current, inválido para movimento/target/fixa |
| `0,01` | 1 c |
| `1`, `1,1`, `1,10` | 100, 110, 110 c |
| `1.234,56` com decimal vírgula | 123.456 c |
| `1234.56` com decimal ponto escolhido | 123.456 c; com vírgula não reinterpretar silenciosamente |
| `-1,10` | -110 c no parser; saldo inicial aceita; transação manual rejeita; import signed infere tipo e usa magnitude |
| `NaN`, `Infinity`, vazio, agrupamento incorreto | Erro detectável; wrapper legado pode manter NaN apenas como sinal de parsing para UI até a validação, nunca no domínio/persistência |
| `1,001` / `1.001` em modo decimal ponto | Rejeitar terceiro decimal; em modo vírgula `1.001` é agrupamento legado legítimo e significa R$1001 |
| `999.999.999,00` | 99.999.999.900 c; aceito |
| `999.999.999,01` | Kernel pode representar, política do campo rejeita acima do teto |

Parser texto monta c por dígitos com limites verificados, sem parseFloat seguido de round. Adapter Number conserva a tolerância existente: Δ = abs(n*100 - Math.round(n*100)) é medida em centavos, não reais; 0,00001 c corresponde a R$0,0000001. Transação rejeita Δ>0,00001 c (aceita igualdade); settings exige Δ<0,00001 c (rejeita igualdade). É tolerância aritmética vigente, não permissão geral para terceiro decimal. Registrar esses limites diferentes; não unificá-los silenciosamente na refatoração. `0.1 + 0.2` pode ser numericamente validável pelo legado; `1.001` Number não é. Backup reader devolve registro original, não o candidato arredondado. Novos comandos continuam a normalização monetária já vigente.

CSV export permanece pt-BR, duas casas, escape de fórmulas e reimportável. Dedup conserva assinatura atual em centavos; parser não converte perda de proveniência em dedup automático novo.

# 8. Datas civis

CivilDate do produto validada `YYYY-MM-DD`, calendário gregoriano, mínimo 1900-01-01 **já presente em validDate**, e máximo estrutural 9999-12-31 decorrente do formato de quatro dígitos; separada de `CivilMonth` `YYYY-MM`. Backup v2 e validação estrutural/migração também passam pelos mesmos validators, portanto data civil anterior a1900 não é contrato válido atual. Não é limite adotado por associação com Excel; as épocas1900/1904 são apenas regras da borda XLSX. A revisão não encontrou fixture que autorize data anterior contrariando o validator. Tipagem pequena, sem objeto Date obrigatório no domínio. Strings canônicas permitem comparação cronológica; validar antes. Adicionar dias/meses por calendário com clamp explícito, nunca por incremento de 86.400.000 ms.

| Fluxo atual | Natureza / contrato |
| --- | --- |
| Transaction.date | Data civil de caixa; não converter para UTC; limite de comando até hoje do corte |
| Account.initialBalanceDate | Data civil da abertura do saldo, início desse dia; antes dela null; movimentos desde ela inclusive |
| Goal.deadline | Data civil; futuro permitido; sem instante de vencimento inferido |
| selected/forMonth/monthKey/comparablePeriods/monthlyData | Hoje usa Date local para mês e navegação; adapter para CivilMonth, período civil explícito; manter mês anterior clamp 28/29/30/31 |
| Budgets | Valor mensal atual associado à categoria, sem competência nem versão histórica inventada |
| Manual / CSV textual | Data canônica ou formato explicitamente escolhido; rejeitar datas impossíveis/ambíguas fora desse formato |
| XLSX | Date da biblioteca hoje usa ISO; serial cru usa epoch 1899-12-30. Exigir fixtures reais 1900/1904 antes de qualquer correção; serial não é Instant |
| Backup/restore | Manter texto civil original; validação estrutural independente de clock; histórico futuro não invalida snapshot |
| format.shortDate | Hoje usa meio-dia local para evitar drift visual; futuro formatter civil sem converter o fato em timestamp |

Leitura não aplica limite «hoje». Comandos aplicam corte explícito; metas conservam regra diferente. Import segue validação determinística existente. Uma correção XLSX demonstrada por fixture é correção deliberada, não paridade falsa; limites de expansão do arquivo não entram em B1.

# 9. Instantes

`createdAt` e `exportedAt` são timestamps/instantes; não determinam data de caixa. `exportedAt` representa exportação, não criação de fatos. Validar conforme leitor atual e interpretar com offset; novos writes usam ISO UTC. Não canonicalizar timestamps históricos no restore apenas para melhorar formato.

Migrador v1 preenche `createdAt` ausente com `${date}T12:00:00.000Z`; hook também preenche ausência ao editar. São comportamentos comprovados, sem consumidor atual que necessite enum de evidência temporal. **Removidos do escopo implementável** knownCreation/knownSynthetic/unverifiedLegacy/unknown como novo tipo ou metadata transiente. Fica somente regra documental: criação nova captura instante; timestamp legado não comprova instante real de criação; ausência é desconhecida; síntese só pode ser afirmada quando houver evidência do caminho migrador. Nunca inferir síntese por horário de meio-dia ou source.

Edição de legado: classificação A, correção necessária e estreita de proveniência, explicitamente deliberada em B1c. Hoje `existing?.createdAt ?? now` e `existing?.source ?? manual` inventam metadados na edição. Proposta: distinguir create/update pelo existing já utilizado; criação mantém preenchimento atual, edição conserva valores explícitos e ausência. Não backfill, não mudar migrador v1 ou schema. CAS/assinatura/dedup não usam esses campos; backup admite ausência e restore a preserva. Testar criação, edição com/sem campos, source import/demo, revisão/conflito, signature e roundtrip. Aprovação do plano deve incluir essa correção C; não entrar como simples refatoração. Tipos formais de prova temporal ficam adiados ao consumidor P1/cloud/auditoria.

# 10. Corte/timezone

Inventário: `localDate(date = new Date())`; defaults de comparablePeriods/closingProjection/generateInsights/accountBalance/totalAccountBalance; validadores de transação/settings; TransactionForm init/max; SettingsPage abertura/deadline/max; App inicializa mês com chamadas separadas e limita navegação com novo clock; hook captura createdAt por registro; export captura exportedAt. Overview chama calculadores com defaults independentes. Date construído para navegar calendário não é captura de clock, mas exige adapter civil.

Contrato mínimo de cálculo: corte civil (`civilDate`, `period` CivilMonth), ou somente o parâmetro usado pela função (saldo recebe asOf, série recebe period). Captura na borda: Instant + timezone IANA capturada do dispositivo → CivilDate; timezone não é passada indiscriminadamente aos calculadores de caixa. BRL, timezone e cutoffInstant não viram payload obrigatório universal. Nenhuma métrica atual filtra por createdAt; não adicionar cutoffInstant sem consumidor. A borda pode manter a zona para recaptura/diagnóstico, sem tipo engine/cache. Snapshot/revisão coerentes vêm de A2b.

Todos os cálculos de uma consulta recebem o mesmo corte, com somente os parâmetros civis necessários; não recapturam agora. Defaults ficam apenas em wrappers de entrada para compatibilidade, nunca em chamadas internas compostas. Comandos recebem `today` validado da mesma captura usada no formulário/preview; revalidar contra nova data no envio exige captura única para o comando, sem renovar a revisão CAS. B1 prepara funções puras; P1 conecta a composição visual toda, incluindo indicadores e limites de navegação.

Regra preservada: mês atual comparado até dia civil do corte, anterior limitado ao último dia; histórico usa mês inteiro. Não mudar silenciosamente resumo mensal para filtro «até hoje»: fórmulas atuais distinguem período inteiro de comparação/projeção/corte do saldo. Documentar entradas e exclusões de cada métrica e preservar fixtures com registros futuros estruturalmente válidos.

Timezone afeta somente derivação de «hoje» de um instante e apresentação de instante. Não afeta transação.date, deadline, abertura nem pertença de um fato ao mês. Pessoal usa timezone do dispositivo capturada por consulta, sem nova configuração persistida. Mudança de fuso ou virada do dia gera novo contexto na próxima consulta/focus/visibilidade; não reescreve datas. P1 deve invalidar memo de composição mesmo se revisão financeira não mudar; sem timer/cache global B1.

DST: calendário civil, mês e clamp independem de duração do dia. Testar instante fixo em America/Sao_Paulo, UTC e zona com DST, incluindo salto e repetição de hora; sem depender de relógio da máquina. Mesmo snapshot + mesmo contexto produz mesmas métricas sob clocks diferentes; novo contexto pode mudar projeção/saldos/comparativo legitimamente.

# 11. Source/proveniência

Hoje: hook marca novas transações manual, import marca import, remoção de demo filtra source demo, migrador v1 usa prefixo demo- para classificar legado. Enum do backup admite apenas manual/import/demo ou ausência. Manter esses campos, IDs e comportamento de remoção.

Source ausente continua ausência, documentada como origem desconhecida. Não criar enum/tipo legacyUnknown nem adapter só para renomear undefined, pois não há consumidor atual. Manual/import/demo explícitos são alegações do registro, não prova bancária ou precisão temporal. Editar preserva source explícito, inclusive import/demo; edição de ausência não inventa manual. Não inferir demo de prefixo nas leituras atuais nem apagar registro ausente como demonstração. Futuro external permanece contrato documental, não valor novo no enum v2 nem conector.

Importação de backup não remarca todos como import; restore preserva proveniência. Transferência continua um fato de caixa com duas pernas, independentemente de source. Nenhuma nova origem dá prioridade financeira automática ao dado.

# 12. Referências externas

Contrato **somente documental**: namespace opaco qualificado pela identidade do fornecedor/conexão/conta/tipo conforme garantia real; external ID string lossless, sem Number, normalização de zeros ou case folding arbitrário. Futuro escopo B2 deve integrar identidade do workspace; não criar workspaceId agora. Numeric ID inseguro recebido já arredondado deve ser rejeitado, exigindo representação textual original; string não recupera precisão perdida.

Observação externa, movimento financeiro e vínculo de reconciliação têm identidades diferentes. N observações podem apontar para 1 movimento sem duplicar caixa e sem substituir sua origem. Vínculo registra evidência; não implica que movimento foi criado pelo provedor. Uma observação agregada pode exigir relação composta futura, a definir com consumidor, sem tabela hoje.

Identidade/idempotência verificadas diferem de fingerprint heurístico. Assinatura de CSV existente continua opção explícita de ignorar idênticos; não vira prova universal de duplicata. Exemplo contratual: manual de R$100, CSV e Open Finance concordantes representam um movimento e duas observações, nunca três receitas. IDs `000123` e `123` permanecem distintos; mesmo ID em namespaces distintos não colide. Não implementar matching automático, storage ou tipos externos sem consumidor.

# 13. Caixa x competência

Pessoal segue regime de caixa pela data civil. Receitas/despesas do período são entradas/saídas registradas, excluindo transferências. Resultado do período = receitas de caixa − despesas de caixa; não inclui saldo inicial. Saldo da conta = base conhecida + movimentos desde a abertura até corte, incluindo pernas das transferências. Total de contas indisponível se abertura de qualquer conta relevante não permite saldo no corte.

Renda prevista, fixas e metas são planejamento, não movimentos realizados. savingsRate é relação da sobra de caixa com receita registrada; não prova poupança aplicada. Não chamar esses números de lucro, DRE, competência, receita reconhecida ou patrimônio sem domínio adequado. Documentar vocabulário; não mudar layout/textos por estética nem implementar Business.

# 14. Compatibilidade backup v2

Evidência: `features/transactions/backup.ts` valida JSON finito, source, timestamps, referências, settings e transações estruturalmente; serializeBackup usa exportedAt; parser preserva snapshot original validado. `importExport.ts` também exporta JSON v2. Restore relê estado, exige safety válido e compara snapshot pós-commit. Adapters precisam cobrir os dois caminhos de export, sem dois contratos divergentes.

Contrato congelado: version 2; amount e todos os campos de settings em R$ number; datas civis e timestamps originais; IDs/source/ausência e campos JSON extras suportados preservados. Não serializar Money/BigInt/revisão operacional no v2. Nova API/formato textual de centavos será decisão de fase com consumidor, não backup v3 preventivo.

R$ v2 → validar como hoje → snapshot raw preservado → projeção c separada. c de novo comando dentro do teto → R$ validado → writer/backup legado. Não substituir snapshot raw por projeção reconvertida, inclusive quando reader aceita ruído IEEE pela tolerância vigente. Roundtrip significa equivalência do conteúdo JSON suportado, não bytes de espaçamento/ordem de chaves. Snapshot de segurança precisa comparar o mesmo estado bruto/revisão; não calcular signature a partir de formato de gráfico.

Teste restaura/exporta IDs, referências, source/createdAt opcionais, extras, settings e números originais. Total derivado em overflow não bloqueia export de dados estruturalmente válidos. Invalidar dado bruto continua disparando recovery, sem defaults novos.

# 15. Compatibilidade A1/A2a/A2b/A2c

| Contrato | Invariante B1 / regressão obrigatória |
| --- | --- |
| A1 restore | Preview estrutural, safety download, atomicidade transações/settings, verificação pós-commit e ausência de segunda escrita corretiva |
| A2a recovery | Erro de leitura mostra recuperação; não fabricar defaults/saldos; futuro estrutural válido continua legível; overflow derivado não se confunde com corrupção |
| A2b CAS | Seis writers recebem revisão esperada; comparação, validação, alteração e incremento na mesma RW; create não sobrescreve, update não ressuscita; erros não consomem revisão |
| A2b migração | DB v3 e metadata reservada inalteradas; v1/v2 compatíveis; VersionError, blocked e upgrade tardio sem alteração; nada de migrations B1 |
| A2c dirty/PWA | Draft mantém inputs reais inclusive inválidos/NaN; Money só entra na validação; conflitos não renovam token; navegação/reload/update continuam protegidos |
| Imports / transferências | Lote atômico, preview/manual/dedup existentes; destino válido e distinto; total conservado quando ambos saldos disponíveis |

UI mínima de erro aritmético pode ser necessária para não derrubar página; consumir mecanismos existentes, sem redesenho. Compatibilidade inclui caminhos de falha, não só sucesso.

# 16. Findings

| Finding | Estado real / responsabilidade B1 | Aceite e limite |
| --- | --- | --- |
| H06 | Aberto: soma/produtos não checked | Fechar operações monetárias atuais com limite/erro/oracle; não prometer agregados de magnitude ilimitada |
| H07 | Enum atual não representa observações múltiplas | Reduzir por contrato claro e preservar desconhecido; implementação de reconciliação/conectores fica futura, finding não totalmente encerrado |
| H08 | Clocks independentes; não há engine/cache universal no app | Definir e testar corte explícito; P1 ainda integra composição/invalidations e futuro cache depende de inputs/revisões completos |
| H03 | Leitura estrutural já separada de hoje em A1/A2 | Preservar; residual é clock de comando explícito e civil/Instant, não refazer recovery |
| M06 | Limites 5MB/linhas não limitam toda expansão; epoch serial cru fixo | Fixtures 1900/1904 e política civil; corrigir apenas bug reproduzido dentro desse recorte. Robustez de descompressão segue P1, não fechar finding integralmente |
| L01 | Vocabulário pode sugerir competência/patrimônio | Glossário de caixa e nomes de contrato; Business permanece fora |

Findings cloud, acesso, logout, sync, liquidação Business, IA e orçamento histórico continuam nas suas fases. Planejamento não resolve findings por si; tabela descreve objetivo verificável da implementação futura.

# 17. Golden cases

Congelar antes de refatorar, com oracle/fixtures independentes. P = paridade, R = representação, C = correção deliberada, N = novo limite explícito.

| Caso | Resultado esperado | Classe |
| --- | --- | --- |
| Receita100, gastos0,10+0,20, transferência1000 | income100; expenses0,30; balance99,70; savingsRate99,7; transferência fora do resumo | P/R; fixture atual calculations.test |
| percentageChange(-50,-100), anterior0 | 50%; com base zero null | P |
| Conta A abertura5000, B2000, receita2000 A, gasto500 A, transferência1000 A→B | A5500; B3000; total8500; transferência não muda total | P/R; fixture explícita planejada |
| Conta antes da abertura; abertura no corte | null antes; no dia base mais movimentos daquele dia; total incompleto null | P |
| Gastos19,90/29,90/0,30 em três meses | Média16,70; média0,10/0,20/0,20 =0,17 | P/R; fixture atual |
| Setembro, corte dia15, três gastos200 até corte | Despesa600; projeção1200; sem três datas/day7 null | P/R |
| Budget100, gasto79,99/80/100 | Sem alerta / atenção / excedido; budget0 desliga | P |
| Histórico categoria250 e250, atual300/300,01 | Anomalia não/sim, mínimo R$50 preservado | P |
| Receita anterior334,40, atual284,24/284,25 | Queda não deve trocar limiar por percentual arredondado; alerta sim/não | P; fixture atual |
| Média/projeção meio centavo; signed ±1,5/±0,5 c | Math.round: 2/-1/1/-0; kernel normaliza -0 a0 (sem efeito financeiro), empate para +∞; conferir toFixed/Intl separadamente | P/R; normalização zero documentada |
| MAX_SAFE_INTEGER dividido por3 | Legado arredonda para3.002.399.751.580.331; racional exato é3.002.399.751.580.330 c | C; não prometer paridade IEEE extrema |
| Meta/fixa R$1e-8 positiva aceita pelo legado | Raw continua aceito/preservado; cálculo que exija minor positivo indisponível, não divisão por0 nem rewrite | C; regressão compatibilidade |
| Soma MAX_SAFE c +1; produto seguro no resultado mas intermediário grande | Erro na soma; mul/div exato quando resultado cabe; nada de Infinity/zero/silêncio | N |
| Março31 vs fevereiro2026/2024; janeiro vs dezembro | Comparativo limita 28/29; ano atravessado sem drift | P/R |
| Mesmo snapshot/contexto sob relógios/fusos diferentes | Métricas idênticas; corte novo pode mudar cálculo legitimamente | N |
| CivilDate2024-02-29 e2026-02-29 | Válida / inválida; restore com civil futuro válido continua legível | P/R |
| Legado sem createdAt/source editado | Continuam ausentes; não usar data da edição como criação | C, mudança deliberada isolada |
| Timestamp legado de meio-dia | Não prova sintético; origem temporal não verificada | N |
| Manual/import/demo, restore de cada | Source explícito preservado; ausência permanece unknown; remover demo não remove unknown | P/N |
| IDs externos000123/123 e9007199254740993 string | Identidades textuais distintas; nenhum Number intermediário | N contratual |
| CSV pt-BR e ponto explícito; XLSX Date/serial1900/1904 | Preservar valores/import; data esperada pela fixture real, não oracle copiado de epoch fixo | P; eventual C documentada |
| Backup v2 com extras e ruído numérico válido | Mesmo conteúdo financeiro/IDs/metadados e valores brutos após roundtrip/restore | P |

# 18. Testes planejados

| Grupo | Casos / evidência a acrescentar durante implementação |
| --- | --- |
| Kernel/parser/adapters | Toda tabela de parsing; limites/sinais/zero; checkedAdd/subtract/multiply; operandos inválidos; produto inseguro com quociente seguro; signed tie; teste independente BigInt; agregado não faz roundtrip R$ |
| Calculadores | Goldens existentes; todos acumuladores e diferenças; budgets/goals/planned/fixas; limite exato ±1c; transferência/abertura; projeções/clamp; null vs zero vs overflow; preservar prioridade/ordem/textos financeiros |
| Civil/Instant/corte | Viradas mês/ano, leap day, datas impossíveis; clock fixo duas zonas; DST spring/fall; mesma consulta um corte; data base/deadline/futuros; não usar createdAt como data de caixa |
| Proveniência | Criação manual/import mantém instante/source atuais; edição preserva explícito/ausente; síntese legada só como regra documental com evidência; demo removida seletivamente; contratos externos testados quando houver função real consumidora, sem módulo vazio |
| Backup/recovery/CAS | backup.test/adversarial; tests restore*, recovery, local-read, repository, a2b-concurrency/migration/conflict-ui; raw roundtrip; rollback; sem consumo de revisão em erro; nenhum writer novo fora CAS |
| Inputs/import/browser/PWA | importExport.test, dashboard.spec, a2c-unsaved.spec, pwa.spec; CSV/XLSX reais nas duas convenções; correção manual; draft inválido preservado; falha checked não perde draft nem dados |

Execução futura disponível: `npm.cmd test`; `npm.cmd run build` (inclui `tsc -b` e Vite); `npm.cmd run test:e2e` depois do build, em origem/contextos isolados e porta livre; `git diff --check`. Não usar perfil pessoal. Scripts lint/typecheck separados não existem; não inventá-los. Prettier existe via `format`, mas escreve amplamente: não executar esse script para validar B1 sem limitar arquivos; eventual `prettier --check` nos arquivos realmente alterados usa ferramenta já instalada.

Não executar instalação ou essas suítes nesta fase documental. Contagens de A2 são somente baseline histórico; registrar novos resultados reais em implementação futura. Testes de erro/arredondamento não podem espelhar apenas a mesma fórmula refatorada.

# 19. Divisão de implementação

**Três commits futuros**, não criados agora. Separar representação, integração e contratos de calendário/origem; reduzir para um só perderia capacidade de revisar paridade. Datas/origem cabem juntos porque delimitam fato civil versus evidência de criação e os mesmos writers.

| Proposta | Escopo / arquivos prováveis | Contratos / testes | Dependências, riscos e rollback |
| --- | --- | --- | --- |
| B1a — kernel Money e adapters | Novo módulo pequeno em `src/utils` ou feature compartilhada + testes colocados junto; validation.ts, tipos mínimos; parsing e assinatura sem mudar DTO persistido | Construtor branded, checked ops, rational mul/div, legacy adapters; parseAmount conserva assinatura R$ e chama kernel; signature/validators têm wrappers compatíveis; módulo já consumido e compilável sozinho, sem aritmética nova na UI; parsing/limites/tolerância/goldens validation | Aprovação deste plano + baseline. Risco separadores/tolerância; revert do código, sem DB migration; não migrar calculations pela metade com unidades implícitas |
| B1b — integrar operações atuais e provar paridade | calculations.ts/test; SettingsPage derivados; format.ts e consumidores de valores no dashboard/transações apenas onde unidade/erro exige; importExport/backup tests e fronteiras necessárias | Todas somas/produtos checked, percentuais decisórios exatos, textos c, conversão gráfico só visual e catches de erros derivados nos consumidores existentes; golden e regressão A1/A2 | Depende B1a. Risco mudança números/erro derrubar rota; smoke browser obrigatório. Revert código preserva dados R$; não restaurar snapshot antigo |
| B1c — calendário/corte e política de origem | Módulo civil/contexto mínimo, calculations/validation/adapters; useTransactions apenas criação/edição de metadados; importExport datas somente se fixture provar bug; testes; documentação de contrato | CivilDate/Month/Instant, parâmetros explícitos, regras documentais de criação/legado; preservação ausência/source; glossário e contrato externo documental | Depende B1a/b; UI composição completa P1. Risco fusos/sintéticos indistinguíveis; testes clock/DST/import/restore. Revert código sem schema; ausência preservada é v2 válido |

Não adicionar documento/arquivo de implementação hoje além de PLANO-B1.md. Nomes de módulos e lista exata de arquivos futuros dependem da revisão do diff de cada commit; não é licença para reorganização geral. Se um commit crescer por bug XLSX não reproduzido ou demanda de metadata durável, retirar esse trabalho para decisão específica, mantendo os três blocos mínimos.

# 20. Critério de entrada

Plano aprovado explicitamente; definir nova execução de implementação; base oficial e worktree próprio confirmados, principal preservado; dependências/ambiente isolado preparados somente nessa execução; baseline real das suítes disponível; fixtures congeladas com expectativas e classificação P/R/C/N; confirmar tolerância legada, teto e rounding; consumidor de erro aritmético delimitado.

Documentos históricos ausentes no commit são lacuna de rastreabilidade, não motivo para copiar o principal. Roadmap versionado e este plano registram decisões necessárias; se aprovação exigir versionar fontes históricas, tratar em ação documental separada. Não implementar B2 para desbloquear B1.

# 21. Critério de saída

Implementação futura somente aprovada quando todos caminhos do inventário usam unidade explícita e operações checked; nenhuma decisão financeira depende de floats formatados; goldens válidos preservados; diferenças deliberadas reproduzidas e documentadas; CivilDate separado de Instant, clocks internos explícitos; proveniência ausente não inventada; backup JSON v2 e DB v3 unchanged; seis writers CAS intactos; suítes/build/checks e smoke reais passam em contexto isolado.

H06 encerrado para operações atuais; H07 reduzido pelo contrato e política, sem alegar conector entregue; H08 contrato testado com integração visual P1 declaradamente restante; H03 preservado; residual M06 e futuro Business/cloud registrados. Nenhuma estrutura sem consumidor ou alteração visual preexistente incluída. Implementação B1 só pode ser concluída com relatório e evidência próprios, não com este planejamento.

# 22. Riscos

Misturar R$ e c apesar de tipos; reconverter agregado seguro em R$ e perder centavo; tolerância Number distinta entre settings/transação; overflow de prefixo e produtos percentuais; prioridade de insight alterada por razão/rounding; erro derivado confundido com corrupção; draft convertido em zero ou dirty token renovado; restore normalizando números/extras; época XLSX1904 interpretada com1900; timezone implícita em Date; memo visual após meia-noite; timestamp sintético sem evidência; enum nova quebrando backup; escopo B1 ampliado para B2/P1/Business.

Mitigação: adapters nomeados, oracle exato, goldens, runtime checked, captura única, fixture Excel real, preservação raw e regressão de falhas. Limitação explícita: não recuperar proveniência perdida; não garantir expansão segura de todo XLSX; não afirmar conclusão de H08 na UI antes de P1. Nenhuma escrita em banco ou serviço remoto é necessária.

# 23. Decisões congeladas após aprovação

**Propostas, ainda dependentes de aprovação do plano:**

1. Estratégia B: domínio BRL em c safe integer, persistência atual em R$ Number; DB v3 e JSON v2 preservados.
2. Kernel pequeno, checked add/multiply e intermediário BigInt local somente para racional exato; sem BigInt global, dependência nova ou Money ilimitado.
3. Teto/sinal/zero/tolerância vigentes por campo, checked em agregados, erro explícito; política de rounding e separadores preservados; diferenças por correção IEEE extrema e impossibilidade de projetar subcentavo são C identificadas, não paridade falsa.
4. Snapshot raw de restore/backup não normalizado; adapters de domínio separados; nenhum writer pode gravar projeção monetária por engano.
5. CivilDate/Month separados de Instant; captura Instant/timezone na borda, cálculos só recebem corte civil necessário; leitura estrutural não depende do relógio; B1 fecha contrato e P1 composição única (H08 não totalmente resolvido em B1).
6. Origem explícita preservada, ausência unknown sem backfill; edição não cria proveniência histórica; createdAt legado sem prova continua não verificado.
7. Referência externa textual opaca e observação/vínculo/movimento distintos, somente contrato até consumidor; N→1 permitido sem duplicar caixa.
8. Pessoal continua caixa; nenhuma competência, workspace, migration, front, Supabase ou infraestrutura futura nesta fase.
9. Três commits futuros coerentes; goldens e regressões são gates; mudanças deliberadas não se disfarçam de refatoração.

Esta entrega é apenas planejamento. Worktree e branch existem; PLANO-B1.md fica sem commit. A implementação requer nova autorização explícita.

# 24. Revisão adversarial pré-implementação

04/10/2026. **PLANO APROVADO COM AJUSTES** como plano revisado; não é autorização para codificar. Revisão somente no worktree plan/b1-money-dates-origin, base c7fc72c. Código/testes prevalecem sobre roadmap, plano e histórico. Nenhum achado crítico.

| ID | Severidade | Achado / evidência | Decisão e alteração |
| --- | --- | --- | --- |
| R01 | ALTO | Política Math.round é preservável, mas IEEE pode divergir do racional exato mesmo com numerador safe; MAX_SAFE/3 demonstra diferença1c | Separar política de rounding de precisão; golden C explícito e quociente/resto exatos no helper |
| R02 | ALTO | Settings positivo não significa ≥1c: R$1e-8 passa monetary e >0, converte a0c; adapter positivo pode rejeitar raw válido | Tabela por campo e ressalva subcentavo; manter raw/read/write/restore; indisponibilidade derivada C sem backfill nem validator novo |
| R03 | ALTO | Checks passarão a lançar; Overview hoje calcula no useMemo sem catch. “Dados acessíveis” sem caminho seria promessa incompleta | Exceção monetária específica e catches mínimos em Overview/Transactions/Settings em B1b; null não significa overflow; sem Result framework |
| R04 | MÉDIO | Objeto Money+currency e enums knownCreation/knownSynthetic/unverifiedLegacy/unknown, legacyUnknown sem consumidor real | Simplificar para branded MinorUnits BRL com runtime; remover tipos/flags de evidência e source desconhecido; manter regras documentais |
| R05 | MÉDIO | Timezone em todo calculador aumenta acoplamento; fórmulas só usam data/período civis | Captura Instant+zona na borda; funções recebem civilDate/period ou somente parâmetro usado. B1 contrato, P1 composição |
| R06 | BAIXO | Preservar ausência na edição altera hook real; precisa aceite explícito, não embutido como representação | Classificar A: correção de proveniência C estreita em B1c; novos creates iguais; CAS/signature/dedup/backup sem mudança de contrato |

Money representation: SIMPLIFICAR. Brand distingue c de R$ em assinaturas, mas operações nativas perdem brand; funções checked/construtor e proibição de casts espalhados são necessários. Currency como invariável BRL basta; multimoeda não existe.

BigInt local: JUSTIFICADO APENAS para divisão/mul-div arredondada exata e comparação racional com produtos inseguros. Casos calculados com Node e oracle BigInt, sem editar código/testes ou instalar dependências:

| Operação | Operandos c / fatores | Resultado/evidência |
| --- | --- | --- |
| Teto individual | 999.999.999 ×100 | 99.999.999.900 c; confirmado |
| Projeção | 300.000.000.000.001 ×31 /31 | Intermediário9.300.000.000.000.031 > MAX; resultado300.000.000.000.001 seguro; possível em3001 linhas válidas, ≥3 datas |
| Anomalia >20% | atual8.400.000.000.000.003 ×100 vs média7.000.000.000.000.002 ×120 | Exato840.000.000.000.000.300 >840.000.000.000.000.240; Number compara como igual (sem alerta, apesar da diferença também superar5000c) |
| Queda15% (<=) | atual5.950.000.000.000.001 ×100 vs anterior7.000.000.000.000.001 ×85 | Exato595.000.000.000.000.100 >595.000.000.000.000.085: não atende; Number igual atende indevidamente; diferença absoluta >5000c |
| Projeção >15% | projeção8.050.000.000.000.003 ×100 vs histórico7.000.000.000.000.002 ×115 | Exato805.000.000.000.000.300 >805.000.000.000.000.230; Number igual; demais gates devem ser satisfeitos na fixture |
| Budget80/100% | budget≤99.999.999.900; produtos80/100 desse teto são seguros | Não alegar necessidade BigInt nessa borda; comparação100% é amount>=budget. Overflow genérico de100×aggregate é evitável por comparação racional adequada |
| Média | MAX_SAFE=9.007.199.254.740.991 /3 | Quociente3.002.399.751.580.330 resto1; Number arredonda errado para...331 |

MAX_SAFE/3 é exemplo do kernel; na integração, não usar como fixture “paridade atual” de movingAverage sem considerar conversões R$ intermediárias já existentes. Resultados de correção extrema devem ser comparados ao oracle e o comportamento antigo registrado separadamente. Checked Number com erro seria seguro mas rejeitaria projeção válida; local BigInt mantém precisão sem novo DTO. Não é necessário em toda soma/comparação/percentual visual.

CivilDate1900: MANTIDO, evidência validation.ts validDate>=1900; backup.ts valida estrutural com mesmos validators, migration usa validateLocalSnapshot→validateBackupSnapshot, restore usa validação v2. Formato quatro dígitos limita9999. Nenhuma nova rejeição civil foi introduzida; Excel1900/1904 não define esse mínimo do produto.

Rounding: Math.round(1.5)=2, (-1.5)=-1, (0.5)=1, (-0.5)=-0. Movimento persistido é positivo; saldo inicial persistido pode ser negativo, além dos resultados. Médias/projeções usam Math.round; inputs/signatures também, mas CSV/descrições usam toFixed e texto monetário Intl. Não prometer que uma política racional substitui todos esses formatadores indistintamente. Zero negativo normalizado no kernel, raw preservado. Tolerância medida em c foi confirmada, não corrigida de unidade: apenas explicitada a fórmula e equivalência em R$.

CreatedAt/source: regras documentais suficientes; nenhum consumidor B1 exige enum de evidência. Ausência significa desconhecido; enum persistido continua manual/import/demo. Edição de ausência é correção de proveniência proposta e explícita, sem backfill: CAS não usa metadados, signature os exclui, reader/restore aceitam ausência (backup.test), remoção demo continua source===demo. Nenhum tipo external persistido.

H08: B1 fecha contrato dos calculadores; P1 fecha Overview/captura única/invalidations de clock. Ainda não totalmente resolvido. Capturar timezone só na borda basta para fórmulas civis; não esconder dependência de captura nem alterar o calendário de fatos existentes.

XLSX/M06: workbook é carregado antes dos limites; Date é transformada pela biblioteca/leitor e serial cru assume1899-12-30. Inspeção não reproduziu bug real1904 com fixture nesta execução. Manter testes de calendário/import existentes; investigação/fixtures específicas1900/1904 podem demonstrar necessidade futura, mas ausência de reprodução não bloqueia B1 nem autoriza correção de epoch. Hardening/descompressão e bug não demonstrado seguem P1/import. Não há dependências instaladas para criar ensaio agora.

Backup v2: confirmado raw original retornado pelo validator; nada de normalização na leitura, nova versão, BigInt/Money no JSON, schema ou migration. Exports/restores preservados. Histórico ausente: impacto somente rastreabilidade, **não bloqueia B1**; não copiado nem consultado novamente fora do worktree nesta revisão.

Divisão: manter3 commits. B1a compila e é útil com wrappers parseAmount/signature mantendo R$ nas APIs existentes; não exportar API experimental ou módulo sem consumidor. B1b usa kernel estabilizado e integra catches/paridade. B1c calendário e a pequena correção de edição compartilham delimitação civil/instante/writers, com testes de origem isolados; sem enums/tipos futuros o bloco permanece delimitado. Dois commits misturariam núcleo e revisão de paridade; quatro separariam uma política de edição pequena sem ganho suficiente agora. Reavaliar se diff futuro contrariar esse tamanho.

Riscos aceitos: perda prévia de evidência temporal irrecuperável; centavos seguros têm teto; prefixo de soma acima dele gera erro mesmo se cancelamento posterior permitir resultado; raw subcentavo válido pode não projetar Money útil (correção C com dados intactos); erro IEEE extremo não é resultado válido a preservar; composição H08 e M06 completo seguem P1; documentação histórica não versionada. Nenhum desses riscos autoriza mudar schema ou financiar fase futura.

Removidos/simplificados explicitamente: objeto currency por valor; enums/tipos de evidência temporal; legacyUnknown formal; timezone/cutoffInstant obrigatórios em calculador; tratamento genérico Result/Either; gate de corrigir XLSX sem fixture. Mantidos: três commits, mínimo civil1900 comprovado, JSON v2 raw, DB v3, correção de edição proposta com aceite explícito. Validação da revisão: inspeção de código/testes, cálculos Node/oracle, hashes dos arquivos deste worktree e git diff/check; suítes do projeto não executadas.

Bloqueadores: nenhum técnico novo para aprovar o plano ajustado. Implementação futura exige autorização explícita, aceitando correções C descritas, e baseline de testes conforme seção20. Esta revisão não inicia B1/B2 nem cria commit.
