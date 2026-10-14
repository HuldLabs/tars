# Doutrina: onde mora cada tipo de conhecimento

A fronteira entre **memória durável**, **cursor de sessão** e **fila** não estava escrita em
lugar nenhum — e por isso os três se contaminavam: regra permanente enterrada num HANDOFF,
estado de sessão promovido a memória, fila tratada como histórico. Escrever a fronteira é o
que impede a perda (o conhecimento que só existe no cursor morre com a sessão) e a poluição
(o cursor que virou depósito de regra não é lido por ninguém).

Origem (R1): curadoria 14/10, `coleta-segtools` 7.1 — a prática é do segtools
(`.ai/memory/` como memória durável, `HANDOFF.md` como cursor, `BACKLOG.md` como fila); aqui
entra só a **regra** explícita.

## A tabela (a régua)

| Conhecimento | Onde mora | Prazo | Quem lê |
|---|---|---|---|
| **Fato/regra durável** (vale depois desta sessão e depois do próximo projeto) | `.ai/memory/` — `operational-memory.jsonl` (curado, com schema e gate) e `agent/*.md` (preferências e correções do dono, uma por arquivo) | permanente; sai por decisão explícita, não por idade | o boot do agente e todo worker |
| **Cursor/estado de sessão** (onde parei, o que fiz hoje, como retomar) | `HANDOFF.md` (e o bloco de retomada do canal) | morre quando a sessão fecha; o que sobreviver é **promovido**, não copiado | quem retoma a sessão |
| **Fila** (o que fazer a seguir, o que está bloqueado) | `BACKLOG.md` e o tracker | até ser feito, fechado ou explicitamente abandonado | quem despacha e quem puxa |
| **Incidente** (falhou, com causa e correção) | `.ai/memory/incident-ledger.jsonl` (+ `LEDGER-INDEX.md`) | permanente; a recorrência vira item de fila | `tars doctor` e a retrospectiva |

## As três regras que a tabela implica

1. **Regra que vale amanhã nasce na memória, nunca no cursor.** Uma lição escrita só no
   `HANDOFF.md` desaparece na sessão seguinte — e some **sem erro**, que é o pior modo.
   Ao notar que o cursor está acumulando regra, promova: a linha vira entrada de memória
   (com `source_refs`) e o cursor só aponta para ela.
2. **Estado que só vale hoje não vira memória.** Memória é para o que se lê **depois**;
   "estou no passo 3" não é fato durável, é cursor. Promover isso enche a memória de ruído
   datado e a leitura de boot perde valor.
3. **A mesma informação não mora em dois lugares (R3).** Se ela está na memória, o cursor e
   a fila **apontam** — nunca repetem o texto. Duas cópias divergem, e a divergência é lida
   como duas verdades.

## O teste rápido (na dúvida, pergunte o prazo)

*"Se a sessão fechar agora e alguém retomar amanhã, isto ainda precisa existir?"*

- **Precisa, como regra** → memória (`.ai/memory/`).
- **Precisa, como "onde paramos"** → cursor (`HANDOFF.md`).
- **Precisa, como "o que falta"** → fila (`BACKLOG.md`/tracker).
- **Não precisa** → não escreva; ou é descartável (`.cache/`), e o descartável tem lugar
  próprio.
