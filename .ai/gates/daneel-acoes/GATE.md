# gate: daneel-acoes

**O que cobra** — as 3 CONDIÇÕES DE PARADA da Daneel que exigem ordem expressa do dono
(`daneel/stop-conditions`), viradas prova que REPROVA. O gate julga o comando do agente e
bloqueia (exit 2) antes do dano:

- **force-push** — `git push --force`, `--force-with-lease`, `-f`, `+<ref>`, `--mirror`. Reescreve
  história (o `HuldLabs/.github` só saiu por force-push **autorizado** — `HANDOFF.md:22`).
- **repo público** — `gh repo create/edit ... --public`/`--visibility public`. Repo público já
  recebeu commit indevido.
- **escrita no cofre** — `op item edit|create|delete`, `tars secrets set`. A SA no dia a dia é de
  **leitura**; escrever exige ordem expressa.

**Em que hook** — `PreToolUse` (`Bash`/`PowerShell`), onde o exit 2 barra o COMANDO antes de rodar.
É a mesma ponta do `no-add-all`.

**Stacks** — `any` (precisa de `node`; sem node, o adaptador de agente falha ABERTO).

**Override** — só o **OPERADOR**, por invocação: `DANEEL_ALLOW=1 <cmd>`. Um agente setar a
variável por conta própria é o comportamento que este hook existe para impedir.

**Parâmetros** — nenhum.

**Adaptador** — dupla ponta, como o `no-add-all`: o motor (`daneel-acoes.mjs`, payload do
`PreToolUse`) tem de ser registrado no `PreToolUse`/matcher `Bash` do harness do agente; a casca
`daneel-acoes.sh` é a versão para o hook do git. FALHA ABERTA em payload ruim.

**Proveniência** — R1: mesma mecânica do `no-add-all` (portado do segtools
`worker-destructive-guard.mjs`). As regras nascem da ficha verificável da skill `.ai/skills/daneel/SKILL.md`
(§2, §3) e fecham a dívida nomeada que o `.ai/doctrines.toml` declarava.
