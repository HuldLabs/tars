# Catálogo do Tars

Gerado por `tars catalog --md`; não edite à mão.

## gates

| Item | O que é |
|---|---|
| `backup-coverage` | backup so' e' real **com prova de restore**, e a cobertura e' **teste |
| `colocacao-arquivo` | o **LOCAL** onde o arquivo nasce, pela **MATRIZ** (`familia -> allowed`): |
| `commit-msg` | a MENSAGEM do commit no padrao `<emoji> <type>(<scope>): <descricao>` (INV-GIT-2), com o |
| `daneel-acoes` | as 3 CONDIÇÕES DE PARADA da Daneel que exigem ordem expressa do dono |
| `fail-closed` | a AUSENCIA de trava nao pode virar APROVACAO silenciosa. Le' os arquivos |
| `gitleaks` | nenhum segredo no que vai ser commitado: roda o `gitleaks` (`protect --staged`, ou |
| `healthcheck` | `--version` **nao e' healthcheck**. O gate le' os arquivos de operacao |
| `lint-swallow` | nenhum erro ENGOLIDO no que vai ser commitado. Le' os arquivos **staged** |
| `no-add-all` | nenhum `git add` amplo (`-A`, `--all`, `-u`, `.`), nenhum `git add -f` e nenhum |
| `no-foreign-runtime` | o `.ai/` que o consumidor COPIA nao pode exigir runtime que ele nao usa. Le' os |
| `prod-guard` | nenhum comando que MUDA estado em producao sem a ORDEM DIRETA DO DONO, |
| `release-guard` | um commit que toca o MOTOR do Tars (`tools/framework/tars-*.mjs`, |

## skills

| Item | O que é |
|---|---|
| `agent-coordination` | How to coordinate ANY delegated worker — a Claude subagent, a peer Claude session, an OpenCode/mimo job, or any other transport. Covers dispatch, write-set isol |
| `app-extraction` | How to extract a live web app into a 100% offline, runnable, locally-served copy in this monorepo — verbatim assets, stubs/mocks, sub-path routing, live→offline |
| `backup-restore` | How to design backup and restore for anything that matters — one repository per context, complete self-contained snapshots, declared retention, restore ALONGSID |
| `coleta-hostil` | How to collect data from a source that does not want to be collected — anti-detection browser work, geo/market-anchored requests, session warm-up and persistenc |
| `daneel` | Identidade de automação (bot) do ecossistema HuldLabs — persona, missão, contrato verificável de ações e como "vestí-la" numa sessão. Carregar SEMPRE que a ação |
| `fabber-api-contract-conventions` | How Fabber names API routes relative to page routes, and the server-driven "front burro" payload contract for any screen a component renders without owning its  |
| `fabber-frontend-architecture-review` | Operational review layer for Fabber's frontend — MUST/SHOULD/MUST-NOT invariants, an anti-pattern catalog, evidence-based-optimization discipline, and a Definit |
| `fabber-frontend-css-ux-patterns` | Modern CSS (container queries, fluid type, dvh units), View Transitions, dark mode/reduced-motion, and official Google-documented checkout/sign-up form UX patte |
| `fabber-frontend-design-system` | Conventions for any Next.js/shadcn/Base UI frontend work in apps/web — component composition, icons, tokens, page templates, when to reuse vs. wrap vs. build. L |
| `fabber-frontend-performance` | Core Web Vitals thresholds and concrete optimization mechanisms (LCP/INP/CLS), JavaScript execution/loading patterns, and responsive image/font optimization for |
| `fabber-frontend-security-headers` | HTTP-header-level security cookbook (CSP, Trusted Types, cookie recipe, CSRF via Fetch Metadata, clickjacking) for Fabber's Next.js/Caddy stack — tactical mecha |
| `fabber-frontend-testing` | Playwright/E2E testing conventions for this store — locator priority, the data-testid naming convention actually decided for this project (not the inherited fb- |
| `fabber-nextjs-rendering-architecture` | Next.js Server/Client Component boundary, caching model (including the opt-in Cache Components feature), streaming/Suspense, and official metadata/JSON-LD APIs  |
| `iac` | How to write infrastructure as a declaration — the ficha/host file is the single source of what exists, each recipe ends with a check that fails LOUD, what is m |
| `iam` | Autenticação e autorização do ecossistema — cadeia de provedores plugável, núcleo próprio × casca de terceiro, um engine de jobs só. Carregar antes de mexer em  |
| `migrate-radix-to-base` | Migrates React projects and components from Radix UI to Base UI. Use when asked to migrate from radix, move to base-ui, convert radix primitives, or switch a sh |
| `root-cause-debugging` | Processo de investigação antes de propor correção — bug, regressão, validação que falhou ou comportamento inesperado. Use sempre que algo quebrou e a causa aind |
| `security-testing` | How to audit Fabber's own attack surface — white-box first, then read-only live verification against OUR hosts only, with every claim carrying evidence and a LI |
| `segtools-content` | Escrita e revisão de TEXTO de verdade no segtools — rascunho base (clareza, densidade prática, voz), revisão crítica (achar o que soa genérico, polido demais ou |
| `segtools-database` | Regras e filosofia de banco/SGBD do segtools (PostgreSQL-first, camadas bronze→gold, índices, migrations, ETL/ingestão, jobs, roles). Carregar ANTES de mexer em |
| `segtools-frontend` | Regras REAIS do frontend do segtools (DS atômico, Base UI/shadcn, page models, render burro, config única, registry, tema seg-v1). Carregar ANTES de codar/edita |
| `segtools-sdd` | Pacote SDD (Spec-Driven Delivery) do segtools — templates de DESCRIÇÃO de issue por tipo/intenção (tema, iniciativa, épico, história, tarefa, bug, spike, subtar |
| `segtools-writing` | Metodologia de ESCRITA do canal de coordenação (módulo projects) — como escrever título, descrição e comentário de issue, com os templates de comentário por tip |
| `senior-research` | Runs a disciplined, adversarial research pass — web search, source triage, cross-verification, explicit citation — instead of a single-shot search-and-summarize |
| `shadcn` | Manages shadcn components and projects — adding, searching, fixing, debugging, styling, and composing UI, including chat interfaces. Provides project context, c |
| `telemetria` | How telemetry works in the framework — it is a CORE capability exposed as hooks (before/after/failure) and a neutral port ctx.telemetria (evento/medir/span) tha |

## guards

| Item | O que é |
|---|---|
| `block-destructive-commands` |  |
| `block-host-commit` |  |
| `block-secret-dump` |  |
| `ensure-memory-link` |  |
| `precompact-persist-state` |  |
| `sessionstart-context-digest` |  |
| `stop-unfinished-work` |  |

## governance

| Item | O que é |
|---|---|
| `EVOLUTION` | > Companion to `security-testing/SKILL.md` + `RUNBOOK.md` and `app-extraction/SKILL.md`. |
| `colocacao-de-arquivo` | O lugar errado de um arquivo não é estilo: é o defeito que **só aparece depois**. O |
| `dados-do-projeto` | Dado perene mora em `data/`, separado por finalidade: `runtime/`, `dev/`, `poc/`, `bench/`. |
| `estado-exige-datadir` | Servico com estado (banco, fila, cache persistente, indice) **nao sobe** quando o volume |
| `git` | Fonte: hook do segtools (`.githooks/pre-push`) e a conversa do dono de 07/10. |
| `incidente-vira-prevencao` | Toda falha de agente é uma **classe**, não um episódio. Corrigir a ocorrência sem |
| `licoes-plataforma` | Pitfalls that are not a bug of any one project: they come from the platform and come back in every |
| `novo-repo` | Todo repo/app novo do ecossistema **nasce por este método** — não por improviso. É a |
| `onde-mora-o-conhecimento` | A fronteira entre **memória durável**, **cursor de sessão** e **fila** não estava escrita em |
| `perdas-por-alvo` | Fonte: `.ai/` (ADR-019 rev. 2). O `rulesync` traduz para cada ferramenta; nem todo |
| `release` | Metodologia **única** para publicar versão em qualquer repo da HuldLabs (Tars, Kipp, Tomo, |
| `segredos-e-identidade` | Cada item abaixo nasce de um incidente real (08/10/2026, o dia em que o `op` ecoou a |
| `skills-README` | Local canônico dos bundles **genéricos**, reutilizados em qualquer auditoria de segurança ou |
| `source-of-truth` | A camada de IA tem **4 camadas** (ADR-019 rev. 2). Este arquivo é a **camada 1 |
| `versionamento-de-extracao` | Toda peca que sai do core e vira independente — **Tars, Tomo, Sofon, Pion, Kipp, Lazarus, |

