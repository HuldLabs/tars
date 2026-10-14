# Git — como trabalhamos

Fonte: hook do segtools (`.githooks/pre-push`) e a conversa do dono de 07/10.
Vale por padrão em todo projeto que consome o Tars.

## Branch

- Nome: `<tipo>/<slug>` — os tipos válidos são os do hook do segtools
  (`feat`, `fix`, `docs`, `refactor`, `chore`, `perf`, `test`, `build`, `ci`,
  `security`, `hotfix`, `deps`, `i18n`, `init`, `release`, `style`, `revert`,
  `wip`); regex `^[a-z]+/[a-z0-9][a-z0-9._-]+$`.
- A branch de **coordenação** (a que junta fatias) **não** leva key de issue: ela
  não é uma entrega, é o trilho onde as entregas se somam.
- Branch de **entrega de issue** leva a key (`feat/seg-123-...`).
- Nunca commitar direto na `main`.

## Integração

- Toda entrega entra por **PR para a `main`**; push direto na `main` é bloqueado
  pelo `pre-push` (o mirror `onedrive` é a exceção declarada).
- **Apagar ao mesclar** — ligado no GitHub (`delete_branch_on_merge`, grátis em
  repo privado). Branch já incorporada não se mantém: nem local, nem remota.
- **Push para o `origin` após cada commit.** Lição da queda de luz de 07/10:
  trabalho só na máquina não está entregue.

## Fechamento de trabalho

- Rodar `tars git prune` — apaga as branches locais já incorporadas na atual e na
  `main` (e, com `--remote`, também as do `origin`). Sempre imprime o que apaga;
  `--dry-run` só mostra; idempotente.
- O `task ops:clean` do segtools chama esse passo (local, sem `--remote`).

## Lição: `No-Lesson:` explícito, nunca silêncio

Todo commit que fecha trabalho declara o que ele **ensinou** — em trailer, no corpo da
mensagem. A ausência não é o silêncio neutro que parece: quem lê depois não distingue
"não havia nada a registrar" de "ninguém olhou". O trailer torna a decisão **visível e
falsificável**.

- **Com lição:** o corpo traz `Lesson: <o que se aprendeu e vale de novo>` (ou a entrada
  do ledger/`No-Lesson` se a lição virou item de backlog, apontando o id).
- **Sem lição:** o corpo traz **`No-Lesson: <por quê>`** — a justificativa é obrigatória,
  e é o que a torna uma decisão em vez de um esquecimento (mesma forma do `No-Release:`
  do gate `release-guard`).
- **O que não vale como `No-Lesson`:** "nada a registrar" sem motivo, e qualquer coisa
  que apenas repita o diff. O trailer diz por que **aquela** mudança não produz regra:
  é mecânica, repete uma lição já registrada (cite o id), ou o fato já está coberto por
  outra fonte.

Origem (R1): `coleta-eco` 2.9.

## Proibido

- `git branch -D` (perde trabalho calado; a poda usa `-d`, que barra o não
  incorporado), `reset`, `stash`, `git add -A/./-u/-f` e `--no-verify`.
