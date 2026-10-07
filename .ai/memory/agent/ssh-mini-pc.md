---
name: ssh-mini-pc
description: "Ler repos do mini PC (thood) por SSH do Windows, nunca pelo drive X: (cross-filesystem)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 86b0a699-9e0a-4846-aa4b-e9c04e46832b
  modified: 2026-10-06T19:17:14.227Z
---

O thood mora no mini PC `hermes`: `ssh pablo@10.0.0.200`, repo em `/projects/thood`. A chave está no SSH do Windows (o do WSL não tem). Para trazer arquivos: `ssh ... "tar czf - ..." | wsl.exe -d Ubuntu-24.04 -- bash script.sh` extraindo em `.cache/`.

**Why:** o dono corrigiu (06/10): X: é `\\10.0.0.200\projects` via SMB, cross-filesystem Windows×WSL, lento.
**How to apply:** qualquer leitura do mini PC → SSH; ver [[nao-cruzar-filesystems]].
