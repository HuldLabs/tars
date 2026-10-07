#!/usr/bin/env sh
# Hook `PreToolUse` (Bash) do gate no-add-all — casca fina: o motor do gate e' o Node ao
# lado (mesma regra para o hook e para os testes). Contrato: stdin = JSON do harness,
# 2 = bloqueia. FALHA ABERTA: sem node, deixa passar (guarda-corpo, nao barreira).
set -u
command -v node >/dev/null 2>&1 || exit 0
exec node "$(dirname "$0")/no-add-all.mjs"
