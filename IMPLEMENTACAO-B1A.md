# Implementação B1a — Money kernel e adapters

04/10/2026. Worktree `Dashboard-Financeiro-B1`, branch `plan/b1-money-dates-origin`, base `67e5d9d85cd8e6187cacb0bba02bf3af7b042da1`. Escopo autorizado: somente B1a conforme `PLANO-B1.md`, incluindo revisão adversarial seção 24. B1b/B1c/B2 e front não foram iniciados.

## Resultado e arquivos

Kernel BRL pequeno, nominal e validado em runtime, consumido pelo parser, validação monetária e assinatura existentes. Não há objeto currency por valor, biblioteca adicionada, mudança de DTO ou migração.

| Arquivo                                        | Mudança                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| `src/utils/money.ts`                           | MinorUnits, erros, adapters, parser lexical, checked e helpers racionais |
| `src/utils/money.test.ts`                      | 70 testes do kernel/adapters/nominal type/overflow/racionais             |
| `src/features/transactions/validation.ts`      | Wrappers compatíveis, precisão centralizada e assinatura em centavos     |
| `src/features/transactions/validation.test.ts` | 24 goldens de paridade, políticas e backup raw subcentavo                |
| `IMPLEMENTACAO-B1A.md`                         | Evidência, contratos, verificações e residuais desta entrega             |

`calculations.ts`, UI, settings derivados, importExport, backup, repository, source, clocks, calendário, package.json/lock, README e roadmap permanecem sem alterações. Capturas de dashboard geradas automaticamente pelos E2E são repostas aos bytes da base neste worktree para não incluir trabalho visual no commit. Não foi realizada nenhuma operação de escrita no worktree principal.

## Baseline real e ambiente

Antes de editar código: root/branch/HEAD corretos, worktree limpo, plano versionado e nenhum kernel B1a existente. A primeira tentativa de unit/build não pôde iniciar por ausência de node_modules (`vitest`/`tsc` não encontrados). Foi executado `npm.cmd ci --no-audit --no-fund` somente no worktree isolado, usando o lockfile existente, sem alterar manifestos nem adicionar bibliotecas. Depois disso o baseline real passou:

| Verificação                             | Antes                         | Depois                          |
| --------------------------------------- | ----------------------------- | ------------------------------- |
| `npm.cmd test`                          | 246/246, 6 arquivos           | 340/340, 8 arquivos; +94 testes |
| `npm.cmd run build`                     | PASS, TypeScript + Vite + PWA | PASS, TypeScript + Vite + PWA   |
| `npm.cmd run test:e2e`                  | 227/227                       | 227/227                         |
| Prettier --check nos arquivos alterados | Não aplicável antes da edição | PASS                            |
| `git diff --check` e staged --check     | Base limpa                    | PASS                            |

E2E: Edge headless, dois workers, contextos isolados, preview `http://127.0.0.1:5191`; nenhum perfil pessoal acessado. Build mantém o aviso preexistente de chunk ExcelJS acima de 500 kB. Scripts dedicados lint/typecheck não existem; build contém `tsc -b`, e também passou `tsc --noEmit`. Não executar `npm run format`, que escreveria fora dos arquivos B1a.

## MinorUnits e operações

`MinorUnits` é number com brand único privado; somente construtor validado efetua cast no código de produção. `minorUnits` exige inteiro seguro, permite sinais e normaliza -0 para zero. Regras por campo ficam no consumidor. Brand impede atribuir number diretamente nas assinaturas, mas operador nativo perde brand; testes de compilação `@ts-expect-error` verificam essa limitação. Runtime também rejeita brand forjado.

`checkedAdd` verifica operandos e fronteira antes da soma; `checkedSubtract` usa negação validada; `checkedMultiply` valida fator inteiro adimensional e fronteira antes do produto. Multiply tem consumidor imediato: montagem lexical por dígitos ×10. Não saturar ou substituir overflow por zero. Erros detectáveis `MoneyError`: invalid, overflow, precision, subcentavo e division.

Representabilidade vai até ±9.007.199.254.740.991 c; limite de campo não é teto de agregado. Overflow da composição financeira e apresentação pertencem à integração B1b: nenhum novo throw foi instalado no dashboard nesta entrega.

## Adapters e tolerância

`fromLegacyReais` valida Number finito, candidato inteiro seguro e tolerância vigente; devolve c sem alterar entrada. Rejeita subcentavo não zero que colapsaria para zero. `hasLegacyPrecision` verifica o contrato **bruto** tolerante, sem projetar nem normalizar settings, para preservar leitura/escrita e backup existentes.

Unidade confirmada no código anterior: Δ = abs(n×100 − Math.round(n×100)), medida em centavos. Transação aceita Δ≤0,00001 c; settings exige Δ<0,00001 c. Isso equivale a R$0,0000001, não R$0,00001. O teste usa n=0,00001/100 para verificar a fronteira exata das duas políticas sem inferir o resultado por texto decimal arredondado.

`toLegacyReais` divide por100 somente na borda e verifica que o roundtrip recupera o mesmo centavo. Rejeita Number seguro em c cuja representação em R$ perderia unidade. Políticas de sinal/zero/teto continuam em validation.ts, antes do writer; helper não impõe teto de campo a agregados nem regrava snapshot.

| Campo                             | Política atual preservada em R$                                |
| --------------------------------- | -------------------------------------------------------------- |
| Movimento income/expense/transfer | 0,01 a999.999.999; magnitude positiva; tolerância inclusiva    |
| Saldo inicial                     | -999.999.999 a999.999.999, zero permitido                      |
| Budget                            | Ausente ou0 a999.999.999; zero desativa                        |
| Renda prevista / limite de saldo  | 0 a999.999.999                                                 |
| Fixa / target de meta             | >0 até999.999.999; tolerância settings pode admitir subcentavo |
| Current de meta                   | 0 a999.999.999; pode superar target                            |

R$999.999.999,00 =99.999.999.900 c. Testes provam raw R$1e-8 em target/fixa preservado por validateSettings e backup v2 roundtrip, enquanto fromLegacyReais rejeita sua projeção para0. A UI derivada de settings ainda não foi migrada, conforme escopo B1a.

## Parser e assinatura

`parseMinorUnits` recebe decimal vírgula/ponto explícito, preserva regex de agrupamento e remoção de R$/espaços, e monta c por dígitos com checked operações. Sem parseFloat nem arredondamento de decimal textual. Sinal permitido no kernel; política do movimento continua positiva. Terceira casa, agrupamento incorreto, NaN/Infinity/vazio e overflow são erros.

`parseAmount` permanece wrapper em R$ number: usa parser lexical e adapter inverso, mantém NaN como erro de parsing e -0 na fronteira legada. Manual/CSV passam pelo mesmo contrato atual; XLSX numérico permanece no validador Number. `transactionSignature` conserva os campos/ordem e usa adapter c; goldens com ruído IEEE e transferência têm assinatura idêntica à anterior. Não criar identidade universal nem dedup novo.

## BigInt local e diferenças deliberadas

BigInt aparece apenas dentro de `multiplyDivideRounded` e no fallback de `compareScaled` quando produto Number não é seguro. Não existe em DTO, estado React, IndexedDB, backup, JSON ou tipo público de valor financeiro.

Esses helpers têm consumidores concretos previstos em B1b: média/projeção e limiares de anomalia/queda/projeção existentes. São implementados sem migrar esses consumidores. Divisão usa quociente/resto exatos com nearest/ties toward +infinity, inclusive resultados negativos. Resultado deve continuar safe Number; comparação retorna -1/0/1. Não criar engine de ratios.

| Caso                                                       | Evidência / classificação                                                                                                                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ±0,5 e±1,5 c                                               | Política equivalente a Math.round: 1/0/2/-1; -0 canônico vira0 somente no domínio                                                                                 |
| 300.000.000.000.001 c ×31 /31                              | Produto inseguro, resultado seguro/exato; aceita no helper racional                                                                                               |
| MAX_SAFE/3                                                 | Legado Math.round retorna3.002.399.751.580.331; racional retorna...330, resto1. **CORREÇÃO EXPLÍCITA** aprovada no plano; calculadores atuais não foram alterados |
| Produtos100/120/85/115 inseguros                           | Comparador exato mantém desigualdade que Number apagava; testes oracle independentes                                                                              |
| Subcentavo bruto válido                                    | Continua raw; projeção Money produz erro detectável, nunca grava0                                                                                                 |
| Parsing/assinatura inválidos fora do domínio representável | Agora rejeitam perda/overflow em vez de fabricar centavos aproximados; parseAmount devolve NaN. Inputs válidos no teto dos campos mantêm paridade                 |

Nenhum golden existente foi alterado para acomodar resultado novo. Correção racional fica no helper novo; B1b precisará integrar e distinguir correção matemática de paridade. Não mudar source/createdAt de legado agora.

## Testes primeiro e regressão

Antes do kernel: os 24 goldens da fronteira legada passaram; suíte money falhou por módulo ainda ausente (fase vermelha esperada). Depois: 70 kernel e24 validation passaram; suíte dirigida kernel/validation/import/backup/adversarial:239/239. Full suite340/340 e E2E227/227.

Cobertura nova: lexical pt-BR/ponto/sinais/zero/agrupamento/terceira casa/MAX_SAFE; adapters finite/ruído/subcentavo/roundtrip; limite separado de política; overflow ±1 e subtração; multiply/fator inválido; brand TypeScript e runtime; signed tie; caso IEEE extremo; projeção exata; percentuais e oracle inteiro independente; signatures; políticas e backup raw.

A suíte E2E completa inclui restore/safety/adversariais/rollback/verificação (A1), recovery/leitura estrutural (A2a), seis writers/concorrência/fence/conflito (A2b), dirty/navigation/reload e14 PWA (A2c), import CSV e XLSX reais. Não é certificação de Safari/mobile físico.

| Invariante         | Resultado                                                      |
| ------------------ | -------------------------------------------------------------- |
| A1 restore         | PASS / preservado                                              |
| A2a recovery       | PASS / preservado                                              |
| A2b CAS            | PASS / preservado; repository intacto                          |
| A2c dirty/PWA      | PASS / preservado                                              |
| Backup             | JSON v2 raw preservado                                         |
| IndexedDB / schema | v3 inalterado; nenhuma migration/reset/escrita na base pessoal |

## Riscos e conclusão de escopo

Brand não impede toda aritmética nativa: usar checked e revisar casts. Conversão R$ não pode ser intermediário de cálculo. Subcentavos legados precisam de tratamento derivado ao integrar B1b, sem tornar snapshot inválido. Racionais exatos podem corrigir resultados extremos anteriormente imprecisos; documentar cada integração. H06 não está totalmente fechado porque cálculos agregados ainda são os atuais. H07/H08 e calendário/proveniência permanecem para seus blocos aprovados.

Diff revisado integralmente e staging seletivo limitado aos cinco arquivos acima. Nenhuma alteração visual, calendário/timezone/source, workspace, cloud, backup v3, schema ou DB bump incluída. B1a termina com um commit `feat: adiciona kernel monetario seguro B1a`; B1b/B1c/B2 não começaram. Não há bloqueador conhecido após as validações registradas.
