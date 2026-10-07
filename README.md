# Tars

O **catálogo de método**: as peças com que a gente trabalha num projeto — a camada `.ai`
(regras, skills, memória, governança), os gates e hooks que barram o erro antes do commit,
o tooling de workers e o processo de sessão.

Não é produto. Runtime, banco, migrations e módulos são do **Sofon**; o design system é do
**Tomo**. O Tars responde a uma pergunta só: *como a gente trabalha*.

## Origem do nome

**TARS**, o robô de *Interstellar* (2014). No filme ele não é uma peça fixa: os módulos se
**rearranjam** conforme a tarefa (o mesmo corpo vira escada, bote, plataforma) e as
"configurações" — honestidade, humor, autodestruição — são **ajustáveis por parâmetro**.

É exatamente o desenho daqui: cada projeto **escolhe as peças** que instala e **ajusta os
parâmetros** que usa. A analogia com a ficção científica não é só charme — é o modelo de
consumo (abaixo).

## O ecossistema

Nomes vêm de ficção científica: **Sofon** e **Tomo** de *O Problema dos Três Corpos* (o
sófon é um próton desdobrado em supercomputador; Tomoko é o avatar dele — a face do sófon);
**Pion** é uma partícula subatômica (méson), na mesma família do sófon.

| Peça | Responde | O que é |
|---|---|---|
| **Tars** | como a gente trabalha | catálogo de método; **transversal** a toda stack (este repo) |
| **Tomo** | como o app aparece | design system; **transversal e multi-stack** (Next, Jinja…) |
| **Sofon** | o que o app é | framework/runtime da stack **Next** (núcleo, plataforma, módulos, banco) |
| **Pion** | o que o app é | framework da stack **Python** (nasce do seo-brain, com base no thood e no seo-expert) |

O conceito é **framework modular self-service multi-stack**: cada peça é um item de catálogo,
e o projeto instala **só o que usa**. Um projeto Python+React (seo-brain) ou Python+Jinja
(thood) pode consumir Tomo e Tars sem adotar o Sofon inteiro. Cada stack nova é uma
partícula: PHP → *Phonon*.

## Modelo de consumo

O Tars é um **catálogo consumível**. O projeto declara num manifesto o que importa, e o sync
**puxa só o declarado** para `.ai/base/`, travando versão + `sha256` de cada item num lock.

```toml
# .ai/tars.toml — manifesto do projeto consumidor
[tars]
version = "1.0.0"
skills  = ["agent-coordination", "segtools-sdd", "segtools-writing"]
rules   = []
memory  = []                      # fatias da memória base, por tema (ex.: "git", "db")
[gates]
pre-commit = ["commit-msg", "gitleaks", "no-add-all"]
commit-msg = ["commit-msg"]
pre-push   = []
local      = ["tools/gates/meu-gate.sh"]   # do PROJETO, não entra no lock
```

O `.ai/tars.lock` guarda a versão do Tars, o commit resolvido e o hash de cada arquivo
copiado. Ele permite três coisas: idempotência (rodar de novo não reescreve nada), **detecção
de drift** (base editada à mão no projeto acusa e **não** é sobrescrita calada) e falha
**ruidosa** para item declarado que não existe no catálogo.

**O motor vem sempre**, sem declarar: `ai-memory`, `ai-layer-check`, o próprio sync
(`tars-sync.mjs`) e o motor de hooks (`tars-hooks.mjs`). O manifesto declara só as **peças** —
gates, skills, regras e fatias de memória.

## Memória em duas camadas

- **Base** (Tars, versionada, só muda por promoção) + **projeto** (a `.ai/memory/` do repo,
  onde as sessões escrevem).
- O boot lê as duas num índice; **o projeto vence a base** em caso de conflito.
- A fatia base chega marcada com `source: "base"` (o `ai-memory` do consumidor distingue a
  procedência).
- **Promoção** (`tars promote`): o caminho inverso — um item que se provou útil sobe do
  projeto para o catálogo, e entra na próxima versão que os consumidores puxarem.

## Comandos

Todos os scripts ficam em `tools/framework/`. A raiz do Tars é achada por `$TARS_HOME` ou
subindo diretórios até achar `.ai/VERSION`; passe `--tars <dir>` para forçar.

### `tars-sync.mjs` — o sync

```sh
node <tars>/tools/framework/tars-sync.mjs init     # cria .ai/tars.toml mínimo e sincroniza
node <tars>/tools/framework/tars-sync.mjs sync     # puxa o declarado para .ai/base/
node <tars>/tools/framework/tars-sync.mjs --check  # só valida base × lock (é o gate); exit 1 se inconsistent
```

- `--tars <dir>` raiz do catálogo · `--project <dir>` raiz do consumidor (default: cwd).
- Item declarado que o Tars não tem ⇒ **exit 1**, nomeando o item.
- Base editada à mão ⇒ **drift**: acusa e não sobrescreve.
- Rodar duas vezes sem mudança ⇒ nada muda (idempotente).

### `tars-hooks.mjs` — o motor de gates

```sh
node <tars>/tools/framework/tars-hooks.mjs <pre-commit|commit-msg|pre-push|local> [args do hook]
```

Lê `[gates]` do `.ai/tars.toml` e roda, **na ordem declarada**, os gates da base
(`.ai/base/gates/<nome>/`) e depois os locais. **Para no primeiro que falha**, imprime a saída
dele e sai ≠ 0. Gate declarado e ausente é falha ruidosa — um gate que some não pode virar um
commit que passa.

A ordem é deliberada: a **base primeiro** (mensagem, segredo, add amplo — comum e barato), o
**local depois** (política do projeto, que pode ser caro). O gate local só roda em `local` e
`pre-commit`; no `pre-push` (o portão caro) ele fica de fora de propósito.

O gate recebe os argumentos do hook como estão (ex.: o arquivo da mensagem no `commit-msg`),
mais `TARS_PROJECT` no ambiente, `TARS_GATE` com o nome e `TARS_GATE_PARAMS` com o JSON de
`[gates.params.<nome>]`.

### `tars-promote.mjs` — a promoção

```sh
node <tars>/tools/framework/tars-promote.mjs --area <memory|skill|gate> --item <nome> \
  [--project <dir>] [--tars <dir>]
```

Sobe um item comprovado de um projeto para o catálogo. Aceita três áreas: fato de **memória**
(vira `memory/agent/<nome>.md`), **skill** (a pasta sobe como está) e **gate local** (vira
`gates/<nome>/` com `GATE.md` mínimo para completar). **Não sobrescreve** item já existente no
catálogo — a promoção é revisada à mão. Escreve no working tree do Tars, não commita.

## Catálogo atual

### Gates (`.ai/gates/<nome>/GATE.md`)

| Gate | Hook | O que cobra |
|---|---|---|
| `commit-msg` | `commit-msg` | mensagem `<emoji> <type>(<scope>): <descrição>`, sujeito ≤ 72; `feat/refactor/perf` exigem `Lesson:`/`No-Lesson:`, `fix/hotfix` exigem `Incident:`/`No-Incident:` |
| `gitleaks` | `pre-commit` | nenhum segredo no que vai ser commitado (`protect --staged`); sem o binário, avisa alto e passa |
| `no-add-all` | `pre-commit` + `PreToolUse` de agente | nenhum `git add` amplo (`-A`/`--all`/`-u`/`.`), `git add -f` ou `git commit -a` |

Cada gate tem uma ficha curta (`GATE.md`): o que cobra, em que hook, stacks (`any`/`ts`/`python`)
e parâmetros. Os parâmetros vêm do config do projeto (`[gates.params.<nome>]`), não do catálogo.

Os gates que dependem da topologia do projeto (`layout-check`, `ds-gate`, `full-check`)
entram como **ficha apontando** — o motor é do Sofon/consumidor, o Tars só descreve o contrato.

### Skills (`.ai/skills/<nome>/`)

`agent-coordination` · `app-extraction` · `security-testing` · `segtools-frontend` ·
`segtools-database` · `segtools-sdd` · `segtools-content` · `segtools-writing` ·
`shadcn` · `migrate-radix-to-base` · e os `fabber-*` (front/api/nextjs/debug, transitórios).

### Regras, governança e guardas

- `.ai/rules/` — `overview.md` e `claude.md` (regras de topo por alvo).
- `.ai/governance/` — autoridade, precedência, `EVOLUTION.md` (auto-evolução de sessão),
  `source-of-truth.md`, `perdas-por-alvo.md`.
- `.ai/guards/` — guardas de runtime (`block-secret-dump`, `block-destructive-commands`,
  `ensure-memory-link`, `precompact-persist-state`, `sessionstart-context-digest`,
  `stop-unfinished-work`), em `.sh` com testes.
- `.ai/hooks.jsonc` · `.ai/mcp.jsonc` · `.ai/permissions.jsonc` — config fonte dos hooks, MCP
  e permissões; o `rulesync` traduz para cada ferramenta (ADR-019).

## Como um projeto novo começa

1. Aponte o Tars: `export TARS_HOME=/caminho/para/tars` (ou passe `--tars <dir>`).
2. Na raiz do projeto novo, rode `node <tars>/tools/framework/tars-sync.mjs init`. Isso cria
   `.ai/tars.toml` mínimo e `.ai/memory/`.
3. Edite o manifesto declarando o que o projeto usa (skills, gates, memória) e rode
   `tars-sync.mjs sync`.
4. Registre os hooks do projeto para chamar o motor, ex.:

   ```sh
   # .githooks/commit-msg
   exec node "$TARS_HOME/tools/framework/tars-hooks.mjs" commit-msg "$1"
   ```

> **Nota (07/10):** o manifesto gerado pelo `init` hoje traz `rules = ["base"]` e
> `memory = ["base"]` — itens que **ainda não existem** no catálogo, então o `init` falha com
> "item declarado que não existe". Até corrigirem, rode o `init`, deixe essas duas listas
> vazias (`[]`) e sincronize.

O **segtools** é o consumidor de referência: o Tars fica montado em `/projects/tars`, o
projeto aponta `TARS_HOME` para lá, declara em `.ai/tars.toml` só o que usa, e a `.ai` dele
fica com o que é **dele** — o resto vem da base.

## Roadmap

O desenho completo está em `docs/TARS.md` (fonte única). O que falta:

- **Portar os itens de alto encaixe** que ainda não subiram: `secrets.mjs` /
  `secrets-patterns.mjs` / sops + 1Password, `refs-index.mjs` (`@see`), `business-rules.py`
  (catálogo `BR-*`), `rename.py`, `verify:lock`, DISK-GUARD, a matriz `file_placement.toml`
  (o motor do `layout-check` já é do catálogo), os includes de Taskfile (`ai:*`, `secrets:*`,
  `verify:*`, `rules:*`), os templates de doc (ADR, HANDOFF, BACKLOG, DELIVERED, lessons,
  WORKING-AGREEMENT, esqueleto do AGENTS.md) e o tooling de workers (`tools/method`: `fast.py`,
  coord-watch, dispatch, agent-worktree, hooks de orçamento/recado/silêncio).
- **Médio encaixe, por demanda**: devcontainer (feature/template), CI (workflows que chamam os
  gates do manifesto), formato do `BENCHMARKS.md`, padrões por linguagem (ruff/uv, eslint/tsconfig),
  convenção de prints (`docs/reference/ux/<tema>`).
- **Fatias pendentes**: corrigir o template do `init`; `task ai:promote`; tornar a memória base
  real (fatias por tema); e a `.ai` do segtools encolher ao que é dele.

Fica **fora** do Tars, por desenho: runtime, banco, migrations, `test-db` e módulos → Sofon.
Peças, tokens e fichas → Tomo. O módulo `projects` (canal) é módulo do Sofon; o Tars fala com
ele pelo MCP.
