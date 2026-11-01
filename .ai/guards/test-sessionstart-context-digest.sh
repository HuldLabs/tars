#!/usr/bin/env bash
# Self-test: bash .ai/guards/test-sessionstart-context-digest.sh
set -uo pipefail
HOOK="$(cd "$(dirname "$0")" && pwd)/sessionstart-context-digest.sh"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
fail=0

out="$(echo '{"source":"startup"}' | CLAUDE_PROJECT_DIR="$ROOT" bash "$HOOK" 2>&1)"

printf '%s' "$out" | grep -q "nunca --no-verify"       || { echo "FAIL: sem as regras que nao voltam"; fail=1; }
printf '%s' "$out" | grep -q "memoria operacional"      || { echo "FAIL: sem a secao de memoria"; fail=1; }
printf '%s' "$out" | grep -q "\[mem-"              || { echo "FAIL: memoria JSONL nao foi injetada"; fail=1; }
printf '%s' "$out" | grep -q "cursor -> HANDOFF.md"     || { echo "FAIL: sem o ponteiro de estado"; fail=1; }

[ "$fail" -eq 0 ] && echo "PASS: digest inclui skills + regras + memoria + estado"
exit $fail
