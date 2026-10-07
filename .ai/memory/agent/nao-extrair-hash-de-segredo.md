---
name: nao-extrair-hash-de-segredo
description: "Não extrair hash de segredo (chave, senha, token) por iniciativa própria, nem truncado — ordem do dono"
metadata:
  node_type: memory
  type: feedback
  originSessionId: dfff980a-7f1b-4ee9-aa17-485079159f23
  modified: 2026-09-26T20:40:22.511Z
---

Não calcular nem mostrar sha256 de segredos (chaves age, senhas, tokens, campos do 1Password) por iniciativa própria,
nem truncado. Ordem do dono, 26/09/2026, depois de eu comparar hashes de chaves age para "conferir" backup.

**Why:** hash de segredo ainda é derivado do segredo e fica no transcript; o dono não pediu e não quer.
**How to apply:** para verificar backup/igualdade de segredo, perguntar ao dono ou pedir que ele confira na ferramenta
dele; nunca rodar `... | sha256sum` sobre valor secreto. Não mexer na chave/usuário pessoal do dono (~/.config/sops,
chave age pessoal). Ver [[ordem-do-dono-e-regra]].
