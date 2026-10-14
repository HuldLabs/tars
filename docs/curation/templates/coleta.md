# Curadoria do ecossistema → Tars, fase 1: COLETA (só leitura). Recorte: REPOS_DO_RECORTE

> **Template reaproveitável.** Portado de `/workspace/.cache/prompts/w-curadoria-coleta.md` (curadoria de 11/10).
> Preencher `REPOS_DO_RECORTE` e `SAIDA`; nada de dado de projeto no corpo do template (R1/AGENTS).

Protocolo: `<TARS>/EVOLUTION.md` e `source-of-truth.md` (leia). Objetivo do dono: todo o ecossistema com o mesmo
contexto e sem repetir erro — tudo que foi aprendido/decidido em qualquer repo e é **GENÉRICO** sobe ao Tars; o
específico fica no repo. Última curadoria: `<SHA do ponteiro>` (`<pasta>`, `.ai/memory` e `.ai/governance`).
Colete o que entrou **DEPOIS** disso.
SÓ LEITURA: nada de commit, edição em repo, push. Saída: `SAIDA/coleta-<recorte>.md`.
Fontes por repo do recorte: `.ai/memory/**` (agent/*.md, operational-memory.jsonl, incident-ledger.jsonl), HANDOFF*,
BACKLOG*, DELIVERED*, `docs/**/*lessons*`, `docs/decisoes*`, ADRs, `docs/estudos`, trailers `Lesson:`/`Incident:` do
`git log --since=<data>`.
Para cada item: fonte (arquivo:linha ou commit), data, tipo (lição | decisão | regra | contexto | armadilha), texto
curto, e classificação: **genérico→Tars** (vale para qualquer projeto), **ecossistema→org** (decisão transversal da
org), **projeto** (fica onde está). Para os genéricos: já **COBERTO** no Tars (cite arquivo:linha), **PARCIAL** ou
**FALTANDO**.
Marque **CONTRADIÇÕES** entre repos (duas memórias que dizem coisas diferentes sobre o mesmo layout, por exemplo).
Registre, no fim, o **HEAD lido de cada repo** (`FONTES/HEAD`) — é o que a rodada seguinte usa como ponteiro.
