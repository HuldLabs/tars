---
name: segtools-frontend
description: Regras REAIS do frontend do segtools (DS atômico, Base UI/shadcn, page models, render burro, config única, registry, tema seg-v1). Carregar ANTES de codar/editar qualquer UI, tema/template, página ou componente no repo segtools.
---

# Frontend do segtools — regras vigentes

Fonte de verdade (leia antes de decidir algo não-trivial):
`docs/STANDARDS.md` (filosofia/padrões gerais — fonte única) · `docs/frontend/design-system/README.md` ·
`docs/frontend/shadcn-modernization.md` · `docs/frontend/theme-system-port.md` ·
`AGENTS.md`/`CLAUDE.md` (R1: portar do Fabber/Nexus).

## Tela nova do módulo Projects: UX do Jira primeiro (ordem do dono, 26/09)
Antes de desenhar ou codar QUALQUER tela ou interação do `projects` (board, detalhe, configuração do projeto, workflow, regras,
checklist, filtros, painel, cerimônias), levantar **como o Jira resolve aquela tela**: prints de referência em
`docs/reference/ux/jira-dot/` (com linha no README), estrutura, estados, textos e interações. A UX do Jira é a base; a
adaptação registra só o que muda e por quê ("salvo alguns detalhes"). Sem referência do Jira no item, a tela não sai de
Refinando (vale como item do DoR de toda história/tarefa de UI do projects). Componentes: shadcn/Base UI e as refs de
`docs/reference/ux/kanban-refs.md`.

## Decisão de componente (o agente decide sozinho — dono, 06/10)
Processo completo e fila: `docs/frontend/design-system/MATURITY.md`. Para no primeiro passo que casar:
1. **Já existe em `packages/ui`?** → use. *Falta de uso não é falta de peça*: peça sem consumidor pede adoção, nunca peça nova.
2. **É variação de uma existente?** → prop/`variant`/`type` (variante explícita, nunca booleanos empilhados); muda com
   tema → token. `field`/`field-select`/`field-textarea` separados é defeito.
3. **Primitiva Base UI resolve?** → use direto; padronizar API/visual → **embrulhe** (sem prefixo); cobre em parte →
   **componha**. Base: nativo (`<dialog>`, `<details>`) > Base UI > Radix só onde o Base UI não cobre.
4. **É dado do app?** → componente não é dado: o app passa dados e callback.
5. **Só então crie, direto em `packages/ui`** desde o 1º uso, com ficha completa (`MATURITY.md`). O DS guarda
   tudo, mesmo peça sem consumidor; cada app escolhe o que usa (dono, 06/10). Abstração cara (tabela, section) →
   spike com casos reais antes.
**Nunca duplicar** átomo/molécula/organismo/modelo de página — mudar num lugar replica para todos.

**Perguntar ao dono só em 4 casos:** mudar contrato de peça já consumida; dependência nova (primitiva shadcn, lib);
exceção a uma BR-DS; trocar stack/tema/ícones. Fora disso: decidir, registrar na ficha e seguir — design não é bloqueio.

## Onde criar (local)
| Local | O que |
|---|---|
| `packages/ui/src/primitives/*` | primitiva shadcn, nome original (não editar; faltou? `npx shadcn add <x>`) — `@sofon/ui/primitives/*` |
| `packages/ui/src/*` | componente do DS do Sofon, **sem prefixo**, nome pelo que faz (`StatusBadge`, `page-simple.tsx`) — `@sofon/ui/*` |

> **SEG-704 (decisão do dono 29/09):** `apps/hub/components/seg/` e `components/ui/` não existem mais. **Nunca** criar `Seg*`/`seg_*`. Teste de componente mora ao lado do componente em `packages/ui/src` (o project `component` do vitest varre lá).
| `themes/seg-v1/templates/*` | estrutura de página (tema) |
| `config/config.toml` | parâmetros/copy (nunca literal no componente) |
| `modules/<id>/*` | plugins (auto-registro): fornecem **dados/config**, não componente |

> **REGRA (dono, 29/09): componente não é dado.** **Todo componente é genérico e do framework** (`@sofon/*`,
> destino físico `packages/ui`), reaproveitável por todo o sistema. App (hub) e módulos **não têm componente
> próprio**: entregam **dados/config** (itens do menu, colunas, campos) que o componente renderiza — o hub não
> "tem um menu", ele usa o componente menu com os dados dele. Componente que sabe o que é issue/board está
> errado: vira genérico + dado vindo do módulo. **Nunca** criar componente em `apps/hub/components/<domínio>/`
> nem em `modules/`; os que existem lá são dívida (mudança para `packages/ui` na fila da SEG-661).

> **`ARCH-DS`:** temas/módulos importam **`@sofon/*`** (nunca `../../../apps/hub/...`). A **engine** é
> package (`packages/theme-engine`, `@sofon/engine`). A UI ainda mora fisicamente no hub; o workspace Bun já
> existe (SEG-662), então a mudança para `packages/ui` é fatia da fundação (SEG-661).
> Dentro do `apps/hub/`, o alias é `@/*` (mas `@/lib/core` → engine).

## Regras duras
- **Base UI, nunca Radix**; prop **`render`**, nunca `asChild`.
- **Ordenação por timestamp cru, nunca por string de data:** data já formatada em BRT `dd/mm/aaaa` (ano
  no FIM) não é ordenável por `localeCompare` — ele erra a virada de mês/ano. (fonte: docs/projects-ui/proj-ui-2-lessons.md:29)
- **Tabs (Base UI):** varia por **`data-orientation`** (o `Tabs` do Base UI não emite `data-horizontal`);
  o **Root** precisa do contorno **`flex flex-col`**, senão a `TabsList` estica num bloco cinza ao lado.
  (fonte: docs/projects-ui/proj-ui-2-lessons.md:26,27)
- **Phosphor** (`@phosphor-icons/react`; `.../dist/ssr` em Server Component).
- **Só tokens** (sem cor/`text-[Npx]`); `gap-*` (nunca `space-*`); `size-*`/`truncate`.
- **Itens no seu Group**; ícone em `Button` com `data-icon` (sem `size-*`).
- **Acessibilidade de exposição:** componente que age como botão precisa de **`nativeButton`** (ramo de
  link com `href`); o átomo `Icon` usa `label` como rótulo acessível — não como `alt` (o Phosphor o
  desenha como `<title>`); evite remontar campo sem necessidade (a11y do foco). (fonte: commit:fedb18e0,806b0b21,5ab11068,f53afa22)
- **`cn`** vem de `cn` (`lib/utils.ts` reexporta).
- **Render burro:** o componente/template **recebe payload COMPLETO** (labels, status, **opções**,
- **Fronteira de erro por seção:** falha de serviço (IA/registry) não derruba a página — isole a seção
  que consome o serviço; a prova cobre o caminho de erro, não só o feliz (senão exceção vira texto na
  tela). (fonte: commit:1ecbcc25, commit:83b36b77)
- **Modo leitura renderiza o estado SALVO, nunca o rascunho.** `saved` (servidor) e `draft` (editor) são
  separados; toda edição inline do canal lê o estado local atualizado no `save()`, nunca a prop do Server
  Component — renderizar o `draft` quebra o "clicar fora mostra o salvo". (fonte: docs/projects-ui/proj-ui-3-lessons.md:13,73)
  mensagens) e só renderiza; **sem copy/estado default** hardcoded. **Regra de negócio não mora no render:** a
  política do domínio (limite, prazo, autorização) fica no ponto de decisão (page model/backend) com o marcador
  `BR-<MODULO>-<NNN>` — `docs/STANDARDS.md` §12. O componente só desenha o que o payload já decidiu.
- **Sidebar** = primitivos do shadcn (`SidebarProvider/Inset/Trigger/MenuButton`), não `<aside>`.

## Componentes únicos (design atômico — regra do dono, 26/09)
Um componente por conceito, configurado por props; **nunca** variação local espalhada. Antes de criar, procure em
`packages/ui/src` e **estenda**. Únicos: `Icon` (lib+nome, padrão na config), `Avatar`
(SEG-196), `Badge` (label/count/dot/chip, SEG-197), `Combobox` (toda seleção em lista, SEG-195),
`InfoPopover`/`EntityHoverCard` (hover rico por entidade), `TypeIcon` (ícone de tipo + hover). Ícone sem rótulo ou texto truncado sempre tem hover
informativo (`BR-DS-001`, `BR-DS-002`). Gates que reprovam variação local: `BR-DS-003` (badge), `BR-DS-004` (avatar), `BR-DS-005` (lista/combobox). Fonte única da regra: `docs/frontend/design-system/README.md` — aqui só o ponteiro.

## Page models (usar, não hand-roll)
- **Troca de modo é in-place, nunca navegação de rota.** "Esqueci minha senha" navegava para
  `/reset-password` com o identificador **vazio** (o campo não era repreenchido). Transicione o
  `LoginMode` no lugar e reescreva o `formRef`. (fonte: fabber/apps/web/e2e/account/forgot-password.spec.ts:5,31)
`PageSimple` (header+conteúdo, toda página interna) · `PageHeader` (o único `<h1>`) ·
`Empty` · `StatusBadge` (label+variant) · `Typeset` (conteúdo rich = relatórios R1–R4). Temas
registram shells: `shell-app`, `shell-simple`, `shell-tabs` (abas de navegação) e `not-found` (404
do tema; 5xx = fallback estático quando houver borda).

## Config é fonte única
- **Indexação (robots/sitemap) é segura por padrão:** local/dev/preview/staging respondem `Disallow`
  total; só produção libera indexação com flag explícita. O **sitemap é do backend**, não do front — o
  front só referencia quando a indexação está liberada. (fonte: farmega/docs/strategy/roadmap-decisions.md:1832,1836)
`config/config.toml` → `generated.json` (`apps/hub/lib/config.ts`). Nada hardcoded: nomes, títulos,
portas (`[ports]`), roteamento (`[routing]`: reserved_tenant_ids/last_tenant_cookie/recent_tenants_key),
copy de UI (`[ui.nav]`, `[ui.messages]`, `[ui.severity]`), larguras (`[ui.sidebar]`).

## Registry do DS
- **Tailwind precisa de `@source` apontando para `packages/ui`:** sem isso, classe usada **só** num
  componente do DS não é gerada (o elemento sai inerte) — o `@source` antigo apontava para o lugar errado
  após mover os componentes. (fonte: commit:0f4bc142, commit:2b82a562)
Fonte `apps/hub/registry.json`; build `npm run registry:build` → `apps/hub/public/r/*` (servido em `/r/...`;
MCP descobre). É o mecanismo de "replica para todos".

## Referências no código
Fonte única: **`docs/AGENT-CONTRACT.md`** (§Referências). Não duplicar a regra aqui.

## Testes: qual camada (SEG-347, decisão do dono 28/09)
Duas camadas, cortadas pelo **custo** e pelo **ambiente**. Guia completo: `docs/frontend/testes-duas-camadas.md`.

| O que você quer provar | Camada | Ferramenta | Onde o teste mora |
|---|---|---|---|
| Interação do DS (clique, teclado, foco, aria, abrir/fechar, seleção, desabilitado) | **componente** | vitest + jsdom + Testing Library | `packages/ui/src/**/*.test.tsx` (ao lado do componente) |
| Lógica pura, geradores, guards de scan (não precisa de DOM) | **unit** | vitest, `environment: node` | `apps/hub/lib/**/*.test.ts` e as demais pastas do `include` |
| Layout, CSS, medida, sticky, rolagem, paridade com o Jira, fluxo com dado real | **tela** | Playwright (`e2e/`) e MCP (:47000, SEG-264) | `apps/hub/e2e/*.spec.ts` |

- **O jsdom não tem layout** — `getBoundingClientRect` devolve zero e o Tailwind não é aplicado. Teste de
  medida ali passa sempre, inclusive com o CSS quebrado. **Layout nunca vai para o jsdom**: é camada de tela (e
  o print que vale como prova é versionado em `docs/reference/ux/<tema>/`).
- **Escreva por papel** (`getByRole`/`getByLabel`), nunca por `querySelector` ou `data-testid` como primeira
  escolha; **interaja com `user-event`**, nunca com `MouseEvent` sintético (o evento cru não passa por foco nem
  teclado); espere com `await user.*` — o `user-event` já envolve a interação no `act` do React.
- Os matchers do jest-dom (`toBeInTheDocument`, `toHaveAttribute`, `toHaveFocus`) e o `cleanup()` entre casos
  vêm de `apps/hub/vitest.component.setup.ts`.
- Rodar: `bunx vitest run --project component` (só a camada com DOM) · `--project unit` (só node) ·
  `bun run test` (as duas). O **pre-commit** roda o project `component` só sobre os testes de componente do
  stage; o `task check` roda os dois projects.

## Verificação
- **Sem `next dev`:** prove o render pelo mesmo caminho da rota — `registerDbPort` →
  `renderModulePage('/rota', params)` → `renderToStaticMarkup`; o print real combina SSR + CSS compilado
  (`@tailwindcss/cli`) + Chromium do container. Limite honesto: o `Tabs` do Base UI não SSR-iza. (fonte: #13,#14,#15,#16,#50)
- **Lint `react-hooks/set-state-in-effect`** barra sincronizar prop→state com `useEffect`, e o
  pre-commit reprova — deriva o estado do servidor em vez de copiá-lo. (fonte: docs/projects-ui/proj-ui-3-lessons.md:17)
`task check` = typecheck+unit+int (**rápido**, portão do dia a dia; sem build/e2e). O **build** (compila
todas as rotas, `.next-build`) é on-demand: `task check:build`. **e2e** idem: `task e2e`/`task check:full`.
O loop é `task dev` (Turbopack incremental, só a rota visitada). Watchdog do Turbopack não pega mutação de
mount — arquivos novos exigem `task dev:restart`.
