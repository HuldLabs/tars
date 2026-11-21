# Python: PEPs, tipos, erros e testes

Portado de `agent-skills/python-engineering-standards` (SKILL e `references/enterprise-python.md`) e do
`farmega/docs/governance/python-standards.md`. O preset do ruff em `templates/tooling/` faz o lint cobrar isto.

## PEPs de base

| PEP | O que cobra | Lint |
| --- | --- | --- |
| 20 | clareza, explícito melhor que implícito, simples | revisão |
| 8 | nomes, imports, layout | ruff `E`, `N`, `I` |
| 257 | docstring útil (Google), não enchimento | ruff `D`, `pydocstyle = google` |
| 484 / 526 | tipo em toda API pública e em estado complexo | ruff `ANN` |
| 544 | `Protocol` quando importa o comportamento, não a herança | revisão |
| 557 | `dataclass` (ou Pydantic na borda) para dado estruturado | revisão |
| 621 | metadado do projeto no `pyproject.toml` | — |
| 723 | metadado inline para script `uv` de um arquivo só | — |

## Tipos

- Todo parâmetro e retorno público anotado; genérico embutido (`list[str]`, `dict[str, int]`).
- `Literal`, `TypedDict`, `TypeAlias`, `Protocol` quando reduzem ambiguidade. `Any` só em borda realmente dinâmica.
- Import usado só em anotação vai para `if TYPE_CHECKING:`.

## Erros (fail-loud)

- Exceção específica, nunca `except:` nem `except Exception` engolido (ruff `BLE001`, `S110`, `S112`).
- Relançar com contexto (`raise DomainError(...) from exc`) quando o chamador ganha com o erro de domínio.
- Nome de exceção termina em `Error` (N818).

## Testes

- Comportamento novo: teste antes, quando viável. Bug: teste de regressão vermelho antes da correção.
- `pytest`; o caminho crítico com cobertura total.

## Pacotes e execução

- Só `uv` (`uv add`, `uv sync`, `uv run`); nada de `pip` ou venv manual como fluxo principal.
- Dependência mínima e justificada, stdlib antes; versão exata (`==`).
- CLI com efeito colateral tem `--dry-run`; `--help` não exige segredo.
- `pathlib.Path` no lugar de `os.path`.
