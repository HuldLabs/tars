# Curadoria — rodada de 13/10

Esta rodada **não é uma coleta A/B/C**. Ela é a **primeira medição pelo ponteiro**: rodar o
`tars curation` e ler o delta — que é como a rotina funciona daqui em diante (§2 de
`docs/CURATION.md`). As fases 1 (inventário), 1b (mapa item a item) e 2 (absorção/release
0.0.1-dev.16/dev.17) rodaram entre 13 e 14/10.

## O que foi lido nesta rodada

**Leitura completa e ética (avança o ponteiro):** as **memórias do agente do segtools**
(`/workspace/.ai/memory/agent/*.md`) — 21 entradas novas desde o ponteiro de 11/10
(`03e9363d`, 13/10 14:28Z). É o delta real lido por inteiro.

**Amostra, não leitura (NÃO avança ponteiro):** o inventário de `tars-inventario.md`
construído a partir das fases 1/1b — mapa de *pontos de checagem*, com `file:line` das
fontes. Amostra não é leitura: o ponteiro só avança sobre o que foi **lido inteiro**.

## Fontes desta rodada (fora do Tars)

| Fonte | O que é | Entra no Tars? |
|---|---|---|
| `estudos/2026-10-13-tars-inventario.md` | inventário do delta por repo (amostra) | não (mapa, não conteúdo) |
| `estudos/tars-curadoria-2b/*.md` | mapas item a item das fases 1b | não (mapa, não conteúdo) |

Os mapas ficam **onde estão** (repo `huldlabs`, é onde o dono lê o plano). O que sobe ao
catálogo é a **metodologia** (`docs/CURATION.md`) e o **histórico** das rodadas — nunca o
mapa bruto, que envelhece a cada rodada.

## Lição desta rodada (vira regra)

**Ponteiro só avança sobre leitura inteira.** Uma rodada que olhou só uma amostra não pode
gravar o HEAD lido — senão o delta entre a amostra e a leitura completa desaparece para
sempre. É a correção feita no `tars curation --advance` (ver §5 de `docs/CURATION.md`).
