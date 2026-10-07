#!/usr/bin/env bash
# lib-json.sh — parse de um campo do JSON do hook. O hook le o stdin UMA vez no
# shell pai (HOOK_INPUT="$(cat)") e depois chama jget; jget NAO le stdin (isso
# quebraria: $(jget) roda em subshell e o 2o cat viria vazio).
# python3 e o preferido no host (Git Bash tem python3, nao node); node e o fallback.
# Uso:
#   source "$(dirname "$0")/lib-json.sh"
#   HOOK_INPUT="$(cat 2>/dev/null || true)"
#   CMD="$(jget tool_input.command)"
jget() {
  printf '%s' "${HOOK_INPUT:-}" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    for k in sys.argv[1].split("."):
        d = d.get(k, {}) if isinstance(d, dict) else {}
    sys.stdout.write(d if isinstance(d, str) else "")
except Exception:
    pass
' "$1" 2>/dev/null && return 0
  printf '%s' "${HOOK_INPUT:-}" | node -e '
let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{
  try{let d=JSON.parse(s);
    for(const k of process.argv[1].split(".")) d=(d&&typeof d==="object")?d[k]:"";
    process.stdout.write(typeof d==="string"?d:"");}catch(e){}
});' "$1" 2>/dev/null || true
}
