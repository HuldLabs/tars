#!/usr/bin/env bash
# PreToolUse — bloqueia comandos DESTRUTIVOS (volumes Docker, reset/clean).
# Adaptado do Fabber (aviso #56: `docker compose down -v` destruiu os volumes de dev).
# Override: SEGTOOLS_ALLOW_DESTRUCTIVE=1 (operador, por invocacao — NUNCA o agente).
# Fails OPEN.
set -uo pipefail

source "$(dirname "$0")/lib-json.sh"
HOOK_INPUT="$(cat 2>/dev/null || true)"
CMD="$(jget tool_input.command)"; TOOL="$(jget tool_name)"
case "$TOOL" in Bash|PowerShell) ;; *) exit 0 ;; esac
[ -z "$CMD" ] && exit 0

OVERRIDE_VAR="SEGTOOLS_ALLOW_DESTRUCTIVE"
block() {
  {
    echo "BLOCKED by .ai/guards/block-destructive-commands.sh: $1"
    echo ""
    echo "Override (so o OPERADOR, por invocacao): $OVERRIDE_VAR=1 <cmd>"
    echo "Um agente setar $OVERRIDE_VAR por conta propria e o comportamento que este hook existe p/ impedir."
  } >&2
  exit 2
}
warn() { echo "WARNING (block-destructive-commands.sh): $1" >&2; }

if printf '%s' "$CMD" | grep -Eq "(^|[[:space:]])${OVERRIDE_VAR}=1([[:space:]]|$)"; then
  echo "OVERRIDE ACTIVE: $OVERRIDE_VAR=1 — guarda destrutiva ignorada pelo operador." >&2
  exit 0
fi

LC="$(printf '%s' "$CMD" | tr '[:upper:]' '[:lower:]')"

# docker compose down -v/--volumes (qualquer ordem de flags)
if printf '%s' "$LC" | grep -Eq '(^|[;&|[:space:]])docker([[:space:]]+compose|-compose)([[:space:]]+[^;&|[:space:]]+)*[[:space:]]+down([[:space:]]+[^;&|[:space:]]+)*[[:space:]]+(-v|--volumes)([[:space:]]|$)'; then
  block "'docker compose down -v/--volumes' remove os volumes nomeados."
fi
# docker volume rm/prune
printf '%s' "$LC" | grep -Eq '(^|[;&|[:space:]])docker[[:space:]]+volume[[:space:]]+(rm|prune)([[:space:]]|$)' && block "'docker volume rm/prune' destroi volumes."
# docker system prune --volumes
printf '%s' "$LC" | grep -Eq '(^|[;&|[:space:]])docker[[:space:]]+system[[:space:]]+prune[[:space:]].*--volumes' && block "'docker system prune --volumes' destroi volumes."
# rm -rf em /var/lib/docker/volumes (rm -rf .cache/ e permitido)
if printf '%s' "$LC" | grep -Eq '(^|[;&|[:space:]])rm[[:space:]]+-[a-z]*r[a-z]*f[[:space:]]'; then
  if ! printf '%s' "$LC" | grep -Eq 'rm[[:space:]]+-[a-z]*r[a-z]*f[[:space:]]+\.cache(/|$)'; then
    if printf '%s' "$LC" | grep -Eq 'rm[[:space:]]+-[a-z]*r[a-z]*f[[:space:]]+/var/lib/docker/volumes/'; then
      block "'rm -rf /var/lib/docker/volumes/...' destroi dados de volume."
    fi
  fi
fi
# --- regras de git (.ai/governance/git.md §Proibido) --------------------------------
# O gate `no-add-all` (.ai/gates/no-add-all/) ja' recusa a familia add/commit amplo, mas
# ele so' esta no PreToolUse de quem o declara; a proibicao vale para TODO consumidor do
# Tars, entao ela mora aqui — no guard que todo consumidor traz. Mesma mensagem/override
# do resto do arquivo (o `block`, nao um exit proprio).
# `git add` amplo: `-A`/`--all`/`-u`/`--update`/`.`
printf '%s' "$LC" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+add[^;&|]*[[:space:]](-a|--all|-u|--update|\.)([[:space:]]|$|;)' && block "'git add -A/--all/-u/.' e' proibido — use pathspec explicito: 'git add -- <arquivo>...'."
# `git add .` sem mais args (o `\.` acima ja' cobre o caso com espaco; este cobre 'git add .')
printf '%s' "$LC" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+add[[:space:]]*\.?[[:space:]]*$' && block "'git add' sem pathspec e' proibido — use 'git add -- <arquivo>...'."
# `git add -f`/`--force`: atravessa o .gitignore (INV-CACHE: .cache/ ja' foi parar na main)
printf '%s' "$LC" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+add[^;&|]*[[:space:]](-f|--force|-[a-z]*f[a-z]*)([[:space:]]|$)' && block "'git add -f/--force' atravessa o .gitignore — nao commite o que esta ignorado."
# `git commit -a`/`--all`: commita o que nao e' seu
printf '%s' "$LC" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+commit[^;&|]*[[:space:]](-[a-z]*a[a-z]*|--all)([[:space:]]|$)' && block "'git commit -a/--all' e' proibido — commite com pathspec: 'git commit -F <msg> -- <arquivo>...'."
# `--no-verify` em commit/push: pula os hooks. Nunca.
printf '%s' "$LC" | grep -Eq '(^|[;&|[:space:]])(git[[:space:]]+(commit|push)|git[[:space:]]+-c[^;&|]*commit)[^;&|]*--no-verify([[:space:]]|$)' && block "'--no-verify' pula os hooks de commit/push — nunca use (o gate e' o ponto)."

# --- ator: o agente NAO se declara humano --------------------------------------------
# O gate condicional pode isentar a licao de quem escreve (`[gates.params.<g>].when`, o
# `tars-actor.mjs`): o valor do marcador no comando zera a cobranca. O harness JA' declara
# `agent` no `.claude/settings.json`; mexer no marcador na mao e' pular a licao por dentro —
# o mesmo buraco que o `--no-verify` abre, noutro lugar. Sao tres as saidas, e as tres
# fecham: APAGAR o marcador (unset/env -u), ou ESCREVER nele valor que nao seja o do
# harness (`agent` para `TARS_ACTOR`, `1` para `CLAUDECODE`).
# Vale para `export` e para aspas.
# 1) `unset <marcador>` (ou `unset -v ...`): apaga o marcador no meio do comando.
printf '%s' "$LC" | grep -Eq "(^|[;&|[:space:]])unset([[:space:]]+-[a-z]+)*[[:space:]]+[^;&|]*(tars_actor|claudecode)([[:space:];&|)]|\$)" && block "'unset tars_actor|claudecode' apaga o marcador de ator no meio do comando — o gate leria o ator errado (o harness ja' declara 'agent')."
# 2) `env -u <marcador>` (ou `env i -u`, `--unset`): remove o marcador so' para aquele cmd.
printf '%s' "$LC" | grep -Eq "(^|[;&|[:space:]])env([[:space:]]+-[^;&|[:space:]]+)*[[:space:]]+--?u(nset)?[[:space:]]*(tars_actor|claudecode)([[:space:];&|)]|\$)" && block "'env -u tars_actor|claudecode' remove o marcador de ator do comando — o agente nao decide isso sobre si."
# 3) `tars_actor=`/`claudecode=` com valor que NAO e' o do harness: `=human`, `=`, `=0`,
#    `=""` — todos zeram a cobranca da licao por dentro. Conta as atribuicoes e as que tem
#    valor permitido: sobra atribuicao sem valor bom => bloqueia (pega a mistura tambem).
n_atrib="$(printf '%s\n' "$LC" | grep -Eo '(^|[;&|[:space:]])(export[[:space:]]+)?(tars_actor|claudecode)[[:space:]]*=' | wc -l | tr -d '[:space:]')"
n_ok="$(printf '%s\n' "$LC" | grep -Eo "(^|[;&|[:space:]])(export[[:space:]]+)?(tars_actor|claudecode)[[:space:]]*=[[:space:]]*['\"]?(agent|1)['\"]?([[:space:];&|)]|\$)" | wc -l | tr -d '[:space:]')"
[ "$n_atrib" -gt "$n_ok" ] && block "'TARS_ACTOR='/'CLAUDECODE=' com valor vazio ou diferente de 'agent'/'1' se declara para pular a licao — o harness ja' declara 'agent'; quem escreve nao decide isso sobre si."

# --- wsl.exe com `$` inline ------------------------------------------------------------
# O `wsl.exe` expande `$VAR` do lado WINDOWS antes de o bash do Linux ver a linha, mesmo
# entre aspas simples: `$HOME`, `$PATH` e um `$TOKEN` chegam vazios ou com o valor do
# Windows, e o comando "funciona" com o valor errado (Incident 08/10: um askpass gravado
# com senha vazia levou a concluir que o token estava invalido). O comando com `$` vai
# num arquivo de script: `wsl.exe -d <distro> -- bash /mnt/c/.../script.sh`.
printf '%s' "$LC" | grep -Eq '(^|[;&|[:space:]])wsl(\.exe)?[[:space:]][^;&|]*[[:space:]]-(l?c|ic)[[:space:]][^;&|]*\$' && block "'wsl.exe ... -c' com \`\$\` inline: o wsl.exe expande a variavel do lado Windows antes do bash ver. Ponha o comando num script e rode 'wsl.exe -d <distro> -- bash <arquivo>'."

# git clean -fdx / reset --hard: avisa (nao bloqueia)
printf '%s' "$LC" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+clean[[:space:]]+-[a-z]*f[a-z]*d[a-z]*x([[:space:]]|$)' && warn "'git clean -fdx' remove todo arquivo nao rastreado — verifique 'git status'."
printf '%s' "$LC" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+reset[[:space:]]+--hard([[:space:]]|$)' && warn "'git reset --hard' descarta mudancas nao commitadas — verifique 'git status'."

exit 0
