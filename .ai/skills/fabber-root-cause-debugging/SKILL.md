---
name: root-cause-debugging
description: Disciplined process for investigating a bug, regression, failed validation, or unexpected behavior before proposing a fix — used before writing an entry in LESSONS-LEARNED.md. Use whenever something is broken and the cause isn't already obvious and confirmed.
---

# Root-Cause Debugging

**Do not guess-fix.** This is the investigation process that runs *before* a fix is
proposed and *before* a `LESSONS-LEARNED.md` entry gets written — that file is the
record of what this process found; this skill is how to actually find it.

## Workflow

1. **Define expected behavior** — what should have happened, precisely.
2. **Define actual behavior** — what actually happened, precisely, with real
   output/evidence, not a paraphrase.
3. **Reproduce with the smallest reliable path** — strip everything not needed to
   trigger the failure before investigating further.
4. **Narrow the failure boundary** — change one variable at a time. Don't fix and
   investigate simultaneously; each change should isolate, not attempt to resolve.
5. **Identify the root cause before widening the fix** — see the distinction below.
   Don't patch the first plausible-looking spot.
6. **Validate the fix actually addresses the root cause**, not just the symptom that
   was first observed — re-run the exact reproduction from step 3 against the fix.
7. **Add the smallest honest regression guard** for the corrected failure mode — a
   test if that's the right layer, otherwise the nearest honest mechanical check (see
   `LESSONS-LEARNED.md`'s "Mechanical checks index" for the project's existing pattern
   of turning a root cause into a checkable rule).

## Root cause vs. symptom — the distinction that matters

A symptom is what broke. A root cause is the structural reason the process allowed
that break to happen. If your explanation of "why it occurred" and your explanation of
"root cause" read the same, dig one more level — see `LESSONS-LEARNED.md`'s own entries
for worked examples (entry #4 in particular: the symptom was a wrong service name in
one file, but the root cause was a shared contract file specifying something Docker
Compose couldn't actually express).

## Rules

- **Preserve evidence while the bug is still observable** — capture the failing
  output/state before it's gone, especially for anything transient (a container that
  restarts, a log that rotates).
- **If a failure is flaky, increase observability before increasing cleverness** —
  don't add speculative handling for a failure mode you haven't actually confirmed;
  add logging/instrumentation until the actual trigger is clear.
- **If the root cause is still genuinely unknown after investigation, say so
  explicitly** — don't present a guess as a finding. This pairs with the project's
  "no completion claim without fresh evidence" rule (`docs/dev/prompts/TEMPLATE.md`).
- **Avoid broad speculative refactors as the first response to a failure.** A wide
  change makes the next investigation harder, not easier, if it doesn't actually fix
  the problem.
- **A concluded bug fix always gets a recurrence guard** — if none can be added in the
  same pass, document the specific reason and the residual risk rather than silently
  skipping it.

## After the investigation

If the root cause and fix are real findings (not a one-off typo with no structural
cause), write them up in `docs/dev/prompts/LESSONS-LEARNED.md` using its four-field
format (Error / Why it occurred / Root cause / Definitive fix) — that file is where
this becomes a standing, mechanically-checkable rule for future work, not a one-time
fix that the next task has to rediscover.

## Rebuild-from-zero — the SSD question, applied here

A fix applied to the running system is not a fix — it is the bypass `CLAUDE.md`
forbids (2026-09-18: `npx @better-auth/cli migrate` run by hand to unblock testing,
leaving a database no automation had produced). Every concluded investigation answers
the mantra in `worker-prompt-template.md` §8: if the SSD burns and the environment is rebuilt from zero
with only the initial secret, does this come back on its own, by which
task/deploy/start? When the honest answer is "only because I ran it manually", the
investigation is not finished — fix the automation, run the automation, and confirm
the corrected path reproduces the state on a clean target.
