#!/usr/bin/env bash
# Prova: filtro do jq nao e arquivo de segredo (comandos reais do Endurance, 01/11).
cd "$(dirname "$0")/../.."
G=.ai/guards/block-secret-dump.sh
t() { python3 -c 'import json,sys;print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[1]}}))' "$2" | bash $G >/dev/null 2>&1; r=$?; [ $r = $1 ] && echo "PASS: $2" | cut -c1-60 || { echo "FAIL($r): $2" | cut -c1-60; exit 1; }; }
Q='t=$(curl -fsS "https://ghcr.io/token?service=ghcr.io&scope=repository:$r:pull"'
t 0 "for r in a; do $Q | jq -r .token 2>/dev/null); done; sed -n 458,466p /x/README.md"
t 0 "cat > \$S <<'EOF'
$Q | jq -r .token 2>/dev/null)
EOF
bash \$S"
t 0 "for r in secrets gh; do $Q 2>/dev/null | jq -r .token 2>/dev/null); done | sort | awk '{print}'"
t 2 "cat .token"
t 2 "cat ~/.ssh/deploy.key"
t 2 "jq -r .token secrets/dev.env; cat secrets/dev.env"
