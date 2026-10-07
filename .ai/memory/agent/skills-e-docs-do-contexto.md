---
name: skills-e-docs-do-contexto
description: "Todo prompt de worker (e toda ação minha) carrega as skills, docs e processos do arquivo/tema tocado, e cita no delivery"
metadata:
  node_type: memory
  type: feedback
  originSessionId: f29330d0-976d-4ab3-ae60-1fb6ed52c4ae
  modified: 2026-09-30T17:18:51.794Z
---

Antes de agir em qualquer arquivo/tema, carregar TODAS as skills, documentações e processos inerentes ao contexto (ex.: banco → segtools-database + DATABASE/QUERY-LAYER; UI → segtools-frontend; issue/comentário → segtools-sdd + segtools-writing; serviço core → CORE-SERVICES; arquivo novo → file_placement.toml; sempre STANDARDS e AGENT-CONTRACT). No prompt do worker, listar explicitamente e exigir que o delivery cite quais leu e como aplicou.

**Why:** ordem do dono 30/09 ("não esqueça de sempre usar todas as skills, documentações e processos inerentes a cada arquivo/tema/contexto").

**How to apply:** checklist fixo no topo de todo `.cache/prompts/fast-*.md`. Ver [[sempre-fatiar]] e [[coordenador-so-despacha]].
