# Self-evolution — the mandatory retrospective

> Companion to `security-testing/SKILL.md` + `RUNBOOK.md` and `app-extraction/SKILL.md`.
> This is the **last phase of every engagement** and the **first obligation before closing it**.
> A bundle that does not update after a real engagement is a snapshot, not a method.

## 1. The rule

Every audit, exploration or extraction produces **new questions, checks, controls and surprises**.
If those are not mapped back into the bundle, the suite stagnates and the next engagement repeats
the discovery. So:

> **No engagement is "done" until the retrospective is written and the bundle is updated — or an
> explicit "nothing new, and here is why" is recorded.** ("Nothing new" is a result only when it
> names the items and shows they are covered.)

This is not extra work bolted on; it is the mechanism that makes `CHANGELOG.md` grow from reality
instead of from opinion. The hardening controls, the false-positive lists and the modules all came
from this loop.

## 2. When

At the end of **every** analysis / exploration / extraction, before the report is considered closed
— for both bundles (`security-testing` and `app-extraction`), and for any client. It is step 10 of
the security `RUNBOOK.md` and the closing step of the extraction method.

## 3. The process (five steps)

1. **Harvest.** From the session notes / transcript / command log, list **every**:
   question asked, check/command run, control observed **present**, control observed **missing**,
   surprise, dead end, and client "good thing" that made the work harder.
2. **Map against the bundle.** For each item, classify coverage — **COVERED / PARTIAL / MISSING /
   N/A** — citing the `file:line` (or module name) that covers it, or the gap. This is the
   **coverage-delta matrix** (§4). This is the core artifact; do it before the prose.
3. **Decide the delta.** For each MISSING/PARTIAL item decide the smallest correct home:
   - a **new module** (needs the five sections + a real incident + a `Related` line),
   - an **extension** to an existing module (a pattern, a false positive, a control row),
   - a **hardening control** (`hardening-baseline.md`, incl. "Beyond the twelve"),
   - a **playbook** section (`docs/security/HARDENING-PLAYBOOK.md`),
   - an **extraction module/standard** (`app-extraction/` + `docs/METHODOLOGY.md`).
4. **Educate the bundle.** Write the additions in the bundle's own format, then add the
   `CHANGELOG.md` entry (what changed, when, why, with the incident as provenance). Never add a
   target **host, key, token or client data** — at most the client name as the source of a lesson.
5. **Record the retrospective.** Write `docs/security/<scope>-lessons.md` (security) or the
   app's `EXTRACTION.md` closing section (extraction) containing the coverage-delta matrix and the
   list of changes. Reference it from the `CHANGELOG.md` entry.
6. **Update the client living handoff** (`apps/<slug>/HANDOFF.md`): what was done, what is pending,
   where everything is, how to resume — kept current **at each step** (`app-extraction/SKILL.md` §7.0).

## 4. Coverage-delta matrix (the required shape)

| # | Learning (question / check / control) | Kind | Bundle coverage | Where (file:line) | Action |
|---|---|---|---|---|---|
| 1 | exact-version CVE triage via advisory API | check | MISSING | — | new `service-subdomain-exposure` |
| 2 | client-channel identity matrix | check | PARTIAL | `authz-idor.md` (identity-from-input) | new `client-supplied-identity` |
| 3 | tenant boundary enforced per object | control | MISSING | — | baseline "Beyond the twelve" #13 |
| 4 | CSRF on all writes | control | COVERED | `webhooks-payments.md` / `headers-cookies.md` | none |
| 5 | wildcard domain → 500 | anti-pattern | MISSING | — | false-positive note in `service-subdomain-exposure` |

Rules that keep it honest:
- **An addition without a real incident is a guess** — not allowed. Cite the incident (`file:line`,
  command output, or the report path).
- **Cross-engagement deltas are the value** — if two clients differ on a control, the delta is a row,
  not tacit knowledge.
- **Promotion:** a "candidate" control observed **holding in ≥2 independent engagements** graduates
  from a note into the baseline (e.g. #13–#19 in `hardening-baseline.md` are currently candidates).
- **The matrix is not bookkeeping** — it is where the systemic finding comes from (the same way the
  security coverage matrix exposes a shared root cause).

## 5. Template (copy into the retrospective)

```markdown
# Retrospective — <engagement> (<date>)
Scope: <what was tested>  ·  Artifacts: <report, evidence, notes>
Bundle(s) touched: security-testing | app-extraction

## Coverage delta
| # | Learning | Kind | Coverage | Where | Action |
|---|---|---|---|---|---|

## Bundle changes made
- <file>: <what changed>  (CHANGELOG entry: <round>)

## Not covered / backlog
- <item> — why deferred

## Promotion watch
- <candidate control> — seen holding in <engagements>; needs <N-1> more to graduate
```

## 6. Definition of done (of the retrospective)

- Every harvested item has a row with a coverage status and a `file:line` (or an explicit gap).
- Every MISSING/PARTIAL item has an action — a change, or a backlog line with the reason.
- The `CHANGELOG.md` entry cites the incident and the files changed.
- No client host/key/token/data entered the bundle.
- **Extraction engagements additionally check** (and record any gap): the app is served by **our real
  API over SQLite** (not a mock); a **`PARITY.md`** exists with the **per-action matrix** (reads+writes;
  CRUDs, calculations, accounts, imports); a **`VERIFY.md`** exists (**every control of every screen**
  with a verdict — change-it-and-assert, CRUD, calc matrix); **live and offline were seeded with the
  SAME values (all fields)** and **each CRUD's payload was captured**, with **save + real-time UI update**
  confirmed; it is **registered in the hub**
  (`iframePort`+card+branch); exposes a **profile selector** when roles differ; and comparisons were
  done **at the same access level + seed** (live free ≠ offline max-access). These are `SKILL.md`
  §5/§6–§7.2 and `docs/EXTRACTION-STANDARD.md` §4.1 — do them by default, without being asked.
