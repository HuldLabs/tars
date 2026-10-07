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

## Proibido

- `git branch -D` (perde trabalho calado; a poda usa `-d`, que barra o não
  incorporado), `reset`, `stash`, `git add -A/./-u/-f` e `--no-verify`.
