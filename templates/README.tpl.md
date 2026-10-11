# <Nome da peça>

<!-- Papel em uma linha: o que ela faz no ecossistema, sem adjetivo. Ex.: "Mensageria do
     ecossistema HuldLabs: tudo que fala com uma pessoa, um sistema ou um agente fora da tela." -->
<Papel em uma linha>

## O nome

<!-- OBRIGATÓRIO. Qual obra, qual personagem, e o que ele DESCREVE (o paralelo com o papel). -->
Em *<obra>*, <personagem> <o que faz>. <Como isso descreve o papel desta peça.>

## O que faz

- <superfície/contrato principal>
- <o que planeja / entrega / guarda>
- <a fonte única que ela é>

Não faz: <o que é de outro dono, para a fronteira ficar explícita>.

## Formas (ADR-0002 do `huldlabs`)

<!-- Preencha só o que se aplica; apague o resto. -->
- **Binário portátil**, com HTTP, CLI e MCP; publica o próprio manifesto (`GET /manifest`).
- **Standalone** (app do ecossistema) ou **plugado** num app pelo adaptador do hospedeiro.
- **Dados:** SGBD próprio ou compartilhado, com schema, role e prefixo próprios.

## Fases

1. <menor caso que prova o contrato (R4)>
2. <...>

## Decisões

`HuldLabs/huldlabs`: `adr/NNNN-<slug>.md` (e o `adr/` deste repo quando for decisão própria).
Resumo e fila: `BACKLOG.md`.
