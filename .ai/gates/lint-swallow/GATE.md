# gate: lint-swallow

**O que cobra** — nenhum erro ENGOLIDO no que vai ser commitado. Le' os arquivos **staged**
(`git diff --cached --diff-filter=ACM`) e reprova com `arquivo:linha` quando encontra:

- JS/TS — `catch` de corpo vazio: `catch {}`, `catch (e) {}`, `catch (e) { /* nada */ }`;
- Python — `except` cujo corpo e' so' `pass`/`...`, na mesma linha (`except: pass`) ou no bloco
  (`except:` + `pass` indentado abaixo).

Comentario nao conta: `/* */`, `//` e `#` saem da linha antes do teste. Um `catch` que trata,
propaga ou registra passa — o alvo e' a falha SILENCIOSA, nao o tratamento de erro.

**Em que hook** — `pre-commit`.

**Stacks** — `any` (precisa de `node` no PATH).

**Parametros** — `allow` (lista de trechos de caminho isentos, ex.: `["vendor/"]`), declarado em
`[gates.params.lint-swallow]` no `.ai/tars.toml` do projeto consumidor.

**Proveniencia** — porte da IDEIA do INV-FAIL-1 do seo-brain (falha nao se engole; leitura de
07/10); a implementacao (heuristica por linha sobre o staged) e' nossa.
