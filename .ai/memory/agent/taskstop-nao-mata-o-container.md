---
name: taskstop-nao-mata-o-container
description: "TaskStop num `docker exec` só mata o cliente no host; o processo dentro do segtools-dev continua vivo"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 86b0a699-9e0a-4846-aa4b-e9c04e46832b
  modified: 2026-10-02T10:19:43.216Z
---

`TaskStop` numa tarefa de fundo que é `docker exec ... segtools-dev sh fila.sh` mata só o `docker exec` do host. O `sh` e os workers lá dentro continuam rodando — e continuam despachando e commitando.

**Why:** 02/10 parei duas filas de FIX com TaskStop; elas seguiram vivas no container por ~1 h, relançaram workers em issues já em `qa-done` (pareciam "rodadas fantasmas"), commitaram na SEG-382 e travaram a fila nova (o contador de `--retomar` via os órfãos).

**How to apply:** para parar uma fila/worker no container, depois do TaskStop matar os processos lá dentro (`/proc/*/cmdline` com `fila-`/`fast.py`/`claude --print` → `kill`, e `kill -9` no `fast.py` se sobrar). Relacionado: [[modo-fast-ativo]].
