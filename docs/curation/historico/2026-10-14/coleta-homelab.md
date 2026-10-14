# Curadoria do ecossistema → Tars, fase 1: COLETA (só leitura). Recorte: homelab-infra

> Rodada de DELTA de 2026-10-14. Protocolo: `docs/CURATION.md` §2 (a rotina por ponteiro).
> Ponteiro de partida: `.ai/curation.json` → `homelab-infra.sha = cb8c53b` (iso 2026-10-13T18:08:37-03:00,
> marca "amostra (inventario 13/10) — NAO avanca"). HEAD lido: `363867d`.
> SÓ LEITURA: nada de commit, edição em repo ou push. Autorizado apenas este arquivo.
> Obs.: o ponteiro de 11/10 **não existe** para `homelab-infra` no `curation.json` (entra na lista de
> repos em 13/10, por amostra) — usei o único ponteiro existente, `cb8c53b`.

Objetivo do dono: todo o ecossistema com o mesmo contexto e sem repetir erro — tudo que foi
aprendido/decidido em qualquer repo e é **GENÉRICO** sobe ao Tars; o específico fica no repo.

Classificação: **genérico→Tars** · **ecossistema→org** · **projeto** (fica onde está). Para os
genéricos: já **COBERTO** no Tars (citei `arquivo:linha`), **PARCIAL** ou **FALTANDO**.

## 0. Escopo do delta medido

Caminhos de conhecimento (`CURATION.md` §2) + `AGENTS.md` + `skills` + `docs/research`:

```
git -C /projects/homelab-infra diff --stat cb8c53b..HEAD -- .ai/memory 'HANDOFF*' 'BACKLOG*' \
  'AGENTS.md' '*lessons*' 'LEARNINGS*' docs/estudos docs/adrs adr estudos docs/research skills .claude/skills
```

**Resultado: 1 arquivo** — `docs/estudos/2026-10-13-telemetria.md` (+237 linhas, §8c/§8c.6.1).
Fora dele, o delta de código (28 arquivos, +1991/−50) foi lido **apenas nos trailers de commit**,
porque as lições de método estão no corpo da mensagem (o repo não usa trailer `Lesson:`).

Commits no intervalo (16):

| commit | assunto | relevância de conhecimento |
|---|---|---|
| `378f5d0` `ecd23f3` | feat/poc telemetria (receita + Teste C) | método — itens 5-8 |
| `6a7db3f` `6f917b4` `934210b` `63fb3f9` | estudo 8c / Teste C na rc2 | método — itens 1-4 |
| `240de5b` `518aaf8` `29417f8` `ece42cd` | correções da receita (doc oficial) | método — itens 9-12 |
| `28daa62` `026edf2` | backup: app fora de `FONTE_DO_DIR` | método — itens 13-14 |
| `5c26928` `0e16124` | repos_mirror: ref ausente + rename fase 2 | método — itens 15-16 |
| `363867d` | tabela de fontes oficiais + review da PoC | fonte do item 11 |

Nada tocado em `.ai/memory/**`, `HANDOFF*`, `BACKLOG*`, `AGENTS.md`, `*lessons*`, `docs/adrs`,
`adr/`, `estudos/` no intervalo (`git log` vazio para esses caminhos).

---

## 1. Achados

| # | fonte (arquivo:linha / commit) | data | tipo | texto curto | classificação | no Tars |
|---|---|---|---|---|---|---|
| 1 | `docs/estudos/2026-10-13-telemetria.md:681-703` (§8c.1) | 13/10/2026 | armadilha | "Não existe pronto" exige medir a **tag mais nova**, não a estável: a PoC mediu o OSS `v1.0.4` (24/09) e concluiu "a recuperação é nossa"; o upstream já a tinha (`openobserve#14837`, merged 28/09) na `v1.1.0`. O §8b fica **retratado** no próprio estudo. | genérico→Tars | **PARCIAL** — `.ai/skills/senior-research/SKILL.md` cobre "data explícita por fonte" e "não encontrado explícito", mas não a regra de **versão de referência**: comparar a *última release/`main`*, não a estável, antes de declarar que falta |
| 2 | `docs/estudos/2026-10-13-telemetria.md:686-698` | 13/10/2026 | decisão | Correção de rumo feita por **retratação dentro do estudo** (bloco "⚠ Retratado pelo §8c" no topo do §8b, apontando o §8c) em vez de editar o texto antigo — o erro medido fica preservado. | ecossistema→org | **COBERTO** — `.ai/governance/EVOLUTION.md` (o delta vira a retrospectiva); vale como exemplo, não como item novo |
| 3 | `docs/estudos/2026-10-13-telemetria.md:705-716` (§8c.2) | 13/10/2026 | regra | Tabela de fontes com **data por fonte** (PR, design, release, issue, `main`, Docker Hub) — é a forma "provável" do método de pesquisa. | genérico→Tars | **COBERTO** — `.ai/skills/senior-research/SKILL.md` |
| 4 | `docs/estudos/2026-10-13-telemetria.md:738-758` (§8c.4) | 13/10/2026 | regra | Tabela de **alternativas prontas** com 5 colunas fixas: candidato · imagem/mantido? (tag + data + licença + estrelas) · faz o que preciso? · **por que não** para o nosso caso. O "por que não" é obrigatório por linha. | genérico→Tars | **PARCIAL** — `senior-research` tem o "onde procurar" (R1) e a data; falta a grelha de **decisão de adoção** (mantenedor vivo? licença? custo de peças? por que não) |
| 5 | `docs/estudos/2026-10-13-telemetria.md:826-832` (§8c.6) | 13/10/2026 | armadilha | Provar que uma **feature existe** na versão por **sonda de deserialização** (mandar o tipo errado e ler o erro explícito: `expected i64`, `expected a sequence`) — dispensa doc e vira prova no release candidate. | genérico→Tars | **FALTANDO** — não achei em `senior-research` nem em `.ai/rules/ambiente.md`. Genérico: serve para qualquer "a feature X existe nesta versão?" com só uma imagem em mãos |
| 6 | `poc/telemetria/` (tag fixa em `poc.env`; commits `ecd23f3`, `6f917b4`) | 13/10/2026 | regra | PoC **com tag fixa e volume nomeado**: trocar a versão da imagem preserva os dados da versão anterior (streams, alertas e destinos sobrevivem) → dá para medir a versão nova sem refazer o setup. | genérico→Tars | **PARCIAL** — `iac` cobre "tag fixa, nunca `latest`"; a propriedade de **PoC descartável com volume nomeado que sobrevive ao bump** não está |
| 7 | `receitas/telemetria/deploy.py` + `hosts/nuc.py:243-267` (commit `378f5d0`) | 13/10/2026 | decisão | Produção sobe só a tag **ESTÁVEL**: a ficha tem `openobserve_tag: "v1.0.4"` (**sem default** na receita) e `permitir_rc: False`; uma `-rc` só entra com o guarda ligado de propósito. Trocar de versão é mudar **uma linha da ficha**. | genérico→Tars | **PARCIAL** — `iac` e `.ai/rules/ambiente.md` não têm a regra de **canal de release** (estável por default; pré-release exige guarda explícito) |
| 8 | `docs/estudos/2026-10-13-telemetria.md:868-880` (§8c.6.1) | 13/10/2026 | armadilha | Motor de alerta avalia a **condição sobre o resultado**: `select count(*)` devolve UMA linha (valor 0) mesmo sem log na janela, e "houve linha" conta como satisfeito → **falso disparo** que nunca vira `false`. Fix: `having count(*) >= 1` (devolve ZERO linhas). | genérico→Tars | **FALTANDO** — `.ai/skills/telemetria/SKILL.md` (absorvido na fatia 2) cobre dedup/alertas, mas não o padrão `agregado sempre devolve linha` × `having` |
| 9 | `docs/estudos/2026-10-13-telemetria.md:874-878` | 13/10/2026 | armadilha | **Nunca escrever `now()` no SQL do alerta**: o otimizador **congela a constante** no plano (`extract(epoch from now())` virou o literal `1791928806170840.5`) e a janela para de andar. Quem janela é o `period` do motor (ele injeta `_timestamp >= agora - period`). | genérico→Tars | **FALTANDO** |
| 10 | `docs/estudos/2026-10-13-telemetria.md:880-882` | 13/10/2026 | regra | **Folga entre janela e ciclo**: `period:1`/`frequency:1` deixa o tick atrasado ("skipped due to delay", 5-6 s sob carga) escapar da janela; `period:2` cobre ≥1 tick com folga e fecha o par disparo/resolução limpo. | genérico→Tars | **FALTANDO** — generaliza para qualquer job/collector "janela ≤ período de varredura é frágil" |
| 11 | `docs/estudos/2026-10-13-telemetria.md:883-890`; commit `363867d` | 13/10/2026 | regra | **Ler a doc oficial antes de codar e revisar o que a PoC inventou**: variável inventada (`ZO_*` inexistentes) sai; caminho binário/default dir da imagem só se confirma no Dockerfile oficial (`otelcontribcol` ≠ `otelcol-contrib`, dir `/etc/otel/`); retenção é **por stream** (o global sozinho não vale nada). | genérico→Tars | **COBERTO** — memória do agente `ler-docs-oficiais-sempre` (13/10, já na rodada anterior) + `senior-research` |
| 12 | `receitas/telemetria/files/compose.yaml` (commit `ece42cd`) | 14/10/2026 | regra | **Healthcheck que prova de verdade**: `openobserve --version` passa em **crash-loop** (só prova que o binário responde); o correto é `GET /healthz` de dentro do container, e o pós-apply também asserta. | genérico→Tars | **PARCIAL** — `.ai/skills/segtools-database/SKILL.md` e a receita irmã `forgejo` têm a forma `/healthz`; falta a **regra explícita** ("`--version` não é healthcheck"), que é o achado |
| 13 | `tests/test_backup_cobertura.py` (commit `026edf2`) | 13/10/2026 | regra | **Trava de cobertura de backup**: varrer as fichas (`receitas/*/vars.py`), extrair os apps que têm dir de dado e **FALHAR nomeando `arquivo:campo`** quando o app não está na lista de fontes do backup — em vez de descobrir depois que o backup saiu vazio. | genérico→Tars | **PARCIAL** — `.ai/skills/backup-restore/SKILL.md` (absorvida na fatia 2) descreve backup/restore; a **cobertura como teste fail-closed** não está |
| 14 | `tests/test_backup_cobertura.py`; commit `026edf2` | 13/10/2026 | armadilha | App que **escreve dado em `/srv` fora da lista de backup** = backup **vazio em silêncio** (aconteceu com 8 contextos no mesmo dia). E a trava precisa de **teste negativo**: rodar o mesmo caminho **sem** o commit e falhar, "para o gate não passar por não olhar nada". | genérico→Tars | **PARCIAL** — `.ai/skills/segtools-sdd` (critério de aceite falsificável) cobre o teste negativo; a regra "**gate que não pode passar por vacuidade**" merece ficar explícita |
| 15 | `receitas/repos_mirror/files/repos_mirror.py:...`; commit `5c26928` | 13/10/2026 | armadilha | Espelho git: **head ausente num bare recém-criado não é divergência** — `ancestral(None, ref)` devolvia falso e o serviço falhava; ausente → **criar** a ref com `update-ref` de old-value **VAZIO** (compare-and-swap: se a ref nascer no meio do caminho, **recusa** em vez de sobrescrever); divergência real segue falhando alto. | genérico→Tars | **FALTANDO** — `.ai/skills/backup-restore` e `iac` não têm espelhamento/bare; o CAS do `update-ref` é técnica portável |
| 16 | `receitas/repos_mirror/README.md:40-58` + `hosts/nuc.py:198-206`; commits `0e16124`, `5c26928` | 13/10/2026 | regra | Renomear um espelho: **renomear o remoto do bare antigo** (arquiva e sai da descoberta), nunca apagar o bare; e a **mesma lista de exclusão tem de ir às duas pontas** (apply e unit do timer), senão as pontas discordam — defeito real do dia. | genérico→Tars | **PARCIAL** — AGENTS §5 tem renomeação em massa (padrão/exclusões/prova); falta o caso "**duas pontas** de uma mesma lista" (ficha × serviço) como regra (R3: a lista é a fonte, o serviço a consome) |

## 2. Contradições

- **`homelab-infra` consigo mesmo, já resolvida no repo:** o §8b (13/10, noite) conclui "a recuperação
  é nossa" e o §8c (13/10, madrugada) **retrata**. Não é contradição aberta — o §8b carrega o aviso
  de retratação. Nenhuma outra contradição entre memórias/estudos no intervalo.
- **Nenhuma contradição com os outros repos** foi observada dentro deste recorte.

## 3. Totais

| métrica | valor |
|---|---|
| arquivos de conhecimento no delta | 1 (`docs/estudos/2026-10-13-telemetria.md`, +237) |
| commits no intervalo | 16 (9 com conteúdo de método no corpo) |
| itens coletados | 16 |
| genérico→Tars | 13 (itens 1, 3-10, 12-16) |
| ecossistema→org | 1 (item 2) |
| projeto | 2 (itens 11 e… o item 11 é org/método; ver nota) |
| **FALTANDO** no Tars | 5 — itens 5, 8, 9, 10, 15 |
| **PARCIAL** | 6 — itens 1, 4, 6, 7, 12, 13, 14, 16 |
| **COBERTO** | 3 — itens 2, 3, 11 |
| trailers `Lesson:`/`Incident:` | 0 (o repo não usa trailers; as lições vivem no corpo do commit e no estudo) |

> Nota: a coluna "projeto" ficou **vazia** de propósito — nada do delta é dado de projeto puro.
> O que é número do homelab (tag `v1.0.4`, `10.0.0.220`, retenção 30 dias, `period:2`) foi
> **descartado** como dado de projeto, e o **método** dele foi coletado sem o número
> (é a disciplina do `CURATION.md` §3 "O que NÃO entra").

## 4. HEAD lido por repo (vira o ponteiro novo após revisão)

| repo | HEAD lido | ponteiro anterior | cobertura |
|---|---|---|---|
| `homelab-infra` | **`363867d`** (`📝 docs(telemetria): tabela de fontes oficiais + review do que a PoC inventou`) | `cb8c53b` | **leitura inteira** dos caminhos de conhecimento do delta (só há 1 arquivo); código lido por mensagem de commit |

## 5. O que NÃO foi lido

- Código de produto do delta (28 arquivos, +1991/−50: `receitas/telemetria/*`, `poc/*`,
  `tests/*`, `hosts/nuc.py`, `lib/*`) — lido **apenas** pelos corpos de commit e pelos trechos
  citados no estudo. Não é caminho de conhecimento pelo §2 do `CURATION.md`, mas é onde estão
  várias lições acima (itens 5-7, 12-16).
- `docs/catalogo.md`, `receitas/registry.py`, `receitas/repos_mirror/README.md`: lidos **só no diff**.
- `.worktrees/` (untracked no repo) — não lido.
- Nenhum arquivo de segredo, `.env*` ou `.sops` foi aberto.

## 6. Nota para o passo 2 (julgamento) — não é absorção

Os 5 **FALTANDO** (itens 5, 8, 9, 10, 15) são o material de método novo desta rodada. Os 6
**PARCIAL** sugerem **extensão** de skill existente (R3: estender, não duplicar), com destaque para
`senior-research` (itens 1 e 4 — versão de referência e grelha de adoção) e `backup-restore`
(itens 13-14 — cobertura como teste fail-closed). O destaque binário do OpenObserve (episódio com
`{episode_id}`, 1 disparo + 1 resolvido), o `notify_on_recovery` e as tags são **conteúdo do estudo**,
já cobertos pela skill `telemetria` da fatia 2 — não se re-absorve (R1).
