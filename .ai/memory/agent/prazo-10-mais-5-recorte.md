---
name: prazo-10-mais-5-recorte
description: "Worker que estoura 10 min não vai para blocked; ganha 5 min para fechar um recorte provado, reescreve o escopo e fatia o resto"
metadata:
  node_type: memory
  type: feedback
  originSessionId: dfff980a-7f1b-4ee9-aa17-485079159f23
  modified: 2026-09-29T10:37:33.469Z
---

Prazo do worker é 10 min + 5 de fechamento. Aos 10 min ele para de avançar e decide o que fecha com prova em 5 min. Esse recorte vira o escopo da issue (AC e entregáveis reescritos). O resto vira subtarefa irmã no template SDD. A entrega vai para `qa-ready`, nunca para `blocked` por prazo. O revisor julga contra a descrição recortada: recorte honesto não é FIX, mas recorte sem subtarefa do resto é FIX.

**Why:** o dono (29/09) achou o rigor anterior prejudicial. Mandar para `blocked` ao estourar o prazo perdia os 10 min e obrigava a recomeçar (SEG-568, SEG-569).

**How to apply:** a regra está embutida em `.cache/prompts/fast-seg356.md` (dev) e em `fast-review382.md` (revisor). Ao ver entrega parcial, conferir se veio com o recorte e a subtarefa irmã, sem fatiar eu mesmo depois. Relacionado: [[uma-subtask-por-worker]].
