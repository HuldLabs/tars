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

# --- regras de git (.ai/governance/git.md §Proibido) ---
check "git add -A"                 "git add -A"                                      block
check "git add ."                  "git add ."                                       block
check "git add --all"              "git add --all"                                   block
check "git add -u"                 "git add -u"                                      block
check "git commit -a"              "git commit -a"                                   block
check "git commit -am"             "git commit -am 'msg'"                            block
check "git push --no-verify"       "git push --no-verify"                            block
check "git commit --no-verify"     "git commit --no-verify -m x"                     block
check "git add -f ignorado"        "git add -f .cache/x"                             block
check "git add '--' explicito"     "git add -- tools/framework/tars.mjs"             allow
check "git add PATH (sem --)"      "git add tools/framework/tars.mjs"                allow
check "git commit pathspec"        "git commit -F /tmp/m -- tools/x.mjs"             allow
check "git status"                 "git status --short"                              allow
check "override git add -A"        "SEGTOOLS_ALLOW_DESTRUCTIVE=1 git add -A"         allow

# --- ator: o agente nao se declara humano ---
check "TARS_ACTOR=human"           "TARS_ACTOR=human git commit -F /tmp/m"           block
check "TARS_ACTOR= human"          "TARS_ACTOR= human git commit -F /tmp/m"          block
check "export TARS_ACTOR=human"    "export TARS_ACTOR=human"                          block
check "TARS_ACTOR='human'"         "TARS_ACTOR='human' git commit -F /tmp/m"         block
check "TARS_ACTOR=human encadeado" "echo x && TARS_ACTOR=human git commit"            block
check "TARS_ACTOR=humano (outro valor)" "TARS_ACTOR=humano git commit"                block
# qualquer valor diferente de 'agent' zera a cobranca — inclusive o vazio.
check "TARS_ACTOR= vazio"          "TARS_ACTOR= git commit -F /tmp/m"                 block
check "TARS_ACTOR='' vazio"        "TARS_ACTOR='' git commit -F /tmp/m"               block
check "TARS_ACTOR=\"\" vazio"      'TARS_ACTOR="" git commit -F /tmp/m'               block
check "TARS_ACTOR=0"               "TARS_ACTOR=0 git commit -F /tmp/m"                block
check "export TARS_ACTOR=human"    "export TARS_ACTOR=human && git commit"            block
# CLAUDECODE: o harness declara 1; outro valor (ou vazio) e' o mesmo buraco.
check "CLAUDECODE=0"               "CLAUDECODE=0 git commit -F /tmp/m"                block
check "CLAUDECODE= vazio"          "CLAUDECODE= git commit -F /tmp/m"                 block
check "CLAUDECODE=human"           "CLAUDECODE=human git commit -F /tmp/m"            block
# `unset`/`env -u`: apagar o marcador no meio do comando (o gate le o env VIVO).
check "unset TARS_ACTOR"           "unset TARS_ACTOR; git commit -F /tmp/m"           block
check "unset -v TARS_ACTOR"        "unset -v TARS_ACTOR"                              block
check "unset CLAUDECODE"           "unset CLAUDECODE && git commit"                   block
check "env -u TARS_ACTOR"          "env -u TARS_ACTOR git commit -F /tmp/m"           block
check "env --unset TARS_ACTOR"     "env --unset TARS_ACTOR git commit"                block
check "env -i -u CLAUDECODE"       "env -i -u CLAUDECODE bun test"                    block
# os valores do harness continuam passando.
check "TARS_ACTOR=agent (o normal)" "TARS_ACTOR=agent git commit -F /tmp/m"           allow
check "CLAUDECODE=1 (o normal)"    "CLAUDECODE=1 bun test"                            allow
check "export TARS_ACTOR=agent"    "export TARS_ACTOR=agent"                          allow
check "unset PATH (nao e' marcador)" "unset PATH"                                     allow
check "env -u HOME (nao e' marcador)" "env -u HOME git commit -F /tmp/m"              allow
exit $fail
