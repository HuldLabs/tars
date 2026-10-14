# Plano de release do Tars — curadoria 14/10 (fase 1b)

> Fontes: coletas de 14/10 (`coleta-{segtools,homelab,seo-brain,apps,eco}.md`), mapas item a item de
> 13/10 (`huldlabs/estudos/tars-curadoria-2b/seg-agentmem-{1,2,3}.md` + `eco.md`), plano de 11/10 e o
> `CHANGELOG`/`BACKLOG` do Tars (branch `curadoria/2026-10-13`, HEAD `b31efe8`). Nada foi escrito fora deste arquivo.

## Resumo (10 linhas)

1. O delta de 14/10 é **maior que o de 11/10**: as 5 coletas somam ~205 itens brutos e os mapas de 13/10
   somam 194 linhas; deduplicados viram **58 itens** neste plano.
2. **11/10 fechou 20 dos 38**: dev.11 (manifesto binário), dev.12 (hook executável no índice), dev.13 (novo-repo),
   dev.14 (Daneel fechada + regra "bug reportado vira release"), dev.15 (A4 + B1.4 + B3.3), dev.17 (10 absorções +
   `tars curation`). **18 seguem abertos** (C).
3. O que **não** entrou em nenhuma release é o grosso desta rodada: colocação de arquivo, taxonomia de `tools/`,
   fail-closed de gate, espelho git, saúde de backup, rede docker de teste — e a **skill nova `coleta-hostil`**.
4. **2 bugs novos** (A1/A2, ambos do `tars sync`) abrem a fila; o `TARS-BUG-1` (PHANTOM) já tem lar.
5. **21 melhorias/doutrinas** (B), **7 viram GATE**. A maioria é **extensão** de skill existente (R3), não skill nova.
6. A **fatia 2b (194 itens dos mapas de 13/10) nunca foi absorvida** — 174 "entra" pendentes, agrupados em B9–B14.
7. **Contradições (F):** a regra do ponteiro está ferida na prática (conhecimento não commitado); `endurance`,
   `lazarus` e `dotfiles` não têm ponteiro; o número do índice de memória do segtools caiu para zero.
8. **Decisões do dono (D):** o conflito "não agir sem confirmar" × "pergunta não segura trabalho"; a skill nova
   `coleta-hostil`; aposentar o par `fabber-*`; o índice de memória do segtools; a `feat/daneel-release`.
9. Ordem sugerida: **fatia 1** = A1/A2 + F4 + F2 (barato e destrava ponteiro) · **fatia 2** = os 7 gates ·
   **fatia 3** = `coleta-hostil` + B9–B14 (a 2b, por partes).
10. Lição de método desta rodada: **ponteiro por sha só enxerga o que foi commitado** — leitura direta não avança.

### Decisões que só o dono toma

> **Resolvidas pelo dono em 14/10/2026** (registradas aqui; as propostas abaixo ficam como o enunciado original).

- **D-1 · O conflito central.** "Não agir em conversa sem ordem" × "pergunta não segura trabalho" × "só 4 casos de
  pergunta" (`seg-agentmem-1` #37/#38) e "perder por alvo" (`.ai/governance/perdas-por-alvo.md`). **Proposta:**
  matriz única — desconhecido/irreversível/produção → pergunta; reversível dentro do write-set → decide e entrega
  com `claim/verify`. **Como pergunta agora:** a matriz é essa ou existe outra ordem de precedência?
  → **ACEITA (14/10).** Vira regra em `.ai/rules/principles.md` §"Quando perguntar e quando decidir", citando as
  fontes conflitantes que substitui.
- **D-2** Criar a **skill nova `coleta-hostil`** (seo-brain #1-#5, #11 + endurance 2.5) ou estender `app-extraction`?
  R1: não existe bundle equivalente — mas "quem coleta atrás de login" é `app-extraction`.
  → **ESTENDER `app-extraction`** (não criar skill nova).
- **D-3** Os 9 bundles `fabber-*` transitórios (`BACKLOG:SKILLS-ABSORB`) — portar, **aposentar** ou manter?
  → **APOSENTAR** os já absorvidos; portar só o que faltar (fatia futura — registrada, não executada aqui).
- **D-4** O `INDEX.md` do segtools está com **0 entradas** e o `memory.index.json` perdeu 3835 linhas (não commitado):
  é regressão do gerador ou efeito do A4 já corrigido no dev.15? Quem é o dono do conserto?
  → **RESOLVIDA:** é regressão do orçamento; vira o bug **A-cap** (índice restaurado do HEAD no segtools).
- **D-5** `feat/daneel-release` (#8, já mergeada no dev.14) × branch `curadoria/2026-10-13` (`curadoria/2026-10-13` tem
  `root-cause-debugging` e o histórico, a release não) — mergear a curadoria na `main` antes do próximo `dev.N`?
  → **ABSORVER TUDO nesta branch, cortar UMA release; o dono mergeia depois.**
- **D-6** `tars identity` (TARS-BUG-5) **bloqueia** a v0.1.0 do Endurance: entra nesta release ou o Endurance segue
  com o contorno?
  → **ENTRA nesta release como P0.**

---

## (A) Bugs do Tars — corrigir na próxima release

- **A-cap · índice de memória zerado pelo ORÇAMENTO (achado 14/10, D-4 resolvido)** — P0, ≤10 min. O gerador gravou `INDEX.md` com 0 entradas e o `memory.index.json` sem 3835 linhas porque o `cap` do orçamento de boot chegou a 0; a guarda do dev.15 (`a841806`, `ai-memory.mjs:399-402`) só olha o STORE vazio, não o `cap`. Fazer: `throw` quando `store>0 && cap===0` (ou piso no `cap`) + teste. O piso `66a1e89d` foi revertido em `1c17b8b5` com premissa que só vale com o boot legível. No segtools o índice foi restaurado do HEAD (264 entradas, `ai-memory --check` ok).

| # | Bug | Fontes | P | Tam. |
|---|---|---|---|---|
| A1 | `tars sync` grava hook de catálogo no **`PreToolUse:Bash`** do consumidor (hook só vale nas ferramentas declaradas) | `eco.md` §2.7a · `BACKLOG.md` TARS-BUG-2/END-SYNC-1 | **P0** | ≤10 min |
| A2 | `tars sync` **não remove** guard que saiu de `.ai/base` (assimétrico; consumidor fica com guard fantasma) | `eco.md` §2.7b · TARS-BUG-3/END-SYNC-2 | **P0** | ≤10 min |
| A3 | `.githooks/` só nasce se a pasta já existir, e o `init` **não avisa** — consumidor novo fica sem hook calado | `eco.md` §2.7c · TARS-BUG-4/END-SYNC-3 | **P1** | ≤10 min |
| A4 | `tars identity` **não existe** — mas é a 4ª doutrina do dev.14; a release precisa **declarar** (a doc diz que existe) | `eco.md` §2.7d · TARS-BUG-5 · `C-3` | **P1** | ≤10 min (declarar) |
| A5 | `tars-doctrines.mjs` acusa PHANTOM: a prova escreve em `/tmp` e o gate lê os **staged** — a prova nunca dispara | `BACKLOG.md` TARS-BUG-1 (segtools, 11/10) | P2 | ≤10 min |
| A6 | Gate que não pode passar **por vacuidade** (gate com exceção órfã; teste negativo obrigatório) | `coleta-segtools` §3.32 · `coleta-homelab` #14 | P2 | fazer com B4 |

> **Mecanismo comum de A1-A3:** o `sync` só **acrescenta**. Fechar os três numa fatia só, com prova no consumidor
> (o `tars sync` tem que ser simétrico: o que sai de `.ai/base` sai do consumidor).

---

## (B) Melhorias / doutrinas — onde entram e se viram GATE

Coluna **Onde**: `doutrina` (`.ai/doctrines.toml`) · `governança` (`.ai/governance/`) · `regra` (`.ai/rules/`) ·
`gate` (`.ai/gates/` + `doctrines.toml`) · `guard` (`.ai/guards/`) · `skill:<nome>` · `template` (prompt de worker).

### B1 — Colocação de arquivo e layout (o buraco maior: nada em 11/10)

| # | Item | Fontes | Onde | GATE? | P | Tam. |
|---|---|---|---|---|---|---|
| B1.1 | **Matriz de colocação por família** (`family → allowed`), com `nao-classificado` bloqueando | `coleta-segtools` 1.2 · `AGENTS.md` §pré-criação · `layout-check.mjs` | governança + gate | **sim** | **P0** | maior |
| B1.2 | **Global (`tools/packages/config/.ai/docs/themes/modules`) × app (`apps/hub`)**: tooling global nunca sob o app | `coleta-segtools` 1.3 | governança + gate | **sim** | P0 | ≤10 min |
| B1.3 | **Taxonomia de `tools/`**: `framework/` × `method/` × `clients/`; nada solto na raiz | `coleta-segtools` 1.4 · `TOOLING-LAYOUT.md` (SEG-38) | governança | sim (gate de layout) | P1 | ≤10 min |
| B1.4 | Serviço de núcleo mora em `packages/platform/<serviço>`; **adaptador core novo no hub é proibido** | `coleta-segtools` 1.1 · ADR-017 · `seg-agentmem-1` #59/#60 | governança | **sim** | P1 | ≤10 min |
| B1.5 | **Nada no ecossistema exige runtime de quem não usa** (transversal = binário único) | `ego.md` 2.2 · `seg-agentmem-1` #42/#43 · `coleta-eco` 5.6 | governança | **sim** | P0 | ≤10 min |
| B1.6 | **Invariante de `.cache/`**: descartável só ali, nunca versionado; revisar `git show --stat` do commit alheio | `seg-agentmem-1` #13/#14 | governança (`git.md`) | não | P1 | ≤10 min |

### B2 — Plataforma, banco e dados

| # | Item | Fontes | Onde | GATE? | P | Tam. |
|---|---|---|---|---|---|---|
| B2.1 | **Porta tipada por domínio** — o SQL mora no adapter; porta expõe método, nunca `query(sql)` | `coleta-segtools` 5.4 · `eco.md` N1-N8 | skill:segtools-database | sim (teste de regressão: import de driver fora de `adapters/`) | **P0** | maior |
| B2.2 | **Nunca conexão global de longa duração**: abre → executa → fecha por chamada; `close()` no `finally` | `eco.md` N5 (incidente real) | skill:segtools-database | não | P1 | ≤10 min |
| B2.3 | **Fail-closed**: ausência de trava/`gates` REPROVA, nunca `return` silencioso | `seg-agentmem-2` #7 (kipp) | doutrina `metodo/contramedida-testada` | **sim** | P0 | ≤10 min |
| B2.4 | **Carga em massa em batch**, nunca `row-by-row`; hook de extensão de motor intercepta (pg_duckdb) | `coleta-seo-brain` #11 | skill:segtools-database | não | P1 | ≤10 min |
| B2.5 | **Teste de agendador não espera o relógio** — dispara o caminho (`triggerSchedule`) e aguarda o resultado real | `seg-agentmem-1` #33/#34/#35 | skill:segtools-database | sim | P1 | ≤10 min |
| B2.6 | **Backup só é real com prova de restore**, e a **cobertura é teste fail-closed** (app com dir de dado fora da lista FALHA nomeando `arquivo:campo`) | `coleta-homelab` #13/#14 · 11/10 B1.7 | skill:backup-restore | **sim** | P0 | ≤10 min |
| B2.7 | **Espelho git**: bare recém-criado sem head **não é divergência**; `update-ref` com old-value vazio (CAS); renomear = renomear o remoto do bare, nunca apagar | `coleta-homelab` #15/#16 | skill:backup-restore | não | P1 | ≤10 min |

### B3 — Coleta a partir de fonte hostil (skill nova)

| # | Item | Fontes | Onde | GATE? | P | Tam. |
|---|---|---|---|---|---|---|
| B3.1 | **Parâmetro que muda o RESULTADO ≠ parâmetro de evasão**: o geo/mercado vem do SSOT, nunca sorteado | `coleta-seo-brain` #1 · #8 | skill:`coleta-hostil` (nova, D-2) | não | P1 | maior |
| B3.2 | **O caminho seguro é o único caminho**: stealth é padrão, nunca flag (ligar-por-flag ⇒ alguém esquece) | `coleta-seo-brain` #2 | idem | sim (default no caminho, não opção) | P1 | ≤10 min |
| B3.3 | **Zero resultado ≠ sucesso**: `empty`/`bloqueado`, nunca `ok`; fallback só com env explícita + aviso | `coleta-seo-brain` #3 (INV-FAIL-1) | doutrina + skill | **sim** | P0 | ≤10 min |
| B3.4 | **Aquecer a origem antes do alvo profundo** e **perfil persistente** entre tentativas | `coleta-seo-brain` #9/#10 | idem | não | P1 | ≤10 min |
| B3.5 | **Automação de navegador em container**: Chrome real na imagem (instalar com `sudo` some no rebuild); cookie logado é credencial; `agent-browser install` nunca | `coleta-eco` 2.5 · `coleta-seo-brain` #4 | regra `ambiente` | sim (imagem declara a dep) | P1 | ≤10 min |

### B4 — Testes e aceite

| # | Item | Fontes | Onde | GATE? | P | Tam. |
|---|---|---|---|---|---|---|
| B4.1 | **Aceite = prova reproduzida**, não atalho `--check` nem asserção de string (já no dev.15; falta o par `claim/verify/expect/real` + seção "não medido") | `coleta-segtools` 4.7 · 11/10 B3.3 | template de worker | sim | P1 | ≤10 min |
| B4.2 | **Medição não decide com máquina disputada**; bench em `docs/research/` com data e ressalva de carga | `seg-agentmem-1` #17 | skill:senior-research | não | P1 | ≤10 min |
| B4.3 | **"Não existe pronto" exige medir a última release/`main`, não a estável** | `coleta-homelab` #1 | skill:senior-research | não | P0 | ≤10 min |
| B4.4 | **Grelha de adoção de alternativa**: mantenedor vivo? licença? custo? **por que não** (obrigatório por linha) | `coleta-homelab` #4 | skill:senior-research | não | P1 | ≤10 min |
| B4.5 | **Sonda de deserialização** prova que a feature existe na versão (mandar o tipo errado, ler o erro) | `coleta-homelab` #5 | skill:senior-research | não | P1 | ≤10 min |
| B4.6 | **Grelha "não existe"** antes de montar rubrica/gold próprio: dataset público e sistema maduro | `seg-agentmem-1` #45 | skill:senior-research | não | P2 | ≤10 min |
| B4.7 | **Teste `-t` que falha por ORDEM** dentro do arquivo: a prova é o arquivo inteiro | `seg-agentmem-2` #1 | skill:root-cause-debugging | não | P1 | ≤10 min |

### B5 — Método de agente e coordenação

| # | Item | Fontes | Onde | GATE? | P | Tam. |
|---|---|---|---|---|---|---|
| B5.1 | **Colisão de recurso**: dois workers no MESMO checkout/slot se matam; detectar por `/proc/*/cmdline`, `--outdir` privado, reportar o duplo despacho | `seg-agentmem-1` #39/#40/#41 | skill:agent-coordination §2 | não | P0 | ≤10 min |
| B5.2 | **Coordenador confere a PRÓPRIA dependência antes de liberar recurso** (disco, drive, porta, container) | `seg-agentmem-1` #21 | skill:agent-coordination §2 | não | P1 | ≤10 min |
| B5.3 | **Comando > ~10-20 s vai para segundo plano**; nunca laço de `sleep` esperando | `seg-agentmem-1` #18 · `coleta-segtools` 2.4 · `eco.md` 2.7e | skill:agent-coordination | não | P1 | ≤10 min |
| B5.4 | **Subagente do harness não é o caminho barato** (mesmo orçamento do coordenador) | `seg-agentmem-1` #29 | skill:agent-coordination §1 | não | P2 | ≤10 min |
| B5.5 | **Custo da coordenação proporcional ao tamanho**: ajuste simples vai direto no checkout com HMR, sem worker/worktree/e2e | `seg-agentmem-1` #4 | skill:agent-coordination | não | P1 | ≤10 min |
| B5.6 | **Revisor lê o bloco inteiro**, nunca a linha do grep, antes de acusar defeito | `seg-agentmem-3` #5 | skill:agent-coordination | não | P1 | ≤10 min |
| B5.7 | **Achado de outra frente vai ao coordenador dela**, com fonte e "avise se conflitar" | `seg-agentmem-1` #1 | skill:agent-coordination | não | P1 | ≤10 min |
| B5.8 | **O canal é o tracker**: issue=fila, assign=claim, comentário=heartbeat, delivery=resultado | `seg-agentmem-3` #10 | skill:agent-coordination | não | P1 | ≤10 min |
| B5.9 | **Relatos de worker viram melhoria do template**, por ponteiro (tag `prompt`) | `seg-agentmem-3` #1/#2 | skill:agent-coordination + `tags.toml` | não | P2 | maior |
| B5.10 | **Idioma**: identificador em inglês; tela, docs, canal, commit e **resposta ao dono** em português | `seg-agentmem-1` #27 · `seg-agentmem-3` #3 | regra | não | P1 | ≤10 min |
| B5.11 | **Verificação visual é na TELA** (nunca a conta do dono); paridade se mede na referência, lado a lado | `seg-agentmem-1` #26 · `seg-agentmem-2` #4 | skill:agent-coordination | não | P2 | ≤10 min |

### B6 — Infra e operação

| # | Item | Fontes | Onde | GATE? | P | Tam. |
|---|---|---|---|---|---|---|
| B6.1 | **`--version` não é healthcheck** (passa em crash-loop); o certo é `GET /healthz` de dentro do container, e o pós-apply asserta | `coleta-homelab` #12 | skill:iac | sim (pós-apply reprova) | P0 | ≤10 min |
| B6.2 | **Canal de release**: produção sobe a tag ESTÁVEL; pré-release exige guarda explícito | `coleta-homelab` #7 | skill:iac | não | P1 | ≤10 min |
| B6.3 | **PoC com tag fixa e volume nomeado** sobrevive ao bump (dá para medir a versão nova sem refazer o setup) | `coleta-homelab` #6 | skill:iac | não | P2 | ≤10 min |
| B6.4 | **Postura multiusuário do devcontainer** (11 itens: sem segredo na imagem, volume por usuário/projeto, socket do Docker off, porta em `127.0.0.1`, digest fixo) | `coleta-eco` 2.1 | regra `ambiente` / skill | **sim** | P1 | maior |
| B6.5 | **Rede docker de teste**: serviço de apoio roda na MESMA rede do agente, por nome de container — nunca por porta publicada | `seg-agentmem-2` #6 | regra `ambiente` | não | P1 | ≤10 min |
| B6.6 | **Precedência de config entre os lados do filesystem** (helper do Windows ganha do Linux no WSL) | `coleta-eco` 1.11 | regra `ambiente` | não | P1 | ≤10 min |
| B6.7 | **Superado por skill ⇒ aposentar, não mergear** | `coleta-eco` 1.10 | governança | não | P2 | ≤10 min |

### B7 — Segredos e identidade

| # | Item | Fontes | Onde | GATE? | P | Tam. |
|---|---|---|---|---|---|---|
| B7.1 | **Segredo não vaza pelo arquivo, vaza pelo caminho indireto**: `argv`, DSN em mensagem de erro, log de ferramenta, `pstree` — e **expansão de shell antes do `-c`** (`wsl.exe`, `ssh host cmd`, `sudo sh -c`) | `coleta-eco` 1.3 · 1.8 | governança `segredos-e-identidade` | **sim** (guard de `argv`/padrão) | P0 | ≤10 min |
| B7.2 | **Toda revogação de credencial exposta entra no BACKLOG central** (onde está, o que fazer, fonte) — e **não é cobrada do dono nos status** | `coleta-eco` 1.2 · `seg-agentmem-3` #6/#8 | governança | sim | P0 | ≤10 min |
| B7.3 | **Push Protection recusando é o sistema funcionando** (`GH013`): o artefato fica local e a decisão sobe | `coleta-eco` 4.2 | governança | não | P2 | ≤10 min |

### B8 — Processo e conhecimento

| # | Item | Fontes | Onde | GATE? | P | Tam. |
|---|---|---|---|---|---|---|
| B8.1 | **Onde escreve cada tipo de conhecimento** (memória durável × cursor de sessão × fila) — a fronteira não está escrita em lugar nenhum | `coleta-segtools` 7.1 | governança | não | **P0** | ≤10 min |
| B8.2 | **Referência por key, nunca por número de linha** (a linha envelhece) | `coleta-segtools` 4.8 | governança | não | P1 | ≤10 min |
| B8.3 | **Marcador `BR-*` + catálogo gerado + gate** | `coleta-segtools` 5.1 | governança + gate | **sim** | P1 | maior |
| B8.4 | **`No-Lesson:` como trailer explícito** ("nada a registrar, e por quê") | `coleta-eco` 2.9 | governança `git.md` | não | P2 | ≤10 min |
| B8.5 | **Fatias de migração expand → migrate → contract** | `seg-agentmem-1` #3 | governança | não | P2 | ≤10 min |
| B8.6 | **Convenções de subsistema em arquivo SSOT próprio; o `AGENTS.md` só aponta** | `coleta-seo-brain` #12 | governança | não | P2 | ≤10 min |
| B8.7 | **Governança de lições: portar do `dotfiles` (R1)** — já existe lá em código (`scripts/ai-lessons*.py`, registry, skill) | `coleta-eco` 4.5 (pendente de leitura do `.agents/`) | governança | sim | P1 | maior |

### B9 — Fatia 2b: os mapas de 13/10 (194 itens, 174 "entra") — agrupados

> **A 2b nunca foi absorvida.** Não listo os 174 um a um: agrupo nos 6 destinos que os mapas propõem. Contagem
> literal por mapa: parte 1 **~55** entram de 100 · parte 2 **~18** de 47 · parte 3 **72** de 90 · `eco.md`
> **~110** de 164. **Decisão do dono:** absorver agora (em partes) ou registrar como dívida nomeada?

| # | Bloco | Fontes | Onde | GATE? | P | Tam. |
|---|---|---|---|---|---|---|
| B9.1 | Coordenação (colisão de recurso, despacho, prompt vivo, escalada) | `seg-agentmem-1` #4/#21/#29/#39-#41 · `seg-agentmem-3` #1/#5/#9-#13 | skill:agent-coordination | não | **P0** | maior |
| B9.2 | Banco (ports & adapters, plugin `register()`, enforcement por teste, checklist de adapter) | `eco.md` N1-N13 | skill:segtools-database | sim (N3) | P0 | maior |
| B9.3 | Infra/IAM (cadeia de provedores, SELD como extração, túnel + Access, DBOS atrás de porta) | `seg-agentmem-1` #66-#71 · `seg-agentmem-3` #9-#12 · `coleta-eco` 1.5-1.7 | skill:iac + governança | sim | P1 | maior |
| B9.4 | Front (componente não é dado, paridade na referência, decisão de design não bloqueia) | `seg-agentmem-1` #19/#20/#37/#38 · `seg-agentmem-2` #4/#5 | skill:segtools-frontend | não | P2 | maior |
| B9.5 | Tooling/método (`.cache/`, comandos longos, termos técnicos, CUE, `--outdir` privado) | `seg-agentmem-1` #13/#14/#18/#31 · `seg-agentmem-2` #9 | governança + skills | não | P2 | menor |
| B9.6 | Órgão/ecossistema (runner isolado, autoria por ator, repositório central das sessões) | `seg-agentmem-3` #9-#13 | governança | não | P2 | menor |

---

## (C) Pendências de 11/10 — o que ainda está aberto

**Fechado (20):** A1 (executável no índice, dev.12, `f6c28bf`) · A2/A3 (motor fora do consumidor, dev.10, `93d3059`)
· A4 (índice não clobbera, dev.15) · B1.4 (prod-guard, dev.15) · B3.3 (aceite real, dev.15) · B3.8 + C-1/C-2/C-3
(Daneel: skill, `tars acessos`, gate `daneel-acoes`, drift e `acessos/daneel.md`, dev.14) · D (bug reportado vira
release, dev.14) · B4.2 (binário único + `0.0.1-dev.N`, dev.11) · B4.3/B4.6 (manifesto do binário + conformidade de
prefixo, dev.11; ADRs em `doctrines.toml` segue aberto) · C (registro de acessos, dev.14).

| # | Item de 11/10 ainda aberto | Virou nesta rodada | P | Tam. |
|---|---|---|---|---|
| C1 | B1.1 layout `/srv/<amb>/<app>` + B1.2 ambiente = projeto Compose (bind mount) | B1.1-B1.4 | **P0** | maior |
| C2 | B1.5 IaC/CaC sem exceção, contratos bloqueantes | B6.1/B6.4 | P1 | maior |
| C3 | B1.7 prova de restore; B1.8 alerta não derruba o job, heartbeat externo; B1.9 erro de leitura ≠ ausente | B2.6 + B8.7 | P1 | ≤10 min |
| C4 | B2.1 credenciais da automação são as únicas; B2.2 multiusuário; B2.3 SSH por ator; B2.4 identidade por repo; B2.5 limitação só com alternativas | B6.4 + B7.1/B7.2 | P1 | maior |
| C5 | B3.1 só o coordenador despacha/worktree por worker; B3.2 comando de subida é `task`; B3.4 "PROIBIDO escrever" com exemplos; B3.5 sync antes do 1º commit; B3.6 causa no despacho; B3.7 saldo 402 | B5.1-B5.11 · B9.1 | **P0** | ≤10 min |
| C6 | B4.4 jobs (lease, 3 idempotências); B4.5 gate de paridade CI × Taskfile; B4.6 contrato de tempo/locale; B4.7 ledger de IA; B4.8 worktree só sai com o trabalho salvo | B9.3 + `coleta-eco` 5.6 | P1 | ≥10 min |
| C7 | C-4 (interação hermes × thood não re-verificada); E4 Forgejo espelho; E5 reconciliação só com o dono; E6 MCP; E7 GHCR | F1-F6 · B2.7 | P1 | maior |

---

## (E) Ecossistema → huldlabs

| # | Decisão | Fontes | Estado |
|---|---|---|---|
| E1 | SELD nasceu (IAM da org, cadeia de provedores) — **extrair × adotar segue em aberto**; reabrir só com SCIM/federação social | `coleta-eco` 1.5 | em aberto (dono) |
| E2 | **DBOS** como orquestrador durável, atrás de `OrchestratorPort`; **não** ser um 2º engine de jobs | `coleta-eco` 1.7 | decidido (dono 12/10) |
| E3 | Hub é **tabela de 12 peças** (Endurance, SELD, Morse, Lazarus, Bulq, Murph, thood, Brand…): peça fora do hub não existe para quem procura | `coleta-eco` 1.12 | coberto (`novo-repo`) |
| E4 | `acessos/daneel.md` **passou a existir** (12/10); falta a doutrina de refresh/drift | `coleta-eco` 1.1 | parcial |
| E5 | Revogação de credencial exposta → BACKLOG do hub (seção Segurança) | `coleta-eco` 1.2 · `seg-agentmem-3` #6 | `huldlabs/BACKLOG.md` §Segurança (memória do agente `revogacao-no-backlog-huldlabs`) — já registrado |
| E6 | Repos do GitHub: **nexus, seo-expert, farmega, tokenhood, bulario, vpnai, farmega.v2** e `fabber-x`/`nexus-x`/`vpnai-x` **ainda não têm ponteiro** no `.ai/curation.json` | `coleta-apps` · `docs/BENCHMARKS.md` | a rodada de 13/10 leu o `fabber` do share X:; conferir `task benchmarks:index` | 
| E7 | **9 bundles `fabber-*` transitórios** (`BACKLOG:SKILLS-ABSORB`) — portar, aposentar ou manter? | `coleta-eco` 5.7 · D-3 | dívida nomeada |

---

## (F) Contradições

| # | Contradição | Versões | **Vigente** | O que corrigir |
|---|---|---|---|---|
| F1 | **Ponteiro ler × commit** | o ponteiro está em `03e9363d` (13/10, segtools) e o `CURATION.md` §5 diz "o ponteiro só avança sobre LEITURA INTEIRA" × 124 arquivos de `agent/` no disco, **20+ não commitados**, e o último commit da pasta é `f98a69a6` (11/10) | **a regra está certa; a prática manda avançar sobre leitura direta** — mas o ponteiro **não muda de comportamento**: enquanto o delta não for commitado, o próximo `git diff` o vê de novo | commit do `agent/` no segtools (dono) + registrar no plano que esta rodada **não** avança o ponteiro do segtools |
| F2 | **`endurance`, `lazarus`, `dotfiles` fora do estado** | a rodada de 11/10 leu 10 repos irmãos mas só fixou 5 HEADs; a coleta de 14/10 diz que os 3 foram lidos por inteiro | **os 3 têm leitura inteira e não têm linha no `.ai/curation.json`** | criar o ponteiro dos 3 (`e94897e` · `f633e77` · `5c23430`) — senão a rodada de novo relê tudo |
| F3 | **`INDEX.md` do segtools com 0 entradas** | o índice diz "0 entradas" e o `memory.index.json` perdeu **3835 linhas** (não commitado) × a memória viva tem 124 arquivos | **é regressão, não coleta** — o A4 (dev.15) barra o clobber **daqui para frente**, mas não restaura o que já caiu | dono: regenerar o índice; se o arquivo já caiu no commit, é caso do A4 retroativo |
| F4 | **Idioma nas duas pontas do mesmo repo** | o `segtools` tem os identificadores do **código** em inglês (`apps/hub`, `layout-check.mjs`, `ai-memory.mjs`) × boa parte da memória e dos mapas está em português | **regra do dono vence: identificador em inglês, texto em português** | não é defeito de dado — é a confirmação de que a regra **já vale** nos dois sentidos; o que falta é escrevê-la no catálogo (B5.10) |
| F5 | **`tars identity` existe?** | o `Endurance` D3/F8 diz que não existe (verificado 13/10) × o dev.14 lista a 4ª doutrina `daneel/*` no CHANGELOG, como se a identidade estivesse fechada | **não existe como comando** — o bloqueio do Endurance vale | a release que trouxer a skill **precisa declarar** o que entrou e o que não (A4) |
| F6 | **`feat/daneel-release` × `curadoria/2026-10-13`** | a release #8 foi mergeada no dev.14 × `root-cause-debugging` e o histórico das rodadas vivem **só** na branch de curadoria | **as duas** — são fatias diferentes da mesma linha | mergear a curadoria na `main` antes do próximo `dev.N` (D-5) |
| F7 | **Contagens divergentes** | a `coleta-homelab` §3 dá 6 FALTANDO/8 PARCIAL e o §4 do mesmo doc diz 5/6 | vale a §3 (a §4 conta o item 11 como projeto) | é erro de digitação da coleta, **não** se propaga ao plano |

---

## (G) O que fica no projeto (contagem por repo)

| Repo | Itens | Exemplos |
|---|---|---|
| segtools | 7 | watchdog de rodada morta; conta de teste do seed; prompt `--sem-canal`; ADRs 001-004 |
| seo-brain | 12 | motor SERP (stealth, ledger, crawl); `kb.market`/`mercados.yaml`; NID/uule |
| kipp | 3 | `bun build --compile`; Jira como guia de produto; DEV local até aprovação |
| homelab-infra | 4 | números de retenção; IPs/portas; tag `v1.0.4`; `period:2` |
| endurance | 3 | D10 completo; NUC/hermes/pve; F2 do helper de credencial |
| lazarus | 2 | RRF/BM25/`k=60`; corpus e vetores `bge-m3` |
| dotfiles | 4 | Pester/`op`/CRLF; `_functions.ps1`; stashes do `dotfiles-windows` |
| nexus · tomo · sofon · pion · tars | 0 | delta vazio por construção (HEAD == ponteiro) |
| **Total** | **35** | — |

---

## Fatias sugeridas para a próxima release

- **Fatia 1 (P0, ≤1 h):** A1+A2+A3 (um só mecanismo: o sync simétrico) · F2 (criar os 3 ponteiros) · F4/B5.10.
- **Fatia 2 (P0, gates):** B1.1/B1.2 · B1.5 · B2.3 · B2.6 · B3.3 · B6.1 · B7.1/B7.2 · B8.1.
- **Fatia 3 (2b, por partes):** B9.1 (coordenação) + B9.2 (banco) — os dois blocos com maior densidade de P0.
- **Fatia 4 (skill nova):** `coleta-hostil` (B3.1-B3.5), depois de D-2.
- **Fatia 5 (contradições):** F1 (commit do `agent/`), F3 (índice), F5 (declarar `tars identity`), F6 (merge da curadoria).
