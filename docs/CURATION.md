# Curadoria — como o conhecimento dos repos entra no catálogo

O Tars é o **catálogo de método**. O conhecimento nasce espalhado nos repos do ecossistema
(memória, lições, handoffs, estudos, backlog) e **sobe** para o catálogo quando se prova útil
além de quem o escreveu. Este doc é a fonte única desse fluxo — antes ele era três mecanismos
soltos que ninguém ligava.

> **Fatia 1** (inventário/mapeamento) e **Fatia 2** (absorção/release) já rodaram (13-14/10).
> **Fatia 3** é a rotina daqui — o `tars curation`.

## 1. Um fluxo só, três passos que já existiam

Os três mecanismos antigos **não** são substituídos — são **ligados** na ordem certa:

| passo | mecanismo (já existia) | o que faz | quando |
|---|---|---|---|
| **1 · Medir** | `tars curation` (novo, DET) | lê o **delta** de conhecimento desde o ponteiro e lista o que andou | rotina (por ponteiro) |
| **2 · Julgar** | `EVOLUTION.md` (retrospectiva) + skill `senior-research` | decide o que entra, generalizado — e o que **não** entra, com motivo | na leitura do delta |

### Julgar começa por R1: **portar, nunca reescrever**

Antes de absorver **qualquer** coisa (skill, regra, doutrina), a primeira pergunta do passo 2
é **R1**: *isso já existe? onde?* Procure, nesta ordem:

1. o próprio repo (skills, docs, memória, testes);
2. os repos vizinhos — `/projects/*/.ai/skills`, `/projects/*/.claude/skills`, `/projects/*/docs`,
   `/projects/fabber*` (front/api/IaC);
3. o vault `ai-brain` (`.ai-brain/skills/**`) — é onde mora o método pessoal do dono.

- **Existia?** → **porte a original** como base (traga o corpo dela, não um resumo), mantenha o
  que for **genuinamente novo** e de método — **marcado** como novo — e registre a origem.
  Reescrever do zero o que já existia é o defeito que esta regra existe para barrar: perde o
  trabalho de curadoria do original e cria uma segunda fonte (fere R3).
- **Não existia?** → diga **"não existia"** e **cite a busca feita** (onde procurou). "Nova"
  sem a busca registrada é afirmação sem prova.
- **Toda absorção registra a origem** na tabela do §3 (`arquivo:linha` no repo de origem) —
  seja porte ou ideia nova. A coluna `origem` é obrigatória, nunca "—".
| **3 · Subir** | `tars promote --area <memory\|skill\|gate> --item <nome>` | escreve o item no catálogo (working tree, para revisão) | por item aprovado |

O passo 1 é **determinístico** (git, sem julgamento); o 2 é **julgamento** (LLM, com fonte); o
3 é a escrita. Marcar isso importa: só o passo 2 pode errar por opinião, e é onde a disciplina
de fonte entra.

### A retrospectiva (EVOLUTION) vira o mapa do passo 2

`EVOLUTION.md` manda, ao fim de cada sessão de análise, colher perguntas/checks/surpresas e
mapear contra o bundle como **COVERED / PARTIAL / MISSING / N/A com `file:line`**. É
exatamente essa grelha que o passo 2 usa sobre o delta: cada item do delta é COVERED (já está
no catálogo), PARTIAL (tem a ideia, falta forma/gate) ou MISSING (não tem). "Nada novo" só
vale **nomeando** os itens — a mesma disciplina do fechamento de sessão.

## 2. A rotina por PONTEIRO (idempotente)

**Ponteiro** é o último commit **curado** de cada repo. A rotina só lê o
`git diff <ponteiro>..HEAD` dos **caminhos de conhecimento** — nunca a árvore inteira:

```
.ai/memory/**   HANDOFF*   *-lessons.md   docs/estudos/**   estudos/**
docs/adr{,_s}/**   BACKLOG.md
```

(`estudos/` na raiz e em `docs/estudos/` — há os dois padrões no ecossistema.)

- **Estado:** `.ai/curation.json` — `{ repos: { "<nome>": { sha, iso } } }`, o mesmo desenho do
  `.ai/tars.lock`: arquivo de conteúdo, revisável, versionado. O ponteiro **é dado**, não código.
- **Idempotência:** sem commit novo nos caminhos de conhecimento, o delta é **vazio** e a rotina
  não faz nada — rodar de novo não muda nada (marca do R3/hooks: repetível por construção).
- **Só o delta que interessa:** um commit que mexeu só em código de produto não aparece — o alvo
  é memória/estudo/handoff, não o diff inteiro.

**Uso:**

```sh
tars curation                 # lê o delta e lista o que andou (não escreve nada)
tars curation --json          # mesma medição, para o coordenador/dashboard
tars curation --advance       # avança o ponteiro dos repos que andaram (grava o HEAD lido)
tars curation --repos <dir>   # pasta dos repos vizinhos (default: o irmão do Tars)
```

O fluxo de uma rodada: `curation` (medir) → ler o delta → `promote` por item aprovado →
registrar a linha neste doc (§3) → `curation --advance` (fechar a rodada).

## 3. O registro origem → destino → situação

Toda absorção vira **uma linha** aqui. O formato vem do `skills-absorvidas` (seo-brain),
portado: uma tabela com origem, destino, situação e o commit que a subiu.

| # | origem | destino no Tars | situação | release |
|---|---|---|---|---|
| 1 | **vault `ai-brain`** (`.ai-brain/skills/senior-research`) — + segmentos `seo-brain/docs/COMO-PENSAMOS.md` | `.ai/skills/senior-research/SKILL.md` | **portada** (o Tars vira a fonte) | fatia 2 |
| 2 | `homelab-infra/docs/restaurar-nuc.md`, `seo-brain/docs/BACKUP.md` | `.ai/skills/backup-restore/SKILL.md` | absorvido (generalizado) | fatia 2 |
| 3 | `segtools/AGENTS.md`, `seo-brain/AGENTS.md`, `segtools/docs/devcontainer-lessons.md` | `.ai/rules/ambiente.md` | absorvido (regra de boot) | fatia 2 |
| 4 | `homelab-infra/docs/estudos/2026-10-13-telemetria*.md` + decisão do dono 14/10 (R1: não existia skill equivalente nos vizinhos nem no `ai-brain`) | `.ai/skills/telemetria/SKILL.md` | absorvido (generalizado) | fatia 2 |
| 5 | `homelab-infra/README.md`, `docs/decisoes.md`, `.../gitops-docker.md`; pyinfra+Pulumi do **Fabber** (R1: não existia skill equivalente) | `.ai/skills/iac/SKILL.md` | absorvido (generalizado) | fatia 2 |
| 6 | `kipp/docs/extracao-dossie.md:207` (D18) | `.ai/governance/versionamento-de-extracao.md` | absorvido (doutrina) | fatia 2 |
| 7 | `segtools/HANDOFF.md` (BR-IAM-004) | `.ai/skills/agent-coordination/SKILL.md` | absorvido (extensão) | fatia 2 |
| 8 | `seo-brain/docs/kb/metodologia/orchestration.md` | `.ai/skills/agent-coordination/SKILL.md` | absorvido (extensão) | fatia 2 |
| 9 | `seo-brain/HANDOFF.md`, `docs/BACKUP.md` | `.ai/skills/segtools-database/SKILL.md` | absorvido (extensão) | fatia 2 |
| 10 | a própria metodologia A/B/C (`EVOLUTION` + `promote` + `skills-absorvidas`) | `docs/CURATION.md` + `tools/framework/tars-curation.mjs` | absorvido (fluxo) | fatia 2 |

### O que NÃO entra, e por quê

Disciplina do formato: o que fica de fora fica **nomeado**, com o motivo — senão a próxima
rodada re-avalia o mesmo e o registro perde valor.

- **Números e endereços do homelab** (IPs, portas, retenções tipo 24h/7d/5s/6m, orçamento de
  RAM) → **dado de projeto**, não método do ecossistema. O catálogo guarda a **regra**
  ("retenção declarada", "orçamento como critério de aceite"), nunca o número.
- **`hood`/`tokenhood`** → pasta sem `.git` em `/projects`; nada a apontar até virar repo.
- **Conteúdo de domínio do `seo-brain`** (SEO, SERP, técnicas anti-bot) → **domínio do produto**,
  não método. O que se porta é o **método** (pesquisa, cobertura), nunca a técnica de domínio.
- **Segredos, hosts, credenciais de outro projeto** → jamais no catálogo (regra dura do R1/AGENTS).

## 4. O que o passo 2 cobra (checklist do julgamento)

Antes de `promote`, cada item do delta responde:

- [ ] **Generalizado?** Zero dado de projeto (host, IP, cofre, cliente, número de retenção).
- [ ] **Procurou a versão existente ANTES de criar?** (R1) — se existia (repo próprio,
      `/projects/*`, `ai-brain`), **portou a original**; se não, **"não existia" com a busca
      citada**.
- [ ] **Já existe no catálogo?** (R1) — se existe, é PARTIAL: estende, não duplica (R3).
- [ ] **Onde é a fonte?** `arquivo:linha` no repo de origem, datado — **a origem está registrada
      na linha do §3** (porte ou ideia nova; nunca "—").
- [ ] **Destino decidido?** skill nova · regra de boot · extensão de skill · doutrina — e o nome.
- [ ] **Se não entra, o motivo está escrito?** (tabela acima).
- [ ] **Sobe a versão?** Mudança visível no consumidor sobe `N` (D18); `No-Release: <motivo>` só
      para prosa/índice.
