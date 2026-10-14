# Plano de release do Tars — curadoria 11/10 (fase 1b)

## Resumo (10 linhas)

1. Três coletas (segtools, 10 repos irmãos, kipp) somam **~80 itens**; deduplicados viram **38**.
2. **5 bugs** do Tars a corrigir na próxima release (A) — todos de mecanismo (hook/sync/índice).
3. **21 melhorias/doutrinas** genéricas (B), **7 delas viram GATE** (o resto é dívida nomeada).
4. A branch **`feat/daneel-agente`** já existe e está pronta: skill + `tars-acessos.mjs` + 4 doutrinas (C).
5. Ela tem **3 furos** antes de mergear: doutrinas `daneel/*` sem gate, drift não implementado, `acessos/daneel.md` nunca gerado.
6. **Regra nova do dono** (D) — texto pronto para README + `principles.md` + template do BACKLOG do tars.
7. **Huldlabs** (E) absorve 9 decisões transversais (Forgejo, MCP, GHCR, ADRs da org).
8. **6 contradições** entre repos (F) — a grave é o layout de app com 3 grafias.
9. Só o dono decide: mergear a `daneel-agente`? qual das 3 grafias de `/srv`? Apps do GitHub ou PAT?
10. Nada foi escrito fora deste arquivo — leitura pura, conforme pedido.

### Decisões que só o dono toma

- **D-1** Mergear `feat/daneel-agente` agora (com os 3 furos abertos) ou fechar os furos antes?
- **D-2** Endurecer o PAT classic do `daneel-bot` para **GitHub App** (`ghs_` de 1h) nesta release ou depois?
- **D-3** `/srv/<amb>/<app>` vence — confirmar e mandar apagar as grafias antigas (memória do segtools + `hermes-migracao.md`) na mesma release?
- **D-4** Sudo NOPASSWD completo do bot no NUC/hermes/pve: manter (decisão 08/10) ou endurecer com lista de comandos (a spec do `endurance-decisoes` ficou pendente)?
- **D-5** `feat/daneel-agente` entra sozinha ou junto com o pacote B (o segundo arrasta 21 itens e estoura a fatia)?

---

## (A) Bugs do Tars — corrigir na próxima release

| # | Bug | Fonte | Prioridade | Tamanho |
|---|---|---|---|---|
| A1 | `tars sync` gerava hook **não executável** no consumidor | `kipp-coord`:11; tars PR #6 (`f6c28bf`) | **P0** | já corrigido — entra no CHANGELOG |
| A2 | `tars sync` **quebra o `prepare-commit-msg`** do consumidor | `segtools`:333-335 (`kipp/BACKLOG`, `31ee5f7`); tars `93d3059` | **P0** | confirmar que `93d3059` fechou; se não, fatia ≤10 min |
| A3 | Hook do catálogo **não acha o motor fora do consumidor** | `segtools`:369 (tars `93d3059`, PR #4/#5) | **P1** | verificar + prova |
| A4 | Gerador de **índice de memória sobrescreve com `(vazio)` calado** (314 linhas perdidas) | `segtools`:4.1.5 (`530455d8`, `3f5245fa`) | **P0** | fatia ≤10 min (guard no `ai-memory.mjs`) |
| A5 | Recuperação do disco apagou `.cache/` — **esperado**, mas o boot não avisa que o índice caiu junto | `segtools`:4.1.8 | **P2** | ≤10 min (checagem no boot) |

> A2/A3 são o **mesmo mecanismo** (hook do catálogo no consumidor) e ficaram instáveis nos dias 10-11/10
> (`w/hookexec`, `w/k0`, `fix/hook-consumidor`). Fechar como um item só com prova no consumidor.

---

## (B) Melhorias / regras genéricas — próxima release

Coluna **Onde entra**: `memória base` (`.ai/memory/`), `governança` (`.ai/governance/`), `regra de boot`
(`.ai/base/rules/principles.md`), `gate` (`~/.ai/gates/` + `doctrines.toml`), `guard` (`.ai/guards/`),
`skill` (`.ai/skills/`), `template` (prompt de worker). **GATE?** = vira regra com prova que reprova.

### B1 — Operação de hosts (doutrina única faltando)

| # | Item | Onde entra | GATE? | P | Tam. |
|---|---|---|---|---|---|
| B1.1 | Layout `/srv/<amb>/<app>/{data,conf}` (+`/opt` por ref, `/srv/repos` espelho, `/srv/state` frio) | `governança/doutrina-operacao.md` | sim (`tars doctor` reprova caminho fora) | **P0** | maior |
| B1.2 | Ambiente = **projeto Compose** (`name:<app>-<amb>`); `profile` NÃO serve; **bind mount sempre** | idem B1.1 | sim | **P0** | maior |
| B1.3 | Prod 100% Docker; uma stack+banco por produto; host descartável | idem | não (doutrina) | P1 | ≥10 min |
| B1.4 | **Nada em prod sem ordem direta do dono** (reapply/rollback/imagem/config) | `regra de boot` + guard | **sim** — guard bloqueia deploy sem flag de ordem | **P0** | ≤10 min |
| B1.5 | **IaC/CaC sem exceção**; contratos bloqueantes (suite vermelha não publica) | `governança` | sim (gate no CI) | P1 | ≥10 min |
| B1.6 | Receita = **procedimento documentado do fabricante** (doc/CLI oficial da versão pinada) | `memória base` + `regra de boot` | não | P1 | ≤10 min |
| B1.7 | **Backup só com prova de RESTORE** (sentinela SHA-256), nunca só existência | `governança` | sim (job de restore semanal falha o gate) | P1 | maior |
| B1.8 | Alerta que falha **não derruba o job**; canal de alerta ≠ próprio host (heartbeat externo) | `governança` | não | P2 | ≤10 min |
| B1.9 | **Erro de leitura ≠ "ausente"** — checagem privilegiada que falha **aborta** | `governança` + `gate` | **sim** | P1 | ≤10 min |

### B2 — Identidade e segredos

| # | Item | Onde entra | GATE? | P | Tam. |
|---|---|---|---|---|---|
| B2.1 | `daneel-opera-tudo`: as credenciais da automação são as **únicas** do devcontainer | `governança/segredos-e-identidade.md` | não (já parcial) | P1 | ≤10 min |
| B2.2 | **Multi-user do container** (11 pontos: sem identidade na imagem, volume `<user>-<project>-op`, socket root single-owner, uid do host, uma SA por projeto) | `governança` | sim (gate na imagem) | P1 | maior |
| B2.3 | **SSH local por ator**: dono = agente 1P; bot = chave própria; `known_hosts` fixo; `from=` LAN sem forwarding | `governança` | não | P1 | ≤10 min |
| B2.4 | Identidade de commit é **do repo**, não global (worker herda) | `memória base` | não | P2 | ≤10 min |
| B2.5 | **Limitação só com alternativas** (dizer "não dá" exige listar o que dá) | `regra de boot` | não | P2 | ≤10 min |

### B3 — Método de worker / coordenação (hoje só memória do segtools)

| # | Item | Onde entra | GATE? | P | Tam. |
|---|---|---|---|---|---|
| B3.1 | Só o coordenador despacha; uma sub-tarefa por worker; **worktree por worker sempre** | `skill agent-coordination` | não (já na skill) | P1 | ≤10 min |
| B3.2 | **Comando de subida é `task`**; `TaskStop` não mata o container; longos em segundo plano | `template` de worker | não | P1 | ≤10 min |
| B3.3 | Worker **prova com o aceite real**, não com atalho `--check`; teste comportamental, não de string | `template` de worker | **sim** (fast.py reprova PHANTOM) | **P0** | ≤10 min |
| B3.4 | Prompt de leitura diz **"PROIBIDO escrever"** **com exemplos** (chave, banco, restart) | `template` de worker | não | P1 | ≤10 min |
| B3.5 | `.ai/base/` não versionado → **`tars sync` antes do 1º commit** em worktree nova | `memória base` | não | P2 | ≤10 min |
| B3.6 | **Coordenador manda a causa `arquivo:linha` no despacho** (worker que investiga morre no teto) | `skill` + `template` | não | P1 | ≤10 min |
| B3.7 | Saldo pode acabar (402): worker morre sem commit → commit cedo e frequente | `template` de worker | não | P2 | ≤10 min |
| B3.8 | **Ficha de agente verificável** (`allowed/prohibited`, `stop_conditions`, `done_when`) | `skill` (já é a `daneel/SKILL.md`) | ver C | P0 | pronto |

### B4 — Plataforma / arquitetura

| # | Item | Onde entra | GATE? | P | Tam. |
|---|---|---|---|---|---|
| B4.1 | `dev:recreate` = **task versionada, CLI >= 0.80.2, timeout que falha alto** (Docker v29) | `licoes-plataforma.md` §5 | não | P1 | ≤10 min |
| B4.2 | **Ferramenta transversal = binário único**; escopo `@huldlabs`, versão `0.0.1-dev.N` no GitHub Packages privado | `governança` | não | P1 | ≤10 min |
| B4.3 | **ADRs da org como linhas em `doctrines.toml`** (binário portátil; manifesto como dado; SGBD do ambiente; outbox na mesma transação; canal indisponível degrada) | `doctrines.toml` | sim (prova por linha) | **P0** | maior |
| B4.4 | Jobs: lease por CHECK, terminal⇔`finished_at`, 3 idempotências, run antes de enfileirar | `doctrines.toml` | sim | P1 | ≥10 min |
| B4.5 | **Gate de paridade CI × Taskfile** (CI só roda o que existe como `task`) | `gate` novo | **sim** | P1 | ≥10 min |
| B4.6 | Contrato único de tempo/locale/número/moeda | `governança` | não | P2 | ≥10 min |
| B4.7 | Ledger retomável de IA com gate de item aberto | `gate` (Kipp + Tars) | sim | P2 | ≥10 min |
| B4.8 | Worktree só é removida **com o trabalho salvo** (`wip:` antes de `worktree remove`) | `memória base` | não | P2 | ≤10 min |

---

## (C) Registro de acessos da Daneel — avaliar `feat/daneel-agente`

**O que já tem** (branch `d87ed10`, 6 commits, **fora da main**):

| Peça | Arquivo | Estado |
|---|---|---|
| Skill canônica (persona, ficha, stop conditions, POPs) | `.ai/skills/daneel/SKILL.md` (128 l.) | pronto |
| Gerador do inventário | `tools/framework/tars-acessos.mjs` (260 l.) | pronto, read-only, barrado por `secrets-patterns.mjs` |
| Teste do gerador | `tools/framework/tars-acessos.test.mjs` (mock `ghp_x`) | pronto |
| Doutrinas | `.ai/doctrines.toml` +39 l. (`daneel/*`) | **2 sem gate** (dívida nomeada) |
| Comando | `tars acessos daneel [--out] [--json]` | pronto |
| README + CHANGELOG | ambos citam a skill e o comando | pronto |

**O que falta (3 furos antes de mergear):**

1. **Drift não implementado** — o módulo gera e ordena para o diff ser estável, mas **não compara** contra o commitado (§4/§6 do desenho exigem).
2. **`acessos/daneel.md` nunca foi gerado** no repo privado `HuldLabs/huldlabs` — a skill aponta para arquivo que não existe.
3. **Gates**: `force-push`, push em repo público e escrita no cofre ainda **não têm guard** (2 das 4 doutrinas declaradas `gate="nenhum"` com motivo — Hermes ainda não migrado).

**O que ENTRA na release:** os 3 furos como fatias irmãs (1) gerar `acessos/daneel.md` no huldlabs; (2) `diff` de drift; (3) guard de força-push/repo-público/cofre. Hosts/orgs/chaves/PATs/APIs **entram só via inventário gerado** — nunca à mão na skill (mata o drift por construção).

**Acessos a inventariar** (fonte: `daneel-agente`, `daneel-arquitetura.md`, `endurance-decisoes.md`): GitHub `daneel-bot` — orgs **HuldLabs, growthsbr, FabberLabs**; PAT classic → recomendação **GitHub App** (`ghs_` 1h); SSH `nuc.czul.net` (`10.0.0.220`, user `daneel`, sudo NOPASSWD), proxy `hermes` (`10.0.0.200`), `pve` (`10.0.0.3`); 1Password cofre `secrets`/item `daneel-bot` (SA de leitura em `~/.config/tars/automation/op-sa.token`); Forgejo (user `daneel`); ferramentas `op gh git docker uv`.

---

## (D) Regra nova do dono — "bug do Tars reportado → corrigido na próxima release"

**Texto proposto** (mesmo nos 3 lugares, R3):

> **Bug do Tars é reportado e corrigido na próxima release.** Todo consumidor que encontrar um bug no Tars (ou no `tars sync`/hook/gate) **reporta** no `BACKLOG` do tars com **repo, data, reprodução** — e o bug **entra na próxima release**; contorno local só é temporário e fica registrado como dívida nomeada. O `CHANGELOG` da release **lista os bugs reportados que fechou**. Bug sem reprodução vira "a confirmar" — não vira dívida infinita.
>
> **Fonte:** `.ai/base/rules/principles.md` (boot de todo consumidor) · este README · template do `BACKLOG` do tars (`## Bugs reportados por consumidores`).

**Onde entra:** (1) `README.md` do Tars §"Regras"; (2) `.ai/base/rules/principles.md` (boot — vale para todo consumidor); (3) template do `BACKLOG` do tars, seção nova. **GATE?** sim — `tars doctor` reprova `BACKLOG` com bug reportado **sem reprodução** ou **aberto há mais de uma release**.

---

## (E) Ecossistema → huldlabs (decisões transversais)

| # | Decisão | Fonte | Já coberto? |
|---|---|---|---|
| E1 | As **cinco peças** (Tars/Tomo/Sofon/Pion/Kipp) + futuras (Lazarus, Morse, Endurance, Phonon…) | `huldlabs/README.md` | sim |
| E2 | **Catálogo, não pacote fechado** — projeto declara, sync puxa o declarado com versão+hash | `huldlabs/README.md` | sim (`.ai/tars.toml`+lock) |
| E3 | **Nada exige runtime de quem não o usa** (só-Python e só-Node são primeira classe) | `huldlabs/README.md` | sim (Tars é binário único) |
| E4 | **Forgejo = espelho universal** de repos (`/srv/repos`, layout `<dono>/<repo>.git`) | `srv-repos-espelho-universal.md` | não |
| E5 | **Reconciliação de cada repo só depois de perguntar ao dono**; `/mnt/e` é mina do crash, nunca fonte | `plano-flash` §F2 | não |
| E6 | **MCP do ecossistema** (modelo Atlassian v2: `discover` + execute por classe de risco) | `estudos/2026-10-10-mcp-*` | não |
| E7 | **GHCR privado grátis** (imagem por digest; o NUC nunca builda) | `ghcr-privado-gratis.md` | não |
| E8 | **Segurança:** token do bot do Slack **commitado** — revogar (dono), tirar do arquivo, limpar histórico | `huldlabs/BACKLOG` §Seg | registrado |
| E9 | **Consolidação:** `seo-expert` completo só existe no disco do crash — consolidar em `/srv/repos/seo-expert.git` | `huldlabs/BACKLOG` §Consol. | registrado |

---

## (F) Contradições entre repos — versão vigente e correção

| # | Contradição | Versões | **Vigente** | Corrigir em |
|---|---|---|---|---|
| F1 | **Layout de app — 3 grafias** | `/srv/data/<app>` (Tars `estado-exige-datadir.md`, antiga) × `/srv/apps/<app>` (segtools `hermes-migracao.md`, pré-11/10) × **`/srv/<amb>/<app>`** (atual) | **`/srv/<amb>/<app>`** (`hi/docs/decisoes.md`, 11/10) | memória do Tars + `hermes-migracao.md` → ponteiro |
| F2 | **thood absorve zenproxy/vpnai?** | `hermes-migracao.md` diz sim × correção do dono (10/10): **não** | **não absorve** (só o cabeçalho corrige; o corpo segue errado) | corpo do `hermes-migracao.md` |
| F3 | **nexus promete `pg_duckdb`** | desenho (`compose:41-50`, `vars.py:76`) × pacote inexistente | **inexistente** — remover a promessa | repo `nexus` |
| F4 | **nexus HEAD** | `main`=`3edb5e9` (01/10) × WIP `recuperado/hermes-1010/wip`=`1544ad1` (10/10, 6 arquivos a mais) | **o WIP é o que roda** | reconciliação (E5) |
| F5 | **`--max-turns`** | boot/memória diz "limite que o dono não pediu não nasce como padrão" × código implementou e removeu | **sem teto por padrão** (SEG-921) — reconciliar a **redação** da memória | memória do segtools |
| F6 | **Schema do manifesto + teste de conformidade** | dizem que moram no catálogo do Tars × só existem no huldlabs/kipp | **devem ir pro Tars** (fatia K0, B4.3) | Tars |

---

## (G) O que fica no projeto (contagem por repo)

| Repo | Itens | Exemplos |
|---|---|---|
| segtools | 6 | watchdog contando rodada morta; harness de worker (teto/`--sem-canal`); canal/board com item congelado como ativo |
| seo-brain | 5 | ingestão do reconstruído; `INVENTARIO-seo-brain.md`; reindexar vetorial; não ingerir `_outros-repos` |
| kipp | 3 | `bun build --compile` (TS); Jira como guia de produto (key ≤10); DEV local até aprovação |
| homelab | 2 | motor em CUE (ficha YAML); compilado = rendered manifests (zero label manual) |
| endurance | 1 | cobertura de tooling pendente (php, mysql/redis-client, pwsh, corepack) |
| **Total** | **17** | — |

---

## Sugestão de fatiamento da próxima release

- **Fatia 1 (P0, ≤1 h):** mergear `feat/daneel-agente` + A1/A2 (CHANGELOG + confirmar hook) + D (regra nova).
- **Fatia 2 (P0):** A4 (índice não sobrescreve com vazio) + B1.4 (guard "nada em prod sem ordem") + B3.3 (aceite real no worker).
- **Fatia 3 (doutrinas):** B1.1/B1.2 (layout/compose) + B4.3 (ADRs em `doctrines.toml`) + C-1 (gerar `acessos/daneel.md`).
- **Fatia 4 (contradições):** F1-F6 em commits atômicos por repo.
