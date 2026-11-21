# gate: source-doc

**O que cobra**: o contrato mínimo de **código como documentação** no que vai ser commitado. Lê os arquivos
**staged** e reprova com `arquivo:linha: motivo` quando encontra:

- Python: módulo sem docstring de módulo; `def`/`class` pública de topo (nome sem `_`) sem docstring; função
  pública com nome de menos de 3 caracteres (`a()`, `f()`). Funções `test_*` e `__init__.py` vazio ficam fora.
- TOML: arquivo que não abre com um comentário `#` dizendo o que controla.
- Shell: script sem bloco `#` de cabeçalho depois do shebang.

O resto da regra (nomes descritivos em variável, docstring estilo Google com `Args`/`Returns`/`Raises`, comentário
do porquê) é cobrado pela revisão e, no consumidor com Python, pelo ruff (`D`, `ANN`, `N`): ver
`.ai/governance/engineering-standards.md` §6.

**Em que hook**: `pre-commit`.

**Stacks**: `any` (precisa de `node` no PATH).

**Parâmetros**: `allow` (lista de trechos de caminho isentos, ex.: `["migrations/versions/"]`), em
`[gates.params.source-doc]` no `.ai/tars.toml` do consumidor. Dívida já existente entra na linha de base
(`tars gates baseline`), como nos outros gates.

**Proveniência**: farmega.v2 `.ai/governance/source-file-documentation.md` e
`.ai/scripts/check_source_documentation.py` (docstring de módulo, cabeçalho de TOML e shell); farmega
`docs/governance/python-standards.md` (docstring Google na API pública); fabber-ecommerce `FOUNDATION.md` §1 e
kerr-crawler `.ai/skills/code-as-doc` (nomes que contam a história). A detecção é heurística por linha, para o gate
só depender de `node`.
