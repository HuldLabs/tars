---
name: pop-do-board-no-worker
description: "POP do board — todo worker assume a issue, move para in-progress, e ao entregar move para delivered e sai de responsável; fica no fast.py"
metadata:
  node_type: memory
  type: feedback
  originSessionId: dfff980a-7f1b-4ee9-aa17-485079159f23
  modified: 2026-09-26T22:21:49.259Z
---

POP (procedimento operacional padrão) do board, ordem do dono em 26/09/2026: ao começar, o worker faz `assign` para si,
`move` para in-progress e comenta progress; ao entregar, comenta delivery, `move` para delivered e tira a si de
responsável; se parar sem entregar, `move` para blocked e sai de responsável. Está embutido em `tools/method/worker/fast.py`
(commit 972ec6b), não no prompt de cada tarefa. Também embutido o POP de qualidade (commits 8f26464, 908620e): ler as
skills que tocam a área (frontend, database, sdd, writing, content), STANDARDS, o design system, docs/GIT.md; reusar
átomo/molécula do DS antes de criar; R1 nos benchmarks; marcador BR; commit só com `git commit -- <arquivos>`.

**Why:** sem isso o board nunca fica atualizado (In progress aparecia com 0 com 6 workers rodando); o dono não quer que
o coordenador corrija isso à mão.
**How to apply:** regra de processo vai para o script/POP, nunca para correção manual; ao ver o board divergir do que
roda, corrigir a causa no dispatcher. Ver [[modo-fast-ativo]], [[ordem-do-board-e-prioridade]].
