#!/usr/bin/env bash
# Self-test: bash .ai/guards/test-block-secret-dump.sh
set -uo pipefail
HOOK="$(dirname "$0")/block-secret-dump.sh"
fail=0
check() {
  local desc="$1" tool="$2" cmd="$3" expect="$4"
  local j
  j="$(TOOL_CMD="$cmd" python3 -c 'import json,os;print(json.dumps(os.environ["TOOL_CMD"]),end="")' 2>/dev/null || TOOL_CMD="$cmd" node -e 'process.stdout.write(JSON.stringify(process.env.TOOL_CMD))')"
  printf '{"tool_name":"%s","tool_input":{"command":%s}}' "$tool" "$j" | bash "$HOOK" >/dev/null 2>&1
  local rc=$?
  if { [ "$expect" = block ] && [ "$rc" -eq 2 ]; } || { [ "$expect" = allow ] && [ "$rc" -eq 0 ]; }; then
    echo "PASS ($expect): $desc"
  else
    echo "FAIL: $desc (esperava $expect, exit=$rc)"; fail=1
  fi
}
check "sops --decrypt"              Bash "sops --decrypt secrets/dev.env.sops"        block
check "sops -d | sha256sum"         Bash "sops -d secrets/dev.env.sops | sha256sum"   allow
check "secrets.mjs print"           Bash "node tools/framework/secrets.mjs print"               block
check "secrets.mjs names (so nomes)" Bash "node tools/framework/secrets.mjs names"              allow
check "check-env"                   Bash "node tools/framework/check-env.mjs"                   allow
check "cat secrets plaintext"       Bash "cat secrets/foo.env"                        block
check "cat secrets .sops (cifrado)" Bash "cat secrets/dev.env.sops"                   allow
check "cat .env"                    Bash "cat apps/hub/.env"                               block
check "cat README"                  Bash "cat README.md"                              allow
check "bare printenv"               Bash "printenv"                                   block
check "bare env"                    Bash "env"                                        block
check "docker inspect no format"    Bash "docker inspect segtools-pg"                 block
check "docker inspect --format"     Bash "docker inspect --format '{{.State.Status}}' segtools-pg" allow
check "docker compose config"       Bash "docker compose -f infra/compose.yaml config" block
check "docker compose config --services" Bash "docker compose config --services"      allow
check "docker compose ps"           Bash "docker compose ps"                          allow
check "docker compose exec env"     Bash "docker compose exec pg env"                 block
check "non-Bash tool ignored"       Read "sops --decrypt secrets/dev.env.sops"        allow
check "cat cache local (texto puro)"  Bash "cat ~/.cache/segtools/dev.env.sops"  allow
check "node lendo a chave age local" Bash 'node -e fs.readFileSync("/root/.cache/segtools/age.key")'  block

# regra de interpretador lendo segredo / chave age
check "node -e lendo secrets/"      Bash 'node -e fs.readFileSync("secrets/dev.env.sops")'      block
check "python3 lendo a chave age"   Bash 'python3 -c print(open("keys.txt").read())'            block
check "node script legitimo"        Bash 'node tools/framework/db/migrate.mjs'                         allow
check "deno lendo a chave age"      Bash 'deno eval x --file /root/.config/sops/age/keys.txt'   block
# falso positivo: texto com os termos NAO pode bloquear se o executavel nao e interpretador
check "grep com keys.txt no padrao" Bash 'grep -n readFileSync keys.txt'                        allow
check "rg com keys.txt no padrao"   Bash 'rg -n keys.txt scripts/'                              allow
# interpretador continua bloqueando DEPOIS de && / | (checagem por segmento)
check "node apos && lendo secrets"  Bash 'cat x && node -e fs.readFileSync("secrets/dev.env.sops")'  block
check "python apos pipe lendo key"  Bash 'echo x | python3 -c print(open("keys.txt").read())'        block

# julga a ACAO, nao a palavra no caminho (issue dev.19): leitor+arquivo de segredo
check "head secrets (le valor)"     Bash "head -5 secrets/dev.env"                    block
check "tail .env (le valor)"        Bash "tail -n 20 apps/hub/.env"                   block
check "less token"                  Bash "less config/api.token"                      block
check "source .env (le valor)"      Bash "source .env"                                block
check "op read sem out-file"        Bash 'op read op://vault/item/token'              block
check "op read com --out-file"      Bash 'op read op://vault/item/token --out-file /tmp/t' allow
check "head *.sops (cifrado)"       Bash "head -3 secrets/dev.env.sops"               allow
# FALSO POSITIVO da issue: "secrets" no NOME do arquivo, codigo-fonte -> permitido
check "cat src/secrets/install.sh"  Bash "cat src/secrets/install.sh"                 allow
check "bash src/secrets/install.sh" Bash "bash src/secrets/install.sh"                allow
check "grep no codigo secrets/"     Bash "grep -n token src/secrets/install.sh"       allow
check "cat secrets/loader.mjs"      Bash "cat tools/secrets/loader.mjs"               allow
exit $fail
