# Perdas por alvo — camada de IA (`rulesync`)

Fonte: `.ai/` (ADR-019 rev. 2). O `rulesync` traduz para cada ferramenta; nem todo
conceito existe em todo alvo. Este arquivo declara a **perda** de cada tradução, para
ninguém supor que a guarda/permissão chegou onde não chegou.

Gerado por `task ai:generate`; confira com `node tools/framework/ai-layer-check.mjs`.

| Alvo | Regras | Skills | Hooks | MCP | Permissões |
| --- | --- | --- | --- | --- | --- |
| Claude Code (`.claude/settings.json`) | `CLAUDE.md` | `.claude/skills/` | 4/4 eventos | `.mcp.json` | `permissions.allow` (9) |
| Codex CLI (`.codex/`) | `AGENTS.md` | `.codex/skills/` | 4/4 eventos | `.codex/config.toml` | **só read/edit/write/webfetch** |
| OpenCode (`opencode.jsonc`) | `AGENTS.md` | `.opencode/skills/` | plugin JS | `opencode.jsonc` (`mcp`) | `permission.bash` |

## Perdas declaradas

- **Codex CLI — permissões `bash`.** O Codex só entende as categorias
  `read/edit/write/webfetch`; a categoria `bash` (as 9 regras de `git *`/`docker *`)
  é **descartada** com aviso no generate. No Codex o agente **não** tem a allowlist de
  shell que o Claude Code tem. (`Codex CLI permissions support only read/edit/write/webfetch categories. Skipping: bash`)
- **OpenCode — hooks sem matcher.** `preCompact` e `sessionStart` não têm superfície com
  matcher no OpenCode (`experimental.session.compacting` / `session.created` não expõem
  valor para casar); o **matcher é descartado** e os eventos viram plugin JS
  `.opencode/plugins/rulesync-hooks.js`. A guarda roda, mas para **todo** disparo, não
  só `manual|auto` / `startup|resume|clear|compact`.
- **Codex/OpenCode — hooks apontam para `./.ai/guards/`**, não para `$CLAUDE_PROJECT_DIR`
  (só o Claude Code ancora a variável). O caminho é relativo à raiz do projeto.
- **`.mcp.json` (Claude Code) é escrito pelo rulesync** (feature `mcp`, target
  `claudecode`) e sai **sem o campo `type`** — idêntico em conteúdo ao que o coordenador
  usa hoje. Não editar à mão: o `ai-layer-check` reprova drift.

## Fora do rulesync (não é perda, é escopo)

- Os **testes** dos guards (`test-*.sh`) e o `lib-json.sh` ficam em `.ai/guards/`;
  nenhuma ferramenta os gera — são a prova dos guards, não config de ferramenta.
- O **git hook** (`.githooks/pre-commit`) não é gerado pelo rulesync: ele roda o
  equivalente de `block-secret-dump` sobre o **conteúdo do stage** (ver o passo (2b) do
  pre-commit). O guard de comando destrutivo não tem equivalente de arquivo — ele julga
  uma **ação**, não um blob.
