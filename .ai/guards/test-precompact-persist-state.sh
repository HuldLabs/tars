#!/usr/bin/env bash
# Self-test: bash .ai/guards/test-precompact-persist-state.sh
set -uo pipefail
HOOK="$(cd "$(dirname "$0")" && pwd)/precompact-persist-state.sh"
fail=0
TMP="$(mktemp -d)"
git -C "$TMP" init -q
git -C "$TMP" config user.email t@t.local
git -C "$TMP" config user.name t
git -C "$TMP" config commit.gpgsign false
git -C "$TMP" config tag.gpgsign false
printf 'cursor\n' > "$TMP/HANDOFF.md"
git -C "$TMP" add HANDOFF.md
git -C "$TMP" -c commit.gpgsign=false commit -qm init

run() { echo '{"trigger":"manual"}' | CLAUDE_PROJECT_DIR="$TMP" bash "$HOOK" 2>&1; }

# 1. estado sujo -> BLOCK (exit 2)
printf 'x\n' >> "$TMP/HANDOFF.md"
out="$(run)"; rc=$?
if [ "$rc" -eq 2 ] && printf '%s' "$out" | grep -q "BLOCKED"; then
  echo "PASS (block): estado documental sujo"
else echo "FAIL: sujo (rc=$rc)"; fail=1; fi
git -C "$TMP" checkout -q -- HANDOFF.md

# 2. estado limpo -> ALLOW (exit 0) + instrucoes ao resumo
out="$(run)"; rc=$?
if [ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q "Preserve no resumo"; then
  echo "PASS (allow+instrucoes): estado limpo"
else echo "FAIL: limpo (rc=$rc)"; fail=1; fi

# 3. escape hatch (marker) -> ALLOW mesmo sujo
printf 'x\n' >> "$TMP/HANDOFF.md"
mkdir -p "$TMP/.cache/claude-hooks"
touch "$TMP/.cache/claude-hooks/skip-precompact-gate"
out="$(run)"; rc=$?
if [ "$rc" -eq 0 ]; then echo "PASS (escape hatch): marker libera"; else echo "FAIL: marker (rc=$rc)"; fail=1; fi

rm -rf "$TMP"
exit $fail
