# gate: gitleaks

**O que cobra** — nenhum segredo no que vai ser commitado: roda o `gitleaks` (`protect --staged`, ou
`detect` no modo `tree`) e propaga o exit code. Sem o binario, **avisa alto e passa** (best-effort, igual ao
pre-commit do segtools: o gate nao inventa um "pode commitar" silencioso).

**Em que hook** — `pre-commit`.

**Stacks** — `any` (precisa do binario `gitleaks` no PATH).

**Parametros** — `modo` (`staged` default | `tree`) e `extra` (lista de argumentos extras do gitleaks).
Declarados em `[gates.params.gitleaks]` no `.ai/tars.toml` do projeto consumidor; a config do projeto
(`.gitleaks.toml`, na raiz) e' usada sozinha quando existe.

**Proveniencia** — portado do segtools (`.githooks/pre-commit` §3; leitura de 07/10).
