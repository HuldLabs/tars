---
name: nomes-dos-pacotes
description: Pacotes à parte do ecossistema - DS = Tomo, camada de IA = Tars, framework = Sofon
metadata:
  type: project
---

Decisão do dono (07/10): o DS sai como pacote à parte chamado **Tomo** (Tomoko, o sófon com rosto em *O Problema dos
Três Corpos*: a face do Sofon) e a camada de IA como pacote à parte chamado **Tars** (robô modular de *Interstellar*).
O framework continua **Sofon**. O seo-brain consome os dois pacotes.

**Why:** projetos fora do framework (seo-brain Python+React, thood Python+Jinja) precisam do DS e da camada de IA sem
adotar o Sofon inteiro.

**How to apply:** BACKLOG `DS-TOMO` e `AI-TARS`. Nomes soltos `tomo`/`tars` ocupados no npm; usar escopo. Ver
[[sofon-green-start]], [[camada-ai-agnostica]].
