# gate: doutrina-operacao (B1.1 · B1.2)

**O que cobra** — a **doutrina de operacao de host**, hoje espalhada na cabeca de quem
escreve o `compose up`:

- **B1.1 — layout.** O dado de um app mora em **`/srv/<amb>/<app>/{data,conf}`** (o ambiente
  e' `dev|stg|prod`); o resto e' `/opt/<app>/<ref>` (binario por versao), `/srv/repos` (espelho)
  e `/srv/state` (frio). O `--str <caminho>` julga um caminho do HOST e **reprova** o que esta'
  fora (`/data`, `/mnt/...`, `/srv/dev` sem app).
- **B1.2 — ambiente e' projeto Compose.** O ambiente e' o **projeto compose** (`name:
  <app>-<amb>`), nao um `profiles:` (profile nao separa topologia nem armazenamento: `up` sem
  profile sobe a stack errada calada). Todo **bind tem `source:`** — bind sem fonte e' volume
  ANONIMO, e o dado do host fica invisivel.

**Por que** — volume NOMEADO do Docker esconde o dado dentro do engine: `du`, backup e
inspecao do host deixam de ver o arquivo, e ninguem sabe quanto ocupa nem onde esta'. O
linter do HOST (`--path /srv`) mora no **consumidor** (o Tars nao tem host): ele declara a
mesma doutrina apontando a propria fonte e a propria prova.

**Modos** (o `esquema` de cada linha do `.ai/doctrines.toml` e' o que a prova reproduz):

| Comando | Julga |
|---|---|
| `--str <caminho>` | um caminho contra o layout B1.1 (prova do `operacao/layout-srv`) |
| `--name <app>-<amb>` | o nome do projeto compose B1.2 (prova do `operacao/ambiente-e-projeto-compose`) |
| `--path <raiz>` | o host sob a raiz — **mora no consumidor** (exit 2 aqui: falha alta) |
| `--source <dir>` / `--compose <arquivo>` | um projeto compose (idem: consumidor) |
| `-g <nome> [-h <arquivo>]` | procura o volume NOMEADO no compose (exit 1 se achar) |

**Stacks** — `any` (precisa de `node`). **Parametros** — `--amb a,b` troca os ambientes validos.

**Proveniencia** — plano de release do Tars (11/10), itens B1.1 e B1.2 (P0). Antes eram prosa:
a familia "o dado do host tem lugar" existia solta no `homelab-infra`; aqui ganha par
doutrina->gate->prova, cobravel pelo `tars doctor` (prova QUE REPROVA, nunca PHANTOM).
