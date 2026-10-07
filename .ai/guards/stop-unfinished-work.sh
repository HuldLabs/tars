#!/usr/bin/env bash
# Stop — ADAPTADO do Fabber. O gate original bloqueia quando ha trabalho aberto E
# nada vai reacordar a sessao (session_crons vazio). O segtools NAO tem coordenador
# nem crons/heartbeat (sessoes interativas), entao o sinal do Fabber nao existe aqui:
# bloquear todo Stop com BACKLOG 'Em andamento' travaria a sessao. Portanto este hook
# e ADVISORY (avisa, nunca bloqueia) e cobra o que faz sentido sem heartbeat:
#   - trabalho aberto no BACKLOG (Em andamento/Bloqueado) => lembrete de refletir em HANDOFF.md.
# Fails OPEN.
set -uo pipefail

source "$(dirname "$0")/lib-json.sh"
HOOK_INPUT="$(cat 2>/dev/null || true)"
ACTIVE="$(jget stop_hook_active)"
[ "$ACTIVE" = "true" ] && exit 0   # anti-loop (regra do harness)

CWD="$(jget cwd)"; ROOT="${CLAUDE_PROJECT_DIR:-$CWD}"; [ -z "$ROOT" ] && ROOT="$(pwd)"
[ -d "$ROOT" ] || exit 0
B="$ROOT/BACKLOG.md"; [ -r "$B" ] || exit 0

OPEN="$(awk '
  /^## Em andamento/ {s=1;next}
  /^## Bloqueado/    {s=2;next}
  /^## /             {s=0;next}
  s && (/^- / || /^\| /) {print}
' "$B" 2>/dev/null | head -n 8 || true)"

if [ -n "$OPEN" ]; then
  {
    echo "stop-gate (advisory): ha trabalho aberto no BACKLOG.md e a sessao esta encerrando."
    echo "Garanta que o proximo passo esta em HANDOFF.md (cursor vivo), nao so no chat:"
    printf '  %s\n' "$OPEN"
    echo "Se o item foi concluido, mova-o para DELIVERED.md."
  } >&2
fi
exit 0
