#!/usr/bin/env bash
# Prova: texto citado nao e' comando; comando de verdade segue barrado (coord Tars, 01/11).
G="$(dirname "$0")/block-destructive-commands.sh"; fail=0
t() { python3 -c 'import json,sys;print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[1]}}))' "$2" | env -u SEGTOOLS_ALLOW_DESTRUCTIVE bash "$G" >/dev/null 2>&1; r=$?; [ "$r" = "$1" ] || { echo "FAIL($r): $2"; fail=1; }; }
A="git add"
t 0 "printf \"barrava $A -A com push -u\" > m; $A -- a.txt; git commit -F m"
t 0 "git commit -m \"evita $A .\" -- a.txt"
t 0 "git commit -F - <<'M'
nao use $A -A
M
$A -- a.txt"
t 0 "printf '%s\\n' '$A -A' 'x'"
t 0 "printf '{\\"c\\":\\"%s\\"}' \"$A -A\""
t 2 "printf '$A -A' | sh"
t 2 "$A -A"
t 2 "bash -c \"$A -A\""
t 2 "echo x; $A ."
[ "$fail" -eq 0 ] && echo "PASS: so_comando"
exit $fail
