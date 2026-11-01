# gate: fail-closed

**O que cobra** — a AUSENCIA de trava nao pode virar APROVACAO silenciosa. Le' os arquivos
**staged** (`git diff --cached --diff-filter=ACM`) e reprova com `arquivo:linha` todo `if`
cujo ramo guardado **retorna aprovacao** (`{ ok: true }`, `true`, `'ok'`) **sem nomear** por
que — sem `motivo`/`erro`/`porque`/`nada`/`ausente`/etc. no que devolve.

O defeito e' de FORMA, e o julgamento anda sobre a ARVORE (nao e' heuristica de texto): o
`acorn` que viaja com o gate (`vendor/acorn.mjs`, 8.14.0, MIT) parseia o arquivo e o gate decide sobre `IfStatement` / `consequent` / `alternate` — comentario,
string e regex do proprio codigo nao confundem. `.ts` passa antes pelo `stripTypeScriptTypes` do Node ou pelo
transpilador do Bun, no binario. O que o parser nao aceitar **nao e' julgado — e o gate DIZ que nao julgou**.

**Por que** — doutrina B2.3 (plano de release de 14/10). A fonte e' um incidente real do
kipp (`seg-agentmem-2` #7): o codigo cobrava a trava quando ela EXISTIA e, quando nao
existia, `return`ava verde — o buraco ficava exatamente onde a protecao tinha de valer.
"Nada a checar" virou "esta tudo certo". Regra que nao e' teste e' sugestao.

**Fail-closed de verdade** — se o `git` nao responder, o gate **REPROVA** (`exit 1`) dizendo que NAO julgou. Nunca deixa
passar calado: um gate que nao corre e' pior que gate nenhum, porque da' a sensacao de
cobertura.

**Prova (o par)** — positivo: `if (!reg) return { ok: false, motivo: '...' }` passa;
`if (!reg) return { ok: true, motivo: 'sem registro a checar' }` (isencao NOMEADA) passa.
Negativo: `if (!reg) return { ok: true }` REPROVA.

**Em que hook** — `pre-commit`.

**Stacks** — `any` (precisa de `node` e do `node_modules` do catalogo).

**Parametros** — `allow` (lista de trechos de caminho isentos), declarado em
`[gates.params.fail-closed]` no `.ai/tars.toml` do projeto consumidor.

**Proveniencia** — porte da IDEIA do incidente do kipp (`seg-agentmem-2` #7) e do item B2.3
do plano de release do Tars (14/10); a implementacao (julgamento da arvore pelo acorn que
ja' esta' na arvore, via R1) e' nossa.

**Requisito** — nenhum: o parser (acorn) vem junto do gate, em `vendor/`.
