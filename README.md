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

O Tars faz parte do **ecossistema HuldLabs** — ver o perfil da organização:
<https://github.com/HuldLabs>. Cada peça é um catálogo e o projeto instala só o que usa.

| Peça | Papel | Repo |
|---|---|---|
| **Tars** | como a gente trabalha | [HuldLabs/tars](https://github.com/HuldLabs/tars) (este repo) |
| **Tomo** | como o app aparece | [HuldLabs/tomo](https://github.com/HuldLabs/tomo) |
| **Sofon** | o que o app é (stack Next) | [HuldLabs/sofon](https://github.com/HuldLabs/sofon) |
| **Pion** | o que o app é (stack Python) | [HuldLabs/pion](https://github.com/HuldLabs/pion) |
| **Kipp** | como o trabalho anda | [HuldLabs/kipp](https://github.com/HuldLabs/kipp) |

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

**`rules/principles` é a regra de boot de todo consumidor:** o sync a leva para
`.ai/base/rules/principles.md` e o adaptador a põe no **topo** do arquivo de boot gerado
(`AGENTS.md`/`CLAUDE.md`) — os mantras (R1–R4, KISS, SSOT, hooks, idempotência…) valem em
qualquer sessão, em qualquer projeto.

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

Há **um ponto de entrada** (`tools/framework/tars.mjs`), e ele só **despacha** para o módulo
dono de cada área — nada de lógica nova ali (R3). A raiz do Tars é achada por `$TARS_HOME` ou
subindo diretórios até achar `.ai/VERSION`; passe `--tars <dir>` para forçar.

```sh
tars init                          # cria .ai/tars.toml mínimo e sincroniza
tars sync                          # puxa o declarado para .ai/base/
tars check                         # só valida base × lock (o gate); exit 1 se inconsistente
tars hooks <pre-commit|commit-msg|pre-push|local> [args]   # roda os gates do hook
tars promote --area <memory|skill|gate> --item <nome>      # sobe item do projeto ao catálogo
tars curation [--advance] [--json]                         # rotina por ponteiro (docs/CURATION.md)
tars doctor [--json]                                       # confere doutrina × gate × prova
tars verify <arquivo>                                      # roda os `verify` de um bloco de claims
tars secrets refresh                                       # abre o cofre (1Password) e regrava o cache cifrado
tars secrets exec -- <cmd...>                              # roda <cmd> com o cache decifrado no env SO do filho
tars secrets check                                         # julga chave/template/cache/ambiente SEM abrir o cofre
```

#### `tars secrets` — o cofre do projeto

O que antes era reinventado por consumidor (caminho fixo, token no `.env`) mora aqui, uma vez.
O **1Password é a fonte canônica**; o dia a dia lê um **cache local cifrado** (sops+age) fora do
repo.

**Três camadas, merge campo a campo** (a mais forte que declara o campo vence):

| camada | onde | o que carrega |
| --- | --- | --- |
| **embutido** | no Tars | só estrutura, nomes de campo e **caminhos locais** `~/.config/tars/<projeto>/` (Windows `%APPDATA%\tars\<projeto>\`). **Nenhuma ref `op://` e nenhuma identidade** — identidade não viaja no catálogo. |
| **perfil** | `~/.config/tars/profile.toml` (Windows `%APPDATA%\tars\profile.toml`), **fora do repo** | as refs **pessoais**: `age_key_ref` (a chave age — ref pronta ou `age_key_ref_pattern`), `bot`, `allowed_signers` — dentro de `[secrets]`. Um perfil por máquina. |
| **projeto** | `.ai/tars.toml` `[secrets]` | sobrescreve o perfil **campo a campo** (o que o projeto não declara segue vindo do perfil). |

Comando que precisa de uma ref que **nenhuma** camada declarou falha alto **nomeando o campo** —
nada de fallback mudo. `tars secrets check` mostra a **camada de origem** de cada ref
(`refs  age_key_ref=perfil(padrao) bot=nenhum allowed_signers=projeto`), nunca o valor.

**Ref por projeto (o padrão).** A chave age é **de cada projeto**, então o perfil declara um
**padrão** com o único placeholder `{projeto}` — resolvido pelo nome do diretório do projeto —
em vez de uma ref fixa por máquina:

```toml
# ~/.config/tars/profile.toml — refs do usuário (fora de repo; o projeto nunca o versiona)
[secrets]
age_key_ref_pattern = "op://secrets/{projeto}/age/age.key"  # `{projeto}` OBRIGATÓRIO: sem ele todos dividem a chave
# bot / allowed_signers são POR PESSOA: seguem como ref pronta
```

O padrão **sem `{projeto}`** falha alto (senão todos os projetos dividem a mesma chave). Um
`age_key_ref` **pronto** — no perfil ou no `.ai/tars.toml` — vence o padrão.

```toml
# .ai/tars.toml — o projeto sobrescreve campo a campo
[secrets]
key_scope = "project"                  # "project" (chave vem do cofre) | "machine" (gerada aqui)
source    = "automation"               # OBRIGATÓRIO: "automation" (token em arquivo) | "owner" (sessão do app 1Password)
# age_key_ref = "op://tars/age-key/ref"  # ref `op://` PRONTA da chave age — vence o padrão do perfil; obrigatório com key_scope="project", proibido com "machine"
# sops_config = ".sops.yaml"           # versionado: o `check` exige o recipient da chave nele
# age_key_file / cache_file / template / token_file — defaults em <dir do projeto>
```

`source="automation"` força `OP_BIOMETRIC_UNLOCK_ENABLED=false` no env do spawn do `op`: nesse
caminho não há dono nem leitor biométrico. Com `owner` nada é forçado — a sessão do app é do dono.

- O **template** é um env-file (`KEY=op://cofre/item/campo`) — o formato que o `op run
  --env-file` resolve. Só a ref como **valor inteiro** de `KEY=` vale: `{{ op://… }}`, `# op://…`
  e `export KEY=…` reprovam no `check` (o `op run` resolve qualquer `op://` do arquivo).
- `refresh` é o **único** que abre o cofre: `op read --out-file` (nunca pelo stdout) para a chave
  — relida a **cada** refresh com `key_scope="project"` (a chave no cofre pode ter rodado) —,
  `op run --env-file` do template (o helper serializa o env resolvido em JSON, então valor
  **multilinha** sobrevive), `sops` para o recipient → cache. Erros do `op`/`sops` **aparecem**
  (redigidos: valor de segredo conhecido vira `***`), nunca `>/dev/null`.
- No início do `refresh`, texto claro deixado por um refresh **morto** em `os.tmpdir()` é
  reapeado — por **PID**, então o dir de um processo vivo é preservado.
- `exec -- <cmd>` decifra **em memória** e roda o filho por **argv, sem shell** — um `;` no
  argumento é dado, não sintaxe. Remove `OP_*`/`SOPS_AGE_KEY` do env do filho e exporta só
  `SOPS_AGE_KEY_FILE` (o caminho).
- `check` **não** abre o cofre: julga chave (0600/ACL) × recipient do cache × `.sops.yaml`, o
  **token** (`source="automation"`: existe, não vazio, `0400`/`0600`/ACL — o conteúdo nunca é
  lido além de "está vazio"), o template (cada `op://` **só** como valor inteiro de `KEY=op://…`
  — nem em comentário, nem no meio, nem em `{{ }}`, nem `export` — porque o `op run` resolve
  qualquer `op://` do arquivo), se o cache decifra e se o ambiente já está sujo. A linha `ambiente` acusa só
  o que aponta para a fonte (`OP_SERVICE_ACCOUNT_TOKEN`, `OP_CONNECT_TOKEN`, `OP_CONNECT_HOST`,
  `OP_SESSION_*`, `SOPS_AGE_KEY`), sempre imprimindo só **nomes**. A linha `refs` mostra a
  **camada** de cada ref (`embutido | perfil | projeto`), nunca o valor.
- A ref da chave age vem **só das camadas** (perfil/projeto) — nunca do template; `check` reprova
  se o template a citar. Nenhuma saída carrega valor de segredo, nem em erro.

### Sem Node — o binário `tars`

O consumidor pode ser um repo **só Python** (uv/venv), sem Node. Por isso o Tars se compila
num **binário único**, com o runtime embutido:

```sh
bun run build   # bun build --compile tools/framework/tars.mjs --outfile dist/tars
```

`dist/tars` (Linux x64) responde aos mesmos subcomandos **sem Node instalado** — é o que o
README, os hooks e os projetos consomem: o comando neutro `tars`, não o nome de um script. O
`dist/` fica no `.gitignore` (o binário vai para **Release**, não para o Git).

```sh
export TARS_HOME=/caminho/para/tars     # ou --tars <dir> em cada comando
"$TARS_HOME/dist/tars" init
```

Quem **já tem Node** pode chamar o mesmo arquivo direto — é equivalente:

```sh
node <tars>/tools/framework/tars.mjs sync
```

### Por dentro: os módulos

Cada área mora no seu módulo; o ponto de entrada só roteia para eles.

#### `tars-sync.mjs` — o sync

```sh
node <tars>/tools/framework/tars-sync.mjs init     # cria .ai/tars.toml mínimo e sincroniza
node <tars>/tools/framework/tars-sync.mjs sync     # puxa o declarado para .ai/base/
node <tars>/tools/framework/tars-sync.mjs --check  # só valida base × lock (é o gate); exit 1 se inconsistent
```

- `--tars <dir>` raiz do catálogo · `--project <dir>` raiz do consumidor (default: cwd).
- Item declarado que o Tars não tem ⇒ **exit 1**, nomeando o item.
- Base editada à mão ⇒ **drift**: acusa e não sobrescreve.
- Rodar duas vezes sem mudança ⇒ nada muda (idempotente).

#### `tars-hooks.mjs` — o motor de gates

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

Um gate pode ser **condicional ao ator** (`when = { actor = "agent" }`): roda só quando quem
escreve é o agente. O `commit-msg` traz `lesson = "agent"` — o `Lesson:` passa a ser cobrado só
do agente; commit humano não paga a lição. **Para isentar o commit humano**, declare
`[gates.params.commit-msg] lesson = "agent"`. O ator é decidido pelo motor (`tars-actor.mjs`):
`TARS_ACTOR` no env do harness (o `tars sync` já declara `agent` no `.claude/settings.json`) ou
o trailer `Co-Authored-By:` nomeando modelo. `when` com nome errado **falha alto** — nunca
pula o gate calado.

#### `tars-doctrines.mjs` — o `doctor`

```sh
node <tars>/tools/framework/tars-doctrines.mjs [--tars <dir>] [--project <dir>] [--json]
```

A **doutrina é dado**: cada regra que a gente diz seguir declara a **fonte** onde está escrita
(`arquivo:linha`), o **gate** que a aplica, a **prova** que a falsifica e **onde** ela roda.
O par vive em `.ai/doctrines.toml` (catálogo) e na seção `[[doctrine]]` do `.ai/tars.toml` do
projeto — que **vence pelo `id`**.

```toml
[[doctrine]]
id     = "git/branch-name"          # <tema>/<slug>; é a chave de dedup
fonte  = "docs/GIT.md:44-54"        # onde a regra está ESCRITA
gate   = ".ai/base/gates/commit-msg"  # quem APLICA (`"nenhum"` + `motivo` = órfã nomeada)
prova  = "node ... --validate-branch 'sem-tipo'"   # comando que REPROVA
onde   = "pre-push"                 # pre-commit | commit-msg | pre-push | session-start | ci
```

O `doctor` roda cada `prova` e classifica: **OK** (a prova reprova — a regra é cobrada),
**PHANTOM** (a prova passa: nada distingue quem segue de quem ignora), **SEM GATE** (órfã
declarada com motivo — aviso), **DRIFT** (a fonte sumiu ou a linha saiu do texto). Sai ≠ 0
quando há PHANTOM ou DRIFT; doutrina de outro projeto sai **PROJETO** (o doctor roda lá).
`gate = "nenhum"` é obrigatório declarar: doutrina sem gate deixa de ser esquecimento e vira
dívida nomeada.

#### `tars-verify.mjs` — o `verify`

```sh
node <tars>/tools/framework/tars-verify.mjs <arquivo|-> [--cwd <dir>] [--json]
```

O `doctor` cobra a **doutrina**; o `verify` cobra a **entrega**. O bloco de entrega vira dado —
uma claim por linha — e cada uma é **re-executada** contra a árvore:

```
claim: o adapter sobe no host do MCP | verify: node x.mjs | expect: [DERIVED] rc=0
claim: o parser cobre o caso vazio  | verify: node y.mjs | expect: /^ok$/ | verify-negativo: node -e "process.exit(1)"
```

- `claim:` — o que se afirma ser verdade (texto livre).
- `verify:` — o comando que um **terceiro** roda (shell, `--cwd` como base).
- `expect:` — a saída literal que o comando deve conter (**substring**), ou `/regex/`. Vazio =
  só o exit 0 importa.
- tag — `[VERIFIED]` / `[DERIVED]` / `[ASSUMED]` / `[UNKNOWN]`, no `claim:` ou no `expect:`.
  Ausente = `[UNKNOWN]`, o mais fraco: **bloqueia incondicional** ("saída não rodada nesta
  sessão nunca conta como `[VERIFIED]`").
- `verify-negativo:` — o comando que **deve falhar** no alvo (INV-IAC-1). Um "rodou sem erro"
  não distingue quem convergiu de quem nunca testou o alvo certo.

O `verify` sai ≠ 0 e nomeia o motivo (um PHANTOM por claim não provada):

- **PHANTOM** — o `verify` falhou, ou a saída não casa o `expect`, ou o campo falta.
- **NEGATIVO** — claim de "corrigido/testado" sem nenhuma prova negativa no bloco.
- **ASSUMED** — mais de 3 claims `[ASSUMED]` (as que passam do teto reprovam).
- **UNKNOWN** — claim sem tag, mesmo que o `verify` passe.

Proveniência: fabber `ai-layer-benchmark.md:250-270` (vocabulário de tags) e
`architectural-premises.md:75-115` (INV-IAC-1). `-` lê o bloco da entrada padrão.

#### `tars-promote.mjs` — a promoção

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
| `commit-msg` | `commit-msg` | mensagem `<emoji> <type>(<scope>): <descrição>`, sujeito ≤ 72; `feat/refactor/perf` exigem `Lesson:` (1 linha) ou o bloco de 4 campos (`erro/porque/causa raiz/correcao`), `fix/hotfix` exigem `Incident:` **em 4 campos** (`causa raiz` ≠ `porque`) ou `No-Incident:` |
| `gitleaks` | `pre-commit` | nenhum segredo no que vai ser commitado (`protect --staged`); sem o binário, avisa alto e passa |
| `no-add-all` | `pre-commit` + `PreToolUse` de agente | nenhum `git add` amplo (`-A`/`--all`/`-u`/`.`), `git add -f` ou `git commit -a` |

Cada gate tem uma ficha curta (`GATE.md`): o que cobra, em que hook, stacks (`any`/`ts`/`python`)
e parâmetros. Os parâmetros vêm do config do projeto (`[gates.params.<nome>]`), não do catálogo.

Os gates que dependem da topologia do projeto (`layout-check`, `ds-gate`, `full-check`)
entram como **ficha apontando** — o motor é do Sofon/consumidor, o Tars só descreve o contrato.

### Skills (`.ai/skills/<nome>/`)

`agent-coordination` · `app-extraction` · `security-testing` · `segtools-frontend` ·
`segtools-database` · `segtools-sdd` · `segtools-content` · `segtools-writing` ·
`shadcn` · `migrate-radix-to-base` · `daneel` (identidade de automação do ecossistema) ·
`senior-research` (pesquisa com fonte datada) · `backup-restore` (backup só é real quando
restaura) · `telemetria` (capacidade core por hook; OTel como plugin) · `iac` (infra por
ficha) · e os `fabber-*` (front/api/nextjs/debug, transitórios).

O inventário de acessos da Daneel é **gerado**: `tars acessos daneel [--out <arquivo.md>]`
(GitHub, 1Password por nome, hosts SSH, ferramentas) — read-only e barrado por padrão de segredo.

### Regras, governança e guardas

- `.ai/rules/` — `overview.md`, `claude.md` (regras de topo por alvo) e `ambiente.md`
  (**nunca cruzar sistemas de arquivos** — repo e ferramenta do mesmo lado).
- `.ai/governance/` — autoridade, precedência, `EVOLUTION.md` (auto-evolução de sessão),
  `source-of-truth.md`, `perdas-por-alvo.md`, `novo-repo.md` (o **método de nascer repo**).
- `.ai/governance/novo-repo.md` — **como nasce um repo/app novo do ecossistema** (8 passos:
  criar no GitHub, README com papel + origem do nome, BACKLOG no commit inicial, `tars init`
  + `tars sync`, `0.0.1-dev.1` + CHANGELOG, ADRs, registro no `huldlabs`, repo irmão).
  Modelos em `templates/` (`README.tpl.md`, `BACKLOG.tpl.md`).
- `.ai/guards/` — guardas de runtime (`block-secret-dump`, `block-destructive-commands`,
  `ensure-memory-link`, `precompact-persist-state`, `sessionstart-context-digest`,
  `stop-unfinished-work`), em `.sh` com testes.
- `.ai/hooks.jsonc` · `.ai/mcp.jsonc` · `.ai/permissions.jsonc` — config fonte dos hooks, MCP
  e permissões; o `rulesync` traduz para cada ferramenta (ADR-019).

**Bug do Tars reportado vira release.** A regra vale para todo consumidor e mora em
`.ai/rules/principles.md` (boot): quem achar um bug no Tars (ou no `tars sync`/hook/gate)
**reporta** no `BACKLOG` do tars com **repo, data e reprodução** — o bug **entra na próxima
release** e o `CHANGELOG` **lista os reportados que fechou**. Contorno local é temporário e fica
como dívida nomeada; report sem reprodução vira "a confirmar", nunca dívida infinita.

## Como um projeto novo começa

Ponha o `tars` no PATH (o binário de Release, o script do catálogo ou `$TARS_HOME/dist/tars`) —
o comando é o mesmo nos três casos; o projeto consumidor **não precisa de Node**.

1. Aponte o Tars: `export TARS_HOME=/caminho/para/tars` (ou passe `--tars <dir>`).
2. Na raiz do projeto novo, rode **`tars init`**. Isso cria `.ai/tars.toml` mínimo e
   `.ai/memory/`. Sem instalar nada, num repo só Python:

   ```sh
   env -i PATH=/usr/bin:/bin "$TARS_HOME/dist/tars" init
   ```
3. Edite o manifesto declarando o que o projeto usa (skills, gates, **guards**, memória) e
   rode `tars sync`. Além de trazer o declarado para `.ai/base/`, o `sync` **gera o wiring
   do harness** — `<projeto>/.claude/settings.json` com `PreToolUse`/`SessionStart`/
   `PreCompact`. O `PreToolUse` chama **só os guards declarados** em `[tars].guards`; um
   guard que `source`a um irmão (ex.: `block-destructive-commands` → `lib-json.sh`) traz o
   irmão junto — sem ele o guard morreria com `jget: command not found` e **liberaria** o
   comando. O `settings.json` é gerado: não se edita à mão.
4. Registre os hooks de projeto (git) para chamar o motor, ex.:

   ```sh
   # .githooks/commit-msg
   exec tars hooks commit-msg "$1"
   ```

   O `tars` tem que estar no PATH do hook. Sem ele, use o caminho absoluto do binário:
   `exec "$TARS_HOME/dist/tars" hooks commit-msg "$1"`. Quem preferir Node chama o script
   direto: `exec node "$TARS_HOME/tools/framework/tars-hooks.mjs" commit-msg "$1"`.


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
- **Fatias pendentes**: `task ai:promote`; tornar a memória base
  real (fatias por tema); e a `.ai` do segtools encolher ao que é dele.

Fica **fora** do Tars, por desenho: runtime, banco, migrations, `test-db` e módulos → Sofon.
Peças, tokens e fichas → Tomo. O módulo `projects` (canal) é módulo do Sofon; o Tars fala com
ele pelo MCP.
