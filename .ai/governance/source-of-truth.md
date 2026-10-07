# Fonte de verdade

A camada de IA tem **4 camadas** (ADR-019 rev. 2). Este arquivo é a **camada 1
(conteúdo)** — junto com `rules/`, `skills/` e `memory/` — e responde "quem manda
quando duas instruções discordam".

**Fonte × gerado:** só `.ai/**` é fonte. `AGENTS.md`, `CLAUDE.md`, `.claude/**`,
`.agents/**`, `.opencode/**`, `.mcp.json`, `opencode.jsonc` e `.codex/**` são
**saídas geradas** pelo `rulesync` via `task ai:generate`. Editar a saída em vez da
fonte é violação de camada; o drift reprova no gate.

## Precedência (ordem normativa)

Quando instruções conflitam, aplique esta ordem:

1. `.ai/rules/*.md`
2. `.ai/governance/*.md`
3. `.ai/skills/*/SKILL.md`
4. `.ai/memory/README.md`
5. `docs/**` fora de `.ai/`, quando não conflitar com o acima

As saídas geradas (item 5 do boot, `AGENTS.md`/`CLAUDE.md`/`.claude/**` etc.) **nunca
são normativas**: são espelho da fonte, não degrau da escada.

## Regras adicionais

- `CLAUDE.md`, `.claude/**`, `.agents/**`, `.opencode/**`, `.mcp.json`,
  `opencode.jsonc` e `.codex/**` são **pontes de runtime** (geradas, finas,
  descartáveis); **nunca** são fonte de autoria. Escrever neles editando a ponte é
  violação de camada — a fonte é o arquivo correspondente em `.ai/`.
- Arquivo de plano/arquivo histórico **nunca** sobrepõe a camada ativa.
- `.ai/skills/**` é a única fonte editável das skills; cada destino do render
  (`.claude/skills`, `.agents/skills`, `.opencode/skills`) é ponte.
- Skills de terceiros (camada 4) entram pelo lockfile (`rulesync.jsonc > sources` +
  `.ai/skills.lock.json`), nunca por cópia à mão.
- Toda divergência (drift) entre ponte e fonte é reprovada por
  `tools/framework/ai-layer-check.mjs` e se corrige regerando (`task ai:generate`).

## Envelopes de boot

- **Envelope 1** (sempre carregado, estável): invariantes e a ordem acima. Vem
  primeiro para maximizar acerto de cache.
- **Envelope 2** (por sinal de tarefa): contexto profundo carregado só quando a
  tarefa pede — skills, governança detalhada, histórico. Mecanismo portado do
  tokenhood (`82bb63c`).

## Estado da camada (02/10/2026)

A camada está ingerida: 4 camadas, precedência acima, skills migradas (SEG-843),
gate de drift no pre-commit (SEG-844), runtime/guards (SEG-845) e catálogo por
lock (SEG-846). `VERSION` = `1.0.0` (a camada, não o app).
