#!/usr/bin/env bash
# Prova do block-host-commit, simulando o host (TARS_GUARD_FORCE_HOST): toda operacao git que pode
# assinar ou abrir SSH barra; leitura e local que nao assina passam; docker exec e bypass passam.
G="$(dirname "$0")/block-host-commit.sh"; fail=0
roda() { python3 -c 'import json,sys;print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[1]}}))' "$1" | env -u REMOTE_CONTAINERS TARS_GUARD_FORCE_HOST=1 bash "$G" 2>/dev/null; echo $?; }
for c in 'git commit -m x' 'git tag -a v1 -m v1' 'git merge x' 'git rebase main' 'git cherry-pick a' \
         'git revert a' 'git am p' 'git stash' 'git stash pop' 'git pull --ff-only origin main' \
         'git push' 'git fetch origin' 'git -C /x push origin y' 'git -c a=b commit -m x'; do
  [ "$(roda "$c")" = 2 ] || { echo "FAIL (devia barrar): $c"; fail=1; }
done
for c in 'git status' 'git log -1' 'git diff' 'git switch -c x' 'git archive HEAD' 'git show x' \
         'docker exec c git push' 'TARS_HOST_COMMIT_OK=hoje git commit -m x' \
         'echo "nunca git push no host"'; do
  [ "$(roda "$c")" = 0 ] || { echo "FAIL (devia passar): $c"; fail=1; }
done
[ "$fail" -eq 0 ] && echo "PASS: block-host-commit"
exit $fail
