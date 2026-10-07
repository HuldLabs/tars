#!/usr/bin/env bash
# PreCompact (matcher: manual|auto) — uma compactacao e o momento em que tudo que
# NAO esta no disco morre. Bloqueia APENAS quando ha mudanca NAO COMMITADA num
# documento de estado (HANDOFF.md/BACKLOG.md/DELIVERED.md). Fails OPEN.
# Escape hatch: CLAUDE_SKIP_PRECOMPACT_GATE=1 ou o marker .cache/claude-hooks/skip-precompact-gate.
set -uo pipefail

STATE_DOCS=(HANDOFF.md BACKLOG.md DELIVERED.md)
STATE_REL=".cache/claude-hooks"
MARKER_REL="$STATE_REL/skip-precompact-gate"

warn() { echo "precompact-gate: $*" >&2; }

source "$(dirname "$0")/lib-json.sh"
HOOK_INPUT="$(cat 2>/dev/null || true)"
CWD="$(jget cwd)"; TRIGGER="$(jget trigger)"

ROOT="${CLAUDE_PROJECT_DIR:-$CWD}"; [ -z "$ROOT" ] && ROOT="$(pwd)"
[ -d "$ROOT" ] || { warn "allowed: project root '$ROOT' nao e diretorio."; exit 0; }

if [ "${CLAUDE_SKIP_PRECOMPACT_GATE:-}" = "1" ]; then warn "allowed (escape hatch: env)."; exit 0; fi
if [ -e "$ROOT/$MARKER_REL" ]; then warn "allowed (escape hatch: marker). Remova-o para rearmar."; exit 0; fi
command -v git >/dev/null 2>&1 || { warn "allowed: git ausente."; exit 0; }
git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1 || { warn "allowed: '$ROOT' nao e git work tree."; exit 0; }

DIRTY="$(git -C "$ROOT" status --porcelain -- "${STATE_DOCS[@]}" 2>/dev/null || true)"
if [ -n "$DIRTY" ]; then
  {
    echo "BLOCKED by precompact-persist-state.sh: a compactacao descartaria estado nao commitado."
    echo ""
    echo "Mudanca(s) nao commitada(s) em documento de estado:"
    printf '  %s\n' "$DIRTY"
    echo ""
    echo "Commite primeiro (ex.: git add ${STATE_DOCS[*]} && git commit ...)."
    echo "Para compactar mesmo assim (casos pontuais): mkdir -p $STATE_REL && touch $MARKER_REL"
  } >&2
  exit 2
fi

warn "allowed: sem mudancas nao commitadas em ${STATE_DOCS[*]} (trigger: ${TRIGGER:-?})."
echo "[precompact] Preserve no resumo o que NAO volta sozinho:"
echo "  - as SKILLS carregadas nesta sessao (o harness recarrega CLAUDE.md/AGENTS.md, skill nao)."
echo "  - o proximo passo (deve estar em HANDOFF.md) e o que esta 'Em andamento' no BACKLOG.md."
echo "  - regras que vivem em skill/disciplina: devcontainer-first; segredos via sops (task secrets:*);"
echo "    nunca --no-verify; verificar PELA SAIDA do comando, nao pela afirmacao."
echo "  - qualquer coisa que exista SO no transcript e pertenca ao HANDOFF.md: escreva no arquivo ANTES de compactar."
exit 0
