# Contrato do manifesto do binario — v1

Ficha do item `contracts/binary-manifest/v1` do catalogo. Diz **o que** e o manifesto, **quem**
le e **onde** mora o schema. A regra de criacao e a fonte: `adr/0002-servicos-binarios-e-modo-plugado.md`
do `huldlabs` (D3, D7, D8.3) — aqui so' a fatia versionavel dela.

## O que e

O binario publica o proprio manifesto **como dado**, em `GET /manifest` e em `<bin> manifest --json`
(ADR-0002 **D3**). O hospedeiro (Sofon/Next, Pion/Python, Phonon/PHP) le esse dado e materializa, sem
reimplementar nada:

| O que o manifesto traz (D3) | Campo aqui | Quem consome |
|---|---|---|
| versao do contrato | `contract` | o adaptador: versao que nao conhece → **falha alto** (D8.3 regra 3) |
| capacidades | `capabilities` | o hospedeiro decide o que materializar |
| tools de MCP | `tools` | proxy das tools no MCP do hospedeiro (D4) |
| itens de menu | `menu` | `href` casa uma rota declarada |
| rotas e paginas | `routes` | registra e encaminha ao binario |
| telas (modelo de pagina) | `pages` | desenha com o DS do hospedeiro — **nunca HTML** |
| configuracoes | `settings` | tela de admin gerada; o binario valida o valor |
| permissoes | `permissions` | mapeia para o IAM do hospedeiro |
| eventos e hooks emitidos/assinados | `events` | assina e repassa (a fronteira transacional fica no hospedeiro, D5) |
| prefixo de objeto no SGBD | `tablePrefix` | a conformidade de D7 (todo objeto criado leva o prefixo) |

## O schema

- `v1/manifest.schema.json` — **JSON Schema draft 2020-12** (`$schema` no proprio arquivo; doc
  oficial <https://json-schema.org/draft/2020-12>). Valida o manifesto inteiro.
- `v1/examples/kipp.json` — exemplo **minimo e valido**: `name: "kipp"`, `contract: "1"`, 1 tool,
  1 permissao. E' o caso base do teste de conformidade.
- `v1/binary-manifest.test.mjs` — o teste de conformidade (roda na suite do Tars). Prova:
  1. o exemplo valido **passa**;
  2. manifesto **sem `contract` reprova**;
  3. pagina com **HTML em vez de modelo reprova**.

## As duas regras que o schema cobra sozinho

1. **Telas sao MODELO, nao HTML (D3).** O `page` nao aceita `html`, `template`, `html*`, `rawHtml`
   nem `markup`; e cada `blocks[].kind` e um tipo que o DS do hospedeiro sabe desenhar (`table`,
   `fields`, `form`, `tabs`, `metric`, `chart`, `markdown`, `action`) — `additionalProperties: false`
   reprova qualquer markup no bloco. O `text` do bloco `markdown` e markdown, nunca HTML.
2. **Versao em tudo (D8.3 regra 3).** `contract` e' obrigatorio e o `$defs.version` tem padrao
   proprio: `"1"` (contrato) e `"2.14.0"` (binario) passam, `"v1"` e `"1.x"` reprovam.

## O prefixo (D7)

`tablePrefix` e o **contrato** do prefixo; a **prova** e a funcao reutilizavel
`conformaPrefixoDeObjetos` (em `v1/prefix-conformance.mjs`), que lista os objetos do schema pelo
`pg_catalog` e reprova qualquer um sem o prefixo — tabela, indice, sequencia, view, matview, tipo,
constraint e a tabela de controle de migrations. Regra do ADR-0002: o binario recebe a conexao (DSN)
do ambiente, e' dono das proprias tabelas e aplica as proprias migrations; o dominio
`pg_catalog`/`information_schema` e do SGBD e nunca leva o prefixo.

Uso: `conformaPrefixo({ client, prefix, schema: "public" })` → `{ faltando: [...], ok: bool }`.

## Versionamento

O item e' `contracts/binary-manifest/v1`. Mudanca **compativel** (campo opcional novo) fica no `v1`;
mudanca **incompativel** (campo obrigatorio novo, tipo alterado, campo removido) cria `v2/` ao lado e
o adaptador passa a escolher pelo `contract` do manifesto — nunca reescreve o `v1`, porque um binario
de release antiga continua publicando `"1"`.
