#!/usr/bin/env bash
# Teste de UPGRADE REAL (dev.23): instala a versao ANTERIOR num projeto, atualiza para a NOVA
# e confere o que o consumidor ve. Os bugs da dev.20/21 (lib dos guards apagada, guard que
# aprovava sem a lib, upgrade que dizia "nada mudou" e mantinha o arquivo velho) so' apareceram
# quando um consumidor atualizou de verdade — nenhum teste fazia esse caminho.
#
#   tools/framework/tars-upgrade-real.sh <binario-anterior> <binario-novo>
#
# Roda no CI da release antes de publicar (job `upgrade-real`) e na maquina de quem mexe no sync.
set -euo pipefail
velho="$(realpath "$1")"
novo="$(realpath "$2")"
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
falha() { echo "upgrade-real: FALHOU — $*" >&2; exit 1; }

p="$(mktemp -d)"
trap 'rm -rf "$p"' EXIT
cd "$p"
git init -q
export TARS_EMBED_CACHE="$p/.cache-tars"

"$velho" init >/dev/null
# Um consumidor tipico: os dois guards que BLOQUEIAM (o caso que quebrou) e uma governanca.
sed -i 's/^guards  = \[\]/guards  = ["block-secret-dump", "block-destructive-commands"]/' .ai/tars.toml
grep -q '"block-secret-dump"' .ai/tars.toml || falha "nao consegui declarar os guards no manifesto"
"$velho" sync >/dev/null

v_velho="$("$velho" --version)"
v_novo="$("$novo" --version)"
echo "upgrade-real: ${v_velho} -> ${v_novo}"

"$novo" sync --upgrade >/dev/null

# 1) o lock diz a versao nova
grep -q "\"version\": \"${v_novo}\"" .ai/tars.lock || falha "o lock nao esta' em ${v_novo}"

# 2) todo arquivo copiado e' IGUAL ao do catalogo novo (nada ficou na versao velha)
for f in $(cd .ai/base && find . -type f -name '*.sh' | sed 's#^\./##'); do
  cmp -s ".ai/base/$f" "$raiz/.ai/$f" || falha ".ai/base/$f ficou diferente do catalogo ${v_novo}"
done

# 3) nada que um guard usa foi apagado
test -f .ai/base/guards/lib-json.sh || falha "o upgrade apagou .ai/base/guards/lib-json.sh"

# 4) sem a lib, os guards BLOQUEIAM (exit 2) — nunca aprovam
for g in block-secret-dump block-destructive-commands; do
  d="$(mktemp -d)"
  cp ".ai/base/guards/$g.sh" "$d/"
  set +e
  echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | bash "$d/$g.sh" >/dev/null 2>&1
  rc=$?
  set -e
  rm -rf "$d"
  test "$rc" = 2 || falha "guard $g sem a lib saiu com rc=$rc (tem de bloquear com 2)"
done

# 5) idempotente: rodar de novo nao copia nada
if "$novo" sync | grep -q '^copia '; then falha "o 2o sync ainda copiou arquivo (nao e' idempotente)"; fi

echo "upgrade-real: OK (${v_velho} -> ${v_novo})"
