# Curadoria — rodada de 11/10 (delta desde 08/10)

A rodada que **estreou o formato A/B/C**: coleta por recorte (só leitura) → consolidação →
plano de release para o dono decidir. Os artefatos brutos estão nesta pasta; o método
generalizado virou `docs/curation/templates/{coleta,consolidacao}.md`.

## Artefatos

| Arquivo | O que é |
|---|---|
| `coleta-segtools.md` | recorte segtools + homelab + huldlabs + kipp + tars + sessões (413 l.) |
| `coleta-kipp-coord.md` | recorte do cache de coordenação do kipp (19 l.) |
| `coleta-seo-brain-tokenhood-fabber-endurance-lazarus-pion-tomo-sofon-dotfiles-farmegav2.md` | recorte dos 10 repos irmãos (321 l.) |
| `PLANO-RELEASE-TARS.md` | consolidação: ~80 itens → 38 deduplicados; 5 bugs, 21 regras, 6 contradições (183 l.) |

Prompts que geraram os artefatos: `/workspace/.cache/prompts/{w-curadoria-coleta,w-cur-a,w-cur-b,w-curadoria-consolida}.md`
(origem dos templates desta pasta).

## Ponteiros — os HEADs que as coletas leram

Cada coleta registrou o HEAD que leu (`FONTES/HEAD` no resumo do worker). É esse conjunto que
a rodada de 11/10 fixa; a próxima rodada lê `git diff <ponteiro>..HEAD` **por repo**.

| Repo | HEAD lido em 11/10 |
|---|---|
| tars | `7b4dce79` (2026-10-11T13:53:28-03) |
| segtools | branch `chore/ecossistema-huldlabs` |
| homelab-infra | `6c79988b` |
| huldlabs | `50638daf` |
| kipp | `a091e609` |

> Os três últimos sem ISO porque o worker só registrou o sha. A rodada de 11/10 é a **fonte
> do primeiro ponteiro real** de cada repo — antes dela o `tars curation` lia "sem ponteiro
> (estado inicial)".

## O que a rodada decidiu (o dono)

As decisões ficaram no topo do `PLANO-RELEASE-TARS.md` (§"Decisões que só o dono toma":
D-1 a D-5 — merge da branch de agente, PAT × GitHub App, layout `/srv`, sudo do bot,
fatiamento da release). Nada foi escrito fora do plano nesta rodada.
