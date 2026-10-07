---
name: buscar-dentro-do-container
description: "Busca no repo segtools = rg dentro do container (docker exec segtools-dev rg), nunca Grep/Glob pelo caminho \\\\wsl.localhost (lento)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: f29330d0-976d-4ab3-ae60-1fb6ed52c4ae
  modified: 2026-09-30T17:50:02.881Z
---

Buscar no repo segtools sempre por `MSYS_NO_PATHCONV=1 docker exec -u 1000 -w /workspace segtools-dev git grep -n ...` (o container NÃO tem rg). Regra também embutida no POP do `tools/method/worker/fast.py` (30/09). Grep/Glob/grep pelo caminho `\\wsl.localhost\...` atravessa o 9P Windows↔WSL e leva segundos a minutos; dentro do container é milissegundos.

**Why:** dono reclamou 30/09 que as buscas "demoram horrores".

**How to apply:** Read de um arquivo conhecido pode ser pelo caminho UNC; varredura (grep/glob/find) sempre no container. Ver [[skills-e-docs-do-contexto]].
