---
name: code-as-doc
description: Código como documentação — nomes descritivos que contam a história, docstrings completas, comentários em bloco que explicam o porquê e fluxo declarativo. Use ao criar ou editar qualquer arquivo de código ou de configuração (Python, TypeScript, Rust, TOML, shell, SQL), inclusive PoC, testes e scripts. Mantra perene, no nível de KISS e SSOT.
---

# Código como documentação

> O código se explica sozinho: quem lê entende **o quê** pelo nome e pela forma, e **o porquê** pelo comentário
> e pela docstring. Documentação à parte que repete o código é duplicação (fere o SSOT).

## Origem (portado, não reinventado)

- **fabber**, `FOUNDATION.md` §1 "Código como documentação": nome semântico, `calculateMercadoLivreFees()` e
  nunca `calcMLFees()`.
- **farmega.v2**: `.ai/governance/source-file-documentation.md`, a skill `source-file-documentation` e o
  verificador `check_source_documentation.py` (documentação de arquivo e de função pública).
- **kerr-crawler**: `.ai/skills/code-as-doc` e `docs/STANDARDS.md` (camadas, matriz de enforcement).
- **agent-skills**: `python-engineering-standards` (PEPs, tipos, erros, testes, uv) e `source-file-documentation`
  (regras por linguagem, escopo), em `references/`.
- **maromba**: exemplo do dono, `calculate_body_ideal_math(...)` e `person_body_weight`, nunca `a(b)` ou `x = 1`.

## 1. Nomes

- Função = verbo + objeto + qualificador: `calculate_with_method()`, `list_formula_input_names()`. Nunca
  `calc()`, `proc()`, `do_it()`, `a()`.
- Variável diz o que guarda, com a unidade: `person_body_weight_kg`, `response_time_ms`. Nunca `x`, `r`, `tmp`,
  `data`, `res`. Exceção: o índice de laço curto e o parâmetro de lambda de uma linha.
- Tipo diz o papel: `CalculationResult`, `FieldError`. Nunca `Result`, `Info`, `Manager`, `Helper` soltos.
- Booleano é pergunta: `is_verified`, `has_consent`. Exceção é sufixo `Error` (PEP 8, N818).
- Termo vem do glossário do domínio; abreviação só quando o domínio já usa (`url`, `id`, `bmr`).
- Tudo em inglês (regra de idioma); o texto que o usuário vê sai por i18n.

## 2. Docstrings (obrigatórias e completas)

- **Todo módulo** abre com docstring: o que o arquivo é, o papel na arquitetura, a decisão (ADR) que o rege.
- **Toda função, classe e método público** tem docstring no estilo do preset da linguagem (Python: Google, PEP 257;
  TS: TSDoc; Rust: rustdoc com `# Errors`/`# Panics`).
- A docstring diz o contrato: o que recebe (`Args:`), o que devolve (`Returns:`), o que levanta (`Raises:`), a
  unidade e o intervalo válido, e a fonte (paper, lei, norma) quando é regra de domínio.
- Docstring não parafraseia a assinatura ("Recebe x e retorna y" é ruído); ela conta o que a assinatura não conta.
- Função privada com lógica não óbvia também recebe docstring.

## 3. Comentários

- Comentário em **bloco**, acima do trecho, explicando o **porquê**: a decisão do dono, a armadilha que já
  mordeu, o invariante, a fonte da regra. Nunca o que a linha já diz.
- Comentário velho é bug: ao mudar o código, atualize o comentário no mesmo commit.
- Arquivo de config (TOML, YAML, shell) abre com um cabeçalho `#` dizendo o que é e quem lê.

## 4. Forma

- Uma função faz uma coisa; se o nome precisa de "e", são duas funções. Complexidade ciclomática ≤ 10.
- Decisão com várias regras é tabela (dict, `match` com um braço por regra), não `if` aninhado.
- Sem número mágico: constante com nome e unidade.
- Clareza vence compactação.

## Referências

- `references/python.md`: PEPs de base, tipos, erros (fail-loud), testes, uv.
- `references/language-conventions.md`: cabeçalho e docstring por linguagem (Python, TS, Rust, TOML, shell, SQL).

## 5. Enforcement

- Gate `source-doc` do Tars: docstring de módulo e de símbolo público, nome público com 3 caracteres ou mais,
  cabeçalho de TOML/shell.
- Preset de lint (Python: ruff `D` com `pydocstyle = google`, `N`, `ANN`, `C90`); dicionário curado (skill
  `cspell-curator`), que pega nome abreviado e comentário no idioma errado.
- Na revisão, um nome que precisa de explicação verbal é defeito: renomeie (regra do escoteiro: o que é tocado é
  corrigido no mesmo commit).

## Histórico

- 20/11/2026: portada para o Tars, generalizada para várias linguagens e com a seção de docstrings explícita.
  Pedido do dono: "docstring é muito importante", "code as docs... tars já te deu tudo isso não?" (não dava).
