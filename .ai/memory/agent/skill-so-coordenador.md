---
name: skill-so-coordenador
description: Só o coordenador edita skills (.claude/skills/**); worker propõe o texto no delivery
metadata:
  node_type: memory
  type: feedback
  originSessionId: dfff980a-7f1b-4ee9-aa17-485079159f23
  modified: 2026-09-29T11:17:44.751Z
---

Worker nunca corrige skill. Só o coordenador edita `.claude/skills/**`. Quando uma issue pede mudança de skill, o worker escreve o texto proposto no comentário de delivery e o coordenador aplica e commita.

**Why:** decisão do dono (29/09, item A2 da tabela de decisões): skill é regra de processo e fica com o coordenador.

**How to apply:** prompts de worker que tocam skill trazem "deixe o texto no delivery que eu aplico"; não pedir permissão de escrita em skills para worker. Relacionado: [[coordenador-so-despacha]].
