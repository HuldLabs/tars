# Memória operacional (SES-02)

`operational-memory.jsonl` — memória **curada e versionada** no repo (ao contrário do histórico de sessão,
que **nunca** vai para o git — ver P-10). Uma linha JSON por entrada. Serve para o agente (e os workers)
terem as regras duráveis sem re-descobrir.

## Campos

A tabela abaixo é a lista **canônica** — a mesma de `SCHEMA_KEYS` em `tools/framework/ai-memory.mjs`. O gate
compara as duas listas (`node tools/framework/ai-memory.mjs --check`) e reprova a divergência nos dois
sentidos: campo do gate que o doc não lista e campo do doc que o gate recusa. Um campo só entra aqui com
**consumidor declarado** (a coluna do meio) — campo que ninguém lê é ruído.

Origem (R1): os campos vêm do schema de `farmega/.ai/memory/operational-memory.jsonl`, reduzido ao que usamos —
o que ficou de fora está na seção seguinte.

| Campo | Quem lê | Valor |
| --- | --- | --- |
| `id` | gate: unicidade no arquivo e formato `mem-<slug>` | identificador da entrada |
| `ts` | gate: ISO-8601 e ordem crescente no arquivo | quando o fato foi registrado |
| `scope` | gate: `lowercase`, separado por `/` | onde o fato vale (ex.: `repo`, `hub`) |
| `statement` | quem carrega a memória (agente/worker) | o fato, curto e acionável |
| `durability` | gate: só `durable` ou `ephemeral` | regra permanente ou observação com prazo |
| `source_refs` | gate: cada caminho tem de existir no repo | onde provar (arquivo/commit) |
| `confidence` | gate: só `high`, `medium` ou `low` | o quanto se confia no fato |
| `validation_status` | gate: só `verified` ou `observed` | tem teste/commit, ou é observação |

## Campos opcionais (memória federada)

Entram só nas entradas que vieram de outro repo (SOFON-MEM-1); a entrada da casa não os usa. O gate os aceita em
qualquer entrada e em qualquer ordem — não fazem parte de `SCHEMA_KEYS` porque são procedência, não fato.

| Campo | Quem lê | Valor |
| --- | --- | --- |
| `source_id` | curador: rastreia a entrada no repo de origem | o `id` que a entrada tinha lá |
| `repo` | o INDEX (origem na linha) e o corte do boot | de qual dos 7 repos veio |
| `source` | curador: o arquivo/commit de origem dentro daquele repo | caminho relativo ao repo de origem |

## Campos recusados

Estes **não** são campos do schema: uma entrada que use qualquer um deles reprova como `chave desconhecida`.
Ficam registrados porque são a diferença conhecida em relação às origens — e a lista de cima é a decisão.

- `kind`, `agent`, `origin`, `memory_layer` — vêm do `.ai/memory/` do Fabber e não entraram: aqui não têm
  consumidor.
- `expires_at`, `supersedes_entry_id`, `promoted_from` — prazo e linhagem, do schema do farmega; também não
  entraram, pela mesma razão. Nenhuma das 45 entradas usa um deles e nenhuma é `ephemeral`, então `expires_at`
  não teria nem o que guardar.
- Quem precisar de um deles traz o **consumidor junto** e move o campo para a tabela de cima; enquanto as duas
  listas divergirem, o gate reprova — de propósito.

Regra: só entra o que **não** é re-derivável do repo em segundos, e nada de valor de segredo.
