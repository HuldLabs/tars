---
name: ler-handoffs-sempre
description: "Antes de propor arquitetura, scaffolding ou decisão, ler HANDOFF.md, HANDOFF-HISTORY.md, BACKLOG e os comentários das issues do tema"
metadata:
  node_type: memory
  type: feedback
  originSessionId: dfff980a-7f1b-4ee9-aa17-485079159f23
  modified: 2026-09-29T14:39:44.882Z
---

Sempre ler os handoffs (`HANDOFF.md`, `HANDOFF-HISTORY.md`), o `BACKLOG.md` (SOFON-*, CORE-*) e os comentários de decisão das issues do tema ANTES de propor. As decisões e os pendentes do dono estão lá.

**Why:** em 29/09 propus adaptador de IA em `apps/hub/lib` e "decidir SOFON-B", mas o handoff já dizia platform PARCIAL / SOFON-B, e a SEG-33 tinha decisão do dono (27/09: "Sofon vai para o final da fila"). O dono corrigiu: "veja handoffs sempre".

**How to apply:** em qualquer pergunta de direção, fazer grep em HANDOFF*.md, BACKLOG.md e `core.issue_comments` do tema e citar a fonte na resposta. Relacionado: [[hub-e-app-de-negocio]], [[segtools-direcionamento-consolidado]].
