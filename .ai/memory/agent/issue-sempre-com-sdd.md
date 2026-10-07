---
name: issue-sempre-com-sdd
description: "Toda issue que eu crio no canal sai com o pacote SDD (preset + AC/DEL preenchidos), mesmo criada às pressas"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 86b0a699-9e0a-4846-aa4b-e9c04e46832b
  modified: 2026-10-02T05:11:36.177Z
---

Toda issue criada por mim no canal SEG sai com o pacote SDD: `apply_sdd_preset` + itens de AC (critérios falsificáveis) e DEL (entregáveis com caminho) preenchidos a partir da descrição, seguindo `.claude/skills/segtools-sdd`.

**Why:** em 01–02/10 criei ~20 issues direto pelo `create_issue`, sem o preset; o dono abriu a SEG-809 e viu "Nenhum checklist neste item" — perguntou "onde está nosso processo SDD?". Precisou de um worker só para o backfill.

**How to apply:** depois de cada `create_issue`, na mesma rodada: `apply_sdd_preset(issue)` e `add_checklist_item` para cada critério e entregável da descrição. Vale também para subtarefas criadas por fatiamento. Relacionado: [[pedido-vira-issue-no-canal]], [[sempre-fatiar]].
