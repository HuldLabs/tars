#!/usr/bin/env bash
# PreToolUse - barra `git commit` de AGENTE fora do container: no host ele usaria a assinatura do
# dono (`~/.gitconfig`) e o pedido do 1Password apareceria sem origem (Endurance, 01/11). Humano
# nao passa por aqui: o guard so' existe no harness do agente.
# Bypass: so' com aprovacao explicita do dono, numa pergunta especifica e sozinha, por commit.
# Fora disso o agente PARA e pergunta. Um guard nao prova a aprovacao: ela e' regra de conduta.
set -uo pipefail
source "$(dirname "$0")/lib-json.sh" || { echo "guard: lib-json.sh ausente - bloqueado ate o tars sync repor" >&2; exit 2; }
HOOK_INPUT="$(cat 2>/dev/null || true)"
CMD="$(jget tool_input.command)"; TOOL="$(jget tool_name)"
[ "$TOOL" = "Bash" ] || exit 0
printf '%s' "$CMD" | grep -Eq '(^|[;&|[:space:]])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^[:space:]-][^[:space:]]*)?)*[[:space:]]+commit([[:space:]]|$)' || exit 0
[ -f /.dockerenv ] || [ -f /run/.containerenv ] || [ -n "${REMOTE_CONTAINERS:-}" ] && exit 0
printf '%s' "$CMD" | grep -Eq '(^|[[:space:]])docker[[:space:]]+exec' && exit 0
case "$CMD" in TARS_HOST_COMMIT_OK=*) exit 0 ;; esac
{
  echo "BLOCKED by block-host-commit: git commit de agente fora do container."
  echo "Rode dentro do container. Bypass so' com aprovacao do dono numa pergunta especifica e"
  echo "sozinha, para este commit (TARS_HOST_COMMIT_OK=<data/motivo> git commit ...)."
} >&2
exit 2
