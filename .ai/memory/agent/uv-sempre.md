---
name: uv-sempre
description: Todo Python roda pelo uv (uv run / uv sync), nunca pelo Python do host; o uv traz o interpretador
metadata:
  type: feedback
---

Todo Python do projeto — tooling, hooks, scripts, testes — roda pelo **uv**: `uv run`, `uv sync --frozen`, `uv run --no-project python` para script solto. Nunca `python3`/`python`/`pip` do sistema, nem venv do host. Vale no devcontainer e no host (Windows, Linux, macOS): o uv baixa o Python que precisar, então nada depende do que está instalado na máquina.

**Why:** regra do dono (02/10). Já existia como decisão do ADR-003 (venv gerenciado por uv), mas não como regra de uso; em 02/10 eu escrevi o `ensure-memory-link.sh` procurando `python3`/`python` do host — no Windows o `python3` era o atalho da Microsoft Store e falhava (corrigido em c93c6872).

**How to apply:** script novo em Python → chamado por `uv run`. Wrapper de hook → `command -v uv` e `uv run --no-project --quiet python <script>`. Revisar diff de worker procurando `python3 `/`pip install` chamados direto. Relacionado: [[cache-politica]], [[buscar-dentro-do-container]].
