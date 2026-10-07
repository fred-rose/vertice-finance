# P1a — Sidebar premium do Vértice

Implementação em **07/10/2026**, somente em `C:\Users\patai\OneDrive\Documentos\Dashboard-Financeiro-P1`, branch `feat/p1a-sidebar-premium`, criado limpo a partir da base oficial **4d601727c573b136639acea81b8d3e8bbaf843eb**. Raiz, branch, HEAD e status conferidos antes da edição. Nenhuma escrita nos worktrees principal, B1 ou B2; sem merge/cherry-pick/deploy.

## Referência e adaptação

Referência solicitada: “Settings Sidebar” do 21st.dev. O briefing forneceu o comportamento detalhado, sem URL/autor do componente exato; a consulta pública não identificou inequivocamente esse item. [Catálogo de sidebars do 21st.dev](https://mcp.21st.dev/community/components/explore/sidebar-ui) consultado como referência de padrões. Não alegamos cópia literal ou inspeção do código de um componente exato não identificado.

Implementação original `AppSidebar` com React, TypeScript, Framer Motion e Lucide já presentes, além de CSS isolado usando a paleta existente. Nenhum Next.js, shadcn ou pacote de tooltip foi adicionado. Tailwind já existia na base e não recebeu alteração de dependência ou configuração.

Topo: marca V na rail; Vértice/Pessoal quando aberta. “Pessoal” é indicação visual do modo, sem dropdown, workspace selector, identidade ou login. Nenhuma UI do produto original foi portada: Organization/Manage members/Integrations/Create organization/Reports/Chat/Deals/Accounts/Competitors/Knowledge Base/Feedback/Document Review/Profile/Sign out.

A sidebar antiga com placeholders desabilitados Orçamentos/Metas/Patrimônio, bloco de workspace/avatar e promoção lateral foi substituída. Foram mantidas apenas páginas funcionais.

## Rotas finais

| Página        | Hash real       | Posição                   |
| ------------- | --------------- | ------------------------- |
| Visão Geral   | #/              | Navegação principal       |
| Transações    | #/transacoes    | Navegação principal       |
| Configurações | #/configuracoes | Parte inferior no desktop |

Uso do `Page` e do hash router/usePage existentes. Router e guards de trabalho não salvo não foram alterados. Orçamentos e Metas continuam seções das configurações existentes, não rotas inventadas.

## Desktop, motion e mobile

Desktop acima de 700 px: fixed à esquerda, altura disponível da viewport com safe areas existentes, recolhida por padrão em **52 px**, aberta em **240 px**. Mouse entra/expande e sai/recolhe. Foco de teclado dentro mantém a expansão até sair. Botão V permite expansão/recolhimento manual em touch, inclusive desktop touch/pen; não cria seletor de modo/workspace.

Conteúdo reserva continuamente 52 px; abertura sobrepõe a página sem alterar seu offset. Teste compara a posição do main antes/depois do hover. Settings fica no rodapé com margin-top:auto. Ícones ficam visíveis; labels usam opacity/translateX pequeno, tween easeOut de **0,2 s**, sem spring/bounce. Reduced motion zera a duração e o deslocamento desnecessário.

Até 700 px: preservada a navegação horizontal superior com as três rotas e textos sempre visíveis, independente de hover. Sem drawer, onboarding ou redesign mobile. Touch real em viewport 320 px não produz overflow horizontal. Isso é emulação de navegador, não certificação física de aparelhos.

## Acessibilidade e identidade

Links reais com aria-label permanente e aria-current=page; ícones decorativos aria-hidden; item ativo combina background, ícone mint, contraste e borda interna, sem depender somente de cor. Focus-visible mint, Tab/Enter pelo router e skip-link existente preservados. Expansão por foco não cria focus trap. Botão possui aria-expanded e aria-controls. Tooltip simples nativo title segue a solução já usada na base; foco expande labels para teclado. Sem biblioteca adicional.

Paleta carvão/grafite e mint existentes, bordas discretas, sem azul/neon/glow. CSS da sidebar tem classes próprias e overrides restritos ao rail/offset do layout. Não alteramos hero, KPIs, gráficos, alerts, Three/shaders ou outro componente P1.

## Limites arquiteturais

AppSidebar recebe somente a página atual. Não consulta transactions, FinanceSnapshot, IndexedDB, CAS, backup ou migration. Nenhuma mudança em WorkspaceId, authority, SessionLease, schema v4, engine, repositórios, backup v2, Money, CivilDate, provenance ou regras financeiras.

Diff dos diretórios protegidos `src/services, src/hooks, src/types, src/utils, src/features` e package/lock frente a 4d60172 permaneceu vazio. A nova sidebar é integrada somente pelo DashboardLayout.

## Testes e validação visual

| Validação executada                                                                  | Resultado                                                                               |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `npm.cmd ci --offline --no-audit --no-fund`                                          | PASS — dependências exatas do lock no worktree próprio; nenhum pacote/configuração novo |
| `npm.cmd test`                                                                       | **PASS — 673/673**, 19 arquivos, 18,60 s                                                |
| `npm.cmd run build`                                                                  | **PASS** — tsc -b, Vite e geração PWA                                                   |
| `npm.cmd run test:e2e -- tests/p1a-sidebar.spec.ts --workers=1 --reporter=line,json` | **PASS — 6/6**, repetido após estabilizar as capturas; 12,8 s na rodada final           |
| `npm.cmd run test:e2e -- --workers=1 --reporter=line,json`                           | **PASS — 365/365**, 25 specs, 10,5 min                                                  |
| Skips / falhas / flaky na suíte completa                                             | **0 / 0 / 0**                                                                           |
| Prettier --check dos cinco arquivos da entrega                                       | PASS                                                                                    |
| `git diff --check` e staged diff check                                               | PASS                                                                                    |

Seis casos novos verificam: collapsed 52 px, hover expanded 240 px e mouseleave após navegação por clique; main sem deslocamento; três rotas reais com aria-current; foco Tab/Enter e contorno; reduced motion; navegação touch 320 px e expansão por botão em touch 1100 px. Nenhum teste ou timeout preexistente foi alterado.

A suíte completa repete A1/A2/B1/B2, incluindo cliente histórico real/SW, fence, CAS, sessões, migration, restore, import, dirty e PWA, além dos seis casos P1a. Um worker evita interferência de benchmarks; concorrência interna dos testes continua ativa.

Preview isolado `127.0.0.1:5194`, Edge headless 154.0.4258.53. Diretórios de serviços/contratos financeiros e backup permaneceram sem diff frente à base. Não há scripts dedicados lint/typecheck; build executa TypeScript. Avisos preexistentes de chunk ExcelJS >500 kB e NO_COLOR/FORCE_COLOR são não bloqueantes.

Visão Geral com dados sintéticos também foi inspecionada em captura da regressão (preservada em TEMP como overview-populated.png). Capturas dirigidas inspecionadas: rail fechada, aberta por hover, Visão Geral, Transações, Configurações com item ativo, foco de teclado e mobile 320 px. Capturas esperam fim da transição, evitando declarar estado intermediário como layout final. Rail 52/240, sobreposição sem shift, posicionamento inferior de Settings, contraste e foco conferidos.

Capturas/JSON dirigidos preservados em `%TEMP%\vertice-p1a-visual-20261007\test-results`. Resultados da suíte completa: `test-results/p1a-full.json` (ignorado). Perfis/dados sintéticos; nenhuma base pessoal ou serviço remoto usado. Helper temporário contra suspensão Windows somente durante o runner, sem configuração permanente.

PNG tracked de dashboard regenerados pela regressão foram repostos aos bytes da base antes do staging; não fazem parte deste commit. Nenhum teste preexistente foi editado ou omitido.

## Arquivos da entrega

- `src/components/dashboard/AppSidebar.tsx`: navegação e estado de expansão, sem domínio financeiro.
- `src/components/dashboard/AppSidebar.css`: rail/overlay, cores, foco, mobile e reduced motion.
- `src/components/dashboard/DashboardLayout.tsx`: integra AppSidebar e preserva main/skip-link.
- `tests/p1a-sidebar.spec.ts`: seis testes reais de rotas, estado, teclado, reduced motion e touch.
- `IMPLEMENTACAO-P1A-SIDEBAR.md`: este relatório.

Staging seletivo limitado a esses cinco arquivos. Commit solicitado: `feat: adapta sidebar premium do Vertice`. Sem git add geral. Entrega validada, sem bloqueador de implementação identificado. Após o commit, index e worktree P1 devem ficar vazios/limpos.

Componente 2 e demais componentes P1 não iniciados. Nenhuma alteração operacional em Supabase/cloud/auth. Encerrar após o commit desta entrega.
