#!/usr/bin/env bash
# Hook SessionStart e `task ai:setup`: roda ensure_memory_link.py pelo uv (regra: todo Python pelo uv,
# nunca pelo Python do host — o uv baixa o interpretador se faltar). Linux, macOS e Windows (Git Bash).
# Sem uv, avisa e segue (nunca derruba a sessão).
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if command -v uv >/dev/null 2>&1; then
  MSYS_NO_PATHCONV=1 uv run --no-project --quiet python "$here/ensure_memory_link.py" "$@"
  exit 0
fi
echo "ensure-memory-link: uv não encontrado no PATH - link da memória não verificado (instale o uv)" >&2
exit 0
