#!/usr/bin/env sh
# Hook `PreToolUse` (Bash) do gate daneel-acoes — casca fina: o motor e' o Node ao lado
# (mesma regra para o hook e para os testes). Contrato: stdin = JSON do harness, exit 2 = bloqueia.
# FALHA ABERTA: sem node, deixa passar (guarda-corpo, nao barreira).
set -u
command -v node >/dev/null 2>&1 || exit 0
exec node "$(dirname "$0")/daneel-acoes.mjs"
