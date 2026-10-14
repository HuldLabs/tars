# gate: no-foreign-runtime

**O que cobra** — o `.ai/` que o consumidor COPIA nao pode exigir runtime que ele nao usa. Le' os
arquivos **staged** (`git diff --cached --diff-filter=ACM`) sob as pastas de conteudo copiado
(`.ai/rules`, `.ai/skills`, `.ai/governance`, `templates`, `.ai/base`) e reprova com `arquivo:linha`
cada invocacao de **linguagem estrangeira** no que vai ser commitado:

- `python`/`python3`/`py -3`/`uv run`/`pip`/`poetry`/`pdm`/`pipenv`/`pytest`
- `ruby`/`gem`/`bundle`, `php`/`composer`, `perl`, `pwsh`/`powershell`/`ps1`, `Rscript`

A linguagem do catalogo e' **Node** (o proprio Tars roda de `node`/`bun`; o `bin` do `package.json`
aponta para `tools/framework/tars.mjs`). Uma regra/skill que manda `python3 script.py` faz o
consumidor instalar Python para seguir a doutrina — exatamente o defeito do item B1.5.

**Por que** — doutrina B1.5 do plano de release 14/10: *"nada no ecossistema exige runtime de quem
nao usa (transversal = binario unico)"*. Fonte: `ego.md` 2.2 (R4 do Endurance: *"Runtime e' feature,
nunca base. Servico e' do compose do projeto, nunca da imagem"*) · `seg-agentmem-1` #42/#43 ·
`coleta-eco` 5.6. Regra que nao e' teste e' sugestao.

**Nao cobra** (o gate separa COPIA de PROJETO):

- o **motor** (`tools/`, `bin/`, `.githooks/`) — o Tars e' do dono e roda o que precisar;
- o `.ai/tars.toml` do proprio consumidor e as pastas de metodo do catalogo (`docs/`) — o que JOGA
  fora no sync nao chega em quem consome;
- o **`runtimes`** declarado em `.ai/tars.toml` (`runtimes = ["python"]`): quem declara o runtime tem
  contrato de instalar — o manifesto e' a prova, o gate so' cobra o que nao foi declarado;
- linha marcada com o escape `tars:runtime-ok — <motivo>` (isencao NOMEADA, nunca calada);
- o bloco cercado por ` ```tars:nao-copia ` … ` ``` ` (receita que o leitor adapta, nao comando que
  o Tars roda).

**Parametros** — `allow` (lista de trechos de caminho isentos) em `[gates.params.no-foreign-runtime]`
do `.ai/tars.toml`.

**Em que hook** — `pre-commit`.

**Stacks** — `any` (precisa de `node`).

**Limite conhecido** — o gate julga o texto do que e' COPIADO; um caminho citado em prosa (ex.: "o
proprio Tars usa `bun test`") passa de proposito: ele nao exige nada de quem le'. O alvo e' o comando
que o consumidor teria de executar.

**Proveniencia** — porte da IDEIA do item B1.5 do plano de release do Tars (14/10), com a fonte em
`ego.md` 2.2 / `coleta-eco` 5.6; a implementacao (varredura por linha do STAGED, com a separacao
copia x projeto e o escape nomeado) e' nossa.
