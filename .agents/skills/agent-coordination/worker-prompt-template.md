# Worker prompt template

Structure for every dispatched task prompt. Exists so prompts are parallel-safe,
resilient, and low-drift by construction, not by remembering each time.

## Before drafting a batch

- Split by disjoint write-set. Tasks touching different files run in parallel;
  anything reconciling multiple others' output is its own sequential prompt at the end.
- **Infra is a singleton — never parallelizes.** At most one task at a time touches
  infra topology/cloud-state paths or the running orchestrator (compose/Docker/Pulumi
  equivalent). App code in separate subtrees parallelizes fine; infra doesn't, because
  the shared object is the *running system*, not the file — two workers can each edit
  a compose file correctly and still produce a broken stack. Second infra task WAITS
  for the first to be `qa-ready`, not merely dispatched.
- Two parallel tasks needing to agree on a name/port/convention: fix it in a shared
  `00-*-contract.md` first — never let them each invent an answer.
- Register every prompt as a tracker row the moment it's drafted (`planned`), with
  dependencies/parallelism filled in then, not inferred later.
- If a worker finds a shared contract wrong mid-task, fixing the contract IS part of
  that task — don't leave it stale for the next sibling to trust blindly.
- **5+ tool calls or context-polluting → its own prompt. ≤3 tool calls → do it directly.**
- A prompt never carries a real secret value, only its reference/path.
- A discovered operational workflow gets documented once in the skill it belongs to,
  referenced from prompts — never re-explained inline or restated across docs.

## Required sections, in order

1. **Title + parallelism note** — what it runs alongside, what it waits for.
2. **Context source of truth** — name the docs to read, don't make the worker hunt.
   Name any project skill relevant to the change type as required reading, first,
   before writing anything (design-system rules for UI work, git/branch rules for
   CI-pipeline work, the secrets-access mechanism for any commit — nearly every task
   commits, so that skill is nearly always required).
3. **Secret handling — mandatory, mechanical, invalid prompt without it.** Never run a
   command whose output could contain a secret unfiltered (`env`/`printenv` bare,
   `cat .env*`, `docker inspect` with no `--format`, a `grep` on a secret-shaped
   name — the matched line still holds the value). This includes interpolating a
   secret's VALUE into a nested command string at any shell depth (e.g.
   `export VAR="$VAR"` re-quoted through `bash -c '...'`/`ssh host '...'` puts the
   real value in the command text, which then lands in logs) — pass the variable
   name and rely on env inheritance, or an explicit `-e`/`--env-file` mechanism,
   never the value pasted into quoted command text. Never leave a raw secret
   un-redirected; compare copies via hash, never by printing. Any leaked value gets
   rotated in the same session unless the operator explicitly judges the exposure
   contained (never assume that call yourself). Commit via the project's own
   non-interactive commit mechanism, never a plain interactive commit that can block
   on a credential prompt.
3a. **Checagem de ambiente antes do 1º teste — obrigatória (2026-09-26).** O `node_modules` do
   worktree tem de ser **pasta REAL**, não symlink: `ls -ld node_modules`. Symlink significa que o
   worktree ficou apontando para o checkout principal — **pare e reporte `BLOQUEIO`**; não copie,
   mova nem reinstale a árvore você mesmo (um worker gastou ~10 min copiando 783 MB para `/tmp`
   em vez de reportar). O conserto é um comando do coordenador: re-despachar a task (o
   `dispatch.sh` instala a árvore real com `bun install --frozen-lockfile --backend=copyfile`).
3a2. **Teste que falha só no worktree é defeito de AMBIENTE até prova em contrário.** Antes de
   tocar no código, rode o MESMO teste no checkout base e compare — um levou 155 s no worktree
   contra 9 s na base, e a "regressão" era o mount, não o diff. Reporte os DOIS tempos.
3a3. **Nunca `sleep` de espera.** Comando longo vai para segundo plano e você segue trabalhando;
   `sleep 60`/`sleep 150` queima o prazo e esconde o progresso. Também nunca mate processo por
   padrão de texto (`pgrep -f`/`pkill -f`): o SEU próprio processo carrega o texto do prompt e casa
   com o padrão.
3b. **Destructive/scoped commands — mandatory, mechanical.** Never run anything that
   destroys data without stating exactly what and getting an explicit yes first.
   Scope the blast radius with the tool's own mechanism (a `--target` flag, an
   explicit profile, explicit pathspecs, a dry-run first) — "only touch these N
   things" in prose is not a control.
4. **Readiness check.** Confirm the task isn't already claimed/blocked. Point at
   where to check current state, never restate it inline (drift risk). If depending
   on another task's output, verify the artifact itself, not just its status label.
   End with **Ready to code now: YES/NO/CONDITIONAL**.
5. **Working protocol** — senior mode; no completion claim without fresh evidence run
   *now*; smallest atomic commits; everything reversible; fail loud, never hang
   silently; test live against a running instance before touching the build/image
   layer, one rebuild at the end to confirm, not one per iteration.
5b. **Periodic self-check-in, on a real wall-clock timer — mandatory.** The worker has
   no native clock: check one explicitly per tool call. Every ~10 min of real elapsed
   time, unconditionally (even with zero problems), raise a check-in on the
   coordinator's question channel: what you're doing, how, and "on track or correct
   me?" Also immediately off-cycle on any real milestone, deviation, blocker, or
   out-of-scope decision — never resolve or drop one silently. Also immediately on
   any tool-permission wall or anything needing the coordinator's decision — raise
   an explicit question alongside the bare permission prompt, don't just sit blocked.
   If unanswered, keep working on anything unambiguous and raise the next one on
   schedule anyway.
6. **Scope — only this.** Exact files owned; exact files/dirs forbidden, naming the
   sibling task that owns them.
7. **Requirements** — the real technical spec, referencing normative docs by name.
   **Synthesized, not delegated** (2026-10-01): each change names
   `file:line` and what to change; never "based on what you find". Write it for someone who just walked into the
   room: what and **why**, what was **already tried or discarded** (and why), and enough context to judge an edge
   case. A lookup carries the exact command; an investigation carries the question and an answer cap ("< 200 words").
8. **Done checklist** — numbered, each item a command whose real output proves it,
   never aspirational. Include every applicable mechanical check from the project's
   own defect log before finalizing. **One item is mandatory on every delivery, no
   matter how small: "if the SSD burns and the environment is rebuilt from zero with
   only the initial secret, does this come back on its own? by which task/deploy/
   start?" — and the answer names the versioned task, deploy, or entrypoint that
   recreates it.** An artifact that exists only because someone ran it by hand — an
   image built locally, a container edited in place, a value pasted into a dashboard,
   an env var exported into a running process — is a **defect**, not a deliverable
   (`CLAUDE.md` §"The real proof — destroy and rebuild the VM from scratch",
   `INV-IAC-2`). "It's already running" is not an answer to that question; it is the
   symptom.
9. **What NOT to do** — explicit anti-scope-creep list.
10. **Mid-task discovery discipline** — a real gap/bug beyond scope gets reported in
    the final report, never silently fixed and never silently dropped.
11. **Claims — mandatory, mechanical, invalid prompt without it.** Every assertion in
    the final report carries the command that proves it, per `## Claims` below. The
    prompt states the format and requires the filled table as the report's last block.
    Not waived for "small" tasks: a small diff is exactly where "verified" gets
    asserted instead of run, because the change looks obviously fine.

## Dispatch mechanics

- **Full text inline, never "read file X and follow it."** A durable prompt file can
  still exist as the record, but the dispatch payload duplicates its content — making
  a worker fetch its own task invites a misread path or hallucinated content.
- State the absolute repo root and absolute prompt-file path if a human will paste
  this manually — relative paths aren't guaranteed to resolve from wherever the
  worker's shell starts.
- **A gap found is not a task you may dispatch.** Register it, tell the operator,
  wait — scoping is the operator's call.

## Self-registration — redundant on purpose

Every prompt's own instructions repeat this twice, not relying on the coordinator
alone remembering:
- **At start**: update your own tracker row to in-progress before doing real work.
- **At end**: update the row to its real outcome + a short durable-doc entry with the
  real commit hash, before reporting done.

**The reviewer checks the same thing, and that half was missing.** "With the real commit
hash" already required the work to be committed — but the rule only ever addressed the
worker, so nothing caught the case where it was skipped. Before moving any row to
`qa-done`, confirm the deliverable is **in git**, not merely on disk: `git status
--short` clean for the paths the task owned, or `git cat-file -e <sha>:<path>` for the
artifact itself. One command.

Real incident, 2026-09-18: `apps/account/scripts/migrate.ts` — T-C2's central deliverable —
sat uncommitted for hours while T-C2a, its verification checklist, T-D3 and T-C3 all ran
and were verified against the working tree. Nothing broke functionally, which is why
nobody noticed. Three revisions (`4582043`, `b139a53`, `181cb0a`) ended up containing the
orchestrator and the CI gate but not the script they invoke — broken checkouts, unreliable
`git bisect` across that range, and `181cb0a` is itself the commit recording T-C3 as
merged against a state it does not contain. Verification that reads the working tree
while CLAUDE.md's "destroy and rebuild the VM" proof reads git makes that proof fiction
for exactly the revisions that diverge.

**Second instance, same day, and it proves the rule on itself:** the paragraph you are
reading was written, left uncommitted in the working tree, and destroyed by a branch
switch during an unrelated promotion job — within the hour, by the person who had just
written it. It was not recoverable from any branch or from the `post-checkout` rescue
stashes. If the rule needed evidence beyond T-C2, this is it.

## Claims — every assertion carries its proof

Every worker states, for **each** assertion it reports, the command that proves it:

```text
claim: <the assertion, one line>
verify: <the exact command, runnable by a third party>
expect: <the literal that must appear in that command's output>
```

An assertion with no `verify`/`expect` is, by contract, **unverified** — the worker
reports it as such. It is never omitted, and never quietly upgraded to "done".

### The rules

- **`verify` is deterministic and non-interactive.** No prompt, no `--watch`, no
  command whose answer changes between two runs on the same state. If it can block
  waiting on input it is not a `verify` command — it is a hang, and it will time out
  as one.
- **`expect` is a literal, not a paraphrase.** `passes` is not an `expect`. The exact
  text the command prints is — `5 passed`, `1 file already formatted`,
  `revision: 00042`.
- **`verify` must be able to fail.** A command whose output or exit code is never
  checked proves nothing; that is the masked-exit-code class, `LESSONS-LEARNED.md` #35
  (`git commit ... | tail -N` reported success while the commit had actually failed).
- **`verify: none` is honest and allowed — hiding is not.** When an assertion
  genuinely cannot be proven by a command (a judgement call, an external human
  decision, a system the worker cannot reach), write `verify: none` plus the reason on
  the same line. Never invent a command that does not actually test the claim. A
  `verify: none` claim is *visibly* unverified to the coordinator; a fabricated
  `verify` is worse than no claim at all, because it looks proven.
- **A claim whose `verify` was run only by its claimant is not evidence.** The
  coordinator re-runs the command — that run, not the worker's word, is the proof.

### Two real examples from this repo

A test:

```text
claim: the claims contract fails when the `## Claims` section is deleted
verify: uv run pytest tests/contracts/test_worker_prompt_contract.py -q
expect: 5 passed
```

A formatting check — `ruff format` also rewrites Python blocks tagged `python` inside
Markdown in this repo, so an example written in Python is formatted code and must stay
ruff-clean:

```text
claim: the new contract test is already ruff-formatted
verify: uv run ruff format --check tests/contracts/test_worker_prompt_contract.py
expect: 1 file already formatted
```

### Final report — the claims table

The worker closes with this table filled in, as the report's last block. The
coordinator reads it mechanically instead of parsing prose. Prose above it is context;
the table is the delivery.

| claim | verify | expect | result |
| --- | --- | --- | --- |
| the claims contract test passes | `uv run pytest tests/contracts/test_worker_prompt_contract.py -q` | `5 passed` | pass |
| this report's summary reads clearly | verify: none — a judgement, no command prints it | — | unverified |

`result` is the worker's own run; a `verify: none` row goes there verbatim, with its
reason. The coordinator's independent re-run is what turns a row into evidence.

### Why this exists

Our most documented recurring defect is the false delivery claim, and it is a class,
not a run of accidents: `LESSONS-LEARNED.md` #11 (three defects reported done, each
surfaced only by exercising the live container, never by reading the diff), #3 (the
worker verified its work against its own restatement of the requirement, so the
paraphrase made it read as complete), #70 (a green `ruff format --check` accepted while
the hook that would have run it was silently skipped). Every case is "verified"
asserted where "verified" was never demonstrated. The prompts already said "verify" — so
the worker said it had. Requiring the command and its expected literal is what makes the
claim falsifiable by someone other than the claimant.

## `qa-ready` is every worker's ceiling

No worker ever marks its own work `qa-done`/"approved" — that claim, if made, is
wrong on sight; revert the status and treat it as unverified.
