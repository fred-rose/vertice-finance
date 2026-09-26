# Evidências A2a — inspeção e reproduções

23/09/2026. Somente análise. HEAD: `971f195f961ab155c7da5d7869c54f668803bb8b`.
Nenhuma edição de produção/testes, commit ou implementação A2a. Dados sintéticos em contextos efêmeros separados de Edge; nenhum perfil financeiro pessoal foi aberto.

## Método e limites

Node v24.15.0, Edge headless 153.0.4234.48, IndexedDB nativo. Um comando Node via stdin empacotou os módulos reais com esbuild `write:false`, em memória. O entrypoint importou o harness existente, os validadores e App/React; não foi salvo script nem arquivo de teste. Servidor HTTP em memória, restrito a 127.0.0.1 e porta efêmera, forneceu uma página vazia. O bundle foi injetado nessa origem. Servidor e navegador foram encerrados em finally.

UI funcional montada com o App atual, JSX automático, CSS omitido e PWA desabilitada por defines. Foram observados DOM, alertas, botões e handlers reais. Isso não certifica aparência, responsividade, SW ou build de produção. Não foram usados screenshots, dist novo, fixture financeira real nem alterações no schema da aplicação. A criação de bases v1/v2 abaixo é preparação isolada das reproduções, não migração implementada no produto.

Os 221 unitários e 104 E2E aprovados de A1 são antecedentes documentados, não contagens desta execução. Esta execução concluiu **25 cenários de estado, 9 combinações de relógio/fuso e observações de UI em 5 estados**, mais controles de save/import e roundtrip A1. Não são novos testes adicionados à suíte.

## Procedimento reproduzível

1. Empacotar em memória `tests/helpers/repositoryHarness.ts`, `validation.ts` e uma função que monte `src/App.tsx`, sem mudar esses módulos.
2. Criar um contexto Edge novo para cada caso; fixar 15/09/2026 15:00 UTC e America/Sao_Paulo.
3. A-new: não abrir/precriar o banco antes de chamar o repository. Demais casos: criar explicitamente a base sintética com as stores indicadas.
4. Usar `backupFixture()`: abertura 5.000/2.000, receita 2.000, despesa 500, transferência 1.000; total íntegro 8.500 em 15/09/2026. B usa settings dessa fixture sem transações.
5. Alterar somente os campos indicados na tabela antes da leitura. Executar `load()` e `readForBackup()` reais; capturar sucesso/erro, contagens, aberturas, metas, limite e `totalAccountBalance(..., "2026-09-15")`.
6. Ler valores/chaves via API nativa antes/depois. A comparação JSON confirma preservação dos valores JSON nesses casos; não é prova geral de identidade de tipos não JSON. O caso Infinity também foi observado rejeitado pelo leitor estrito; não inferir preservação universal de NaN/Infinity a partir de stringify.
7. No caso C, depois da observação inicial, chamar save de uma despesa de 85 e import de outra despesa de 85: ambos aceitos, chave personal ainda ausente. Montar a UI após essas duas gravações sintéticas.
8. Montar App para A-new, C, D, F e J, observar overview, navegar por hash para Configurações e contar controles. Em C, selecionar backupFixture válido e tentar gerar o safety backup.
9. No caso B, restaurar backupFixture usando o safety snapshot real e comparar o load posterior: equivalência verdadeira.
10. Para relógio/fuso, restaurar fixture com transação em 2099-12-31, abertura em 2099-01-01 e meta em 2099-12-31; manter o mesmo banco durante as três mudanças de relógio de cada contexto. Comparar load/readForBackup com o alvo e executar validadores de comando separadamente.

## Matriz observada

“Estrito” significa readForBackup. “Igual” compara o estado bruto antes/depois das duas leituras, antes dos controles adicionais de escrita. Mudanças em A-new e v1 são o bootstrap/migrador já existente.

| Caso | load | Estrito | Total no corte | Chaves settings após leitura | Bruto igual |
| --- | --- | --- | --- | --- | --- |
| A-new | OK; 0 registros | OK | 0 | personal | NÃO |
| A-existing-empty | OK; 0 registros | ERRO: BackupValidationError | 0 | nenhuma | SIM |
| A-other-key | OK; 0 registros | ERRO: BackupValidationError | 0 | other | SIM |
| B | OK; 0 registros | OK | 7000 | personal | SIM |
| C | OK; 3 registros | ERRO: BackupValidationError | 1500 | nenhuma | SIM |
| C-null | OK; 3 registros | ERRO: BackupValidationError | 1500 | personal | SIM |
| C-custom-ref | ERRO: Error | ERRO: BackupValidationError | não calculado | nenhuma | SIM |
| D | ERRO: Error | ERRO: BackupValidationError | não calculado | personal | SIM |
| E | ERRO: Error | ERRO: BackupValidationError | não calculado | personal | SIM |
| F | ERRO: Error | ERRO: BackupValidationError | não calculado | personal | SIM |
| G | ERRO: Error | ERRO: BackupValidationError | não calculado | personal | SIM |
| H | ERRO: Error | ERRO: BackupValidationError | não calculado | personal | SIM |
| I | OK; 3 registros | OK | 6500 | personal | SIM |
| J | OK; 3 registros | OK | indisponível | personal | SIM |
| goal-future | OK; 3 registros | OK | 8500 | personal | SIM |
| bad-source | OK; 3 registros | ERRO: BackupValidationError | 8500 | personal | SIM |
| bad-createdAt | OK; 3 registros | ERRO: BackupValidationError | 8500 | personal | SIM |
| numeric-id | OK; 3 registros | ERRO: BackupValidationError | 8500 | personal | SIM |
| transfer-category | OK; 3 registros | ERRO: BackupValidationError | 8500 | personal | SIM |
| income-destination | OK; 3 registros | ERRO: BackupValidationError | 8500 | personal | SIM |
| duplicate-goal | OK; 3 registros | ERRO: BackupValidationError | 8500 | personal | SIM |
| metadata-infinity | OK; 3 registros | ERRO: BackupValidationError | 8500 | personal | SIM |
| v1-no-settings | OK; 3 registros | OK | 1500 | personal | NÃO |
| v1-empty-settings | OK; 3 registros | ERRO: BackupValidationError | 1500 | nenhuma | NÃO |
| v2-missing-store | ERRO: NotFoundError | ERRO: NotFoundError | não calculado | nenhuma | SIM |

Definições adicionais:
- A-existing-empty: v2 já criado, ambas as stores vazias, personal nunca inserido pelo preparador.
- A-other-key: mesmo caso, mas settings contém a chave other.
- C/C-null: personal ausente/nulo, referências compatíveis com defaults.
- C-custom-ref: personal ausente e accountId custom-lost.
- D: personal = {}. E: falta accounts[0].initialBalance.
- F: amount = -1. G/H: conta/categoria missing.
- I: uma transação em 2099-12-31. J: primeira abertura em 2099-01-01.
- goal-future: deadline = 2099-12-31.
- bad-source/bad-createdAt: origem invalid/timestamp impossible.
- numeric-id: ID de uma transação é o número 42.
- transfer-category: transferência com categoryId food.
- income-destination: receita com destinationAccountId reserva.
- duplicate-goal: dois objetos de meta com o mesmo ID.
- metadata-infinity: settings.metadata.external = Infinity, inserido diretamente no IDB sintético, sem passar pelo parser A1.
- v1-no-settings: versão 1 com transactions e sem store settings; v1-empty-settings: versão 1 com settings vazio. Nessas duas fixtures os registros incluem aliases legados e campos da fixture moderna: demonstram a política de criação de settings na abertura, não validam todo o universo de schemas v1.
- v2-missing-store: v2 com transactions, sem store settings.

### Mensagens de load

- C-custom-ref: Selecione uma conta válida.
- D: Não foi possível ler ou salvar os dados. Revise as configurações e tente novamente.
- E: Revise nome, saldo e data inicial das contas.
- F: Informe um valor entre R$ 0,01 e R$ 999.999.999,00, com até duas casas decimais.
- G: Selecione uma conta válida.
- H: Selecione uma categoria compatível com o tipo.
- v2-missing-store: Failed to execute 'transaction' on 'IDBDatabase': One of the specified object stores was not found.

O erro estrito de validação foi `BackupValidationError`: “Arquivo inválido: revise a estrutura, os campos e as referências do backup JSON v2.” Falta de store produziu NotFoundError nativo nos dois métodos.

### Contraprovas financeiras e de escrita

- C: abertura devolvida [0, 0], metas [], limite 0, total 1.500. A fixture íntegra teria abertura total 7.000 e saldo total 8.500. O repository não conhece a abertura perdida: 1.500 não é saldo confiável.
- C: save aceito, import retornou 1, registros passaram de 3 para 5, personal continuou ausente.
- C-null teve o mesmo fallback, embora a chave exista com valor inválido null.
- B: roundtrip restore → load equivalente ao alvo = **true**. Nenhuma regressão A1 foi demonstrada.
- J: load e leitura estrita aceitam; totalAccountBalance retorna null no corte anterior à abertura. Esse null é comportamento correto, não saldo zero.

## UI observada

| Caso | Alertas overview | Componente summary | Botão restore em Configurações | Inputs de abertura |
| --- | --- | --- | --- | --- |
| A-new | 0 | 0 | 1 | 2 |
| C | 0 | 1 | 1 | 2 |
| D | 1 | 0 | 0 | 0 |
| F | 1 | 0 | 0 | 0 |
| J | 0 | 1 | 1 | 2 |

- A-new: onboarding normal, sem alerta, Configurações disponível.
- C: overview aparece como normal; Configurações mostra dois inputs de abertura derivados dos defaults. Após os dois lançamentos adicionais do controle, o resultado mensal da UI é 1.330. Esse resultado mensal não deve ser confundido com o total de contas 1.500 medido antes do controle.
- C: selecionar backup válido abre a prévia, mas Baixar backup de segurança falha. Mensagem: “Não foi possível gerar ou iniciar o download do backup de segurança. A restauração está bloqueada; seus dados não foram substituídos. Verifique o download e a integridade dos dados atuais.” Confirmação desabilitada.
- D/F: alerta e Tentar novamente; nenhuma summary. Navegar para #/configuracoes altera o título, mas mantém o erro, sem restore nem inputs.
- J: leitura bem-sucedida e Configurações disponível. O total indisponível foi conferido pela função financeira; sem CSS e sem esperar todas as animações, esta execução não certifica o texto final de cada cartão de conta.
- Nos cinco casos, nenhum pageerror capturado na execução concluída.

## Clock/date

| Fuso | Instante UTC | load idêntico | Estrito idêntico | Comando de transação | Comando de settings |
| --- | --- | --- | --- | --- | --- |
| America/Sao_Paulo | 2026-09-15T00:30:00Z | SIM | SIM | rejected | rejected |
| America/Sao_Paulo | 2020-01-01T00:30:00Z | SIM | SIM | rejected | rejected |
| America/Sao_Paulo | 2100-01-01T00:30:00Z | SIM | SIM | accepted | accepted |
| Pacific/Kiritimati | 2026-09-15T00:30:00Z | SIM | SIM | rejected | rejected |
| Pacific/Kiritimati | 2020-01-01T00:30:00Z | SIM | SIM | rejected | rejected |
| Pacific/Kiritimati | 2100-01-01T00:30:00Z | SIM | SIM | accepted | accepted |
| America/Los_Angeles | 2026-09-15T00:30:00Z | SIM | SIM | rejected | rejected |
| America/Los_Angeles | 2020-01-01T00:30:00Z | SIM | SIM | rejected | rejected |
| America/Los_Angeles | 2100-01-01T00:30:00Z | SIM | SIM | accepted | accepted |

No instante 2026-09-15T00:30Z, o dia local é 14 em São Paulo/Los Angeles e 15 em Kiritimati. O teste move o relógio de 2026 para 2020 e depois 2100, sem regravar o snapshot. Nenhum estado ficou ilegível. Rejeição de cadastro/edição antes das datas futuras é a regra de comando esperada.

## Ocorrências do instrumento

As primeiras duas tentativas pararam ao esperar o título Configurações: o texto do comando enviado por stdin precisava de UTF-8 explícito. Antes da execução final também foi explicitado JSX automático para corresponder ao projeto. A execução final com `$OutputEncoding = [System.Text.UTF8Encoding]::new()` concluiu com exit code 0. Não se atribui esses timeouts à aplicação.

A revisão automática da permissão de uma repetição expirou; a única repetição permitida foi autorizada e concluiu. Isso não foi rejeição de segurança do experimento. Não foram alterados produção, expectativas de testes ou timeouts da suíte.

## Estado Git recebido

```text
 M README.md
 M artifacts/dashboard-desktop.png
 M artifacts/dashboard-mobile.png
 M artifacts/onboarding-desktop.png
 M index.html
 M package-lock.json
 M package.json
 M src/App.tsx
 M src/components/charts/TrendChart.tsx
 M src/components/dashboard/DashboardLayout.tsx
 M src/components/dashboard/FinancialSummary.tsx
 M src/components/transactions/ImportModal.tsx
 M src/components/transactions/TransactionForm.tsx
 M src/components/ui/Dialog.tsx
 M src/main.tsx
 M src/styles.css
 M vite.config.ts
?? ARQUITETURA-VERTICE-2-REVISADA.md
?? ARQUITETURA-VERTICE-2.md
?? AUDITORIA-ARQUITETURA-VERTICE-2.md
?? CAMADA-3D.md
?? DECISOES-VERTICE-2.md
?? PWA.md
?? REFINAMENTO-VISUAL.md
?? artifacts/refinamento-desktop.png
?? artifacts/refinamento-mobile.png
?? artifacts/refinamento-modal-mobile.png
?? artifacts/revisao-a0-a1-evidencias.json
?? artifacts/three-desktop.png
?? public/icons/
?? scripts/
?? src/components/pwa/
?? src/components/visual/
?? src/hooks/useVisualEffects.ts
?? src/pwa/
?? src/visual.css
?? src/visual/
?? src/vite-env.d.ts
?? tests/pwa.spec.ts
?? tests/three.spec.ts
?? tests/visual.spec.ts
```

Diff rastreado recebido: 17 arquivos, 6.438 inserções, 1.898 exclusões. As alterações de package/lock dominam o tamanho. Foram executados status, diff/stat e log. Não há implementação A2 no HEAD. O inventário SHA-256 em memória cobre 87 arquivos rastreados e não ignorados recebidos.

Preservação final conferida: **87/87 arquivos recebidos com SHA-256 idêntico**, HEAD e index inalterados, hash do diff rastreado idêntico ao inicial. Somente PLANO-A2A.md e este relatório foram criados. git diff --check passou. Nenhuma limpeza, staging, commit ou implementação foi realizada.
