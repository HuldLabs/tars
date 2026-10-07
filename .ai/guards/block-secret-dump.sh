#!/usr/bin/env bash
# PreToolUse — bloqueia comandos que DESPEJAM segredos (sops/age, .env, env, docker).
# Adaptado do Fabber (block-secret-dump.sh), sem `wp`/`op`: aqui os segredos vivem em
# o cache local cifrado (ADR-013: ~/.cache/segtools/dev.env.sops + age.key) e o app NAO tem .env em texto puro.
# Contrato: stdin {tool_name, tool_input:{command}}; exit 2 = block (stderr = motivo).
# Fails OPEN: qualquer erro inesperado -> exit 0.
set -uo pipefail

source "$(dirname "$0")/lib-json.sh"
HOOK_INPUT="$(cat 2>/dev/null || true)"
CMD="$(jget tool_input.command)"; TOOL="$(jget tool_name)"
case "$TOOL" in Bash|PowerShell) ;; *) exit 0 ;; esac
[ -z "$CMD" ] && exit 0
LC="$(printf '%s' "$CMD" | tr '[:upper:]' '[:lower:]')"

block() {
  {
    echo "BLOCKED by .ai/guards/block-secret-dump.sh: $1"
    echo ""
    echo "Segredos ficam no cache local cifrado (ADR-013): ~/.cache/segtools/dev.env.sops"
    echo "Alternativas seguras:"
    echo "  - node tools/framework/check-env.mjs   (imprime so PRESENCA: set/unset)"
    echo "  - task secrets:names         (imprime so os NOMES das chaves)"
    echo "  - compara por hash: <cmd> | sha256sum"
    echo "  - docker inspect --format '{{json .Mounts}}' <container>"
    echo "  - docker compose ps (nunca 'config')"
  } >&2
  exit 2
}

# 1. sops --decrypt para stdout (sem hash)
if printf '%s' "$LC" | grep -Eq '(^|[;&|[:space:]])sops([[:space:]]|$)'; then
  if printf '%s' "$LC" | grep -Eq '(^|[[:space:]])(-d|--decrypt)([[:space:]]|$)'; then
    if ! printf '%s' "$LC" | grep -Eq '\|[[:space:]]*(sha256sum|sha1sum|shasum)'; then
      block "'sops --decrypt' imprime o conteudo decifrado."
    fi
  fi
fi

# 2. node tools/framework/secrets.mjs print (despeja valores)
if printf '%s' "$LC" | grep -Eq 'secrets\.mjs[[:space:]]+print'; then
  block "'secrets.mjs print' despeja os valores dos segredos."
fi

# 3. ler .env em texto puro, ou secrets/ que NAO seja .sops (cifrado)
if printf '%s' "$LC" | grep -Eq '(^|[;&|[:space:]])(cat|type|get-content|gc)[[:space:]]+'; then
  if printf '%s' "$LC" | grep -Eq '\.sops([[:space:]]|$)'; then
    : # .sops e CIFRADO — ler e inofensivo, permitido
  elif printf '%s' "$LC" | grep -Eq '(^|/)secrets/|\.cache/segtools'; then
    block "le um arquivo de secrets/ ou o cache local em texto puro."
  elif printf '%s' "$LC" | grep -Eq '\.env([^a-z0-9_].*|$)|(^|/)\.env[[:space:]]'; then
    block "le um .env em texto puro."
  fi
fi

# 4. bare env / printenv
printf '%s' "$LC" | grep -Eq '(^|[;&[:space:]])printenv([[:space:]]*($|[;&]))' && block "bare 'printenv' despeja o ambiente."
printf '%s' "$LC" | grep -Eq '(^|[;&[:space:]])env([[:space:]]*($|[;&]))' && block "bare 'env' despeja o ambiente."

# 5. docker inspect sem --format
if printf '%s' "$LC" | grep -Eq '(^|[;&|[:space:]])docker[[:space:]]+inspect([[:space:]]|$)'; then
  printf '%s' "$LC" | grep -Eq -- '(--format|[[:space:]]-f[[:space:]])' || block "'docker inspect' sem --format dumps o container (env vars)."
fi

# 6. docker compose ... config|convert (resolve ${VAR}); config --services e isento
if printf '%s' "$LC" | grep -Eq '(^|[;&|[:space:]])docker(-compose|[[:space:]]+compose)[[:space:]]'; then
  if printf '%s' "$LC" | grep -Eq '(^|[[:space:]])config([[:space:]]|$)' && ! printf '%s' "$LC" | grep -Eq '(^|[[:space:]])config[[:space:]]+--services([[:space:]]|$)'; then
    block "'docker compose config' resolve e imprime todos os \${VAR} em texto puro."
  fi
  printf '%s' "$LC" | grep -Eq '(^|[[:space:]])convert([[:space:]]|$)' && block "'docker compose convert' idem."
  # 7. docker compose exec <svc> env/printenv
  printf '%s' "$LC" | grep -Eq 'exec[[:space:]]+[^[:space:]]+[[:space:]]+(env|printenv)([[:space:]]|$)' && block "'docker compose exec ... env/printenv' despeja o ambiente do container."
fi
# 8. interpretador (node/python/deno/bun) lendo secrets/ ou a chave age.
# Ancora o interpretador ao INICIO do segmento (^ ou depois de ; & |), e exige o
# termo secreto NO MESMO segmento ([^;&|]* nao cruza separador) — assim
# `grep keys.txt` / `rg readFileSync` (executavel nao-interprete) NAO sao falso-positivo,
# mas `node ... secrets/` apos `&&` ou `|` continua bloqueando.
if printf '%s' "$LC" | grep -Eq '(^|[;&|])[[:space:]]*([a-z_][a-z0-9_]*=[^[:space:]]+[[:space:]]+)*(node|nodejs|python3?|deno|bun)[[:space:]][^;&|]*(secrets/|\.cache/segtools|age\.key|keys\.txt|\.config/sops|sops/age)'; then
  block "um interpretador (node/python/...) le secrets/ ou a chave age."
fi

exit 0

