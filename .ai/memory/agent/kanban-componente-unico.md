---
name: kanban-componente-unico
description: "Quadro Kanban é um componente só (dnd-kit + board-drag.tsx); drag, zonas e reorder são do componente, nunca por tela"
metadata:
  node_type: memory
  type: feedback
  originSessionId: dfff980a-7f1b-4ee9-aa17-485079159f23
  modified: 2026-09-29T12:24:56.391Z
---

O quadro Kanban do segtools é um componente único e genérico: `@dnd-kit` + `apps/hub/components/board-drag.tsx`. Board, configuração de colunas e qualquer outra tela o reusam, fornecendo só os dados e o callback de drop. Zonas por status, reordenar colunas, destaque de drop e fantasma são do componente.

**Why:** o dono corrigiu duas vezes em 29/09. Primeiro, a tela de configuração de colunas (SEG-578) nasceu como componente próprio, com alças ⠿ decorativas. Depois, a SEG-576 foi pedida "no board" e não no componente.

**How to apply:** em qualquer issue de quadro, o prompt manda usar ou estender `board-drag.tsx` e proíbe outro drag. A revisão reprova lógica de drag presa a uma tela. Relacionado: [[prints-do-dono]].
