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

# 3. leitura IMPRIMINDO valor de arquivo de segredo — julga a ACAO, nao o caminho.
# So bloqueia quando o comando (a) LE/DUMPA (cat/less/head/tail/sed/awk/strings...)
# (b) um arquivo de SEGREDO (*.env, *.sops, *.key, token/secret/credentials, secrets/...)
# (c) cujo valor sai para stdout (sem | sha256sum). Caminho com "secrets" no NOME
# (ex.: src/secrets/install.sh, codigo-fonte) NAO bloqueia por si so.
READERS='(^|[;&|[:space:]])(cat|bat|batcat|less|more|head|tail|sed|awk|strings|xxd|od|nl|tac|vi|vim|nano|emacs|source|get-content|gc)[[:space:]]|(^|[;&|[:space:]])[.][[:space:]]'
# Ancora por CLASSE de separador (^|[[:space:]/]) — o `(^|/)` do GNU grep falha
# de forma intermitente quando a entrada vem por PIPE (testado: exit 1 com o texto
# presente); a classe e' estavel.
SECRETFILE='(^|[[:space:]/])(\.env([.][a-z0-9_-]+)?|secrets/[^[:space:]]*|[^[:space:]]*\.(env|sops|key|pem|p12|pfx|token|credentials|netrc)|(id_rsa|id_ed25519|\.netrc|\.npmrc|\.pypirc|\.pgpass))([[:space:]]|$)|\.cache/segtools|\.config/sops|keys\.txt'
# codigo-fonte dentro de secrets/ nao e valor de segredo (src/secrets/install.sh)
SRCCODE='\.(sh|bash|zsh|py|mjs|cjs|js|ts|tsx|jsx|go|rs|rb|java|kt|md|json|toml|ya?ml|txt|html|css|scss)([[:space:]]|$)'
if printf '%s' "$LC" | grep -Eq "$READERS"; then
  if printf '%s' "$LC" | grep -Eq "$SECRETFILE" && ! { printf '%s' "$LC" | grep -Eq '(^|[[:space:]/])secrets/.*'"$SRCCODE"; }; then
    # ler um .sops (CIFRADO) e inofensivo; mas so o VERBO-LEITOR puro: `cat a.sops`,
    # nunca `cat secrets/x | cat` (o ultimo alimenta um leitor real com texto puro).
    if ! { printf '%s' "$LC" | grep -Eq '\.sops([[:space:]]|$)'; } \
       || printf '%s' "$LC" | grep -Eq '\.sops[[:space:]]*[|;&]'; then
      # `| sha256sum` do lado do arquivo = prova por hash, isento
      if ! printf '%s' "$LC" | grep -Eq '\|[[:space:]]*(sha256sum|sha1sum|shasum)'; then
        block "le/imprime em stdout o valor de um arquivo de segredo (.env/.sops/secrets/chave)."
      fi
    fi
  fi
fi

# 4. bare env / printenv
printf '%s' "$LC" | grep -Eq '(^|[;&[:space:]])printenv([[:space:]]*($|[;&]))' && block "bare 'printenv' despeja o ambiente."
printf '%s' "$LC" | grep -Eq '(^|[;&[:space:]])env([[:space:]]*($|[;&]))' && block "bare 'env' despeja o ambiente."
# 4b. `op read` sem --out-file: imprime o valor do segredo na tela.
if printf '%s' "$LC" | grep -Eq '(^|[;&|[:space:]])op[[:space:]]+read([[:space:]]|$)'; then
  printf '%s' "$LC" | grep -Eq -- '(--out-file|-o[[:space:]][^[:space:]]+)[[:space:]]' || block "'op read' sem --out-file imprime o valor do segredo."
fi

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

