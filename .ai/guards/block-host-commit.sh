#!/usr/bin/env bash
# PreToolUse - barra operacao git de AGENTE fora do container que pode ASSINAR ou abrir SSH: no
# host ela usaria a assinatura e o SSH do dono (`~/.gitconfig`, op-ssh-sign) e o pedido do
# 1Password apareceria sem origem (Endurance, 01/11). Antes so' o `commit` era barrado, e tag,
# merge, rebase, pull e push passavam. Leitura e operacao local que nao assina seguem livres.
# Humano nao passa por aqui: o guard so' existe no harness do agente.
# Bypass: so' com aprovacao explicita do dono, numa pergunta especifica e sozinha, por comando.
# Fora disso o agente PARA e pergunta. Um guard nao prova a aprovacao: ela e' regra de conduta.
set -uo pipefail
source "$(dirname "$0")/lib-json.sh" || { echo "guard: lib-json.sh ausente - bloqueado ate o tars sync repor" >&2; exit 2; }
HOOK_INPUT="$(cat 2>/dev/null || true)"
CMD="$(jget tool_input.command)"; TOOL="$(jget tool_name)"
[ "$TOOL" = "Bash" ] || exit 0
LC="$(so_comando "$CMD" | tr '"\047' '  ')"
# Assinam (commit.gpgsign/tag.gpgsign) ou falam com remoto por SSH (insteadOf).
SUBS='commit|tag|merge|rebase|cherry-pick|revert|am|commit-tree|stash|pull|push|fetch|clone|ls-remote|submodule|remote[[:space:]]+update'
printf '%s' "$LC" | grep -Eq "(^|[;&|[:space:]])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^[:space:]-][^[:space:]]*)?)*[[:space:]]+($SUBS)([[:space:]]|\$)" || exit 0
# TARS_GUARD_FORCE_HOST: so' o teste o liga, para provar o bloqueio dentro do container. Ele so'
# endurece o guard; nunca libera nada.
if [ -z "${TARS_GUARD_FORCE_HOST:-}" ]; then
  [ -f /.dockerenv ] || [ -f /run/.containerenv ] || [ -n "${REMOTE_CONTAINERS:-}" ] && exit 0
fi
printf '%s' "$LC" | grep -Eq '(^|[[:space:]])docker[[:space:]]+exec' && exit 0
case "$CMD" in TARS_HOST_COMMIT_OK=*) exit 0 ;; esac
{
  echo "BLOCKED by block-host-commit: git de agente fora do container que pode assinar ou usar o"
  echo "SSH do dono (commit, tag, merge, rebase, pull, push, fetch...)."
  echo "Rode dentro do container. Bypass so' com aprovacao do dono numa pergunta especifica e"
  echo "sozinha, para este comando (TARS_HOST_COMMIT_OK=<data/motivo> git ...)."
} >&2
exit 2
