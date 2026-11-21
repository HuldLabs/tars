# Documentação no arquivo, por linguagem

Portado de `farmega/.ai/governance/source-file-documentation.md` e `agent-skills/source-file-documentation`.
Regra-mãe: **se o formato aceita comentário ou docstring, o arquivo de primeira mão abre com uma descrição curta
e idiomática.** O objetivo é clareza operacional, não volume de comentário.

## Python

- Todo `.py` tem docstring de módulo (o que é, papel, ADR que rege).
- Classe pública e função pública não trivial: docstring Google com `Args`, `Returns`, `Raises` quando o tipo e o
  nome não bastam.
- `#` para porquê, invariante, efeito colateral e fluxo não óbvio.

## TypeScript / JavaScript

- Arquivo de módulo abre com `/** ... */` (TSDoc) dizendo o papel; export público com TSDoc (`@param`, `@returns`,
  `@throws`).

## Rust

- `//!` no módulo e `///` no item público, com `# Errors`, `# Panics`, `# Safety`, `# Examples`; `// SAFETY:` em
  todo `unsafe` (kerr-crawler `docs/STANDARDS.md` §3.1).

## TOML / YAML

- Começa com `#` explicando o que o arquivo controla e quem lê.
- Comentário de seção só para intenção, precedência ou padrão arriscado; acima da chave.

## Shell

- Shebang primeiro; logo depois, bloco `#` com propósito, premissas de ambiente e efeitos colaterais.
- Comentário só no trecho que a estrutura do comando não explica.

## SQL / migrations

- Cabeçalho com o propósito da migration e a ADR; comentário (`COMMENT ON`) em tabela e coluna de domínio.

## Fora do escopo

Arquivo gerado, vendorizado, cache, lockfile e formato sem comentário (JSON). Arquivo trivial leva só o cabeçalho.
