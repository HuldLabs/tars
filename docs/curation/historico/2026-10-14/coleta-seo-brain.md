# Curadoria do ecossistema → Tars, rodada de DELTA 14/10 — COLETA (só leitura). Recorte: seo-brain

Protocolo: `docs/CURATION.md` (passo 1 — medir o delta) + `docs/curation/templates/coleta.md`.
Ponteiro de entrada: `a5b40d7` (13/10 22:21Z, rodada de 13/10 — **amostra, não avançou**).
Recorte: **só fontes de MÉTODO**. `research/kb` de SEO (SERP, anti-bot, keyword) = **domínio**, não método.

## Delta medido

```sh
git -C /projects/seo-brain diff --stat a5b40d7..HEAD -- \
  .ai/memory HANDOFF* BACKLOG* AGENTS.md '*lessons*' LEARNINGS* docs/estudos estudos \
  docs/adrs adr docs/research skills docs/kb/metodologia
```

| arquivo | Δ |
|---|---|
| `AGENTS.md` | +1 |
| `docs/adrs/ADR-006-cliente-projeto-mercado.md` | +25/-8 (v3) |
| `docs/research/convencoes-coletor.md` | **novo**, +33 |
| `skills/seo-serp-snapshot-intel/monitor/ledger.py` | +33/-2 |
| `skills/seo-serp-snapshot-intel/scripts/serp_capture.py` | +24/-4 |
| `skills/seo-serp-snapshot-intel/scripts/serp_crawl.py` | +46/-14 |

**7 commits** em 14/10 (todos entre 01:29Z e 02:22Z), nenhum em `.ai/memory`, `HANDOFF`, `BACKLOG`,
`*lessons*`, `LEARNINGS`, `docs/estudos`, `estudos`, `docs/kb/metodologia`.

## Itens

| # | fonte (arquivo:linha / commit) | data | tipo | texto curto | classificação | Tars |
|---|---|---|---|---|---|---|
| 1 | `docs/research/convencoes-coletor.md:10-14` | 14/10 | **regra** | **SERP ancorada por SSOT de mercado, nunca sorteada.** `hl`/`gl`/`device`/`location` vêm de `kb.market` (`--market-id`); YAML é só seed. A anti-detecção varia **UA/viewport/tempos** — nunca o que muda o **resultado**. | **genérico→Tars** (coleta reprodutível) | **FALTANDO** — não há skill de coleta/extração no Tars que trate "parâmetro que muda o resultado ≠ parâmetro de evasão". Busca: `git grep -n -i 'uule\|ancor\|geo.target' .ai/skills` no curadoria → vazio |
| 2 | `docs/research/convencoes-coletor.md:16-17` | 14/10 | **regra** | **Stealth é o PADRÃO, não uma opção (flag).** Ninguém "liga": o caminho de captura já aplica perfil/UA/fingerprint/headers. Ligar-por-flag ⇒ alguém esquece ⇒ o caminho cru é o mais usado. | **genérico→Tars** | **FALTANDO** (mesma família do #1; a regra é "o caminho seguro é o único caminho") |
| 3 | `docs/research/convencoes-coletor.md:19-22`; `tests/test_serp_failloud.py` | 14/10 | **regra** | **Sem falha silenciosa (INV-FAIL-1):** dependência ausente ⇒ **erro nomeando o que falta**; nunca degradar para o substituto que se sabe detectável. Fallback só com env explícita **e** aviso no stderr. Resultado vazio (0 itens) é `empty`/`bloqueado`, **nunca** `ok`. | **ecossistema→org** (R4) | **PARCIAL** — `docs/STANDARDS.md` já tem R4/"falha rápida", mas **não** a regra "0 resultados ≠ sucesso" nem "fallback exige env + aviso". Candidato: extensão da skill de extração/coleta |
| 4 | `AGENTS.md:69` + `docs/research/convencoes-coletor.md` | 14/10 | **lição** | **Dependência de ambiente se DECLARA na imagem/defconfig, não se instala à mão:** Chrome real no devcontainer e na imagem de produção. Instalar com `sudo` resolve hoje e **volta no próximo rebuild**. Espelha `docs/devcontainer-lessons.md` (rounds 13-15). | **genérico→Tars** | **PARCIAL** — `.ai/rules/ambiente.md` diz "rode dentro do container", não diz "declare a dep no manifesto, não instale à mão" |
| 5 | `docs/adrs/ADR-006-...:102-107` | 14/10 | **lição/decisão** | **`registrable_domain` (eTLD+1) sai da PUBLIC SUFFIX LIST oficial, nunca de lista hardcoded** (defeito real: `SUFIXOS_COMPOSTOS` fixo — viola INV-PHIL-1); host normalizado (minúsculo + IDNA, RFC 6454 §4), `raw_host` à parte. | **genérico→Tars** | **FALTANDO** — inclusive **violação nossa**: `tools/framework/db/project-add.mjs` no segtools hardcodeda **5 TLDs** (`.com.br` `.co.uk`…). É o mesmo defeito; `packages/*` não deve depender do PSL, mas o **gate** (aviso/erro) cabe em `tools/framework/` |
| 6 | `docs/adrs/ADR-006-...:90-101` | 14/10 | **decisão** | **Escopo (host vs subdomínio vs subpasta vs URL exata) é atributo do HOST, não do projeto** (v2→v3). Enum `host\|subdomains\|subfolder\|url` (o token `root` era ambíguo entre fornecedores). Cobre N-hosts pelo mesmo schema; tipo (`simples`/`elaborado`) é **política**, não estrutura — proibido tabela por tipo. | **projeto** (domínio seo-brain; ADR-006 é local) | n/a — mas a **parte genérica** ("variantes de escopo de alvo são propriedade do alvo, não do cliente") **FALTANDO** em `docs/QUERY-LAYER.md`/DS |
| 7 | `docs/adrs/ADR-006-...:88-89` | 14/10 | **decisão** | **Protocolo/www = ORIGIN (RFC 6454):** `host` sem scheme; `protocolo` (`http\|https\|ambos`) separado. Fundir www/http-https é **decisão de produto**, não definição (a RFC desaconselha tratar registrable domain como unidade). | **genérico→Tars** | FALTANDO (junto com #5) — é a base de "o que é o MESMO alvo" |
| 8 | `skills/.../monitor/ledger.py:288-298` (6c762d9) | 14/10 | **armadilha** | **Herdar a chave de contexto do registro-pai, nunca recriar por default.** `registrar_parse` chamava `keyword_id()` com defaults (pt-BR/desktop) e colava o parse de **outro mercado** no keyword pt-BR — mesmo defeito do `hl` sorteado. Corrigido: o `keyword_id` vem do `serp_raw` coletado. | **genérico→Tars** | **FALTANDO** — família "derivar, não re-derivar de defaults" (endereça a origem do dado, não o nome) |
| 9 | `skills/.../scripts/serp_capture.py:150-178` (45c20a9) | 14/10 | **lição** | **Aqueça a ORIGEM antes do alvo profundo:** `goto` direto na URL interna é o padrão **mais** detectável; navegar a home antes põe cookies/consent e muda o veredito. (Já citado como LEARNINGS 2026-10-06 — é a **confirmação empírica** dele.) | **genérico→Tars** | **FALTANDO** — skill de extração/coleta não tem "ordem de navegação"; boa parte do ecossistema coleta atrás de login |
| 10 | `skills/.../scripts/serp_capture.py:150-153` (45c20a9) | 14/10 | **lição** | **Perfil PERSISTENTE entre tentativas** (`user_data_dir` fixo em vez de `mkdtemp` por tentativa): sessão que já viu a origem tem veredito diferente da que chega virgem. | **genérico→Tars** | **FALTANDO** (par do #9) |
| 11 | `docs/research/convencoes-coletor.md:29-32` (b3e93f9) | 14/10 | **armadilha** | **Extensão do banco (hook de plano/motor) intercepta caminho de bulk:** o hook do `pg_duckdb` intercepta `COPY ... FROM STDIN` **mesmo com `force_execution=off`** e não enxerga a temp table (`relation "_gt" does not exist`). Use `executemany` em batch; o `SET` é defensivo. Nunca **row-by-row** (round-trip por linha trava). | **genérico→Tars** (carga em massa) | **FALTANDO** — `.ai/skills/segtools-database` não tem armadilha de extensão/hook de motor nem "batch, nunca row-by-row" |
| 12 | `docs/research/convencoes-coletor.md:1-4` (199efd0) | 14/10 | **regra de forma** | **Convenções de subsistema em arquivo SSOT próprio, e o `AGENTS.md` só APONTA** (1 linha) — não repete. | **ecossistema→org** | **COBERTO** — `.ai/rules/*` + `AGENTS.md` "só o ponteiro, não duplicar" (R3). Item fechado, sem ação |
| 13 | `skills/seo-serp-snapshot-intel/**` (357 linhas) | 14/10 | **contexto** | O motor SERP (stealth, ledger, crawl, geo) é **domínio do seo-brain**; a **metodologia** extraível são os itens #1-#11. | **projeto** | n/a (registrado: não é método) |

## Contradições

Nenhuma entre repos nesta leitura. **Interna resolvida no próprio delta:** o ponteiro anterior dizia
`escopo` no **projeto**, a v3 move para **`kb.project_host`** — é a evolução, não contradição (o ADR
carrega as duas versões com a marca `(v3)`).

## O que NÃO entra (e por quê)

- **Técnica de SERP / anti-bot / parsing de SERP** (`serp_capture.py`, `serp_crawl.py` bulk, uule, NID):
  **domínio do produto**, não método — mesma regra do §3 de `CURATION.md` ("o que se porta é o método,
  nunca a técnica de domínio"). Só os **enunciados gerais** (#1, #2, #9, #10) sobem.
- **`kb.market`/`kb.geo_target`/`mercados.yaml`/`serp_default.yaml`** e nomes de tabela do seo-brain:
  dado/nomenclatura de projeto.
- **Rede/portas/hosts** do coletor: dado de projeto.
- **Contagens de performance locais** ("68k linhas em ~9s"): número de máquina, não método. O que sobe é
  a **regra** ("batch, nunca row-by-row").

## HEAD lido

| repo | HEAD lido | commits desde o ponteiro |
|---|---|---|
| `seo-brain` | `45c20a953996f2c930c93c3ad8c3494dc9b48272` | 7 (todos 14/10) |

**Cobertura:** delta lido **por inteiro** nos caminhos de conhecimento (`git diff a5b40d7..HEAD` — 6
arquivos, 136 linhas somadas). Código de produto **não** foi lido linha a linha: leu-se o **hunk que
carrega a regra** (docstrings, comentários, diffs de constante/config) — o suficiente para extrair #1-#12.
**Não lido:** o corpo dos scripts `serp_capture.py`/`serp_crawl.py` fora dos hunks; `migrations/**`,
`config/**`, `data/kb/**` (domínio/dado, fora do recorte por decisão).

## Recomendação para a fase 2 (julgar)

Os itens **#1-#5** e **#11** formam um bloco coerente — **"coleta a partir de fonte hostil"** — que hoje
não existe em nenhum bundle do Tars. R1: procurar antes em `/projects/*/.ai/skills` e no vault
`ai-brain`; se não houver, é **skill nova** (`coleta-hostil`), com #6-#10 como **extensões** de
`agent-coordination` (contexto herdado) e `segtools-database` (carga em massa).
