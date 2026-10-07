---
name: uma-subtask-por-worker
description: "Trabalho maior que 10 min vira subtasks no canal; cada worker despachado roda na sua própria subtask, nunca dois na mesma issue"
metadata:
  node_type: memory
  type: feedback
  originSessionId: dfff980a-7f1b-4ee9-aa17-485079159f23
  modified: 2026-09-28T22:48:05.530Z
---

Tarefa que passaria de 10 min não vira prompt grande nem "3 partes num worker": vira **subtasks** da issue no canal, e cada worker é despachado com `--issue` na SUA subtask. Nunca dois workers na mesma issue.

**Why:** em 28/09 fui juntando partes num prompt só e os prazos subiram de 10 para 40 min; ao dividir, pus dois workers na SEG-442, que dividem a pasta de sessão do fast.py. O dono lembrou que subtask existe justamente para refinar task maior.

**How to apply:** antes de despachar, se o escopo não cabe em 5–10 min → `create_issue` subtask (pai = a issue) por parte → um despacho por subtask, em paralelo quando os write sets não se cruzam. Ver [[modo-fast-ativo]].
