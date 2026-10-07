---
name: nao-cruzar-filesystems
description: Nunca operar arquivos do repo cruzando Windows↔WSL (\\wsl.localhost ou /mnt/c|d); tudo dentro do devcontainer/WSL
metadata:
  type: feedback
---

O repo mora no ext4 do WSL. Toda operação sobre ele — ler, editar, criar, buscar (rg/grep/find), instalar dependência, rodar teste, build, watcher, git em massa — roda **do mesmo lado**: `docker exec -u node -w /workspace segtools-dev ...` (ou um shell do WSL). Nunca a partir do Windows via `\\wsl.localhost\...`, nem do WSL via `/mnt/c` ou `/mnt/d`. Vale para o agente em sandbox também.

**Why:** regra do dono (03/10): "várias vezes tivemos inúmeros problemas de lentidão extrema e IO alto porque estávamos cruzando ambientes". O caminho cruzado passa pelo 9P/DrvFs: boot do e2e > 240 s no 9p contra 45 s no ext4 (`docs/WSL-MIGRATION.md`), symlink de `node_modules` quebrado, watcher sem eventos (Round 14). Eu mesmo cruzo: minhas ferramentas de arquivo (Read/Write/Edit) rodam no Windows sobre `\\wsl.localhost`.

**How to apply:** busca e operação em massa sempre por `docker exec` (já é a regra [[buscar-dentro-do-container]]); Read/Write/Edit do host só para arquivo pontual e pequeno; script que gera muitos arquivos roda no container; prompt de worker já roda no container (fast.py). Host Windows só para o que é dele: app desktop, navegador, o symlink da memória ([[uv-sempre]] vale nos dois lados).
