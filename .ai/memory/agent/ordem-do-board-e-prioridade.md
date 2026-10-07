---
name: ordem-do-board-e-prioridade
description: "No segtools a ordem do board é a prioridade — ler da direita para a esquerda, de cima para baixo; terminar antes de começar"
metadata:
  node_type: memory
  type: feedback
  originSessionId: dfff980a-7f1b-4ee9-aa17-485079159f23
  modified: 2026-09-26T22:49:22.120Z
---

Princípio scrum do dono (26/09/2026): toda lista nasce priorizada; o topo é mais prioritário, e a coluna mais à direita
vem antes. O board se lê da direita para a esquerda, de cima para baixo. Mantra: "pare de começar, comece a terminar".

**Why:** a ordem é a própria expressão da prioridade; o campo priority é atributo, não substitui a ordem.
**How to apply:** ao escolher o próximo trabalho ou listar pendências, fechar primeiro o que está mais à direita
(delivered → revisar, in progress → terminar) antes de puxar item novo do backlog. Regra registrada na SEG-156 #286.
Ver [[papeis-po-coordenador]].
Escopo (dono, 26/09): a leitura de prioridade vale só para status das categorias `todo` e `doing` (as 3 categorias
base do Jira: todo/doing/done); tudo em `done` (Concluído, Cancelado etc.) fica fora.
