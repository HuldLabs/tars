# gate: prod-guard

**O que cobra** — nenhum comando que MUDA estado em producao sem a ORDEM DIRETA DO DONO,
declarada na propria linha: `docker compose up/down/restart/rm/stop/kill`, `docker stack
deploy`, `systemctl restart/stop/start/reload/disable/mask/kill`, `kubectl
apply/delete/replace/patch/scale/drain/cordon/rollout restart`, `helm upgrade/install/
uninstall/rollback` e `git push --force`. Sem a ordem, o gate REPROVA (exit 2) e o comando
nao roda. A LEITURA nao e' bloqueada (`docker ps`, `docker compose config`, `systemctl
status`, `kubectl get`, `curl`): o guard separa MUDANCA de leitura.

**Por que** — doutrina B1.4 (plano de release 11/10): um `compose up` sem ordem derruba a
stack que o dono administra e o agente nao sabe reerguer. O gate e' a regra em CODIGO; sem
ele a doutrina e' sugestao (fabber `architectural-premises.md`: regra que nao e' teste e'
sugestao).

**Ordem direta do dono** — a flag `TARS_PROD_ORDER=<data/motivo>` na linha do comando
libera aquele comando (ex.: `TARS_PROD_ORDER=2026-10-11 docker compose up -d`). A ordem e'
por invocacao e registra quem mandou; nao ha' flag global que a torne permanente.

**Em que hook** — `PreToolUse` (matcher `Bash`) do agente. O MUSCULO e' `gate.mjs` (Node);
a casca `.sh` ao lado so' chama o Node e falha ABERTO sem ele (guarda-corpo, nao barreira).

**Stacks** — `any` (precisa de `node`).

**Parametros** — nenhum.

**Proveniencia** — dor do plano de release do Tars (11/10), item B1.4. A mesma familia de
regra (ordem do dono para o irreversivel) ja' existia solta no guard do segtools; aqui
ganha par doutrina->gate->prova, cobravel pelo `tars doctor`.
