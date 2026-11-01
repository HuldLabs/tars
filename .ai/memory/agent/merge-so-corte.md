---
name: merge-so-corte
description: Só o PR de corte de versão espera o merge do dono; o resto o coord mergeia como Daneel
metadata:
  node_type: memory
  type: feedback
  originSessionId: 65ff40fe-91f7-48bc-9d9a-037d1577a889
  modified: 2026-10-14T20:50:38.301Z
---

O dono aprova (mergeia) **só o PR de corte de versão**. Todo outro PR — correção com `No-Release`, doc, BACKLOG, HANDOFF — eu mergeio como Daneel (`gh pr merge` no container, conta `daneel-bot`), com os gates verdes e a prova no corpo do PR. Regra escrita em `.ai/governance/release.md` §Papéis.

**Why:** 14/10/2026 o dono disse "só preciso aprovar PR de corte, o resto é com você e Daneel".
**How to apply:** não peça merge ao dono fora do corte; antes do merge, confira que o PR não foi mergeado já (ele pode mergear antes do meu último push — o #37 perdeu um commit assim). Relacionado: [[versao-e-lote]].
