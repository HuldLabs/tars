#!/usr/bin/env bash
# SessionStart (matcher: startup|resume|clear|compact) — injeta um resumo curto do
# estado no inicio da sessao (stdout e contexto VISIVEL). <= 30 linhas. Nunca falha.
# Inclui as entradas DURABLE+VERIFIED da memoria operacional (.ai/memory) que nao expiraram.
set -uo pipefail

MAX_LINES=30; LINES=0; OUT=""
print_line() { [ "$LINES" -ge "$MAX_LINES" ] && return 0; OUT="${OUT}$1
"; LINES=$((LINES+1)); }

source "$(dirname "$0")/lib-json.sh"
HOOK_INPUT="$(cat 2>/dev/null || true)"
SOURCE="$(jget source)"; CWD="$(jget cwd)"
ROOT="${CLAUDE_PROJECT_DIR:-$CWD}"; [ -z "$ROOT" ] && ROOT="$(pwd)"; [ -d "$ROOT" ] || ROOT="$(pwd)"

print_line "[context-digest] ($SOURCE) segredos/estado ficam em disco; o resumo abaixo evita re-descobrir."
print_line "skills obrigatorias: app-extraction, security-testing (leia o SKILL.md de cada uma)."
print_line "regras que NAO voltam sozinhas:"
print_line "  - devcontainer-first: rode ferramenta DENTRO dele (devcontainers exec), nao no host."
print_line "  - segredos: cache local cifrado ~/.cache/segtools/dev.env.sops (ADR-013; 1Password e a fonte); o template versionado e secrets/dev.env.tpl; apps/hub/.env e PROIBIDO; use task secrets:*."
print_line "  - nunca --no-verify; verificar PELA SAIDA do comando, nao pela afirmacao."
print_line "  - verde = task check (typecheck+unit+int+build+e2e)."

BRANCH=""; command -v git >/dev/null 2>&1 && BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
[ -z "$BRANCH" ] && BRANCH="(nao-git)"
print_line "estado: branch $BRANCH | cursor -> HANDOFF.md | fila -> BACKLOG.md | entregue -> DELIVERED.md"

# --- memoria operacional (SES-02): durable + verified + nao expirada, com teto ---
MEM="$ROOT/.ai/memory/operational-memory.jsonl"
if [ -f "$MEM" ]; then
  MEM_LINES="$(python3 -c '
import json,sys,datetime
today=datetime.date.today().isoformat(); n=0
try:
    fh=open(sys.argv[1],encoding="utf-8")
except Exception:
    sys.exit(0)
for line in fh:
    line=line.strip()
    if not line: continue
    try: e=json.loads(line)
    except Exception: continue
    if e.get("durability")!="durable" or e.get("validation_status")!="verified": continue
    exp=e.get("expires_at")
    if exp and exp < today: continue
    print("  - ["+str(e.get("id",""))+"] "+str(e.get("statement",""))[:120]); n+=1
    if n>=6: break
' "$MEM" 2>/dev/null || node -e '
const fs=require("fs");let out="";try{const L=fs.readFileSync(process.argv[1],"utf8").split(/\r?\n/);const today=new Date().toISOString().slice(0,10);let n=0;
for(const l of L){const s=l.trim();if(!s)continue;let e;try{e=JSON.parse(s)}catch{continue}
if(e.durability!=="durable"||e.validation_status!=="verified")continue;if(e.expires_at&&e.expires_at<today)continue;
out+="  - ["+(e.id||"")+"] "+String(e.statement||"").slice(0,120)+"\n";if(++n>=6)break} }catch{}
process.stdout.write(out);' "$MEM" 2>/dev/null || true)"
  if [ -n "$MEM_LINES" ]; then
    print_line "memoria operacional (durable/verified):"
    while IFS= read -r l; do [ -n "$l" ] && print_line "$l"; done <<< "$MEM_LINES"
  fi
fi

if [ -f "$ROOT/BACKLOG.md" ]; then
  OPEN="$(awk '/^## Em andamento/ {s=1;next} /^## / {s=0} s && /^- |^\| / {print}' "$ROOT/BACKLOG.md" 2>/dev/null | head -n 6 || true)"
  if [ -n "$OPEN" ]; then
    print_line "BACKLOG.md 'Em andamento':"
    while IFS= read -r l; do print_line "  ${l:0:110}"; done <<< "$OPEN"
  fi
fi
printf '%s' "$OUT"
exit 0
