# Camada de IA — `.ai/`

`.ai/` é a **fonte canônica** da camada de IA deste repositório. Nada normativo fora de `.ai/`:
os arquivos que os agentes carregam no boot (`AGENTS.md`, `CLAUDE.md`,
`.claude/**`, `.agents/**`, `.opencode/**`) são **pontes geradas** e finas, nunca a
segunda fonte de verdade.

Arquitetura completa: **`docs/adr/adr-019-camada-ai-canonica.md`** (rev. 2).

## As 4 camadas (ADR-019 rev. 2)

| # | Camada | O que é | Onde vive |
|---|---|---|---|
| 1 | **Conteúdo** | A verdade: regras, governança, skills, memória, hooks, MCP, permissões | `.ai/**` (este diretório) |
| 2 | **Tradução** | Compila o conteúdo para o formato que cada ferramenta entende | `rulesync.jsonc` + `task ai:generate` |
| 3 | **Runtime** | Guardas que rodam de fato na sessão (bloqueiam comando destrutivo, vazamento de segredo) | `.ai/guards/`, e as saídas `.claude/settings.json`, `.mcp.json`, `opencode.jsonc`, `.codex/` |
| 4 | **Catálogo** | Skills de terceiros, instaladas por lockfile (nunca cópia à mão) | `.ai/skills.lock.json` + `task ai:skills:*` |

## Mapa de pastas

| Pasta | Papel | Fonte? |
|---|---|---|
| `rules/` | Regras de topo por alvo (`root: true`), inclui a ponte de boot | **fonte** |
| `governance/` | Autoridade, precedência, segurança de escrita, memória, perdas por alvo | **fonte** |
| `skills/` | Skills do projeto (`<nome>/SKILL.md`); as de terceiros entram pelo lock | **fonte** |
| `memory/` | Memória operacional não-secreta (JSONL + ledger) | **fonte** |
| `sessions/` | Continuidade entre sessões (ponteiros) | **fonte** |
| `guards/` | Scripts de guarda (pre-commit e hooks de sessão) + testes | **fonte** |
| `hooks.jsonc` `mcp.jsonc` `permissions.jsonc` | Config dos hooks, MCP e permissões — insumo das saídas por alvo | **fonte** |
| `skills.lock.json` | Commit resolvido + `sha256` das skills de terceiros | gerado/verificado |
| `VERSION` | Versão da camada (SemVer) | **fonte** |

## Precedência (ordem normativa)

Quando instruções conflitam, vale a primeira da lista:

1. `.ai/rules/*.md`
2. `.ai/governance/*.md`
3. `.ai/skills/*/SKILL.md`
4. `.ai/memory/README.md`
5. `docs/**` fora de `.ai/`, quando não conflitar com o acima

## Fonte × gerado

- **Fonte (à mão):** tudo em `.ai/` — regras, governança, skills, memória, guards, as três
  configs `.jsonc` e o `VERSION`.
- **Gerado (nunca editar à mão):** `AGENTS.md`, `CLAUDE.md`, `.claude/skills/**`,
  `.agents/skills/**`, `.opencode/skills/**`, `.claude/settings.json`, `.mcp.json`,
  `.codex/**`, `opencode.jsonc`. Para mudar qualquer um deles, mude a fonte em `.ai/` e
  rode `task ai:generate`.
- **Regra dura:** saída gerada **não se edita**. O gate `ai-layer-check` (drift) reprova
  qualquer saída versionada que divirja da fonte.

## Comandos

| Comando | O que faz |
|---|---|
| `task ai:generate` | Traduz `.ai/` para as saídas geradas (rulesync) |
| `task ai:check` | Gate: estrutura + drift da camada (roda `node tools/framework/ai-layer-check.mjs`) |
| `task ai:skills:restore` | Restaura `.ai/skills/` pelo commit travado no lock |
| `task ai:skills:update` | Resolve de novo a ref do upstream e atualiza o lock |
| `task ai:skills:check` | Valida `.ai/skills/` contra o lock (divergência = falha) |

## Princípios de boot

Porte do tokenhood (`82bb63c`) — o boot é caro, então é enxuto e cacheável:

- **Envelope 1 — estável:** invariantes e esta ordem de precedência, sempre carregados.
- **Envelope 2 — dinâmico:** contexto profundo só quando a tarefa pede (por sinal).
- **Ordem estável→dinâmico:** o que não muda vem primeiro, para maximizar acerto de cache.
- **Orçamento de boot:** o envelope 1 tem teto; o que incha vira Envelope 2.
- **`VERSION`:** versiona **a camada**, não o app (SemVer).

## Catálogo de skills de terceiros (ADR-019 rev. 2, camada 4)

Skills que não são nossas entram por **instalador com lockfile**, nunca por cópia à mão. A lista
é declarada em **`rulesync.jsonc > sources`** (a fonte única); o commit resolvido e o `sha256` do
conteúdo de cada skill ficam em **`.ai/skills.lock.json`**; o destino é **`.ai/skills/<nome>/`**.

| Comando | O que faz |
|---|---|
| `task ai:skills:restore` | Restaura `.ai/skills/` pelo commit travado no lock (AC-02: apagar e restaurar dá hash igual) |
| `task ai:skills:update` | Resolve de novo a ref do upstream, atualiza o lock e refaz as skills |
| `task ai:skills:check` | Valida `.ai/skills/` contra o lock (divergência = falha) — é o gate |

O fetcher é `tools/framework/ai-skills-sync.mjs`. Ele fala direto com a API do GitHub
(`git/trees` + `git/blobs`) porque o `rulesync install` **corrompe binários**: o decode dele
passa o conteúdo por UTF-8 e cada byte ≥ 0x80 vira U+FFFD (o PNG `89 50 4e 47` chega como
`EF BF BD 50 4E 47`). A API devolve base64 fiel — é o que usamos. Sem `GITHUB_TOKEN`/`GH_TOKEN`
(o `gh auth token` serve), a API pública funciona no limite anônimo.

**Adicionar uma skill do catálogo.** Acrescente a entrada em `rulesync.jsonc > sources` — por
exemplo `{ "source": "dono/repo", "path": "skills", "skills": ["minha-skill"] }` — e rode
`task ai:skills:update`, depois `task ai:generate`.

**Remover.** Tire o nome da lista `skills` (ou a entrada inteira) em `rulesync.jsonc`, apague a
pasta `.ai/skills/<nome>/` e rode `task ai:skills:update` para o lock refletir a lista nova.

## Versão

`VERSION` versiona **a camada**, não o app (SemVer, porte do tokenhood `3.4.0`).
