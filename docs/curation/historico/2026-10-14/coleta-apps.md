# Coleta (fase 1, só leitura) — recorte APPS: kipp, tomo, sofon, pion, nexus

Rodada **2026-10-14** · métodо: `docs/CURATION.md` (Tars) · template: `docs/curation/templates/coleta.md`.
Tars lido na branch de curadoria (a rodada 13/10 das memórias do agente do segtools **não** é remapeada aqui).
SÓ LEITURA: nada commitado, nada editado fora deste arquivo.

## Sumário da medição

| repo | ponteiro usado | HEAD lido | commits no delta | itens de conhecimento |
|---|---|---|---|---|
| kipp | `772d236` (11/10) | `772d236` | 0 (HEAD == ponteiro) | 0 |
| tomo | `48408fe` (11/10) | `48408fe` | 0 (HEAD == ponteiro) | 0 |
| sofon | `a5c6d95` (11/10) | `a5c6d95` | 0 (HEAD == ponteiro) | 0 |
| pion | `01163d5` (11/10) | `01163d5` | 0 (HEAD == ponteiro) | 0 |
| nexus | `cf86b2d` (13/10, amostra) | `cf86b2d` | 0 | 0 |

## Itens

Nenhum item a coletar nesta rodada — **delta vazio por construção** (ver Nota metodológica).

## Nota metodológica (achado operacional — vai ao coordenador)

1. **Ponteiro do `.ai/curation.json` é POR REPO.** `.ai/curation.json` guarda `repos.<nome>.sha`. Os valores
   listados no cabeçalho da rodada (slot `tdelta-apps`) vieram do Tars e **não** valem para os outros repos:
   `772d236` existe só no kipp; `48408fe` só no tomo; `a5c6d95` só no sofon; `01163d5` só no pion; `cf86b2d` só
   no nexus. Aplicar o sha do kipp em tomo/sofon/pion dá `fatal: bad revision` (é o que aconteceu na primeira
   tentativa e faz a rodada parecer "sem delta" por erro de comando, não por ausência de conhecimento).
2. **Os 5 repos do recorte estão no próprio ponteiro.** HEAD de kipp/tomo/sofon/pion == o sha da rodada de 11/10;
   HEAD do nexus == o sha da amostra de 13/10. Logo `git diff <ponteiro>..HEAD` é vazio e não há o que ler.
3. **Consequência para o ponteiro novo:** como HEAD == ponteiro, a rodada **leu por inteiro** o que andou (nada).
   Os 5 podem ser marcados `--reviewed` (nenhum delta perdido); o status `reviewed` do nexus troca de
   "amostra (inventario 13/10) — NAO avanca" para a rodada de 14/10 — mas **sem ganho de leitura** (o repo
   não andou). Se o critério for "amostra não avança de verdade", mantenha nexus como está e registre o motivo.

## HEAD lido de cada repo (ponteiro novo, após revisão)

```
kipp   772d23639da2eec1c349d69a46821dca336df5e8
tomo   48408fedd4143ddd98408377ad9baf02fe4f2194
sofon  a5c6d9555e31af05dde38aee24f3a6e96307fe89
pion   01163d572c4d565423c35f68c4f11b01fe7cf32c
nexus  cf86b2dd07710db26b28235f5cba865f3cccbf3b
```

## Não lido

- **Fontes de conhecimento inteiras** de kipp/tomo/sofon/pion: já lidas na rodada de 11/10 (coleta A/B/C +
  consolidação) — não relidas aqui, e sem delta desde então (nada a reler).
- **Fontes de conhecimento inteiras do nexus:** **não lidas** (a rodada 13/10 foi inventário por amostra).
  Mas o repo não teve commit desde então, então o delta é vazio — a lacuna é do inventário, não desta rodada.
- Trailers `Lesson:`/`Incident:` do `git log --since=` não foram varridos: sem commits no delta, não há de onde
  tirar.
