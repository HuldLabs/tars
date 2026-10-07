---
name: sofon-green-start
description: "Decisões do dono 06/10 sobre o Sofon green start, apps base web-next/web-jinja, init com escolha de front e ordem da fila"
metadata:
  node_type: memory
  type: project
  originSessionId: 86b0a699-9e0a-4846-aa4b-e9c04e46832b
  modified: 2026-10-06T19:17:10.501Z
---

Decisões do dono em 06/10/2026:
- segtools incuba; SEG-33 copia o kernel SEM .git para ~/projects/sofon; apps consomem @sofon/*. O scaffold Copier que o DeepSeek fez no sofon é descartado.
- Sofon nasce com dois apps base finos: `apps/web-next` (extraído do apps/hub) e `apps/web-jinja` (Python nativo, ideia do thood e figma-kiwi; consumidor seo-brain). Lógica do app base em pacote; mesmo contrato (OpenAPI/read models) e mesmos tokens.
- `sofon init` pergunta o front: next, jinja ou nenhum (nenhum prova que o kernel não puxa front).
- `apps/hub` será renomeado para `apps/segtools-web` depois da cópia do kernel.
- Diretório do app vem de `[app].dir` no config.toml (fonte única).
- Ordem: SEG-33 (hub fora do kernel → f2b → f4/f5 → copiar kernel) → web-next → renomear → fila DS (docs/research/ds-front-benchmark) → web-jinja → seo-brain.

**Why:** seo-brain deve nascer do Sofon; separar framework de negócio.
**How to apply:** estado vivo em HANDOFF.md (topo); ver [[ssh-mini-pc]].
