#!/usr/bin/env bash
# Self-test: bash .ai/guards/test-block-destructive-commands.sh
set -uo pipefail
HOOK="$(dirname "$0")/block-destructive-commands.sh"
fail=0
check() {
  local desc="$1" cmd="$2" expect="$3"
  local j; j="$(TOOL_CMD="$cmd" python3 -c 'import json,os;print(json.dumps(os.environ["TOOL_CMD"]),end="")' 2>/dev/null || TOOL_CMD="$cmd" node -e 'process.stdout.write(JSON.stringify(process.env.TOOL_CMD))')"
  printf '{"tool_name":"Bash","tool_input":{"command":%s}}' "$j" | bash "$HOOK" >/dev/null 2>&1
  local rc=$?
  if { [ "$expect" = block ] && [ "$rc" -eq 2 ]; } || { [ "$expect" = allow ] && [ "$rc" -eq 0 ]; }; then
    echo "PASS ($expect): $desc"
  else
    echo "FAIL: $desc (esperava $expect, exit=$rc)"; fail=1
  fi
}
check "compose down -v"            "docker compose down -v"                          block
check "compose -f x down --volumes" "docker compose -f infra/compose.yaml down --volumes" block
check "compose down (sem -v)"      "docker compose down"                             allow
check "volume rm"                  "docker volume rm segtools-pg-data"               block
check "volume prune"               "docker volume prune"                             block
check "system prune --volumes"     "docker system prune --volumes"                   block
check "rm -rf docker volumes"      "rm -rf /var/lib/docker/volumes/x"                block
check "rm -rf .cache"              "rm -rf .cache/"                                  allow
check "override do operador"       "SEGTOOLS_ALLOW_DESTRUCTIVE=1 docker compose down -v" allow
check "ls"                         "ls -la"                                          allow
exit $fail
