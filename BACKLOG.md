# BACKLOG — Tars

> **Fonte única.** Uma linha por item; detalhe em **link**, nunca parágrafo na célula. Todo
> pedido vira item **na hora** (mesmo cru); só entra na fila quando **ready**. Ao entregar, o
> item sai daqui e vai para o `CHANGELOG` (fato, um lugar).

## Legenda de maturidade
`a-confirmar` → `nao-refinado` → `ready` → `in-progress` → `blocked` → `fixed`

## Em andamento

| # | item | estado | detalhe |
|---|---|---|---|
| — | — | — | — |

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
