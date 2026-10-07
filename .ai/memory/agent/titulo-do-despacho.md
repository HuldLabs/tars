---
name: titulo-do-despacho
description: "Na barra lateral do app, o título de cada despacho de worker leva a key E o título da issue, não só a key"
metadata:
  type: feedback
---

A descrição do Bash de despacho (`run_in_background`) aparece como título na barra lateral de tarefas do app. O dono
pediu (28/09) que ela traga a key e o título curto da issue, ex.: `SEG-277 · Checklist em abas com % e progresso`,
em vez de `Dispatch SEG-277`.

**Why:** com vários workers rodando, só a key não diz ao dono o que cada um faz.
**How to apply:** todo `fast.py` despachado em background usa `description: "SEG-N · <título curto da issue>"`;
comandos auxiliares longos também descrevem o que fazem em palavras. Ver [[modo-fast-ativo]].
