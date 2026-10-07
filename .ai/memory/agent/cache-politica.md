---
name: cache-politica
description: Descartável só em .cache/ (INV-CACHE-1/2/3); nunca commitar .cache, nem com git add -f; nada na raiz nem no host
metadata:
  type: feedback
---

Tudo o que é descartável (saída de rodada, export, PoC, cache de ferramenta) mora em `.cache/` — invariantes INV-CACHE-1/2/3 em `docs/INVARIANTS.md`, gate em `config/file_placement.toml:6`. `rm -rf .cache/` tem de ser seguro a qualquer momento; estado de verdade fica no Postgres ou em arquivo versionado fora de `.cache/`. Ferramentas são redirecionadas para lá (ESLint, Vitest, TS buildinfo). Nada descartável na raiz do repo nem em pasta do host.

**Nunca commitar `.cache/`** (só `.cache/.gitkeep` e `.cache/README.md` são versionados) — nem com `git add -f`.

**Why:** regra do dono (02/10). Em 02/10 workers commitaram arquivos de `.cache/backfill` e `.cache/varredura` três vezes forçando o add; removidos em b7e7810c e 190f671b.

**How to apply:** prompt de worker diz "saída em `.cache/`, não commite"; revisar `git show --stat` de cada commit de worker procurando `.cache/`; o guard destrutivo deve recusar `git add -f` de caminho ignorado (pendente). Relacionado: [[uv-sempre]].
