# Implementação P1b — TopoField

Data: 07/10/2026.
Worktree: `C:\Users\patai\OneDrive\Documentos\Dashboard-Financeiro-P1`.
Branch: `feat/p1b-topofield`.
Base: `0430f9e7db274f13656326f5c8db6497640b40c2`, P1a concluído; árvore e staging inicialmente vazios.

## Escopo e referência

Somente o componente 2 do P1, conforme o briefing TopoField/21st.dev anexado. O material desta solicitação descreve a demo, mas não contém seu código-fonte integral ou URL exata. Não se declara cópia ou inspeção dessa página específica. Triângulo fullscreen, grid, contornos, lifecycle e integração são implementação local do briefing.

A função GLSL de simplex noise 2D foi adaptada de [Ashima/webgl-noise](https://github.com/ashima/webgl-noise/blob/master/src/noise2D.glsl), de Ian McEwan/Ashima Arts, mantida por Stefan Gustavson. A [licença MIT original](https://github.com/ashima/webgl-noise/blob/master/LICENSE) está integralmente em `topofield-noise-LICENSE.txt` e no comentário do fragment shader, preservado na string do bundle distribuído.

Usados: canvas/WebGL, simplex noise, grid fino, contornos e movimento lento. Descartados: HTML completo, NexusNode, hero/cards, variantes e controles da demo, iframe/srcDoc/postMessage, Tailwind/Iconify/GSAP/CDNs. Zero dependências novas.

## Arquitetura e integração

`TopoFieldBackground` renderiza diretamente um div e um canvas WebGL nativo. Props: `speed`, `density`, `opacity` e `className`. Não recebe transações, saldo, snapshot, workspace ou qualquer dado financeiro.

Host mínimo: a `page-heading` existente em `App.tsx`, somente quando a rota é Overview. Não há nova seção, hero ou reorganização de controles: título, copy, seletor de período e CTA permanecem nos mesmos lugares, como HTML/React acima da camada via z-index. O canvas é absoluto, sem participar do flex/layout e sem capturar eventos; `aria-hidden="true"` no div e canvas. Essa região também existe com banco vazio ou mês sem movimentos; welcome panel, KPIs, gráficos e textos financeiros não foram editados.

## Visual final

Grafite existente, mint `#b1e6c5`, linhas discretas e grid quase imperceptível, bordas suavizadas. Valores após inspeção: speed 0,025; density 7; opacity 0,20; escala espacial 0,4. Sem neon ou fundo branco. Corrigida a composição alpha do contexto durante a inspeção, usando `premultipliedAlpha: false`.

Inspecionadas capturas reais do preview em Edge: Overview vazia e preenchida com receita sintética de R$ 1.200, sidebar fechada/aberta, desktop, viewport 375px, reduced motion e fallback. Leitura e CTAs preservados. Resize e navegação validados no navegador; nenhuma informação depende do shader.

Evidências dirigidas preservadas em `%TEMP%\vertice-p1b-visual-20261007\directed`; comparação em `frame-comparison-directed.json`. Artefatos de teste não integram o commit.

## Lifecycle, reduced motion e fallback

Program/shaders/buffer criados uma vez por montagem. Mudanças de parâmetros e resize atualizam uniforms/drawing buffer sem recompilar. Sem alocação no callback por frame; até 30 draws WebGL/s, embora o RAF acompanhe o navegador.

Pausa/cancela RAF quando document.hidden é true ou IntersectionObserver indica saída da viewport. Retoma sem acumular tempo oculto. Reduced motion renderiza frame estático, sem loop contínuo, inclusive com alteração da preferência em runtime. Speed zero também não inicia loop.

Cleanup cancela RAF, desconecta ResizeObserver/IntersectionObserver, remove resize/visibility/media-query/context-loss listeners, deleta buffer/program/shaders e libera o contexto via WEBGL_lose_context quando disponível. Troca para Transações ou Configurações desmonta completamente o componente.

Falha/null/exception de contexto, falha de compile/link ou perda do contexto deixam grid/gradiente CSS silencioso. Após context loss, o fallback permanece até nova montagem; não há mecanismo complexo de reconstrução. A Overview e o diálogo continuam funcionais.

DPR limitado a 1,25 e largura do drawing buffer a 1.536px. Até 700px, fallback CSS estático; na abertura em viewport pequeno não se cria WebGL. Layout mobile validado por emulação, sem certificar performance em aparelho físico.

## Performance visual

Classificação: **ACEITÁVEL no ambiente medido**, sem budget universal ou certificação de GPU/mobile. Medição simples em Edge headless, 90 intervalos RAF em cada condição, mesma Overview com dados sintéticos. Condição sem efeito: navegação desmonta o WebGL, retorno força fallback, e a camada decorativa é ocultada; números e conteúdo permanecem iguais.

| Medida                  | Com WebGL  | Sem efeito |
| ----------------------- | ---------- | ---------- |
| Cadência RAF aproximada | 165,02 fps | 165,05 fps |
| Gap mediano             | 6,10 ms    | 6,10 ms    |
| Gap p95                 | 6,20 ms    | 6,20 ms    |
| Gap máximo              | 6,30 ms    | 6,30 ms    |

DPR do navegador 1; buffer com efeito 1.184 × 130. A cadência RAF não é o FPS dos draws do shader (limitados a 30/s), nem uma medida de conclusão GPU. 31 submissões acumuladas até a captura custaram cerca de 0,30ms na instrumentação JavaScript; não se infere utilização percentual de CPU/GPU ou memória. Nenhuma regressão perceptível nessa amostra; tempos de carregamento não foram isolados num benchmark separado. A suíte completa também anexa sua própria medição, sujeita à carga da regressão.

## Testes e baseline

| Verificação                     | Baseline P1a | P1b final                                                     |
| ------------------------------- | ------------ | ------------------------------------------------------------- |
| Unit — npm.cmd test             | 673/673      | 673/673 PASS, 19 arquivos                                     |
| Build — npm.cmd run build       | PASS         | PASS, tsc -b + Vite + PWA                                     |
| E2E — npm.cmd run test:e2e      | 365/365      | 372/372 PASS, 26 arquivos, zero skips/falhas/flaky (10,9 min) |
| Dirigidos P1a + P1b             | 6 P1a        | 13/13 PASS, zero skips                                        |
| Prettier nos arquivos alterados | —            | PASS                                                          |
| git diff --check                | —            | PASS                                                          |

Regressão completa executada com `--workers=1 --reporter=line,json`, porta 5195, checkpoint histórico B2b `0157797` previamente verificável em TEMP via artifact-evidence.json. Sete testes novos; nenhum teste existente alterado, removido ou marcado skip.

Cobertura nova: presença exclusiva na Overview; canvas decorativo; contexto WebGL real; recursos liberados e frames cessando após unmount; falha de contexto e compile sem quebrar CTA/navegação; reduced motion sem desenhos contínuos; context loss; hidden/offscreen e retomada; resize sem novo program; fallback mobile sem GL/overflow; resumo financeiro com dado sintético; comparação simples de cadência.

Uma primeira rodada dirigida detectou seletor de teste incorreto (Cancelar não existe nesse diálogo); o teste foi corrigido para Escape e as rodadas finais passaram. A correção visual de alpha ocorreu antes da validação final.

Não existem scripts separados `lint` ou `typecheck` no package.json; o build executa TypeScript. Aviso preexistente de chunk ExcelJS maior que 500kB permanece; não impede build. Nenhum warning novo de domínio foi introduzido.

## Arquivos do commit

- `src/App.tsx` — import, classe e montagem condicional no cabeçalho existente.
- `src/components/dashboard/TopoFieldBackground.tsx`.
- `src/components/dashboard/TopoFieldBackground.css`.
- `src/components/dashboard/topoFieldShaders.ts`.
- `src/components/dashboard/topofield-noise-LICENSE.txt`.
- `tests/p1b-topofield.spec.ts`.
- `IMPLEMENTACAO-P1B-TOPOFIELD.md`.

Os três PNGs rastreados regenerados pela regressão são repostos exatamente aos bytes do HEAD antes do staging seletivo. Sem reset/limpeza ampla ou inclusão de artefatos.

## Preservação e fechamento

AppSidebar.tsx/CSS e DashboardLayout não alterados; os seis testes P1a passam. OverviewPage, FinancialSummary, charts e styles.css globais permanecem intactos. Diff vazio em services/hooks/features/types/utils/package.json/package-lock.json: Money, CivilDate, provenance, WorkspaceId, authority, CAS, SessionLease, IndexedDB v4, migration, restore, backup v2, repository e calculadores preservados.

Não houve escrita nos worktrees principal/B1/B2, rural ou Supabase/cloud/auth. Sem merge ou cherry-pick. Componente 3, hero financeiro, novos KPIs/cards/charts e Three.js não iniciados.

Commit seletivo solicitado: `feat: adiciona TopoField ao Vertice`.
Bloqueadores da entrega P1b: nenhum no escopo P1b.

## Refinamento visual — 07/10/2026, base 072a1a2

Refinamento exclusivo de presença visual, na mesma branch `feat/p1b-topofield`. Os valores abaixo atualizam a área e os parâmetros do checkpoint original documentado acima.

| Parâmetro                             | Antes          | Depois                                   |
| ------------------------------------- | -------------- | ---------------------------------------- |
| Região visual desktop medida a 1280px | 1.184 × 130px  | 1.184 × 272px                            |
| Altura mínima do cabeçalho desktop    | altura natural | 240px (+32px da camada absoluta)         |
| Opacity padrão                        | 0,20           | 0,36                                     |
| Density padrão                        | 7              | 6                                        |
| Intensidade dos contornos no shader   | 0,55           | 0,85                                     |
| Intensidade do grid                   | 0,055          | 0,075                                    |
| Escala espacial                       | 0,40           | 0,65                                     |
| Speed                                 | 0,025          | 0,025, preservada                        |
| Fade                                  | linear lateral | radial elíptico, transparente nas bordas |

Usado o próprio `page-heading`: apenas sua altura mínima em desktop aumenta. Título, controles e CTA permanecem no flex existente; o conteúdo seguinte continua no fluxo abaixo do cabeçalho ampliado. Não há novo container, hero financeiro, alteração em App.tsx ou shader atrás do card inteiro de onboarding/KPIs.

Inspeção antes/depois em capturas desktop de 1280px e escala CSS 100%: as curvas são identificáveis imediatamente no centro, com mint mais presente, sem neon/glow e com desaparecimento suave nas bordas. Texto e CTA mantêm contraste alto. Inspecionadas Overview vazia e com receita sintética de R$ 1.200, sidebar fechada/aberta e reduced motion. A captura com dados é feita no topo e sem foco transitório no skip link, para comparação consistente.

Evidências em `%TEMP%\vertice-topofield-refinement-20261007\before` e `after-directed`, com screenshots originais, sem edição ou redimensionamento. Não são incluídas no commit.

Arquitetura e proteções inalteradas: WebGL direto; sem iframe/CDN ou dependência nova; pause hidden/offscreen; cleanup completo; DPR 1,25/largura 1.536px; até 30 draws/s; frame estático em reduced motion; fallback mobile até 700px e fallback por falha WebGL. O diff do TSX modifica somente defaults de density/opacity; nenhuma função de lifecycle foi editada. Sidebar P1a, B1/B2 e testes financeiros permanecem intactos.

Na amostra dirigida de 90 intervalos RAF, cadência aproximada 164,96 fps com efeito e 165,02 sem efeito; p95 6,20ms em ambos. Buffer agora 1.184 × 272, DPR medido 1. Continua ACEITÁVEL no ambiente medido; não se infere certificação física/GPU ou percentual de CPU/memória.

Validação deste refinamento: unit **673/673 PASS**, build **PASS**, dirigidos iniciais P1a/P1b **13/13 PASS**; dirigidos finais P1b **7/7 PASS**; regressão completa **372/372 PASS, zero skips/falhas/flaky (9,5 min)**. Zero skips novos. Prettier restrito aos arquivos alterados e `git diff --check`: PASS.

Única alteração de teste: assertiva de altura 220–300px, opacity/min-height esperados e normalização da captura com dados. Não há comparação de pixels exatos, alteração de testes financeiros ou retirada de proteções.

Arquivos: `TopoFieldBackground.css`, `TopoFieldBackground.tsx`, `topoFieldShaders.ts`, `tests/p1b-topofield.spec.ts` e este relatório. PNGs rastreados regenerados pelos E2E são repostos aos bytes do HEAD antes do commit.

Commit solicitado: `fix: reforca presenca visual do TopoField`.
Componente 3 não iniciado. Worktrees principal/B1/B2 intactos; sem merge/cloud/auth/Supabase.
