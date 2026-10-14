# Curadoria do ecossistema → Tars — fase 1: COLETA (recorte de 11/10/2026)

Só leitura. Marco: última curadoria do Tars = **08/10 23:34** (`/projects/tars`, `.ai/memory` e `.ai/governance`;
commit `8f712634` = merge do PR #3, "feat/tars-dev9-secrets"). Coleto o que entrou **depois** disso.

Protocolo lido: `/workspace/.ai/base/governance/EVOLUTION.md` e `source-of-truth.md`.

## 0. Recorte — quais repos existem (e o que tem atividade)

| Repo pedido | Caminho | Existe? | HEAD | Commits desde 08/10? |
|---|---|---|---|---|
| seo-brain | `/projects/seo-brain` | sim | `3f39ee16` | **sim** (1: 11/10 16:06) |
| tokenhood | `/projects/tokenhood` | sim | `82bb63c0` | não (nada desde 08/10) |
| fabber | `/projects/fabber` | sim | `095419ed` | não |
| fabber* (ecommerce/wsl-probe/2-ecommerce) | `/projects/fabber-*` | sim (wsl-probe sem `.git`) | — | não |
| endurance | `/projects/endurance` | sim | `f0e260e6` | **sim** (1: 11/10 16:05) |
| lazarus | `/projects/lazarus` | sim | `f633e776` | não |
| pion | `/projects/pion` | sim | `01163d57` | não |
| tomo | `/projects/tomo` | sim | `48408fed` | não |
| sofon | `/projects/sofon` | sim | `a5c6d955` | não |
| dotfiles | `/projects/dotfiles` | sim | `92e69227` | não |
| farmega.v2 | `/projects/farmega.v2` | sim | `ffc5afb3` | não |

**Não há trabalho novo (git) em: tokenhood, fabber*, lazarus, pion, tomo, sofon, dotfiles, farmega.v2** desde 08/10.
A atividade do recorte está em **seo-brain** e **endurance** (ambos 1 commit em 11/10), mais três repos **fora do
recorte mas centrais** para o que o dono pediu, que puxei como evidência de contexto:

- **`/projects/tars`** (o próprio catálogo) — commits 09/10 e 11/10 em `.ai/governance`/`.ai/memory` e a **branch
  `feat/daneel-agente`** (a peça da Daneel — alvo obrigatório deste pedido).
- **`/projects/huldlabs`** (repo central da org, criado 10/10) — README do ecossistema, 2 ADRs, backlog geral, estudos.
- **`/workspace`** (segtools) — os `.cache/*.md` (auditorias, pesquisas, reconciliações, prompts de worker) e os
  `var/worker-runs/*/resumo.txt` (lições dos workers), exigidos pelo pedido para o recorte "sessões".

Onde o pedido mandou ler transcripts de sessão Claude em `/projects/../` (inacessíveis daqui), usei os relatórios
`.cache/*.md` do segtools e os `resumo.txt` de `var/worker-runs/*/` (492 runs).

---

## 1. Registro de acessos da Daneel (OBRIGATÓRIO — hoje ausente do Tars)

**Achado central.** Todo o "registro de acessos" da Daneel **existe, mas está numa branch NÃO mergeada** do Tars:
`feat/daneel-agente` (4 commits, `1066793`..`d87ed10`, de 11/10). O pedido cita
`/projects/tars/.worktrees/hook/tools/framework/tars-acessos.mjs`; essa worktree foi removida no meio da coleta
(outra sessão ativa), mas o arquivo vive na branch:

```
git -C /projects/tars log --oneline main..feat/daneel-agente
d87ed10 docs(daneel): perfil padrao do Hermes e guardrails explicitos
5aa3ee2 docs(daneel): ficha verificavel da persona vira doctrine
9d6dbcd test(acessos): mock com ghp_x prova a guarda anti-segredo
2109d53 📝 docs(catalogo): registra a skill e o inventario da Daneel
1f59772 ✨ feat(acessos): inventario de acessos da Daneel gerado (tars acessos)
1066793 ✨ feat(skills): skill canonica da Daneel (identidade de automacao)

git -C /projects/tars diff --name-status main...feat/daneel-agente
M .ai/doctrines.toml   A .ai/skills/daneel/SKILL.md   M CHANGELOG.md   M README.md
A tools/framework/tars-acessos.mjs   A tools/framework/tars-acessos.test.mjs
M tools/framework/tars.mjs   M tools/framework/tars.test.mjs
```

### 1.1 O que o `tars-acessos.mjs` faz (fonte lida: `feat/daneel-agente:tools/framework/tars-acessos.mjs`, 260 linhas)

Módulo que **gera** (nunca escreve à mão) o inventário `acessos/daneel.md`. Garantias no cabeçalho:

- **Read-only**: só GET/list/read em GitHub/1Password/host (linhas 11-13).
- **Nunca imprime VALOR de segredo**: GitHub pela API (não mostra token); 1Password lista cofre/item/campo por
  **NOME** (nunca `op read`/`--reveal`); a saída passa por `assertSemSegredo` (linhas 13, 53-56) que reusa
  `secrets-patterns.mjs` (o mesmo do pre-commit) e **reprova alto** se casar padrão de segredo.
- **Falta credencial = `(indisponivel: <motivo>)`**, nunca inventário mentiroso (linha 14).

Coletores e o que cada um extrai:

| Coletor | Fonte | Extrai |
|---|---|---|
| `coletarGitHub` (linhas 71-100) | `gh api` | login, orgs, repos (privado/público + nível admin/push/pull), convites pendentes de repo e de org |
| `coletar1Password` (107-141) | `op vault list`/`op item list`/`op item get --fields label` | cofres e **nomes** de itens e campos — nunca valores |
| `coletarHosts` (144-156) | `ssh daneel@<host>` com `true` e `sudo -n true` | entra? sudo NOPASSWD? |
| `coletarFerramentas` (159-167) | `--version` | op, gh, git, docker, uv |

**Constantes embutidas (fonte dos acessos):**
- `ORGS_PADRAO = ['HuldLabs', 'growthsbr', 'FabberLabs']` (linha 28; fonte citada: `.cache/gh-daneel-push.sh`).
- `HOSTS_PADRAO = ['nuc.czul.net']` (linha 30; fonte citada: `.cache/hi/hosts/nuc.py`).
- `depsReais` (242-250): `op` roda com `OP_SERVICE_ACCOUNT_TOKEN` injetado; `ssh` usa `-o BatchMode=yes
  -o ConnectTimeout=8 daneel@<host>`. Identidade SSH do bot = usuário **`daneel`**.

Projeção markdown (`renderInventario`, 185-222): seções GitHub / 1Password / Hosts SSH / Ferramentas. Nota final
"_Somente nomes: nenhum valor de campo e lido ou registrado._". Ponto **NÃO fechado** no módulo: o **drift** (o
`diff` entre duas gerações que o desenho do §4 de `.cache/daneel-arquitetura.md` exige) **não está implementado** —
o módulo gera e ordena para o diff ser estável (`sort` por nome, linha 194), mas não compara contra o commitado.

### 1.2 Onde mora cada peça do acesso (fonte: `.ai/skills/daneel/SKILL.md` §4-§7 da branch)

| Peça | Dono | Caminho / ref |
|---|---|---|
| Skill canônica (persona, contrato, como vestir) | Tars | `.ai/skills/daneel/SKILL.md` |
| Inventário **gerado** | privado `HuldLabs/huldlabs` | `acessos/daneel.md` |
| Credenciais | cofre `secrets`, item `daneel-bot` | `op://secrets/daneel-bot/*` |
| Token da SA de leitura | — | `~/.config/tars/automation/op-sa.token` |
| Comando | Tars | `tars acessos daneel [--out <arquivo.md>] [--json]` |

**Registro de acessos propriamente dito (o que o pedido pediu para incluir):**

- **Hosts SSH:** `nuc.czul.net` (IP LAN `10.0.0.220`), usuário `daneel`, sudo **NOPASSWD completo** (dono, 08/10).
  ProxyJump: `hermes` (`pablo@10.0.0.200`). Também `pve` (`10.0.0.3`, sudo NOPASSWD completo). Fonte:
  `.cache/endurance-decisoes.md` §SSH + `.cache/daneel-arquitetura.md` §0.
- **Chaves `op://`:** SSH do homelab em `op://secrets/daneel-bot/homelab/auth-ssh-key-*` (lida pela SA da Daneel);
  chave de assinatura em `op://secrets/daneel-bot/github/signing-ssh-private-key` (e `…/signing-ssh-private-key?ssh-format=openssh`
  quando é campo nativo); PAT do GitHub em `op://secrets/daneel-bot/github/pat-classic-daneel-bot-automation`; SA do
  1Password em `op://secrets/daneel-bot/1password/…` (leitura e escrita). Fonte: `.cache/daneel-arquitetura.md` §3-§4,
  `.ai/memory/agent/daneel-opera-tudo.md`, `.ai/governance/licoes-plataforma.md:24`.
- **PAT do GitHub:** hoje **PAT classic** (`daneel-bot`) — recomendação de endurecimento registrada (não decidida):
  migrar para **GitHub App** (instalação por repo, token `ghs_` de 1h; fecha NHI4/NHI5/NHI7). Fonte
  `.cache/daneel-arquitetura.md` §3, §"Mudanças de segurança recomendadas".
- **Identidade de git:** `user.name=Daneel`, `user.email=daneel-bot@pabloaugusto.com`, chave de assinatura própria
  (nunca a do dono). Fonte `segredos-e-identidade.md:88-101`.
- **Forgejo (identidades):** usuário `daneel` criado por receita, segredos em `op://secrets/daneel-bot/forgejo/…`;
  admin `pablo`→`pabloaugusto`. Fonte `docs/homelab-plano-coordenador-flash.md` §F1-identidades.
- **APIs:** GitHub (API + PAT), 1Password (SA de leitura no dia a dia; RW só sob ordem do dono, doutrina 14), Forgejo.

### 1.3 Gaps do registro de acessos (o que falta para o Tars ser fonte)

1. **Não mergeado.** Skill + módulo + doutrinas estão só na branch `feat/daneel-agente`. `main` do Tars **não tem**
   `.ai/skills/daneel/` nem `tools/framework/tars-acessos.mjs`.
2. **`acessos/daneel.md` nunca foi gerado/commitado** no `HuldLabs/huldlabs` (o repo central existe — README, 2 ADRs,
   backlog, estudos — mas **nenhum** `acessos/`). O ponteiro da skill aponta para um arquivo que não existe ainda.
3. **Drift não implementado** no módulo (gera, mas não faz `diff` contra o commitado).
4. **Doutrinas `daneel/*` sem gate.** Das 4 adicionadas, 2 têm `gate = "nenhum"` com motivo declarado (Hermes não
   migrado); as outras 2 só cobrem `--no-verify`/`git add -f` via `block-destructive-commands.sh`. Comentário da
   própria branch nomeia a dívida: "`force-push`, push em repo público e escrita no cofre ainda **NÃO** tem gate".

---

## 2. Itens coletados (fonte · data · tipo · classificação)

Legenda de classificação: **G→Tars** (genérico, vale para qualquer projeto) · **E→huldlabs** (decisão transversal da
org) · **P** (fica no projeto). Coluna *cobertura*: COBERTO/PARCIAL/FALTANDO no Tars main, com `arquivo:linha`.

### 2.1 Governança de IA e identidade de automação (branch `feat/daneel-agente`)

| # | Item | Fonte · data | Tipo | Classe | Cobertura no Tars main |
|---|---|---|---|---|---|
| A1 | Skill canônica da Daneel (persona ela/dela, missão, ficha `permitida|proibida|exige aprovação`, stop conditions, "como vestir") | `feat/daneel-agente:.ai/skills/daneel/SKILL.md` · 11/10 | regra | **G→Tars** | **FALTANDO** (só na branch) |
| A2 | Inventário de acessos **gerado** + guarda anti-segredo | `feat/daneel-agente:tools/framework/tars-acessos.mjs` + `.test.mjs` · 11/10 | regra | **G→Tars** | **FALTANDO** (só na branch) |
| A3 | Daneel é o **perfil PADRÃO do Hermes**; runtime consome a skill, nunca redefine | `SKILL.md:3`, doutrina `daneel/hermes-perfil-padrao` · 11/10 | decisão | **G→Tars** | **FALTANDO** |
| A4 | Autoedição/curator **desligados** no perfil da Daneel; credencial nenhuma dentro do Hermes | `SKILL.md:38-39`, doutrina `daneel/autoedicao-desligada` · 11/10 | regra | **G→Tars** | **FALTANDO** |
| A5 | Stop conditions: falta credencial do bot → parar e reportar (nunca cair na do dono); `gh api user` ≠ `daneel-bot` = identity mismatch | `SKILL.md:52-61`, §4 item 4 · 11/10 | regra | **G→Tars** | **PARCIAL** — a doutrina existe na prosa (`segredos-e-identidade.md:4`) mas o contrato verificável da persona não está em main |
| A6 | Doutrina como DADO (fonte/gate/prova/onde), `tars doctor` reprova órfã nomeada | `.ai/doctrines.toml:1-14` · já existia | regra | **G→Tars** | **COBERTO** (`.ai/doctrines.toml` em main) — método já é o "mais automático"; as linhas `daneel/*` entram nele |

### 2.2 Homelab / infraestrutura (decisões do dono de 10-11/10)

| # | Item | Fonte · data | Tipo | Classe | Cobertura no Tars main |
|---|---|---|---|---|---|
| B1 | **Layout `/srv/<ambiente>/<app>/{data,conf,…}`** (bind sempre) substitui `/opt/<app>` + `/srv/data/<app>` | `.ai/memory/agent/prod-sempre-em-docker.md`; `homelab docs/decisoes.md 3604466` · 11/10 | decisão | **G→Tars** (layout de estado vale para todo app do ecossistema) | **FALTANDO** (não há doutrina de layout de dados; `estado-exige-datadir.md` cobre o *marcador* do volume, não o caminho) |
| B2 | Produção **sempre em Docker**; nada de uv/python/venv/unit de app no host | `.ai/memory/agent/prod-sempre-em-docker.md` · 09/10-11/10 | regra | **G→Tars** | **FALTANDO** |
| B3 | **Forgejo é o espelho universal** de repos (`/srv/repos` é a raiz dele, layout `<dono>/<repo>.git`); v1 (`/srv/repos` cru) descartada | `.ai/memory/agent/srv-repos-espelho-universal.md`; `plano-flash` §F1-§F3 · 10/10 | decisão | **E→huldlabs** (infra da org) | **FALTANDO** no Tars (é decisão de infra; candidata a nota no huldlabs/BACKLOG, ver §4) |
| B4 | **Reconciliação de CADA repo só depois de perguntar ao dono**; `/mnt/e` é mina do crash, nunca fonte | `plano-flash` §F2; `srv-repos-espelho-universal.md` · 10/10 | regra | **E→huldlabs** | **PARCIAL** — princípio "nada se perde" é memória (`consolidacao-nada-se-perde.md`) mas não é doutrina |
| B5 | **NADA em prod sem ordem direta do dono** (reapply, rollback, troca de imagem, config) | `.ai/memory/agent/app-de-prod-so-com-autorizacao.md`; `plano-flash` §regras · 10/10 | regra | **G→Tars** | **FALTANDO** (é regra de operação, não específica do segtools) |
| B6 | **Motor do homelab: ficha YAML + schema e geração em CUE** (binário oficial fixado); medida CUE × Python documentada | `plano-flash` §"Formato do motor — DECIDIDO" · 11/10; `cue-toml-array-de-tabelas-grau.md` | decisão + armadilha | **P** (motor é do homelab) — mas a **armadilha** do CUE é G | **FALTANDO** (a armadilha `cue tomli [][]` é candidata a `licoes-plataforma`) |
| B7 | Compilado = *rendered manifests* (Helm+Flux): toda rota/card/monitor/backup nasce da ficha; zero label `traefik.*`/`homepage.*`; render 2× = bytes idênticos | `plano-flash` §NOVO MOTOR · 10/10-11/10 | decisão | **P** | **P** |
| B8 | **IaC/CaC sem exceção** (nada à mão no NUC); **contratos bloqueantes** (suite vermelha não publica) | `.ai/memory/agent/iac-e-contratos-bloqueantes.md` · 10/10 | regra | **G→Tars** | **FALTANDO** |
| B9 | Gatus + endpoints derivados das rotas; heartbeat externo; SMART/ntfy; Renovate no Forgejo; `--dry-run`+diff no push | `.cache/homelab-insights.md` · 10/10 | contexto | **E→huldlabs** | **FALTANDO** (estudos do homelab) |

### 2.3 Método de IA / catálogo (origem iageny, promovida a BACKLOG do huldlabs)

| # | Item | Fonte · data | Tipo | Classe | Cobertura no Tars main |
|---|---|---|---|---|---|
| C1 | Ficha de agente verificável: `allowed/prohibited_actions`, `stop_conditions`, `human_approval_triggers`, `done_when`+checks | `huldlabs/BACKLOG.md` §Ideias a portar 1; `.cache/iageny-gaps.md` §1 · 10/10 | regra | **G→Tars** | **PARCIAL** — a ideia materializou em `daneel/SKILL.md` ficha + `doctrines.toml`, mas só na branch |
| C2 | Ledger retomável de trabalho de IA (doing/done/log) com gate que falha com item aberto | `huldlabs/BACKLOG.md` item 2 · 10/10 | regra | **G→Tars** (→ Kipp + Tars) | **FALTANDO** |
| C3 | Correlação worklog × roadmap (registro + gate) | `huldlabs/BACKLOG.md` item 3 · 10/10 | regra | **G→Tars** | **FALTANDO** |
| C4 | Gate de paridade CI × Taskfile (CI só roda o que existe como `task`) | `huldlabs/BACKLOG.md` item 4 · 10/10 | regra | **G→Tars** | **FALTANDO** |
| C5 | Contrato único de tempo/locale/número/moeda para todos os projetos | `huldlabs/BACKLOG.md` item 5 · 10/10 | regra | **G→Tars** | **FALTANDO** |
| C6 | MCP do ecossistema no modelo Atlassian MCP v2 (`discover` + execute por classe de risco, um gateway) | `huldlabs/estudos/2026-10-10-mcp-ecossistema-atlassian-v2.md` | decisão | **E→huldlabs** | **FALTANDO** |

### 2.4 Arquitetura do ecossistema (ADRs do huldlabs, 10/10)

| # | Item | Fonte · data | Tipo | Classe | Cobertura no Tars main |
|---|---|---|---|---|---|
| D1 | **Binário portátil, standalone ou plugado** (ADRP-0002): o produto é o binário; 2 modos; manifesto como dado (`/manifest`, `<bin> manifest --json`); adaptador genérico por framework; fronteira transacional fica no hospedeiro | `huldlabs/adr/0002-servicos-binarios-e-modo-plugado.md` · 10/10 (aceito) | decisão | **E→huldlabs** (vale p/ Tars, Sofon, Pion, Tomo, Kipp, thood, Morse, Brand, Lazarus) | **FALTANDO** no Tars; **pode entrar como linha em `.ai/doctrines.toml`** (mesmo padrão de `versionamento-de-extracao.md`) |
| D2 | **Mensageria e jobs**: 3 donos (`communication`/`notifications`/`jobs`) + outbox como transporte; contrato `CommunicationRequest`; `emit(tx)` na mesma transação; motor de jobs do segtools vira padrão (7 verbos, 3 chaves de idempotência, lease por CHECK) | `huldlabs/adr/0001-mensageria-e-jobs.md` · 10/10 (proposto) | decisão | **E→huldlabs** (→ Sofon/Pion/Morse) | **FALTANDO** |
| D3 | **Cinco peças do ecossistema**: Tars (método), Tomo (DS), Sofon (stack Next), Pion (stack Python), Kipp (work tracking); catálogo, não pacote fechado; item declara a stack que pede | `/projects/huldlabs/README.md` · 11/10 | contexto | **E→huldlabs** | **FALTANDO** no Tars (é README da org; só o índice precisa existir no Tars para o boot saber onde ler) |
| D4 | **Ferramenta transversal sai como binário único** (`tars`, `kipp`, `tars secrets`); nada exige runtime de outra stack | `huldlabs/README.md` §Regras transversais · 11/10 | regra | **G→Tars** | **PARCIAL** — `ecossistema-agnostico-de-runtime.md` (memória) toca o tema, sem a forma "binário único" |

### 2.5 Plataforma (Windows/WSL/container) e segurança

| # | Item | Fonte · data | Tipo | Classe | Cobertura no Tars main |
|---|---|---|---|---|---|
| E1 | Chave SSH com CRLF → `error in libcrypto`; normalizar antes de usar; `daneel-bot` key de `op://…/signing-ssh-private-key` (3 linhas com CR) | `.ai/governance/licoes-plataforma.md` §1 · 08/10 | armadilha | **G→Tars** | **COBERTO** (é o próprio arquivo, em main) |
| E2 | 1Password `?ssh-format=openssh` só em campo SSH Key nativo; PKCS#8 vs OpenSSH | `licoes-plataforma.md` §2 · 08/10 | armadilha | **G→Tars** | **COBERTO** |
| E3 | `wsl.exe` expande `$VAR` no lado Windows; comando vai em arquivo (`bash <file>`) | `licoes-plataforma.md` §3 · 08/10 | armadilha | **G→Tars** | **COBERTO** |
| E4 | Worktree do Windows visto do WSL (`gitdir: C:/…`) | `licoes-plataforma.md` §4 · 08/10 | armadilha | **G→Tars** | **COBERTO** |
| E5 | Serviço com estado **não sobe sobre volume vazio** (marcador `.initialized`; init é decisão explícita) | `.ai/governance/estado-exige-datadir.md` · já existia | regra | **G→Tars** | **COBERTO** |
| E6 | Token do bot do Slack **commitado** em `homelab-devops/.../slack-provider.yaml:16` — revogar, tirar do arquivo, checar visibilidade | `huldlabs/BACKLOG.md` §Segurança · 10/10 | armadilha | **E→huldlabs** | **FALTANDO** (não é do Tars; é backlog do huldlabs — já registrado lá) |
| E7 | **seo-expert completo fora do `/srv/repos`**: código só existe no disco do crash (`/mnt/e/BKP/…`, `/mnt/e/recuperado/…`); consolidar em `/srv/repos/seo-expert.git` | `huldlabs/BACKLOG.md` §Consolidação · 10/10 | contexto | **E→huldlabs** | **FALTANDO** (projeto/homelab) |

### 2.6 seo-brain (atividade nova de 11/10)

| # | Item | Fonte · data | Tipo | Classe | Cobertura no Tars main |
|---|---|---|---|---|---|
| F1 | Ingestão do seo-brain reconstruído (E:, crash 07/10): `insights_finding_doctrine.py` reconstruído é superset do commitado (acrescenta `_cross_encoder`/alavanca 2) | `seo-brain:3f39ee16` · 11/10 | contexto | **P** | **P** |
| F2 | `docs/recuperacao/INVENTARIO-seo-brain.md` — fonte única do escopo pós-`2045e5f` | `seo-brain:3f39ee16` · 11/10 | contexto | **P** | **P** |
| F3 | **Recrear índice vetorial** (pgdata do serp-pg perdido no crash); `.md` são a fonte; reindexar com Ollama no Ryzen | `seo-brain:HANDOFF.md` item 31 · 11/10 | contexto | **P** | **P** |
| F4 | Não ingerir `_outros-repos/processo-seo` (é do seo-expert, não do seo-brain) | `seo-brain:3f39ee16` trailer | lição | **P** | **P** |
| F5 | `No-Lesson:` usado quando a ingestão é artefato reconstruído por script de export de sessão | `seo-brain:3f39ee16` trailer | lição | **G→Tars** | **COBERTO** (o gate aceita `No-Lesson`; doutrina em `git/lesson-trailer`) |

### 2.7 endurance (atividade nova de 11/10)

| # | Item | Fonte · data | Tipo | Classe | Cobertura no Tars main |
|---|---|---|---|---|---|
| G1 | Endurance = imagem base do ecossistema + features por stack; **decisões de 08/10 trazidas para o repo** | `endurance:f0e260e6`; `.cache/endurance-decisoes.md` · 11/10 | contexto | **G→Tars** (é o `devcontainer` do ecossistema) | **PARCIAL** — há `versionamento-de-extracao.md` (a peça nasce `0.0.1-dev.N`) mas a spec de imagem/features vive no README do endurance |
| G2 | **Segredos e signing viram finos**: instalam `tars`, montam o volume do token e chamam `tars secrets refresh/exec` e `tars identity provision` — sem lógica própria | `.cache/endurance-decisoes.md` §2 · 08/10-11/10 | decisão | **G→Tars** (é a doutrina de segredos aplicada) | **PARCIAL** — `segredos-e-identidade.md` é a doutrina; a "feature fina" é consequência |
| G3 | **Multi-user security (11 pontos)**: sem identidade/segredo na imagem; volumes nomeados `<user>-<project>-op`; socket root só single-owner; agente SSH do dono nunca entra; uid do host; uma SA por projeto read-only | `.cache/endurance-decisoes.md` §Multi-user · 08/10-11/10 | regra | **G→Tars** | **FALTANDO** — endurecimento de imagem multi-usuário é genérico e não está no Tars |
| G4 | **SSH a servidores locais por ator**: dono = agente 1OP; automação = chave própria do bot (user `daneel`); runner cloud não entra na LAN; `known_hosts` fixo; `from=` LAN, sem forwarding | `.cache/endurance-decisoes.md` §SSH · 08/10 | regra | **G→Tars** | **FALTANDO** (a doutrina 7 cobre o transporte por ator; o detalhe do `authorized_keys` restrito não) |
| G5 | Cobertura de tooling: falta no endurance `php` (Fabber), `mysql-client`, `redis-client`, `pwsh` (dotfiles 50 .ps1), pnpm/npm corepack (farmega, tokenhood) | `.cache/endurance-decisoes.md` §Coverage · 08/10 | contexto | **G→Tars** | **FALTANDO** (backlog de features do endurance) |
| G6 | **Paridade com CI**: mesma imagem por digest, `task ci` como única entrada, gate em `tars doctor` (imagem/digest do CI == devcontainer; CI só chama o entrypoint) | `.cache/endurance-decisoes.md` §Paridade · 08/10 | regra | **G→Tars** | **FALTANDO** — relaciona com C4 (paridade CI×Taskfile) |
| G7 | Publicar **só em tag `v*`**; versão derivada da tag | `endurance:6ae08cf` · 07/10 | contexto | **G→Tars** | **COBERTO** (`git/tag-semver` em `doctrines.toml`) |
| G8 | GitLab = gerador YAML no Tars a partir da mesma declaração | `.cache/endurance-decisoes.md` §Paridade · 08/10 | decisão | **G→Tars** | **FALTANDO** (futuro) |

### 2.8 Regras de operação e identidade (memórias do segtools, 10-11/10)

| # | Item | Fonte · data | Tipo | Classe | Cobertura no Tars main |
|---|---|---|---|---|---|
| H1 | **Daneel opera tudo**; as credenciais dela são as **únicas** no devcontainer; nenhuma credencial do dono/admin montada | `.ai/memory/agent/daneel-opera-tudo.md` · 10/10 | regra | **G→Tars** | **FALTANDO** (é a identidade de automação — mesma família da skill da Daneel) |
| H2 | **Nunca ler/editar pelo caminho do Windows** (`\\wsl.localhost`/`/mnt/c|d`); tudo dentro do devcontainer/WSL | `AGENTS.md` §4; memória `buscar-dentro-do-container.md` | regra | **G→Tars** | **PARCIAL** — doutrina 3 (`licoes-plataforma.md:38-45`) cobre `wsl.exe`; a regra geral de FS está no AGENTS do segtools |
| H3 | App novo nasce com **BACKLOG** | `.ai/memory/agent/app-novo-nasce-com-backlog.md` · 10/10 | regra | **G→Tars** | **FALTANDO** |
| H4 | **Limitação só com alternativas** (dizer "não dá" exige listar o que dá) | `.ai/memory/agent/limitacao-so-com-alternativas.md` · 11/10 | regra (feedback do dono) | **G→Tars** | **FALTANDO** |
| H5 | **Curador/coordenador único até o NUC** (não ramificar coordenação antes do servidor central) | `.ai/memory/agent/coordenador-unico-ate-nuc.md` | regra | **P** (operação do segtools) | **P** |
| H6 | **Fable só com pedido** (modelo caro não é o default) | `.ai/memory/agent/deepseek-pro-so-com-pedido.md` | regra | **G→Tars** (política de custo/coordenação) | **PARCIAL** — `agent-coordination/SKILL.md` §1 (economia de tokens) toca, sem a regra explícita |
| H7 | **Conferir dependências antes de liberar recurso** (módulo que ainda não existe não trava) | `.ai/memory/agent/conferir-dependencias-antes-de-liberar-recurso.md` | regra | **G→Tars** | **PARCIAL** |
| H8 | **GHCR privado grátis** (imagem por digest; o NUC nunca builda) — base do R9 do motor | `.ai/memory/agent/ghcr-privado-gratis.md` + `plano-flash` §R9 | decisão | **E→huldlabs** | **FALTANDO** |
| H9 | **Trabalho salvo antes de remover worktree** (`wip:` antes de `worktree remove`) | `workspace` commits `18965009`,`a0374743`,`b1366a1b` ("trabalho sem commit salvo antes de remover a worktree") · 11/10 | armadilha | **G→Tars** | **FALTANDO** (lição do próprio harness de worktree) |
| H10 | Identidade de commit do **repo** (worker herda a identidade do repo, não a global) | `workspace:57767ca7` "commit do worker sai com a identidade do repo" · 11/10 | regra | **G→Tars** | **PARCIAL** (`segredos-e-identidade.md:8` fala de autoria; o "do repo" é específico do worker) |
| H11 | Worker: **sem teto de verba/turnos por padrão**; o freio é o custo, ligado por hook | `workspace:0794128a`,`7d83e9f2`,`f23fa452`,`e5e38b24` (SEG-921) · 11/10 | regra | **P** (harness do segtools) | **P** |
| H12 | Hooks da rodada também em `--sem-canal` | `workspace:7c3ff610` · 11/10 | regra | **P** | **P** |

### 2.9 Devcontainer / plataforma (workspace, 10-11/10)

| # | Item | Fonte · data | Tipo | Classe | Cobertura no Tars main |
|---|---|---|---|---|---|
| I1 | `devcontainer up` travava com **Docker v29** (Round 16); `task dev:recreate` com CLI ≥0.80.2 e timeout | `workspace:251335a0`,`625810aa` · 10/10; `docs/devcontainer-lessons.md` | armadilha | **G→Tars** | **FALTANDO** (`licoes-plataforma.md` não cobre Docker v29/devcontainer up) |
| I2 | `~/projects` inteiro montado em `/projects`; monta huldlabs, kipp, homelab-infra | `workspace:694e815c`,`bf8d3887` · 10/10 | decisão | **G→Tars** | **FALTANDO** (layout de mounts do devcontainer do ecossistema) |
| I3 | Contrato de identidade usa o perfil **Daneel**; gh e git como Daneel; PAT da Daneel no post-start | `workspace:c63194e2`,`b30510e5`,`32715fbc` · 10-11/10 | regra | **G→Tars** | **FALTANDO** (mesma família da skill da Daneel) |

---

## 3. CONTRADIÇÕES entre repos (marcadas)

1. **`/srv/data/<app>` (memória antiga) × `/srv/<amb>/<app>` (decisão 11/10).** `infra-nuc-producao.md` e a versão v1
   de `srv-repos-espelho-universal.md` falam de dados por app; a decisão de **11/10** (`homelab docs/decisoes.md
   3604466`, citada em `prod-sempre-em-docker.md`) define `/srv/<ambiente>/<app>/{data,conf,…}` e **substitui** o
   `/opt/<app>` + `/srv/data/<app>`. → **A memória antiga ficou viva sem marca de superada** (o `prod-sempre-em-docker`
   marca, mas `infra-nuc-producao` não). Ação: Tars deve ter a regra de layout numa fonte única; as memórias antigas
   viram ponteiro.

2. **Forgejo × `/srv/repos` cru.** `srv-repos-espelho-universal.md` marca explicitamente a v1 como **SUPERADA (10/10)**
   pelo Forgejo — coerente. Mas `infra-nuc-producao.md` (09/10) ainda diz "`/srv/repos/*.git` no NUC vira o espelho
   universal", sem citar o Forgejo. → **`infra-nuc-producao.md` está desatualizada** (escrita antes da decisão do Forgejo).

3. **Sudo do bot.** A spec `endurance-decisoes.md` §SSH propõe "sudo mínimo / lista de comandos" para produção; a
   realidade registrada na **mesma** nota (08/10 tarde) é **sudo NOPASSWD completo** no NUC, hermes e pve — "substitui
   a spec como decisão do dono". Risco nomeado pelo próprio dono: pve vira base de produção hardened → o bot = root em
   prod. → Contradição **resolvida por decisão do dono**, mas a **proposta de endurecimento ficou pendente de
   confirmação** ("Risk to confirm with the owner"). Não é conflito aberto; é decisão com follow-up.

4. **`/srv/repos` × `/srv/repos` como raiz do Forgejo.** O item B3 e o `huldlabs/BACKLOG` §Consolidação usam
   `/srv/repos/seo-expert.git` e `/srv/repos/homelab-devops.git` ("planos `*.git`") enquanto o `plano-flash` §F1 diz
   que esses `*.git` **planos ficam intocados** (fora do layout do Forgejo, que só vê `<dono>/<repo>.git`). → Mesma
   raiz, **duas organizações** coexistentes (transitório, até a reconciliação F2). Marcar como "estado de transição",
   não contradição de decisão.

5. **`hook-exec` × hooks gerados executáveis.** A worktree `w/hookexec` ("hooks gerados nascem executáveis") e
   `w/k0`/`fix/hook-consumidor` (hook do catálogo acha o motor fora do consumidor) são correções de **mecanismo** já
   mergeadas/fechadas em 11/10 (PRs #4/#5) — sem contradição, mas indicam **instabilidade do mecanismo de hook** nos
   últimos 2 dias (candidato a lição de plataforma: hook do catálogo e o "motor fora do consumidor").

---

## 4. Síntese para a promoção (fase 2 do coordenador)

**Genérico→Tars, FALTANDO, com maior valor (sugestão de ordem):**

1. **Mergear/absorver a branch `feat/daneel-agente`** — é a peça que o dono pediu como obrigatória e já está pronta
   (skill + módulo + doutrinas + changelog). Precisa: (a) fechar os gates das doutrinas `daneel/*` hoje em `"nenhum"`;
   (b) implementar o `diff` de drift; (c) **gerar `acessos/daneel.md` no HuldLabs/huldlabs** (hoje inexistente).
2. **Doutrinas de operação que hoje são só memória do segtools** e valem em qualquer consumidor: produção sempre em
   Docker (B2), layout `/srv/<amb>/<app>` (B1), nada em prod sem ordem do dono (B5), IaC/CaC sem exceção + contratos
   bloqueantes (B8), app novo nasce com backlog (H3), limitação só com alternativas (H4).
3. **Endurecimento multi-usuário do container** (G3) + **SSH restrito por ator** (G4) + **paridade CI×Taskfile** (C4/G6):
   são regras genéricas de plataforma; parte já tem a semente em `licoes-plataforma.md`/`doctrines.toml`.
4. **Paridade/ledger/contrato de tempo** (C2, C3, C5) — vieram do iageny, já estão no BACKLOG do huldlabs como
   "portar como gate do Tars".
5. **ADRs da org** (D1, D2) como **linhas em `doctrines.toml`** (escopo `catalogo` ou `huldlabs`), no mesmo padrão de
   `versionamento-de-extracao.md`.
6. **Lições de plataforma novas** (I1 Docker v29/devcontainer up; B6 armadilha CUE-TOML; H9 worktree wip; mecanismo de
   hook instável) → anexar a `.ai/governance/licoes-plataforma.md`.

**Ecossistema→huldlabs (não ao Tars):** Forgejo espelho universal (B3), reconciliação repo-a-repo (B4), Gatus/heartbeat/
Renovate (B9), MCP do ecossistema (C6), token Slack commitado (E6), seo-expert fora do `/srv/repos` (E7), GHCR (H8),
ADRs D1/D2.

**Projeto (fica onde está):** todo o seo-brain (F1-F5), motor/compilado do homelab (B7), harness de worker do segtools
(H5, H11, H12).

---

## 5. Fontes lidas (caminho + HEAD quando git)

- Repos do recorte: `/projects/seo-brain` (`3f39ee16`), `/projects/endurance` (`f0e260e6`); demais do recorte sem
  atividade desde 08/10 (HEADs na tabela §0).
- `/projects/tars` (`main` + branch **`feat/daneel-agente`** `d87ed10`; worktrees `hook-main`/`hookexec`/`k0`/`licoes`):
  `.ai/skills/daneel/SKILL.md`, `tools/framework/tars-acessos.mjs(+.test)`, `.ai/doctrines.toml`, `.ai/governance/{segredos-e-identidade,licoes-plataforma,estado-exige-datadir,incidente-vira-prevencao,versionamento-de-extracao,source-of-truth,EVOLUTION}.md`, `.ai/memory/{INDEX,README}.md`.
- `/projects/huldlabs` (`50638daf`): `README.md`, `BACKLOG.md`, `adr/0001-*`, `adr/0002-*`, `estudos/2026-10-10-*`.
- `/workspace/.cache/`: `daneel-arquitetura.md` (253 l.), `endurance-decisoes.md`, `homelab-insights.md`,
  `iageny-gaps.md`, e inventário de 40+ relatórios.
- `/workspace/docs/homelab-plano-coordenador-flash.md` (178 l.).
- `/workspace/.ai/memory/agent/*.md` (novos desde 08/10) e `/workspace/var/worker-runs/*/` (492 runs; lições via
  `resumo.txt`).

**O que NÃO consegui acessar:** transcripts de sessão Claude em `/projects/../` (fora do container) — substituídos
pelos `.cache/*.md` e `var/worker-runs/*/resumo.txt` conforme o pedido. A worktree
`/projects/tars/.worktrees/hook/` foi **removida durante a coleta** (outra sessão ativa); o conteúdo foi lido da
branch `feat/daneel-agente` equivalente.
