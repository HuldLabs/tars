# Module — CI gates (does the gate actually gate?)

## What it tests

Whether every security control that claims to be automated can actually **fail**. Not
"does the job exist" and not "is the job green" — *what command turns it red, and have
you run it?*

Five failure shapes, all seen or explicitly forbidden in this repo:

1. **Vacuous** — the job passes because it asserts nothing.
2. **Absent** — the gate exists but did not run on the change in question.
3. **Neutered** — `|| true`, `continue-on-error: true`, a step that swallows a non-zero
   exit, or a required check that is not required.
4. **Unread** — the gate ran red and someone merged anyway.
5. **Mismatched** — the gate is real, runs, and asserts a *different property* from the
   one that is broken. This is the hardest shape to see, because every signal is green and
   the assertion is genuinely non-trivial. The audit's working counterexample:
   `tests/contracts/test_caddy_wpjson_store_api_exceptions.py` parses all three
   Caddyfiles and asserts the `@blocked_wpjson` matcher's **exemptions**
   (`REQUIRED_GET_EXCEPTIONS` / `MUST_STAY_BLOCKED`) — a real, running
   gate that had been passing the whole time, sitting next to the vacuous `INV-SEG-1` job,
   while `CRITICAL-1/2/3` were live. It was never going to catch them: which routes are
   *exempted* is not which routes are *blocked*, and a matcher can get the second wrong
   while the first holds perfectly. **When a finding survives a green gate, do not conclude
   the gate is fake — first ask what property it actually asserts, then whether that
   property was ever the vulnerable one.**

## Why

**Shape 1, our own incident, 2026-09-21.** The job
`invariant / INV-SEG-1 (WordPress public-surface allowlist)` **reported a passing check
on every PR while asserting nothing**: `.github/workflows/security.yml` exited 0 both
when the test file was missing and when `FABBER_API_URL` was unset, and it stayed green
through the audit that found the allowlist bypassable in six live-verified forms
(commit `43880fd`). The test file could not have caught them either — its four
`BLOCKED_PATHS` rows all already returned `403`.

The fix chose **skip over fail** for the unarmed case, and the reasoning is the reusable
part: `INV-CI-1` says a gate must be blocking once armed, but an *unarmed* gate must not
be red either, or it blocks every PR for a reason unrelated to the change under review.
GitHub reports a skipped job as `skipped`, never as a passed check — "which is the
honest signal for 'not verified'". The step's `exit 0` escapes were removed entirely:
reaching the step without a target is now a loud `::error::`.

**Shape 2, our own incident, 2026-09-20.** `.githooks/` is this repo's **only** branch
protection (GitHub Free, no required checks), and on this host a linked worktree's
`.githooks/` files arrive **without the exec bit** — git prints
`hook was ignored because it's not set as executable` once and runs neither `pre-commit`
nor `pre-push`. It ran undetected from 2026-09-20 18:17: **57 consecutive red CI runs,
7 PRs (#98–#104) merged without reading a single run**, ~1,800 of 2,000 monthly Actions
minutes burned in under 48h (`.claude/skills/git-workflow/SKILL.md`; LESSONS-LEARNED
#70). Hence that skill's four rules — create worktrees only via
`infra/scripts/agent-worktree.sh`, treat a commit whose output contains that message as
**invalid**, never `--no-verify`, and merge only after reading the PR's own CI run.

**Shape 3 is written down as forbidden, not left to judgement:** `INV-CI-1` — every CI
security gate is blocking, no `|| true`, no `continue-on-error` — and the closing line
of `ci-security-spec.md`: **"None of them ship with `|| true`. A gate that never fails is
theater."**

**Shape 4 has its own trust boundary, and it is not the workflow's fork guard.** A fork
PR runs its *own* workflow file and can delete the guard; the real protection is the
repo staying private, GitHub's "Run workflows from fork pull requests" remaining
disabled and "Require approval for all external contributors" enabled
(`git-workflow/SKILL.md`). A gate's configuration is part of the gate.

## How to verify

```bash
# 1. What exists, and in what state (skipped vs. run)
gh workflow list
gh run list --workflow=security.yml --limit 20
gh pr checks <pr-number>                      # per-check, not a summary line

# 2. Neutering — the mechanical greps
grep -rn "|| true\|continue-on-error\|exit 0" .github/workflows/ .githooks/
grep -rn "if:" .github/workflows/security.yml   # every skip condition, justified?

# 3. Hooks are actually executable where you are working
ls -l .githooks/ && git config core.hooksPath
```

**4. Mutation-test the gate — this is the module's actual work.** Pick the gate, break
the thing it guards, and run it:

```bash
# Example: the INV-SEG-1 matcher contract, offline, no target needed
uv run pytest tests/contracts/test_caddy_inv_seg_1_matchers.py -q     # expect: pass
# then restore the old matcher (path /graphql) in infra/docker/Caddyfile
uv run pytest tests/contracts/test_caddy_inv_seg_1_matchers.py -q     # expect: FAIL
```

`43880fd` records that exactly this was done — "restoring the old `path /graphql`,
dropping the `/index.php/wp-json` positive path, or replacing the `query` matcher each
make it fail". That sentence is the standard for closing any gate-class finding.

The contract test is also the **cheaper** kind to have: it runs offline at PR time,
asserts *semantics* (it extracts the real `path_regexp` values and evaluates them against
the live-verified bypass forms), and emulates Caddy's `path` matcher to prove the
exemptions still hold. Structural assertions catch a regression the day it is written;
a live-target test only catches it when a target is configured.

**5. For a gate that needs a live target**, arming it is an operator-owned config change
under "IaC total" (a versioned script, never a dashboard click). `43880fd` deliberately
did **not** arm `FABBER_API_URL`: production still carried all six bypasses, so arming it
would have failed correctly and reddened every PR until the promotion landed. Note the
recorded caveat — the verification was that production answers at Caddy with its own
`403` and not with a Cloudflare Access challenge, and that "the runner's own hop was not
exercised and is called out as such". That is the honesty bar for an arming decision.

## What "covered" means (with evidence)

- **A gate inventory**: every security job, what it asserts, and whether it is blocking.
  "What it asserts" is the load-bearing column — a job whose name matches the finding's
  topic is not evidence that it asserts the finding's property (`CRITICAL-4`).
- **The gate's inputs are a variant matrix, not a sample.** For every blocked path, the
  trailing-slash, bare, `/index.php/`-prefixed and `?rest_route=`-carrying spellings, each
  with the method the resource actually answers. `CRITICAL-4`'s Defect B was a test whose
  rows were all correct and all already passing; the audit's own phrasing of what was
  missing is the requirement — *"for every blocked path, also test the trailing-slash, bare,
  and `?rest_route=` forms."* A gate over an enumeration of spellings needs the enumeration
  to be the *attack surface's*, not the implementation's.
- **A demonstrated red run per gate**, with the mutation that caused it and the real
  output. A gate with no recorded red run is in the same class as the one that passed
  through six bypasses.
- **The skip conditions enumerated and justified**: each job-level `if:` states what
  makes it skip, and a skip is never reported as a pass.
- **`|| true` / `continue-on-error` / `exit 0` absent** — or present with a written
  reason and an owner.
- **The hook-integrity check run in the environment you are working in** (exec bit +
  `core.hooksPath`), because that is the failure that already happened here.
- **The fork/PR trust boundary confirmed at its real location** (repo visibility,
  fork-workflow setting, approval requirement), not inferred from the workflow file.

## Known false positives

- **A green check on a *skipped* job.** GitHub's summary views collapse the distinction;
  check the per-job state, not the roll-up.
- **A locally green run of a test the CI job never invokes.** Confirm the workflow
  actually calls the file you ran — the vacuous INV-SEG-1 job is the proof that a
  plausible-looking invocation is worth verifying.
- **A test that passes for the wrong reason.** The four stale `BLOCKED_PATHS` rows were
  not wrong; they were too weak. Ask what the assertion would fail on, not whether it
  currently passes.
- **A real gate is not evidence about a different property.** The exemption contract test
  (`test_caddy_wpjson_store_api_exceptions.py`) was passing throughout `CRITICAL-1/2/3`,
  and it was not broken — it answered a different question. Do not "fix" it, and do not
  count it as coverage for the allowlist's *blocking* half.
- **`ubuntu-latest` vs. the self-hosted runner:** a job pinned to `ubuntu-latest`
  deliberately (the `identity-schema-drift` job, and both `deploy-*.yml` — a promotion
  must never depend on a developer machine being up) is a decision, not drift.
- **A workflow edit that looks like a bypass may be a legitimate skip.** Read the
  comment: the skip-vs-fail choice for an unarmed gate is exactly this case.
- **The runner's own trust boundary is not a gate.** It mounts the host docker socket,
  so every job is root-on-host and the registration PAT is readable via `docker inspect`
  — accepted and documented in `infra/compose/compose.ci-runner.yaml`'s own TRUST
  BOUNDARY header. Do not file it as a new finding; check it has not *changed*.
