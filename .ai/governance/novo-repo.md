---
root: true
---

# Doutrina: nascer um repo (o método único)

Todo repo/app novo do ecossistema **nasce por este método** — não por improviso. É a
doutrina que o **Kipp** e o **Kipp do projects** cumpriram e que o **SELD** (11/10/2026)
executou. Quem cria um repo novo segue os passos na ordem; cada passo deixa prova.

**Por que existe.** Decisões tomadas em conversa se perdem quando o repo nasce só com um
README, e a próxima sessão recomeça do zero. O método congela o que foi decidido **no
commit inicial**, com a fonte de cada decisão — e faz o repo nascer consumidor do Tars.

## Os passos (na ordem)

### 1 · Criar o repo no GitHub

- **Org certa e privado.** `gh repo create <org>/<nome> --private`. Nome de pessoa/org do
  ecossistema é `HuldLabs`; o repo fica **plano** em `~/projects/<nome>` (irmão, nunca
  aninhado — igual ao GitHub).
- A identidade do commit e do push é a da organização (Daneel); credencial pelo PAT da org,
  nunca impresso (`tars secrets exec -- gh …`, ver `segredos-e-identidade.md`).

### 2 · README com papel + origem do nome

O README diz, em três blocos: **o que é** (uma linha de papel), **o nome** (a origem — qual
obra, qual personagem, o que ele descreve) e **como se liga ao resto do ecossistema** (a
tabela de peças quando for peça). Molde: `HuldLabs/morse`. A origem do nome é obrigatória —
nome sem origem é nome que ninguém reusa.

### 3 · BACKLOG no commit inicial

`BACKLOG.md` nasce no **mesmo commit inicial** (ou logo depois), com:

- **Decisões em vigor** — tabela `# | decisão | fonte` (ADR, conversa, pesquisa). Decisão sem
  fonte não entra.
- **Fila** — `# | item | depende de | aceite`. Aceite falsificável.
- **Armadilhas que não podem voltar** — o que já queimou (achado em pesquisa/incidente).
- **Em aberto** — o que ainda é decisão do dono, com a recomendação e a ressalva.

Molde: `HuldLabs/morse` `BACKLOG.md` (`e1acf06`). Eis por que existe: ver
`docs/AGENT-CONTRACT.md §Referências` do consumidor.

### 4 · `tars init` + `tars sync`

O repo nasce **consumidor do Tars**: `.ai/tars.toml` declara as peças, `tars init` cria o
manifesto mínimo e o primeiro `tars sync` puxa o declarado para `.ai/base/` e trava o lock.
O motor (sync, hooks, memória) roda de `$TARS_HOME`.

### 5 · Versão `0.0.1-dev.1` + CHANGELOG

Toda peça que nasce versionada entra em **`0.0.1-dev.1`** com o `CHANGELOG.md` no formato de
4 subseções (`versionamento-de-extracao.md`): **o que mudou · por quê · arquivos impactados ·
o que o consumidor faz**. `0.0.1` diz "ainda não é produto"; `dev.N` conta entrega.

### 6 · ADRs

Toda decisão de desenho vai para `docs/adr/NNNN-<slug>.md`, no formato dos ADRs do
`huldlabs` (`adr/`), **uma alternativa por seção, rejeitada com motivo verificado em fonte**
(ADR-009 do fabber). O ADR é a fonte; o BACKLOG só resume e aponta.

### 7 · Registrar no README do hub

A peça entra na **tabela de peças** do repo central (`HuldLabs/huldlabs` README) e o
`BACKLOG.md` da org ganha a linha dela. Peça que não está no hub não existe para quem
procura.

### 8 · Repo irmão em `~/projects`

`git clone` em `~/projects/<nome>`, plano e irmão. **Nunca** aninhar; nunca cruzar filesystem
(o clone mora do mesmo lado do repo).

## Variante: repo recuperado (sem upstream)

Nem todo repo "nasce": alguns são **recuperados** de cópia, share ou backup, sem upstream.
Aí o lar dele é um **espelho próprio** — o servidor git da org —, **não** um diretório de
arquivos sincronizado por aplicação caseira: o servidor git **puxa nativamente** e cada repo
tem o seu; um diretório cru exigiria construir um app de sincronismo para replicar o que o
servidor já faz. Origem: `.ai/skills/iam` §4 (curadoria 14/10, `47623f1`).

- **Árvore recuperada congelada, só-leitura**, no branch original intacto, com um **doc que
  registra** o que entrou, o que ficou fora e **como regenerar** — sem esse doc a recuperação
  não é auditável.
- **A migração vai em branch próprio, por tema**, nunca sobre o original congelado: o original
  é a evidência; a migração é o trabalho.
- **Provisionar repo novo** (org própria no espelho, autenticação como bot, token efêmero para
  push) é rotina do ator de automação, não o jeitinho com a credencial de alguém.
- **Antes de apagar a cópia local: a ponta de CADA branch existe no espelho** (e no upstream,
  quando houver) — critério verificável, não suposição.
- **Código e serviço são separados:** o serviço **nunca roda de dentro do diretório de repos**;
  cada app tem sua cópia de deploy e recebe **release**, não `pull`.
- **Armadilhas da recuperação:** clone de terceiro sem `.gitmodules` vira *gitlink* silencioso
  (o conteúdo não vem), e config de plugin costuma guardar **chave/token reais** — trate o
  arquivo recuperado como dado hostil até provar o contrário.

## Prova (o método se falsifica)

O `tars doctor` cobra esta doutrina por um repo que a executou: o README tem a seção da
origem do nome, o `BACKLOG.md` tem as quatro seções, o `.ai/tars.toml` existe, o
`CHANGELOG.md` está em `0.0.1-dev.1` e há pelo menos um `docs/adr/*.md`. Onde a prova vive no
CONSUMIDOR (o repo que nasceu), o `[[doctrine]]` do `.ai/tars.toml` dele declara a fonte
(`README.md`, `BACKLOG.md`) e a prova roda sobre a raiz daquele projeto.

## Molde

`HuldLabs/morse` — commit inicial `e1acf06` (`BACKLOG.md` com decisões, fila e armadilhas) e
o README com "O nome". Modelos prontos em `templates/` (ver `templates/README.md`).
