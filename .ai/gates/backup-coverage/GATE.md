# gate: backup-coverage (B2.6)

**O que cobra** — backup so' e' real **com prova de restore**, e a cobertura e' **teste
fail-closed**: app que declara dir de dado fora da lista de fontes do backup **REPROVA
nomeando `arquivo:campo`** — o buraco que so' apareceria no restore, quando ja' e' tarde.
O gate julga duas coisas no que esta' staged:

1. **Cobertura** — todo app com campo de dir de dado (`data_dir`/`dir_dado`/`data`/`dir_dados`)
   carregando um caminho de verdade tem de aparecer na lista `fontes` da declaracao de backup.
2. **Prova** — a declaracao de backup tem de **nomear a prova de restore** (sentinela +
   cadencia). "O job rodou" prova que a copia aconteceu, nao que o dado volta.

**Por que** — achados 13 e 14 da coleta do homelab (13/10, commits `28daa62` e `026edf2`):
8 contextos escreviam dado em `/srv` **fora** da lista de backup e o backup saia **vazio em
silencio** — descoberto depois, no restore. A trava que resolve e' varrer as fichas e falhar
nomeando onde o dado ficou de fora; e ela precisa do **teste negativo** (o mesmo caminho
**sem** o defeito nao pode reprovar), "para o gate nao passar por nao olhar nada".

**Fail-closed de verdade** — sem `git` ou sem conseguir julgar o arquivo, o gate **DIZ que
nao julgou** em vez de passar calado.

**Prova (o par)** — positivo: ficha com `fontes = ["/srv/prod/app"]` cobrindo
`data_dir = "/srv/prod/app/data"` e `restore_sentinela` passam. Negativo: `data_dir` fora de
`fontes` REPROVA nomeando `vars.py:<linha>`; declaracao sem prova de restore REPROVA tambem.

**Em que hook** — `pre-commit` (varre o staged). O consumidor pode chamar o mesmo
`julgaArquivo` no pos-apply da receita, como o healthcheck.

**Stacks** — `any` (precisa de `node`).

**Parametros** — no `[gates.params.backup-coverage]` do `.ai/tars.toml` do consumidor:
`allow` (trechos isentos), `fontes` (chave da lista, default `fontes`), `dados` (chaves que
declaram dir de dado).

**Proveniencia** — porte da IDEIA dos achados 13/14 (`tests/test_backup_cobertura.py` do
homelab-infra, commit `026edf2`) e do item B2.6 do plano de release do Tars (14/10); a
implementacao (parse da declaracao + par positivo/negativo) e' nossa.
