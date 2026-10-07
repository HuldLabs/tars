---
name: deepseek-pro-so-com-pedido
description: Workers sempre no DeepSeek Flash; o Pro (FAST_MODEL=deepseek-v4-pro) só quando o dono pedir explicitamente
metadata:
  node_type: memory
  type: feedback
  originSessionId: 86b0a699-9e0a-4846-aa4b-e9c04e46832b
  modified: 2026-10-02T19:30:29.747Z
---

Todo despacho de worker usa o **DeepSeek Flash** (padrão do `fast.py`). O **Pro** (`FAST_MODEL=deepseek-v4-pro[1m]`) só sai quando o dono pede explicitamente naquela tarefa.

**Why:** 02/10 o dono pediu o Pro para uma análise adversarial; depois eu lancei o bench SEG-836 também no Pro por conta própria, e o saldo do DeepSeek acabou (402). O dono: "agora tudo é flash… a regra é só lance Pro quando eu pedir explicitamente".

**How to apply:** nunca setar `FAST_MODEL` para o Pro sem pedido explícito na tarefa; um pedido anterior de Pro não vale para a próxima tarefa. Relacionado: [[coordenador-so-despacha]].
