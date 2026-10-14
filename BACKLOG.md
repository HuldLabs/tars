# BACKLOG — Tars

> **Fonte única.** Uma linha por item; detalhe em **link**, nunca parágrafo na célula. Todo
> pedido vira item **na hora** (mesmo cru); só entra na fila quando **ready**. Ao entregar, o
> item sai daqui e vai para o `CHANGELOG` (fato, um lugar).

## Legenda de maturidade
`a-confirmar` → `nao-refinado` → `ready` → `in-progress` → `blocked` → `fixed`

## Em andamento

| # | item | estado | detalhe |
|---|---|---|---|
| END-SYNC-1 | **`tars sync` liga hooks indevidos no `PreToolUse` do Bash** | ready | reportado pelo coord Endurance (14/10); reprodução no §"Bugs" abaixo |
| END-SYNC-2 | **`tars sync` não apaga guards removidos de `.ai/base`** | ready | o guard sai da fonte e fica vivo no consumidor; reportado pelo coord Endurance (14/10) |
| END-SYNC-3 | **`.githooks` só é gerado se a pasta existir — e o `init` não avisa** | ready | consumidor novo fica sem hook e não sabe; reportado pelo coord Endurance (14/10) |
| END-CLI-1 | **`tars identity` não existe** — bloqueia a v0.1.0 do Endurance | ready | subcomando ausente; reportado pelo coord Endurance (14/10) |
| SYNC-PRE-TOOL | **`tars sync` sobrescreve `hooks.PreToolUse` e derruba hook posto à mão** | ready | achado 14/10 ao rodar o sync do próprio catálogo: o `prod-guard` está no PreToolUse do `.claude/settings.json` (não é `[tars].guards`), e o sync reescreve o evento só com os guards declarados — o hook do gate some calado. Não é desta fatia (pré-existente no HEAD); reprodução: `tars sync --tars . --project .` → `git diff .claude/settings.json` mostra o prod-guard removido. Correção provável: preservar entradas de PreToolUse cujo comando o sync não gerencia (posse por `OWNED`/caminho). |

## Metodologias do ecossistema (pedido do dono, 14/10)

A doutrina `release` (`.ai/governance/release.md`) é a primeira. Faltam, no mesmo formato (papéis, passo a passo, quando falha, quem cobra), cada uma um item da fila:
- **Rollback**: voltar uma versão publicada (binário, imagem, lock do consumidor) e um deploy; quando se faz rollback e quando se publica a correção para frente; prova de que voltou.
- **Deploy**: do artefato publicado ao ambiente (homelab: receitas pyinfra, produção só com ordem do dono, `TARS_PROD_ORDER`), promoção entre ambientes, verificação pós-deploy.
- **Hotfix**: correção urgente sobre uma versão publicada (branch, versão, Release e aviso).
- **Incidente em produção**: detectar, conter, comunicar, corrigir e registrar no ledger (liga com `incidente-vira-prevencao.md`).
- **Atualização de dependências**: bump de peças do ecossistema (Tars na base do Endurance) e de terceiros, com cadência e gate.
- **Descontinuar**: tirar de uso uma versão, feature ou peça sem quebrar o consumidor.

## Bugs reportados por consumidores

Regra do dono (11/10, `.ai/rules/principles.md`): bug do Tars reportado por um consumidor
**entra na próxima release** e o `CHANGELOG` **lista os reportados que fechou**. O consumidor
**reporta aqui** com **repo, data e reprodução** — três campos, nesta ordem. Contorno local só
é temporário e fica registrado como dívida nomeada no consumidor.

- **repo** — de onde veio (`segtools`, `kipp`, `farmega.v2`, …).
- **data** — quando apareceu (AAAA-MM-DD).
- **reprodução** — o comando que falha e a saída literal. Sem isso o item nasce **`a-confirmar`**
  (não vira dívida infinita: um report sem reprodução não bloqueia release, mas também não
  fecha por decreto).

| # | repo | data | reprodução | estado |
|---|---|---|---|---|
| TARS-BUG-1 | segtools | 2026-10-11 | `node tools/framework/tars-doctrines.mjs` acusa PHANTOM em `fail/erro-nao-se-engole`: a prova escreve o fixture em `/tmp`, mas o gate lê os arquivos **staged** — então a prova nunca dispara e a doutrina passa por PHANTOM | a-confirmar (prova não exercita o gate; fatia irmã) |
| TARS-BUG-2 | Endurance (coord) | 2026-10-14 | `tars sync` grava hook de catálogo no `PreToolUse` do **Bash** do consumidor — o hook só deveria valer para as ferramentas que o catálogo declara. Reprodução: consumidor novo + `tars sync` → `hooks.jsonc` do consumidor lista o hook em `PreToolUse:Bash` | a-confirmar (aguarda a saída literal do consumidor) |
| TARS-BUG-3 | Endurance (coord) | 2026-10-14 | `tars sync` **não remove** do consumidor um guard que saiu de `.ai/base` (só acrescenta) — o consumidor fica com guard fantasma que o catálogo não tem mais | a-confirmar (aguarda execução) |
| TARS-BUG-4 | Endurance (coord) | 2026-10-14 | `.githooks/` só é gerado quando a pasta **já existe** no consumidor, e o `tars init` **não avisa** — consumidor novo fica sem hook de commit/push silenciosamente | a-confirmar (aguarda execução) |
| TARS-BUG-5 | Endurance (coord) | 2026-10-14 | `tars identity` **não existe** — subcomando necessário para a v0.1.0 do Endurance; `tars --help` não lista nada equivalente | a-confirmar (capacidade ausente, não bug de mecanismo) |
