# Padrões de engenharia (standards)

> Regra sem comando que a prove é intenção. Cada padrão daqui tem três camadas: **especificação** (a norma
> externa: PEP, RFC, ECMA), **convenção** (a escolha do ecossistema) e **enforcement** (o gate ou o lint que
> reprova). Compilado em 20/11/2026 de kerr-crawler `docs/STANDARDS.md`, segtools `docs/STANDARDS.md`, fabber
> `FOUNDATION.md`, farmega `docs/governance/python-standards.md`, farmega.v2 `source-file-documentation`,
> tokenhood `cspell-curator` e agent-skills `python-engineering-standards`. O inventário completo (199 regras, com
> fonte e linha) foi medido no consumidor maromba.

## 1. Filosofias

Os mantras (R1 já existe?, KISS, SSOT, fail-fast, fail-loud, idempotência, modularidade, plugabilidade,
agnosticidade, hooks em tudo, consistência declarada, isolamento) moram em `.ai/rules/principles.md`: este
documento não os repete (SSOT). Somam-se, porque já valem em vários consumidores e faltavam aqui:

| Mantra | Regra | Fonte |
| --- | --- | --- |
| **Código como documentação** | Nome conta a história, docstring completa, comentário diz o porquê. Skill `code-as-doc` | fabber §1, kerr-crawler |
| **YAGNI** | Peça, abstração ou ferramenta só com gatilho real nomeado; capacidade aceita, mas diferida | tomo ADR-0002, fabber |
| **Regra de dois (DRY)** | Repetiu em 2 consumidores, vira compartilhado; antes disso nasce local | farmega ADR-021/024 |
| **Tudo configurável** | Padrão nomeado, nunca constante solta no fluxo; nome, caminho, porta e tema em config | kerr-crawler, segtools |
| **Formatos abertos** | RFC, ISO ou padrão de mercado em tudo que não é o executável (ex.: erro HTTP = RFC 9457) | kerr-crawler |
| **Zero legado** | Sem shim, alias ou fallback calado; quem move algo atualiza todos os usos no mesmo commit | fabber, farmega.v2 AP-008 |
| **Dry-run em escrita** | Operação que muda estado aceita `--dry-run` e percorre o caminho completo | segtools, farmega.v2 |
| **Escoteiro** | O que é tocado é corrigido (nome, docstring, comentário) no mesmo commit | kerr-crawler |
| **Regra de arquitetura é teste** | Fronteira de camada é provada por teste (import-linter, dependency-cruiser) | fabber, segtools, kerr |

## 2. Padrões de projeto e arquitetura

- **Ports & Adapters:** a porta é um `Protocol` no domínio; o adapter fica por engine; o domínio nunca importa o driver.
  A resolução do adapter é explícita (config → erro), sem fallback silencioso.
- **Camadas:** `core` (kernel puro) → `adapters` (I/O) → `modules` (plugáveis) → `apps` (borda, sem regra de
  negócio). Regra para classificar: se não sobe sem a peça, é core; se dá para desligar sem derrubar o sistema, é
  módulo; se estende o sistema sem tocar o core, é plugin.
- **Registry + auto-descoberta** para módulo e método; **Strategy**: método/fórmula é dado (asset versionado).
- **Read model** para leitura; **outbox** na transação; **fila no Postgres** (`SKIP LOCKED`, DLQ, jitter).
- **Identidade:** `bigint identity` interno + `uuid` v7 externo; slug nunca é identidade.
- **Banco guarda o "nunca"** (NOT NULL, UNIQUE, FK, CHECK); o código decide o resto.

## 3. Por linguagem

| Linguagem | Especificação | Convenção | Enforcement (preset) |
| --- | --- | --- | --- |
| Python | PEP 20, 8, 257, 484, 526, 544, 557, 621, 723 | `code-as-doc/references/python.md`; só `uv`; pin `==` | `templates/tooling/ruff.toml` |
| TypeScript | ECMA-262, TSDoc | strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noUnused*` | `templates/tooling/tsconfig.base.json` |
| Rust | API Guidelines, rustdoc | `//!`/`///`, `# Errors`; `thiserror` na lib | clippy `-D warnings` (lacuna) |
| Shell | POSIX, bash | shebang + bloco `#`; `set -euo pipefail`; aspas | shellcheck (lacuna) |
| TOML/YAML | TOML 1.0.0, YAML 1.2.2 | cabeçalho `#` dizendo o que controla | `source-doc` (cabeçalho) |
| SQL | Postgres | `snake_case`, schema como fronteira, `COMMENT ON` no domínio | revisão |
| Markdown | CommonMark | texto em pt-BR acentuado | cspell |
| Todo arquivo | EditorConfig | LF, UTF-8, newline final | `templates/tooling/.editorconfig` |

**Documentação no arquivo:** veja `code-as-doc/references/language-conventions.md`, com o gate `source-doc`.

## 4. Nomes e idioma

- O código é em inglês: identificadores, rotas de API, docstrings, comentários, valores de enum e commits.
- Em português ficam a documentação (ADR, BACKLOG, HANDOFF, memória, docs) e a resposta ao dono. O texto que o
  usuário vê sai pelo i18n.
- **Nome:** função começa por verbo e objeto; booleano é pergunta (`is_`, `has_`); unidade vai no nome
  (`_ms`, `_kg`); `_at` marca instante. Não usar `tmp`, `data`, `res`, `Manager` nem `Helper`.
- **Arquivo:** `kebab-case` em minúsculas; `snake_case` só onde a linguagem exige.

## 5. Tooling distribuído (`templates/tooling/`)

Até esta versão o Tars não distribuía nenhuma config de ferramenta, e o ecossistema tinha 6 versões do ruff e
`line-length` 79, 100 e 120. O preset é o **piso**: o consumidor copia e só **acrescenta** regra. Cada exceção
vem com o motivo comentado.

| Arquivo | O que cobra | Base medida |
| --- | --- | --- |
| `ruff.toml` | `E F I B SIM UP C90 N D ANN S110 S112 BLE001`, Google, mccabe 10 | maromba (o único que roda `D`, `ANN` e `C90`); farmega |
| `cspell.config.yaml` | en + pt-BR + es; dicionários oficiais fixados; dicionários próprios curados | tokenhood, farmega, maromba |
| `tsconfig.base.json` | a união das flags estritas de farmega/apps/web e kerr-crawler | farmega, kerr-crawler |
| `.editorconfig` | LF, UTF-8, indentação por tipo | farmega |

**Dicionário próprio:** fica em `.cspell/project-words.txt` (projeto e ferramentas) e em
`.cspell/<domínio>-terms.txt`. A curadoria segue a skill `cspell-curator`: corrigir o texto primeiro, rodar
`cspell trace`, e nunca virar lixeira.

## 6. Matriz de enforcement

| Regra | Gate | Estado |
| --- | --- | --- |
| Docstring de módulo e de símbolo público, nome com 3 caracteres ou mais, cabeçalho de TOML e shell | `source-doc` | gate |
| Exceção engolida | `lint-swallow` + ruff `S110/S112/BLE001` | gate + preset |
| Docstring completa (Args, Returns, Raises), tipos, complexidade | ruff `D`, `ANN`, `C90` | preset |
| Grafia e idioma do comentário | cspell + `flagWords` | preset |
| Pin exato de versão | gate local do consumidor (maromba `tools/gates.sh`) | a portar |
| Camadas | import-linter (Python), dependency-cruiser (TS) | por projeto |

## Decisões abertas (do dono)

- **`line-length`:** 100 é o mais comum (6 repos medidos). O maromba usa 120, e a doc do farmega diz 79 sem gate
  que a sustente. O preset traz 100.
- **Formatter:** `ruff format` (kerr-crawler, thood) ou Black (segtools).
- **Checker de tipos:** ty (farmega, kerr-crawler) ou mypy strict (farmega.v2, nexus, fabber).
