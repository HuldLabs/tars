#!/usr/bin/env bash
# Prova do block-host-commit: agente no host barrado; container, docker exec e bypass passam.
G="$(dirname "$0")/block-host-commit.sh"; fail=0
roda() { printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$1" | env -u REMOTE_CONTAINERS bash "$G" 2>/dev/null; echo $?; }
if [ -f /.dockerenv ] || [ -f /run/.containerenv ]; then esperado=0; else esperado=2; fi
[ "$(roda 'git commit -m x')" = "$esperado" ] || { echo "FAIL: commit"; fail=1; }
[ "$(roda 'git status')" = 0 ] || { echo "FAIL: status"; fail=1; }
[ "$(roda 'docker exec c git commit -m x')" = 0 ] || { echo "FAIL: docker exec"; fail=1; }
[ "$(roda 'TARS_HOST_COMMIT_OK=hoje git commit -m x')" = 0 ] || { echo "FAIL: bypass"; fail=1; }
[ "$fail" -eq 0 ] && echo "PASS: block-host-commit"
exit $fail
