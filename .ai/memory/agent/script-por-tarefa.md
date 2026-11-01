---
name: script-por-tarefa
description: Script e mensagem de commit temporarios tem nome por tarefa; nunca reusar .s.sh/.m
metadata:
  node_type: memory
  type: feedback
  originSessionId: 65ff40fe-91f7-48bc-9d9a-037d1577a889
  modified: 2026-11-01T19:30:26.086Z
---

Cada tarefa usa arquivos temporarios com nome proprio (`.s-<tarefa>.sh`, `.m-<tarefa>`), e o script confere a mensagem certa (`grep -q "<titulo>" ../.m-<tarefa>`) antes de commitar.

**Why:** em 01/11/2026, reusar `.s.sh`/`.m` falhou 3 vezes: o Write recusava por "modificado desde a leitura", o script antigo rodava no lugar e quase commitou com a mensagem do corte da dev.30.

**How to apply:** ao escrever script de commit/merge no container, nomeie pelo branch; `set -euo pipefail`; confira a mensagem e a mudanca esperada antes do commit.
