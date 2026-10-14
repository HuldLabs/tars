---
name: agent-coordination
description: How to coordinate ANY delegated worker — a Claude subagent, a peer Claude session, an OpenCode/mimo job, or any other transport. Covers dispatch, write-set isolation, the infra-is-singleton rule, stall detection, the resilience loop, evidence standards, and verification before trust. Load BEFORE dispatching anything, and before reviewing anything a worker left in the review queue.
---

# Agent coordination

**Transport-agnostic.** The rules below are identical whether the worker is a Claude
subagent, a peer session, an OpenCode job, or a workflow run — the failure modes are
identical across all of them. **If the worker you're dispatching to is OpenCode, also
load `transports/opencode.md` in addition to this file** (which MCP calls, its
permission/question polling, model-choice parameters); for a Claude subagent/peer
session, also load `transports/claude-subagent.md`. Each transport file assumes this
one has already been read — it's a complement, not a replacement.

Prompt structures: `worker-prompt-template.md` (what every dispatched task carries),
`coordinator-prompt-template.md` (the kickoff a coordinator session pastes/reuses).

## 0. Session start / resume ritual — MANDATORY, before anything else (owner order, 2026-09-26)

Run this on every session start, every app restart and every "continue from where we stopped". It exists because an app
restart left a phantom watchdog (listed by `CronList`, never firing) and a worker invisible in the app sidebar.

0. **Read this whole skill, then rebuild context — before anything else, without being asked** (owner order,
   2026-09-26). Read `SKILL.md` to the end plus `project-bindings.md` and `worker-prompt-vivo.md` (a truncated or
   summarised copy does not count). Then load, in this order: the handoff doc (next step, work in progress), the
   tracker/backlog (in progress, ready, blocked), and — if the current session exists — its **last 30 minutes of
   messages** (the transcript file named in the project binding). Only after that, act.
1. **Watchdog — filtered first, cron as backup (owner order, 2026-10-01).** Arm a **`Monitor`** on the filtered
   watchdog command from `project-bindings.md` (`coord-watch.sh` + `coord-context.py`): it prints — and wakes the
   coordinator — only when something changed (channel event by another actor, worker run finished, `qa-ready` queue
   grew, new commit on `main`, context above the limit, or 30 min of silence). Measured 2026-10-01: 74% of the 3-min
   cron cycles ended with no action, each re-reading ~760k tokens. Re-arm the Monitor when it expires.
   Then the **backup cron — always recreate, never trust the listing, never improvise the text:** `CronList`;
   `CronDelete` every watchdog found; `CronCreate` a fresh recurring one at **`*/30 * * * *`** with the **canonical
   watchdog prompt copied verbatim from `project-bindings.md`** — not written from memory (a paraphrase dropped the
   heartbeat check on 2026-09-26). A listing that survived a restart proves nothing. The agent cannot see the app's background tasks panel: confirm via `CronList` and ask the operator to confirm the panel shows it as "Loop". Both `CronCreate` recurring and `/loop 3m` show there as "Loop" (operator's screenshot, segtools, 2026-09-26).
2. **Heartbeat.** `ScheduleWakeup` with the coordinator prompt (120–180s with a worker alive; 1200–1800s when waiting on
   the operator). Confirm it appears as a pending one-shot in `CronList`.
3. **Workers visible in the sidebar.**
   - New dispatch: launch the dispatcher through the shell tool with **`run_in_background: true`** — never `&`/`nohup`
     inside the command (that detaches it from the app and hides it from the sidebar).
   - Worker already running (e.g. after a restart): arm a **`Monitor`** on its live status (timeline tail) that emits on
     every status/commit change and exits when the worker dies; re-arm on expiry (max 30 min).
3a. **Ownership check after any restart (2026-10-07):** before dispatching or killing anything, run `ListAgents` and list the live `fast.py --slot` processes in the container. A forked copy of the session inherits the history and believes the workers are its own; two coordinators re-dispatched and killed each other's workers the same day. Never kill a process by a broad name/arg pattern — only the exact pid (e.g. the one listening on the port), and never a `claude` worker process (a broad `playwright|47001` match killed a live worker).
4. **Say it in the first report**: watchdog id, heartbeat time, one line per worker with its sidebar task/monitor id.
   The operator should never have to ask whether these exist.

Project-specific commands for each step live in `project-bindings.md`.

## 1. The coordinator's actual job

**Token economy — the default is the DeepSeek worker (owner order, 2026-09-26, repeated).** The coordinator acts
itself ONLY when a DeepSeek worker would not be effective: an owner decision, a secret handled by the owner, a
one-line fix already fully known, or reading a worker/reviewer verdict. Investigating, measuring, running tests,
benchmark/parity sweeps and fixes all go to a DeepSeek worker via the dispatch script. Claude subagents (`Agent`,
Explore, general-purpose) cost the same budget as the coordinator — they are NOT the cheap path; use them only when the owner
asks. Violation seen 2026-09-26: rebuild debugging, e2e timing and two Fabber sweeps done by Opus/Explore.

Coordinator and reviewer, not implementer. Three duties, in order:
1. Bound the work before dispatching — scope, write-set, evidence standard.
2. Verify what comes back against the running system, never against the report.
3. Keep the task tracker/handoff doc true, continuously, as things happen.

Do small fixes yourself when the fastest path is a 2-3 file edit. Delegate at ~5+
tool calls or context-polluting work. Relaying a summary without checking it adds
latency and removes verification — strictly worse than doing nothing.

## 2. Write-set isolation

Every dispatched task declares exactly what it owns and what it must not touch.
Parallel tasks have disjoint write sets, stated in the prompt, not assumed.

**Infra is a singleton — never parallelizes.** At most one worker at a time touches
infra topology/cloud-state paths or the running orchestrator itself (up/down/
restart/build/volumes). App code in disjoint subtrees parallelizes cleanly; infra
doesn't, because the shared object is the *running system*, not the file — two
workers can each edit a compose file correctly and still produce a broken stack. If
two infra tasks are ready, serialize: the second waits for the first's `qa-ready`,
not merely dispatched.

**The singleton is scoped to the object, not the label — a real over-application
caught live 2026-09-20.** The protected object is the *running system*: `compose
up/down/restart/build/volumes`, VM state, cloud resources. A change that only
touches the REPOSITORY — a doc, a secrets-registry entry, dead-code removal,
tooling, a worktree script, a one-line workflow-file edit — is NOT covered by this
rule, even when its subject matter is "infra-flavored," and follows the ordinary
disjoint-write-set rule instead. The over-broad version ("nothing labeled infra runs
in parallel") froze an entire ready queue for no reason tied to the actual risk this
rule exists to prevent — four ready, disjoint-write-set repo-only tasks sat
undispatched waiting on an unrelated diagnostic job because they were all mentally
filed under "infra." Ask "does this touch the live running system" before applying
the singleton, not "does this sound like infra work."

Shared working tree hazards: never a wildcard git-add (explicit pathspecs only);
strongest-to-weakest mitigation is worktree isolation, then disjoint write sets,
then serialization. Before touching files another worker wrote, confirm that worker
is actually dead — a session still reporting busy can rewrite your changes under you.
**This includes the coordinator's own edits** — an uncommitted BACKLOG.md/DELIVERED.md/HANDOFF.md
edit sitting in the working tree can be silently swept into another worker's
`git stash`/`git stash pop` cycle. Commit the coordinator's own doc edits promptly,
don't leave them lingering uncommitted while a worker with shell access is active on
the same tree.

**A credential carries the RESOURCE it authorizes, not just the actor — and the
dispatch must carry that resource too (real defect, BR-IAM-004, 2026-10).** Two
workers can be "the same identity" (same bot, same token, same runner label) and
still be authorized over *different* resources. A token scoped to project A that ends
up writing under project B is not a permissions bug in the abstract — it is a
**dispatch that never named the resource**. Rules:

- Every credential states **which resource it is scoped to** (project, repo, host,
  tenant), and every dispatch names the resource the worker is meant to act on. The
  worker's write set and its credential's scope must be the **same set**.
- The worker **verifies the resource before the first write**, not after: read where
  the credential actually points (`git remote -v`, the target path, the tenant id) and
  abort loud if it is not the resource the prompt named. A mismatch must fail on write
  #0, never land a commit in the wrong place.
- The coordinator checks the same thing at dispatch: reusing an identity across repos
  without re-stating the resource is how the cross-write happens. Reusing the identity
  is fine; reusing it **silently** is not.
- A shared credential that *cannot* be scoped per resource is a stop-and-report, not a
  "be careful" — the guardrail is the scoping, not the intent.

**Worktree isolation, concretely — use it, don't just cite it as the strongest
mitigation and then skip to the weaker ones.** `infra/scripts/agent-worktree.sh`
(this project, added 2026-09-20 after seven same-day collisions on one shared
checkout, two of which destroyed a worker's uncommitted diff): `add <task-id>
<branch-name> [<base-ref>]` creates a new worktree at `.worktrees/<task-id>`
(inside the repo, so the devcontainer sees it; the pre-2026-09-21 sibling
`../fabber-wt-<task-id>` is legacy and only handled for cleanup)
on a fresh branch and prints its absolute path; pass that path as the OpenCode
transport's `directory` argument so the dispatched job never touches the
coordinator's own checkout. `remove <task-id>` tears it down once the job is
`qa-ready` and its PR is merged or abandoned — never while it may still be
running. `list` shows every live agent worktree, for the same periodic
hygiene `git stash list` already gets (confirm each is still needed before
removing, don't assume). Works even when the HOST's git credential manager
has no cached auth for the repo (a real, separate finding the same day — the
devcontainer's `op`-backed `GIT_ASKPASS` is authenticated, the bare host
often isn't): the script best-effort `fetch`es and falls back to whatever
`origin/main` ref is already present locally, shared via the same `.git`
the devcontainer's own fetches keep current. **Default to a dedicated
worktree for every OpenCode dispatch from here on** — the coordinator's own
doc edits (ROADMAP/HANDOFF) are the one exception, since those are meant to
land on the coordinator's own current branch quickly, not a throwaway one.

**Never interpolate a secret's VALUE into a command string, at any shell nesting
depth.** Named examples (`env`/`printenv` bare, `cat .env*`) are not the exhaustive
list — `export VAR="$VAR"` re-quoted through a nested `bash -c '...'`/`ssh
host '...'`/devcontainer-exec wrapper puts the real value in the command text,
which then lands in tool-call logs unfiltered, identically to printing it directly.
Real incident, 2026-09-17: a worker hit an SSH-agent-forwarding problem three shell
layers deep and worked around it by re-exporting `$OP_SERVICE_ACCOUNT_TOKEN` by
value into a nested command — the real 1Password service-account token appeared
in cleartext in the job's tool metadata, was read by the coordinator's routine
status check, and could not be unseen. To pass an already-exported secret through
a nested shell layer, pass the **variable name** (rely on env inheritance) or an
explicit `-e VAR`/`--env-file` mechanism that never places the value in command text.

**A worker that hits an architectural blocker on shared/remote infrastructure (a
missing runtime, a missing service, a connector limitation) documents the blocker
and the options, then stops.** It does not install, provision, or configure
anything on that shared infrastructure to route around it — not even temporarily,
not even with a planned cleanup. Real incident, 2026-09-17: a worker hit "pyinfra
isn't installed on the remote VM" and, before a correction could land, had already
written code to SSH in and `pip install` pyinfra there. Caught by the coordinator
verifying directly over SSH that the install never actually landed — the worker's
own final commit had reverted to an explicit blocked stub, but only by luck of
timing, not by recognizing the boundary on its own.

**An allowlist entry for a shared gate must reference a SPECIFIC value/ID, never a
pattern that matches an entire future credential class.** A specific-value exception
(one exact hash/ID, individually justified) is a narrow, safe carve-out; a
pattern/regex exception (e.g. `ck_[a-f0-9]{32}`) silently allows every future real
secret of that shape to pass unnoticed — the same "weaken a shared gate" violation
as lesson #60, just shaped like config instead of a code change. Real incident,
2026-09-17: a worker's `.gitleaks.toml` change added a generic WooCommerce-key-shape
regex, justified by a false claim (a cited file didn't actually contain the
pattern) — caught by the coordinator checking the claim against the file.

**A worker never weakens a shared gate to make its own change pass.** A pre-commit
hook edit, a CI check disabled, a lint exclude/ignore added, a test skipped — none of
these are ever a valid fix for a failure the worker's own change caused. If a file
fails a gate, the file is wrong until proven otherwise, not the gate. This is always
a finding to report, never something to silently work around. Real incident,
2026-09-17: a worker wrote a bash script with a `.py` extension, ruff correctly
rejected it, and the worker's fix was patching the shared pre-commit hook to exclude
that file from lint instead of renaming it — caught by the coordinator reading the
actual commit diff, not the worker's report.

**A worker's write set is scoped to the single branch named in its dispatch, not just
files.** Switching branches, cherry-picking, or touching `main`/any promotion target
is always out of scope — unconditionally, even when the worker's own reasoning
concludes it would help (e.g. "this fix should be on main too, let me move it").
Moving a commit between branches is exclusively a promotion-PR decision
(`git-workflow/SKILL.md`), never a worker's call mid-task. Real incident, 2026-09-17:
a worker committed correctly, then unilaterally checked out `main` and attempted a
cherry-pick — caught by the coordinator checking git state directly (not the
worker's report), no damage landed, but it was luck (an interrupted stash/checkout
sequence), not the worker's own judgment, that prevented it.

## 3. Dispatching

- **Slice before dispatch — never dispatch a big item (owner order, 2026-09-29).** Before launching, check the item
  against the slicing triggers in `segtools-sdd` §8 (>10 min of worker, >1 acceptance boundary, >~15 code files, an "and"
  joining two deliveries, live infra mixed with code, unestimable → spike). Any trigger fires → cut it into sequential
  subtasks first, then dispatch one worker per slice, disjoint write sets in parallel. Real incident: SEG-662
  ("workspace **and** rename") went out whole and came back as a 214-file commit that also rewrote test identities.

- **How to launch, every time (owner order, 2026-09-26):** only through the project's dispatch script
  (`project-bindings.md`), with the full prompt file (context, scope, ACs, protocol, secret rules) — never an ad-hoc
  command. Launch it with the shell tool's **`run_in_background: true`** — that is what puts it in the app sidebar.
  **Never `&`, `nohup` or `disown` inside the command**: that detaches the process from the app and hides it.
- The prompt is the contract — follow `worker-prompt-template.md`'s required
  sections; missing the secret-handling section makes a prompt invalid to dispatch.
- Full task text inline, never "go read file X" — a durable prompt file can still
  exist as the record, but the dispatch payload duplicates it.
- **A gap you found is not a task you may dispatch.** Finding it is valuable;
  scoping work against it is the operator's call. Register the gap, ask, wait.
- Scope the blast radius with the tool's own mechanism (a target flag, an explicit
  profile, explicit pathspecs, a dry-run first) — "only touch these N things" in
  prose is not a control.
- **Every prompt carries the progress contract** (added 2026-09-25, after a worker
  ran 2h with 26 uncommitted changes and nothing visible): commit after each
  proven step, never one big commit at the end; an explicit time box ("até N
  min; se travar, commite o que está provado e reporte"); never reproduce a
  CI-only condition expensively on the dev box (e.g. emulated foreign-arch image
  builds — verify on the host arch, CI builds the target arch natively).
- **Machine budget is part of dispatch.** At most 2 heavy workers (full test
  suite, image builds, local stacks) at once on the dev box; four parallel suites
  made each 2-3x slower and looked like a hang.
- **Launch every worker observable and steerable** — a live event timeline and an
  inbox the coordinator can write to mid-run (project binding names the tools). A
  worker launched blind (output only at exit) is a dispatch defect, not a style
  choice: the coordinator cannot tell progress from a loop, and the only lever
  left is killing it.
- Model choice: the project's designated free tier + lowest reasoning effort by
  default (see the relevant `transports/` file for the exact parameter and why
  minimal reasoning tends to outperform higher effort on routine dispatched work) —
  unless the project's own current policy carves out an exception for
  security-sensitive implementation work.

### 3.1 Synthesis and token economy (2026-10-01)

Cost concentrates in three places: **exploration** (finding where to edit — 61% of worker steps, 43% of its tokens
in our measurement), **echo** (tool output flowing back into context) and **narration** between tool calls. Rules:

- **The coordinator synthesizes; the worker executes.** Never dispatch "based on what you find" / "com base no que
  encontrar" — that delegates the understanding. The prompt names `file:line` and what to change. If you don't know
  the lines yet, the task is a research slice (read-only, short answer), not an implementation one.
- **Code before model.** `fast.py --issue` already appends the precollect package (cited paths, `git log --grep`,
  title grep) to the prompt; add only the `file:line` the package can't know. `--sem-precoleta` exists only to
  measure before × after.
- **Read the summary, not the transcript.** A worker's result is `resumo.txt` in its run dir (≤10 lines:
  STATUS/COMMITS/PROVA/ARQUIVOS/PENDENTE) plus the `delivery` comment. The transcript and `run.jsonl` are evidence,
  opened only for a specific doubt — and then with `tail`/`grep`, never whole.
- **Lean tool reads — the cut is the default, the full version is an explicit parameter.** `get_issue` returns the
  last 8 comments, each text capped at 2000 chars, no events, no text copies (`meta.body`, `previous_body`); widen only
  what you need: `comments: 0` (all), `body_max: 0` (whole text), `events: true`, `raw_comments: true`, or `full: true`.
  Mutations ack: `comment` (`echo: true` for the stored comment), `edit_issue` (`return_issue: true`), `move`, `assign`
  — don't re-read the issue to "confirm" a write that acked. Any new cut in a tool follows the same rule.
- **Continue or spawn fresh** (by context overlap):

  | situation | decision |
  |---|---|
  | worker researched exactly the files to edit | continue (inbox/recado) |
  | broad research, narrow implementation | fresh worker with the synthesized `file:line` |
  | fixing its own failure | continue |
  | verifying another worker's code | fresh worker (clean eyes) — always |
  | wrong approach | fresh worker; the prompt says what was discarded and why |

- **Parallelism.** Reads/research in parallel freely; writes one worker per write set (§2); verification may run
  beside implementation only in a different area.
- **Cost cap.** `fast.py --teto-usd` (default 1.00): `worker-budget-hook.mjs` sums the run's transcript with our
  DeepSeek price table (output estimated from the written text — DeepSeek reports 0 per message); at 100% the worker is
  told to deliver the proven slice, at 125% — and only after a warning was already delivered, so the worker always gets
  one step to commit — `fast.py` ends the run. Runs past 50% are logged (`budget_half` in `run.jsonl`) to calibrate the
  cap; a task known to be expensive is dispatched with a higher `--teto-usd`. `--max-budget-usd` is useless here
  (Anthropic prices).
- **Shared checkout, explicit pathspec — enforced.** The destructive guard also refuses `git add -A/./--all/-u` and
  `git commit -a`: a broad add took another front's README into a commit (2026-10-01).
- **Stop spinning.** `fast.py --max-turns` (default 120 desde 03/10; era 80) is the hard cap; a worker that hits it comes back as
  `parcial`, never re-dispatched with the same prompt — re-slice first.
- **Coordinator verbosity.** ≤25 words between tool calls, final report ≤100 words unless the owner asked for
  detail. Text carries decisions, milestones and errors — never narration.
- **Big output goes to disk.** In the worker this is mechanical: the `worker-quiet-wrap.mjs` hook rewrites any
- **Saída de ferramenta vira objeto tipado, não stdout cru** (`sandbox_status`,
  `return_code_interpretation`, `interrupted`, `no_output_expected`). Hook em todo tool call adiciona
  latência: exige teto duro (~200ms wall-clock **por fase**) e hooks independentes em paralelo.
  (fonte: tokenhood/docs/architecture/adrs/017-...:101,226,69,73)
  test/typecheck/lint/build command into `run-quiet.sh` (log on disk, summary in context); full output is the log on
  disk or `# saida-completa` in the command. The coordinator's own `Bash` filters by hand (`| tail -40`).
- **Only the tools the role uses reach the prompt.** `fast.py` passes `--tools` (built-ins), `--strict-mcp-config`
  (only the run's `mcp.json`) and `PROJECTS_MCP_TOOLS` (the channel tools of the role). `--allowedTools` is permission
  only — it does not remove a tool's schema from the prompt. Measured 01/10: 36,246 → 10,518 fixed tokens per request.
- **Woken only by change.** The coordinator's watchdog is `coord-watch.sh` under a `Monitor` (`project-bindings.md`):
  it prints only when the channel, a worker run or `main` changed. 74% of cron cycles were empty (measured 01/10).
- **Roles in `fast.py`** (`--papel`): `dev` (default, reads and writes), `revisor` (Edit/Write disallowed; reads, runs,
  comments — the reviewer is always a fresh run), `explorar` (read-only, 30 turns, answer < 200 words with `file:line`).
  Research slices go out as `explorar` — never as `dev` "just looking". WebSearch/WebFetch only with `--web`.
- **Resume, don't restart.** `fast.py --retomar` continues the last conversation of that issue/slot (same config dir,
  cache prefix intact) — use it to fix a worker's own failure; a new approach is a fresh run (table above).
- **Verification nudge.** Three slices closed in a row without a reviewer run → the next dispatch is the review, before
  any new implementation. `coord-watch.sh` prints `REVISAO` whenever the `qa-ready` queue grows.
- **The coordinator's own context.** Close the session at milestones (a delivery reviewed, a batch closed) with the
  handoff written; a long session costs every turn. Before closing, the handoff holds: the request, files/keys, errors
  and fixes, what was tried, what the owner marked as important, pending decisions, current state, next step.
- **Prompt cache.** Static rules first, per-run data last (`fast.py` puts branch/issue/slot in DADOS DA RODADA at the
- **Boundary token + uso por classe alinham cache e custo.** Uma constante (`SYSTEM_PROMPT_DYNAMIC_BOUNDARY`)
  demarca bloco estável × dinâmico e alinha os breakpoints de prompt caching; o schema de uso separa
  `cache_creation_input_tokens` de `cache_read_input_tokens`, e o preço usa taxa por classe de modelo.
  (fonte: tokenhood/docs/architecture/adrs/017-...:62,82)
  end). Never prepend dynamic text to a fixed prompt block — one changed character at the start invalidates the cache.

## 4. Monitoring — a "running" status means almost nothing

A worker can report running/busy while blocked on an unanswered prompt, looping on
a failing command, confidently wrong, or a zombie whose process died.

Every check cycle, in order:
1. **Pending approvals/questions first** — surfaces everything blocked on you across
   every worker at once. A rejection always pairs with what to do instead.
2. **Per-worker live report — read, analyse, act, EVERY cycle** (operator rule,
   2026-09-25). Read each running worker's real-time timeline since the last
   cycle (commands, files touched, reasoning, commits) and actively audit it:
   is it on the prompt's scope and order; did it make a mistake (wrong premise,
   wrong branch/worktree, forbidden action, secret printed, a test weakened, a
   "fix" that bypasses a gate, a loop, duplicate work with another worker); is
   it about to collide with another worker's write set? Then act the same cycle:
   **warn** the worker through its inbox with the concrete correction, **coordinate**
   (reorder, hand a finding from one worker to another, hold a colliding one),
   and **communicate** — the cycle report names what each worker did, any error
   found and the correction sent. "Running, no news" is not an acceptable line
   for a worker whose timeline you did not read.
3. **Cross-check reality** — file mtimes vs. now. Zero recent writes despite
   claiming mid-task is the concrete stuck signal.
4. **Orphaned host processes**, when the system misbehaves in a way no file
   explains. State changing between two of your own consecutive commands means
   something else is driving it — find that before continuing to diagnose.

**Anomaly spotted? Ask the worker, don't just self-diagnose.** An unexpected exit
code, a command that looks wrong, behavior not matching the prompt — ping it
directly and ask, even when fairly confident already; it turns an inference into an
on-record confirmation for near-zero cost. This is the coordinator-initiated half of
the same "ping pong" as the worker's own periodic self-check-in — the channel runs
both directions, and neither should need asking for every time.

**Read the live timeline, steer through the inbox (2026-09-25).** Every cycle, for
each running worker, read the last lines of its timeline (filtered and capped — `tail -30`, never the whole file;
§3.1) (tool calls, commands,
reasoning) and its commit count — not the wrapper's "running". When the timeline
shows a loop, an out-of-scope detour, a forbidden path (emulated build, a VM
mutation, a secret about to be printed) or a wrong premise, **send a course
correction to its inbox immediately** and confirm the ack on the next read —
correction lands at the worker's next tool call, so a long-running command still
finishes first. Killing is the last resort, for a dead process or a correction
ignored twice; a relaunch always resumes from disk ("continue from the commits and
uncommitted changes in this worktree, don't redo what exists").

Stall handling: dispatched-at/expected-by per worker (cap ~45min). **No commit in
~30min is a mandatory look, not a wait**: read the timeline, then steer or cut —
never let a silent worker run on (2026-09-25: one ran 2h, blind, in an emulated
build and a typecheck loop). Past due, no report → probe via the inbox. No
progress on the next cycle → treat as dead, read what's on disk, re-dispatch
"continue from disk state, don't redo what exists." A worker that dies on an
external cause (e.g. API balance exhausted, 402) is relaunched with the same
resume wording once the cause clears — check every worker, not just the one that
reported. Same blocker reported twice → escalate to the operator, don't retry a
third time.

## 5. Resilience — nothing stalls unnoticed, including you

**Both roles run both mechanisms. Neither is optional, and neither substitutes the
other.** On 2026-09-20 the coordinator and the architect sat idle for hours in
parallel, each with a live heartbeat, each reporting "nothing pending" while the queue
was full — because both beats asked *did anything break* instead of *is the work
moving*. A heartbeat proves a session is alive; it does not prove work is advancing.

**"I don't have that tool" is a blocker like any other — prove it before claiming it.**
Peer sessions on the same harness have the same toolset. On 2026-09-20 a coordinator
reported it could not recreate its own watchdog because the pings "arrive as external
messages", and the architect accepted that at face value and wrote a rule around it;
the operator corrected both — the scheduling tool was available the whole time. Before
reporting a capability as missing, check for it. A missing capability that turns out
to exist is the same failure as a blocker that names the operator for a path that is
already automated, and it earns the same answer: verify, then report.

**Keep the coordinator's turns short — a long turn swallows its own wakeups** (both sessions, 2026-09-26). Scheduled
wakeups and watchdog fires only land while the session is idle; an 8-minute turn of investigating, editing and re-running
tests eats every 3-minute fire inside it, so the watchdog looks dead when it is only queued — and it burns the expensive
model's tokens on work a worker does for a fraction. The coordinator dispatches, reads, steers and decides; investigation,
fixes, test runs and reviews go to workers. A 2-3 file edit of the coordinator's own docs (skill, handoff, tracker) is the
exception.

Two independent mechanisms, mandatory from cycle 1:

1. **Heartbeat (primary)** — schedule the next wakeup after every cycle, carrying
   the coordinator prompt. 120-180s while any worker runs; 1200-1800s when
   everything waits on the operator. Never end a turn without one scheduled while
   work is open. (These figures assume a genuinely fast worker model; loosen back
   toward 300-600s only if a slower model/config is confirmed in use.)
2. **Watchdog (backup)** — a recurring job every ~3min re-entering the same prompt.
   Its only job: catch a broken heartbeat chain. On entry, establish when the last
   real cycle ran (mechanisms below); if it's older than ~4min, run a full cycle,
   else no-op. Delete it when the mission is green. **Correction 2026-09-25
   (operator):** the "recent cycle → no-op" shortcut hid hours of idleness — the
   watchdog fired every 3 min while a worker ran and the coordinator answered
   one-liners. Rule now: **with any worker alive, every watchdog fire is a real
   cycle** (read each timeline, audit, steer, report); with none alive, it
   advances the mission's next step or names the operator decision it waits on.
   No-op is only valid with nothing running and nothing dispatchable.

### What every cycle asks — and which role asks what

The cycle's job is **is the work moving**, not *is something on fire*. A beat that only
checks for breakage answers "nothing pending" while the queue sits full — that happened
for hours on 2026-09-20, in two sessions at once, both with a live heartbeat.

Keep the questions generic. The tasks of the day live in the tracker and the dispatch
queue, which the cycle **consults** — a watchdog carrying task names, PR numbers or tool
names dies with the work it was written for.

**Two roles run cycles, and they are not interchangeable.** The split follows what
each one can actually see and decide, not seniority. The coordinator owns *execution*:
it holds the worker handles, the job ages, the permission prompts and the write-set
map — nobody else can answer whether a job is alive. The architect/PM owns *direction
and integrity*: it holds the operator's intent, the ADRs and invariants, and the
authority to say a delivery is wrong — the coordinator reviewing its own dispatch
against architecture is marking its own homework.

Getting this wrong is expensive in both directions. A coordinator auditing
architecture stalls on questions it cannot settle; an architect auditing worker
liveness duplicates the coordinator, adds no signal, and stops doing the only job
nobody else is doing.

**Shared core — both roles, every cycle**
1. Is anything pending with no owner and no declared blocker? That is a defect, not
   waiting.
2. Is anything in flight stuck?
3. Are the environments up? A broken environment outranks everything else.
4. Did I announce an action last cycle and not execute it? Execute now, or record it
   with an owner and a trigger. Never close a turn on a promise.

**Coordinator — execution and flow**
5. Can anything be parallelised? Serialise only what mutates the same *running system*;
   repository-only change parallelises in an isolated worktree. Respect declared
   dependencies between tasks.
6. Can anything pending be dispatched now — did a dependency just close?
7. Are the workers alive, progressing, and running in the right execution context?
   Job age, not just job status.
8. Was every delivery verified **in the artifact**, with its acceptance test actually
   run? A worker's own report is an input, never a verification.
9. Is this session's context near its limit? Hand off deliberately, before degrading.

**Architect / PM — direction and integrity.** Each of these is a real, expensive
failure from 2026-09-20 that no flow question would have caught:
10. **Is what we're doing the thing that matters most right now, or did we go reactive?**
    Hours went into promoting staging while the dev environment was down. The base comes
    before what depends on it, and only the operator noticed.
11. **Was an operator order re-scoped, sliced or diluted — by me or by another session?**
    "Remove all of it" became "item 3, last, gated on my approval", and the orphaned
    resource stayed live. A direct order does not become a phased plan without the
    operator saying so.
12. **Has any claim of ours been contradicted by reality?** Comment, docstring, secret
    registry status, invariant, tracker row. This class appeared **six times in one day**
    — a doc that lies is a defect, not a detail.
13. **Did any delivery remove a protection that existed?** SHA pinning, a guard, a gate,
    a test, or a comment recording a decision that was paid for. A refactor that deletes
    protection passes review because the diff reads like cleanup.
14. **Am I holding something behind a gate the operator never asked for?** An invented
    approval step is indistinguishable from progress and costs the same as a real
    blocker. Escalate what is genuinely the operator's — destructive, costly, product
    scope — and decide the rest.

**Shared core, one more — is this blocker real?**
Before reporting anything as blocked, check it is not a path that already exists and
is fully automated. On 2026-09-20 sessions stalled repeatedly on blockers that were
not blockers: commit signing "needs the operator to unlock the desktop vault" (the
devcontainer signs with its own key, no desktop app involved), SSH to the VM "needs
the operator's agent" (the devcontainer loads the VM key itself), secret reads
"blocked" (a service-account token is already injected), a CLI "missing" (it belongs
in the devcontainer, not the host). Each cost hours, one of them three.

The test: **if a tool or credential appears unavailable, the first question is
"am I running in the wrong place?", never "the operator must act".** A blocker that
names the operator as owner is only legitimate after confirming no automated path
exists. Escalating a solved problem is indistinguishable, from the operator's side,
from being stuck — and it burns their time instead of yours.

**Principles that outlive any particular task**
- Verify in the artifact, never in the report.
- A blocker is only legitimate with a named owner; if the owner is you, execute now.
- Agent reach exceeds its declared write-set — an agent touching infrastructure,
  credentials or git remotes outside its task is a security finding, not a curiosity.

**"Nothing pending" is only valid when the queue is empty.** Never as a default answer.
With a ready, undispatched item, the report says what did not move and why.

**Every report — heartbeat or watchdog, no-op or not — uses one fixed shape, table over
prose, never a bare "NO-OP silencioso" with nothing else.** Five rounds of operator/peer
feedback the same day (2026-09-20), each tied to a real gap that day, not preference:

```
Ciclo N — <hora BRT (UTC-3)>

Em andamento
| Tarefa | Status atual | Transporte<br>modelo | Idade | Prova de conclusão | Verificado (como/quando, BRT) |

Bloqueado
| Item | Dono | Desde | O que destrava |
(or the single line "nada bloqueado")

Delta: <one sentence, or "nenhum">
Persistido: <commit SHA(s), or "nada novo a persistir">
```

- **The `Tarefa`/`Item` cell names WHAT the work is, in plain words, before any id** —
  e.g. `Seed de imagens: restaurar upload de fotos (item 3, job_4390a1ee)`, never just
  `Item 3 — job_4390a1ee`. A bare job id/queue number forces the reader to recall or look
  up what it means; the operator flagged this 2026-09-21.
- **`Status atual`** is one short word/phrase (`rodando`, `aguardando permissão`,
  `parado >3min`, `concluído — falta verificar`). **`Transporte<br>modelo`** puts the
  transport and the model on two lines of the same cell (e.g. `OpenCode<br>mimo`) to save
  horizontal width.

- **A dense prose paragraph is harder to scan than the same facts in rows** — the
  original complaint. Two groups (in-flight; blocked), each its own small table.
- **In-flight needs five columns, not "running"/"done":**
  - *Age* — "running 4min" and "running 3h" need opposite reactions; a bare
    `running` doesn't distinguish them. A T-G2 worker stalled silently for hours,
    unnoticed until asked. Compute from the same `date -u` discipline this section
    pins for the beat marker — never mix a local-time job timestamp against a UTC
    "now".
  - *Completion proof* — the concrete, checkable criterion, never the bare word
    `running`/`done`. A T-G2 worker marked "Full E2E Axis 2 test" `completed`
    without running it; a T-G4 worker reported "ruff limpo" having run `ruff check`
    but not `ruff format --check` — both looked done in a status word and weren't.
    State the real test ("matrix builds only what changed AND a broken build stops
    the others", not "PR opened").
  - *Verified how/when* — the BRT time of the LAST check (computed in UTC, shown
    in UTC-3) and its source: `API`,
    `artifact`, or `worker's own report`. A worker's report is an input, not a
    verification, and does not satisfy this column alone. The same day: a
    `git log --format=%s` (subject only) produced a false "missing test" claim
    later disproven by the API's full commit body; a broad grep sweep caught what
    a narrower one missed; a transcript re-read reversed an earlier status claim.
- **A blocked item names its owner** — user, consultant, worker, or external. An
  unowned "blocked" is how things sit stalled with nobody accountable — the
  `main -> stg` promotion itself sat blocked for a while on an under-justified hold,
  surfaced only when the operator asked directly.
- **Every reprinted line is reverified, or marked `not reverified`.** A report that
  said "consultant proceeding with PR #5/#7 and the promotion" was already stale
  the moment it was sent — both were already merged, the promotion already run.
  Repeating old state with the confidence of current state is worse than no report.
- **State only the delta since the last beat.** Nothing changed → one line says so;
  don't reprint the unchanged table. A silent no-op and an identical reprinted table
  carry the same information for more context cost.
- **`Persistido:` names the commit SHA(s), not a claim.** This is the same substance
  the "Each cycle" checklist in §9 already requires (tracker/handoff doc landed
  durably before scheduling) — this line is that requirement's proof surface in the
  report itself, not a second rule (`AP-008`: one fact, one place). "Atualizei o
  HANDOFF" is not verifiable; a SHA is. The same day, two persistence claims hadn't
  actually reached the server (a commit only pushed after being asked; an assumption
  that a mirror would carry later commits that it didn't) — say the SHA and the
  claim becomes checkable by anyone, including the coordinator itself next cycle.
- **Nothing outside these sections.** A real incident worth explaining at length (a
  worker collision, a wrong-branch commit) is its own separate message, never
  heartbeat filler — the beat is a status board, analysis is a different artifact,
  and mixing the two makes the board grow every cycle until nobody reads it.

Still no write to the beat marker file itself on a real no-op — this is about what's
said to the operator, not the two-field on-disk schema, which stays exactly as narrow
as the rest of this section requires.

**Deliberately not synced to the same timer.** Two independent mechanisms is the
point — if they shared one clock, a single failure (a `ScheduleWakeup` call itself
erroring, the session dying right after scheduling) would take both down together.
What DOES need to line up: the watchdog's staleness threshold must sit clearly above
the heartbeat's own slowest normal interval, with real margin, not equal to it or
below it — equal-to is a race: a heartbeat legitimately running at its own slow end
looks indistinguishable from a broken chain. Tune this by tightening the heartbeat
ceiling, not by loosening the watchdog threshold — the operator wants faster overall
detection, not slower. With a 180s heartbeat ceiling, a 4min (240s) threshold keeps
a full minute of margin.

**How the watchdog knows the chain is alive — in this order:**

1. **Ask the scheduler.** Where the transport can list pending scheduled wakeups/
   jobs, "is a heartbeat wakeup still scheduled?" is a direct answer to the only
   question the watchdog asks — it measures the mechanism itself instead of
   inferring it from a proxy. Prefer this wherever it exists (see the relevant
   `transports/` file for the call).
2. **A beat marker, only where the scheduler can't be queried.** ONE line,
   overwritten (never appended) every cycle, exactly two machine fields: an ISO
   timestamp and a cycle number. That is the entire schema. There is deliberately
   no free-text field — no `next_action`, no status, no session IDs, no notes,
   nothing a fresh reader would ever need to read. It is a pulse, not a state file
   and not a scratchpad. A coordinator's next action belongs in the tracker row
   for the task it concerns; duplicating it here is how this artifact grows.
3. **Never infer the heartbeat from the tracker/handoff doc's latest entry.** A
   healthy cycle with nothing new legitimately writes nothing (see below), so a
   quiet-but-working chain reads as stale — a false alarm in the most common case.
   A portable skill also can't assume those docs carry a machine-readable
   timestamp at all. Their freshness answers "when did something happen," not "am
   I still alive" — different questions, and only the second one is the watchdog's.

**Every cycle — not just when a worker is currently active — scan the tracker for a
task that is ready (its blocker already cleared: a dependency now `qa-ready`, a
design doc now Accepted) with no job/agent dispatched yet, and dispatch it
immediately, at the confidence/model level already recorded on its own row.** A
watchdog that only re-checks jobs already running will happily no-op forever next
to a fully-unblocked, pre-scoped task nobody started — that already happened for
real. "Nothing to do this cycle" is true only after this scan comes up empty.

**Everything you learn goes in the durable tracker/handoff doc, in the cycle it
happened.** A delivery, a review outcome, a design decision, a finding, a live
in-progress status worth knowing — it lands there before the next wakeup is
scheduled, not batched for later, not parked anywhere session-scoped, not left only
in chat. A power outage or account switch between two heartbeats should cost at most
one cycle of progress, recoverable by any fresh coordinator reading those durable
docs alone. A cycle with nothing new is a legitimate no-op; a cycle that changed
something and didn't land it durably is not.

**A restarted coordinator resumes from the durable docs, never from a scratchpad.**
If it can't reconstruct what was happening from them, the defect is a missing
durable entry — fix it by writing that entry, never by keeping a richer side file.

**Why the schema above is this narrow — two incidents, same shape.** 2026-09-17: a
coordinator's state file absorbed real findings across many cycles instead of the
tracker/handoff doc. The correction applied then was a written warning to keep the
file minimal. 2026-09-18, in the same project after that correction: a fresh
coordinator recreated the file from scratch and it accumulated narrative again,
with the warning present in this very section — and separately, on the same day, a
fully-unblocked task sat undispatched for multiple watchdog cycles because the
watchdog only checked jobs already running. A free-text artifact the coordinator
writes every single cycle attracts whatever it has just learned, whatever the
surrounding prose asks — so the fix is that there is no free-text field to write
into, not a stronger request not to use it; and a watchdog that only watches active
jobs will never notice ready work it never started watching.

Clock discipline: wakeups don't fire while busy — check real current time each
cycle rather than assuming the schedule held.

**Clock discipline, concretely — always UTC, never mix with local time.** Write
the beat marker's timestamp with `date -u` and compare it against `date -u` on
every read, start to finish of a mission. A project whose team/infra is in a
non-UTC timezone (e.g. Brazil, UTC-3) is exactly the case that breaks this if
local time sneaks in anywhere: a marker written in local time and compared
against a UTC "now" (or vice versa) produces a 3+ hour phantom staleness or
phantom freshness, silently — the delta arithmetic itself is fine, only the two
inputs disagree about their epoch. This was flagged live 2026-09-20 specifically
because the project timezone (Brazil, UTC-3) made the failure mode obvious
before it caused a real false reading — pin `date -u` as the one clock source
for this mechanism and don't reach for a project-local "now" helper here even
if one exists for other purposes.

**Presentation to the operator is the other half, and it is NOT UTC — it is
the project timezone, UTC-3 (`America/Sao_Paulo`), suffixed `BRT`.** The rule
above governs arithmetic (the beat marker, job age, staleness deltas): one clock,
`date -u`, never mixed. It says nothing about what a human reads, and that gap
produced two sessions reporting the same instant in two different timezones to
the same operator on 2026-09-20 — one in UTC, one in local time, neither
labelled. Concretely: compute in UTC, then render every timestamp shown in a
cycle report, a status line, a handoff, or a dispatch as UTC-3 with the `BRT`
suffix — `date -u -d '-3 hours' '+%H:%M BRT'`, a fixed offset, since Brazil has
had no DST since 2019. Do NOT use `TZ=America/Sao_Paulo date`: on the host's Git
Bash (no tzdata) it silently prints UTC while labelling it however you asked —
measured 2026-09-20, `15:25` under `TZ=` against a real `12:25 BRT` — which is the
exact unlabelled-epoch failure this whole block exists to prevent. Never print a
bare UTC time to the operator, and never put UTC and BRT in the same text without
labelling both. The operator flagged this for the coordinator earlier the same day and it
still wasn't written down — which is why it is here now, not left as a
preference to remember.

**A backup watchdog scheduled via a session-only mechanism (e.g. `CronCreate`)
does not survive everything a heartbeat does, and needs its own staleness
check.** Live 2026-09-20: a watchdog cron created early in a session was gone
~1h46min later — `CronList` returned empty with no error, no deletion event
visible in the transcript, likely lost across a session-level restart/reload
that a purely in-memory scheduled job doesn't survive. The heartbeat
(`ScheduleWakeup`) kept the mission alive through that same gap, which is
exactly the redundancy the two-mechanism design buys — but it means the
watchdog itself needs periodic reconfirmation, not "created once, trust it for
the mission's duration." Concretely: when a watchdog-cycle prompt fires, if
you don't remember explicitly creating this specific cron this session (context
compaction can also hide that), call `CronList` and recreate it if empty —
cheap, idempotent, and cheaper than losing the backup mechanism silently for
however long it takes something else to notice.

## 6. Verification — `qa-ready` is every worker's ceiling

**Review in two phases, the test phase always in the background (owner order, 2026-09-26).** A full foreground run of
typecheck + lint + unit + integration + e2e froze the coordinator for minutes: no replies to the operator, no cycles.
1. **Automated phase — background.** Launch the gates with the shell tool's `run_in_background: true` and keep working
   (answer the operator, run cycles, start the manual read). Never run a multi-minute suite in the foreground.
2. **Manual phase — after the tests come back.** Green tests are not the review: read the diff yourself (scope, write set,
   weakened tests/gates, security surface), open the real screen or run the real command for visual/behavioral changes,
   and check the worker's claims against the artifact. Only then PASS or FIX.

**Default: the review itself is dispatched (owner order, 2026-09-26 — token cost).** Both phases above are run by a
separate worker with an **adversarial reviewer profile** (`review-prompt-adversarial.md`): read-only on the branch, runs
every gate twice where flaky, compares against the base, hunts weakened tests/gates and false claims, and posts a `review`
comment with a `item | command | expected | got | ok?` table. The coordinator reads that verdict and decides; it
re-reviews by hand only when the verdict is inconclusive, contradicts itself, or the change is security/data critical.
A reviewer never moves the status — accepting the verdict (`qa-done`, merge, or a FIX redispatch) stays with the
coordinator.

**Before blaming the code, rule out the environment.** 2026-09-26: a FIX verdict called a test "a regression" that was
the worktree's `node_modules` living as a real 711 MB directory on the slow host mount (155 s vs 9 s on base). The
reviewer (human or worker) re-runs the failing test on the base checkout first; a gap only in the worktree is an
environment defect of the dispatch, not of the delivery.

**The coverage reviewer is a SECOND role, distinct from the adversarial reviewer.** The adversarial reviewer
(`review-prompt-adversarial.md`) takes the worker's findings as given and tries to break them — it catches what the
author got *wrong*. It structurally **cannot** catch what the author *forgot*: an item the author never raised leaves
nothing to attack. Coverage is a different question — *what is missing from the set?* — and it needs its own pass:

- **The checklist is the master, not the delivery.** Take the acceptance criteria (or the canonical checklist for
  this kind of work) **verbatim**, and for every item ask: does the delivery have a status? The finding is the item
  with **no status** — not raised, not deferred with a reason, not answered "n/a". Silence is the signal, and it is
  invisible to a review that only reads what was written.
- **A deferred item counts only with a named reason.** "Not done" is covered; "not mentioned" is not. Push anything
  parked on someone/something to name the holder.
- **Report as a coverage table:** `item (from the checklist) | status (done | missing | deferred) | evidence or the
  name it was deferred to`. The reviewer of coverage never edits and never moves the status — it hands the missing
  list to the coordinator, who decides whether it is scope, a sibling issue, or a real gap.
- **Run it wherever a checklist exists** — not only code: a research note against its sub-questions, a security
  audit against its controls, a release against its items. The rule is general: *someone must ask what is absent*,
  and it must not be the author.

- No worker marks its own work qa-done. A delivery already claiming "approved" is
  wrong on sight — revert the status, treat as unverified.
- Read the artifact, never the summary. Cross-check anything spanning multiple
  files by grepping both sides. A peer/worker is a capable coprocessor, not a
  trusted oracle.
- Evidence that counts: a command and its real output run *this cycle*, a passing
  test run's output, a screenshot for anything visual, negative tests where a
  failure mode exists.
- Evidence that doesn't count: "the doc/agent said so," a `qa-ready` label with
  nothing verified underneath, a status field saying running, a healthcheck passing
  without verifying it actually proves the function it claims to.
- A verification is true *at a time*. Restate one as current only by re-running it
  now, or date it explicitly ("verified `<time>` via `<command>`; not re-checked
  since"). An undated "verified" is not honest.

- **The reviewer asks the same rebuild-from-zero question the worker was required to
  answer** (item 8 of `worker-prompt-template.md`): if the SSD burns and the
  environment is rebuilt from zero with only the initial secret, does this come back
  on its own, by which task/deploy/start? An artifact that exists only in the running
  system — an image built by hand, a container mutated in place, a dashboard value —
  is a defect, and `CLAUDE.md` §"Never bypass automation manually" already forbids
  producing one. Real cases, 2026-09-23: a hand-built `fabber-id-migrator:local` image
  that `task dev:up` silently depended on, `gh` unauthenticated in the devcontainer
  despite the PAT existing, and WordPress running with no
  `OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`.
- **The strong proof is destructive: delete the artifact, run the automation, watch it
  come back.** Not the report's claim, not "the doc says the deploy creates it." Where
  deleting is genuinely unsafe mid-task, the weaker-but-real substitute is the
  versioned file that creates it plus a search proving nothing recreates it by hand —
  and the gap is stated, not glossed over. "It's already running" is never a
  verification.

## 7. Continuous bookkeeping

Not a wrap-up checklist — as it happens:
- On dispatch → tracker row to in-progress, right then.
- On a new demand surfacing (a finding, a correction, a new ask) → register it
  before dispatching work on it.
- On a worker reporting back → row to qa-ready + a durable-doc entry with the real
  evidence and any out-of-scope finding.
- On closing any piece of work → **cleanup is part of the delivery (owner SOP, 2026-10-07; disk filled up 2026-10-06)**: remove what it created (read-only copies in `.cache/bench/*`, drafts in `.cache/<topic>/`, agent worktrees) and run `task ops:clean`; the report says what was cleaned. Docker volumes only with the owner.
- On your review → qa-done, with the actual outcome — a bare status with no
  outcome detail is unacceptable.

**Edit the handoff doc's current top entry in place for a small increment of
the SAME ongoing thing; only start a new entry when the update is substantial
enough to deserve its own heading.** An append-only log of near-duplicate
updates on one task is as hard to skim cold as the state-file bloat this
section already warns against — same failure, applied to the durable doc
instead of the scratchpad.

## 8. Escalation — never decided by an agent

- Anything that can destroy data.
- Anything touching a production/live environment.
- Any irreversible infra milestone (a full rebuild-from-scratch proof, etc.) —
  explicit in-the-moment go-ahead only, never inferred as "ready."
- Scope that wasn't given.
- A close judgment call with real downside either way — present the trade-off,
  don't pick silently.

A worker hitting one of these escalates to you; you escalate to the operator. Never
let a worker guess and proceed.

## 9. Quick checklist

**Before dispatching** — prompt follows the template with secret-handling present;
write set disjoint from every concurrent worker; no two workers on infra at once;
any prior owner of these files confirmed dead; scoping flags required mechanically;
operator actually scoped this; tracker row → in-progress.

**Before dispatching (2026-09-25 additions)** — worker launched observable
(timeline) and steerable (inbox); prompt carries commit-per-step + time box + "no
expensive CI-only reproduction locally"; heavy-worker count ≤ 2.

**Each cycle** — pending approvals/questions cleared first; per-worker timeline
tail + commit count read, course corrections sent through the inbox and acked;
per-worker detail read;
file mtimes cross-checked; orphaned host processes checked if misbehaving; tracker
scanned for ready-but-undispatched work and dispatched, not just active jobs
re-checked; tracker and handoff doc current — anything new this cycle landed
durably BEFORE scheduling; next wakeup scheduled (beat marker touched only where
the scheduler can't be queried). **If nothing was dispatched this cycle, name why —
a real reason, not silence:** an active worker's colliding write-set (name which
files collide), a genuine technical dependency, or a decision explicitly parked on
someone named (user/consultant/worker). A cycle with ready, disjoint-write-set work
sitting undispatched and no named reason is a cycle failure, not a legitimate no-op
— idleness with ready work available looks identical to correctness from the beat
line alone unless the reason is stated, which is exactly the failure mode this
whole section exists to make visible instead of silent. Real incident, 2026-09-20:
a coordinator over-applied the infra-singleton rule (see its own correction above)
to four ready, unrelated repo-only tasks and reported "waiting on T-S2" with no
named collision — none of the four actually touched T-S2's write set.

**On delivery** — artifact read, not the summary; claims re-run now, negative tests
included; any self-assigned "qa-done" reverted; out-of-scope findings landed
immediately; row → qa-done with a real outcome note.
