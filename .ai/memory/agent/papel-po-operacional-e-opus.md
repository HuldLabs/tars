---
name: papel-po-operacional-e-opus
description: No projeto SEG o papel ai-product-owner (operação do board, liberar para ready, fechar DoR) é do opus; o dono é stakeholder/PM de ideias
metadata:
  type: project
---

Em 28/09/2026 o dono decidiu: no projeto `seg`, o papel `ai-product-owner` fica com `opus` (coordenador). Ele se vê como stakeholder e "PO de ideias", como um PM — não opera o board. Vínculo gravado via `bun scripts/projects.ts role assign seg opus ai-product-owner` (precisa `DB_HOST=host.docker.internal` e `PROJECTS_TOKEN_OPUS`).

**Why:** o preset SDD recusava com ROLE_NOT_MAPPED; o dono não quer ser gargalo operacional.

**How to apply:** eu libero itens para `ready` e fecho o DoR; decisões de produto/arquitetura continuam com o dono. Ver [[papeis-po-coordenador]].
