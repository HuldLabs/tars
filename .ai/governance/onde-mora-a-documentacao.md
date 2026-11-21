# Doutrina: onde mora cada tipo de documentação

Complementa `onde-mora-o-conhecimento.md` (memória, cursor, fila e incidente). Aquela diz onde mora o **estado do
trabalho**; esta diz onde mora o **documento**. Origem: nutrelu, 21/11/2026 (decisão do dono), duas pesquisas na web
(spikes e modelos de documento) e o levantamento do kerr, kerr-crawler, farmega.v2, segtools e do próprio Tars.

## 1. Separar por público

| Pasta | Público | Responde |
|---|---|---|
| `docs/` | quem **usa** | como usar, funções, FAQ, referência pública (ex.: `docs/contracts/openapi.json`) |
| `docs/product/` | quem **define** (o dono, como PO) | o que o produto faz, para quem e com que regras |
| `docs/engineering/` | quem **constrói** | como, decidido, medido e provado |
| raiz | operação | `README`, `BACKLOG` (fila), `HANDOFF` (cursor), `CHANGELOG`; lidos pelos guards do Tars, não mudam de lugar |

Precedente: GitLab (`doc/` e `doc/development/`); Rust, Go e Kubernetes separam o uso das propostas de desenho.
Quando a documentação de uso virar site, o gerador exclui `docs/engineering/` e `docs/product/`.

## 2. `docs/engineering/`: uma pasta por pergunta

| Pasta | Pergunta | Muda? | Modelo |
|---|---|---|---|
| `adr/` | o que decidimos e por quê | só por ADR nova que a substitui | `templates/ADR.tpl.md` |
| `research/` | o que os outros dizem ou fazem (fonte externa, com data) | não | `templates/RESEARCH.tpl.md` |
| `knowledge/` | o que é verdade no domínio, conferido contra a fonte | sim, é viva | — |
| `spikes/sN-slug/` | isto funciona aqui? (relatório no `README.md`, código ao lado) | não | `templates/SPIKE.tpl.md`, índice `templates/SPIKES-INDEX.tpl.md` |
| `bench/NNN-slug/` | quanto mede, de forma repetível | a cada rodada | `templates/BENCH.tpl.md` |
| `rfc/` | mudança em produção (*Request for Change*, ITIL) | até ser executada e revisada | `templates/RFC.tpl.md` |
| `postmortems/<id do ledger>.md` | anexo longo de incidente do produto em produção | não | `templates/POSTMORTEM.tpl.md` |

`docs/product/` recebe a marca, `business-rules.md` (regras com id estável `BR-<ÁREA>-NNN`, citadas pelos testes que
as provam, padrão segtools/kerr) e `features/` (uma ficha por funcionalidade).

## 3. Regras

1. **Um nome, um lugar.** Incidente e erro conhecido moram **só** no `.ai/memory/incident-ledger.jsonl`: a linha é o
   episódio, `classe` é o problema (ITIL *problem*), `destino` o item que o fecha, `contorno` o que fazer até lá
   (ITIL *known error*). Não existem pastas `incidents/` nem `problems/`. O postmortem é anexo, nomeado pelo id e
   apontado pelo `fonte` da linha.
2. **RFC é *Request for Change*.** Não há RFC no sentido *Request for Comments*: a ADR com status `proposto` cumpre
   esse papel. É o equivalente da GMUD (Mevo) e do GIM/FAM (Petrobras).
3. **ADR é intenção; teste é materialização.** Toda ADR `aceito` tem a seção **Confirmação**: o teste ou gate que
   prova a decisão no código (MADR 4). Quando ADR e teste divergem, vale o teste, e a divergência vira item.
4. **A spike levanta fatos; a ADR decide.** Critério de saída escrito antes de medir; prazo estourado vira
   `abortado por prazo`; o código da spike nunca é copiado para o produto (reescrito com teste; Shore, XP) e o
   produto nunca importa `spikes/`. PoC e protótipo são o campo `tipo` da spike, não pasta própria.
5. **Research → knowledge só conferido.** Uma afirmação sai de `research/` para `knowledge/` depois de conferida
   contra a fonte primária.
6. **Bench só o repetível** (regressão de desempenho), com ambiente, versões, warmup, execuções, mediana e desvio,
   baseline, fator limitante e dados brutos (Heiser, *benchmarking crimes*; Gregg, *active benchmarking*). Medição
   de uma vez fica na spike.
7. **Pasta nasce com o primeiro documento.** Ninguém cria pasta vazia "para depois".

## 4. Na matriz de colocação

O consumidor declara em `config/file_placement.toml`, antes de `python` e `shell` (a spike carrega scripts):

```toml
[[family]]
name = "spike"
paths = ["docs/engineering/spikes/"]

[[family]]
name = "bench"
paths = ["docs/engineering/bench/"]
```

E ignora as saídas geradas: `/docs/engineering/spikes/*/out/`.

## 5. Kipp e Confluence

Quando o Kipp (tarefas) e o porte do Confluence existirem, o repositório guarda o **conteúdo** que vale junto com o
código e o Kipp guarda o **trabalho** (dono, estado, aprovação), um apontando para o outro por id. Os modelos de
`templates/` servem aos dois lados, para os campos não divergirem.
