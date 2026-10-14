# Doutrina: versionamento de extracao

Toda peca que sai do core e vira independente — **Tars, Tomo, Sofon, Pion, Kipp, Lazarus,
Endurance** — nasce em `0.0.1-dev.N` e sobe a versao a cada entrega que MUDE o que o
consumidor ve. `0.0.1` diz "ainda nao e' produto"; `dev.N` e' a contagem de entregas.

## `N` conta entrega, nao commit

`N` sobe quando ha' entrega agrupavel: um defeito corrigido, uma capacidade nova, uma
doutrina. Refactor interno sem efeito no consumidor, regeneracao de indice ou ajuste de
comentario **nao** sobem `N` — e o gate aceita o escape `No-Release: <motivo>` no commit.

A contagem e' por entregas, nao por dias: duas entregas no mesmo dia sao `dev.7` e `dev.8`.

## A entrega traz as notas

Subir a versao sem dizer o que mudou repete o defeito que esta doutrina corrige: o agente
do seo-brain (07/10) gastou turnos decifrando o que tinha mudado no Tars porque o consumidor
nao tinha notas acionaveis. Cada versao leva no `CHANGELOG.md` as **4 subsecoes fixas**:

- **O que mudou** — o comportamento, nao o arquivo.
- **Por que** — o defeito ou a necessidade que obrigou a mudanca.
- **Arquivos impactados no consumidor** — o que o `tars sync` escreve na casa dele.
- **O que o consumidor faz** — o comando exato (`tars sync`, `tars upgrade-notes`).

## Fonte e espelho

`.ai/VERSION` e' a fonte; `package.json` e' o espelho. O `tars sync` grava a versao no
`.ai/tars.lock` do consumidor, e o `tars upgrade-notes` imprime SO' as notas entre a versao
do lock e a atual — quem ja' esta' na ultima nao le' nada.

## Quem cobra

`.ai/gates/release-guard` (pre-commit): commit que toca o motor (`tools/framework/tars-*.mjs`,
`.ai/gates/`, `.ai/guards/`, `.ai/governance/`) sem subir `.ai/VERSION` E sem entrada no
`CHANGELOG.md` e' REPROVADO.

## D18 — extraido nasce versionado

**Toda peca extraida nasce versionada (`0.0.1-dev.N`) e toda mudanca VISIVEL no consumidor
sobe o `N`.** Nao existe "depois a gente versiona": a peca que sai do core sem versao ja'
nasce com divida e o consumidor nao tem como saber o que mudou.

- **O gatilho e' a VISIBILIDADE, nao o commit.** Mudanca que o consumidor ve' (arquivo que o
  `sync` copia, comportamento de comando, contrato de gate) sobe o `N`; refactor interno sem
  efeito no consumidor nao sobe — o escape `No-Release: <motivo>` fecha esse caso.
- **A versao e' a do CATALOGO, nao a do app.** O `VERSION` versiona a **camada** que o
  consumidor puxa, nunca o app que o consome (o app tem o versionamento dele). Duas pecas
  extraidas do mesmo core recebem numeros independentes.
- **Extrair ja' e' entregar.** No mesmo commit em que a peca nasce, ela nasce com a versao
  inicial e a entrada no CHANGELOG; peca sem versao e' a divida que o proximo consumidor paga
  sem saber.
- **O consumidor trava a versao no lock** (`.ai/tars.lock`): a versao viaja com os hashes do
  que ele instalou, e `tars upgrade-notes` imprime so' o delta desde o lock — versionamento
  sem notas acionaveis repete o defeito que esta doutrina corrige.

## Como a versao vira Release

O processo inteiro (PR final, merge do dono como aval, tag, workflow, conferencia,
aviso e atualizacao dos consumidores) esta' em `release.md`.
