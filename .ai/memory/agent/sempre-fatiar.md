---
name: sempre-fatiar
description: Toda demanda passa pelos gatilhos de fatiamento (segtools-sdd §8) antes de ready/despacho; demanda grande nunca vai para worker
metadata:
  node_type: memory
  type: feedback
  originSessionId: dfff980a-7f1b-4ee9-aa17-485079159f23
  modified: 2026-09-29T15:42:47.123Z
---

Sempre fatiar antes de despachar: gatilhos, ordem de corte e critérios estão em `.claude/skills/segtools-sdd` §8 (aprovado pelo dono em 29/09/2026; estudo em `docs/research/fatiamento-de-demandas.md`). Fatia é subtarefa com número sequencial, nunca sufixo de letra.

**Why:** despachei a SEG-662 ("workspace e rename") inteira; voltou com 214 arquivos num commit e dado de teste trocado. O dono: "sempre fatiando, tasks grandes não".

**How to apply:** antes de cada despacho, checar os gatilhos; se algum dispara, criar as subtarefas e disparar uma por worker, em paralelo quando o write set for disjunto. Relacionado: [[prazo-10-mais-5-recorte]], [[uma-subtask-por-worker]].
