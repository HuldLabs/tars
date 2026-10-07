# Module — deploy drift (the fix that isn't serving)

## What it tests

Whether the thing answering requests is the thing that contains the fix. This module
exists because a security finding can be correctly fixed, reviewed, merged, and still be
**live** — and because a previous claim about a system's state can be wrong in the same
direction.

It covers three drifts:

1. **Code → artifact** — the fix is on a branch/main; the target runs an older build.
2. **Artifact → deployment** — the right artifact exists but the deploy silently did not
   happen.
3. **Doc → reality** — the documentation describes a state the system was never in.

## Why

**Drift 1, our own audit, 2026-09-21.** The INV-SEG-1 matcher fix is committed on `main`
(`145e1c7`), verified live on the dev stack — and **production still carried all six
allowlist bypasses at that moment**, because the fix is promoted separately and
operator-gated (`43880fd`'s own body: "production still carries all six bypasses (the
matcher fix is promoted separately, operator-gated)"). One finding, two true
classifications (`SKILL.md` §3) — and the reason the finding is `DOWN` on dev and `LIVE`
in prod in the same table row.

This is structural here, not incidental: `prod` **never rebuilds**, it deploys the exact
artifact `stg` validated (`.claude/skills/git-workflow/SKILL.md`, ADR-001 — "build once,
promote the artifact"). That is the right design, and it means "merged" and "deployed"
are always two facts that must be established separately.

**The full audit turned that into `HIGH-1`, and its shape is the lesson**: production was
running a **~10-day-stale** artifact, so *every* security change merged in that window was
absent from what served traffic — the CSP (`apps/web/next.config.ts:149-161` emits
`Content-Security-Policy-Report-Only` for `/(.*)` unconditionally, no env gate anywhere in
the file; production emitted **none**), the identity/auth integration, the automated
`wp-graphql-headless-login` removal (`infra/pyinfra/deploy_wp_bootstrap.py:395-405`, added
2026-09-14, later than the running artifact), and any matcher fix from the same period.
The second-order consequence is what makes this a first-class finding rather than a
footnote: **every other finding's classification depends on it.** A fix landed in that
window might be believed live when it is not, and — the direction that is easy to miss —
an app-level finding in the same report (the open redirect, the `/conta` auth gap, the
`payment_method` selector) is **not live**, which lowers its urgency today and raises it
the moment the promotion lands. Classify against the artifact, not the branch.

The audit also states its own limit honestly, and that limit is part of the method:
read-only meant it could not read the running image's build SHA, so it recorded two
candidate explanations (the artifact predates the config, or the header is stripped in
transit) and the reasons the first is far better supported — Caddy `header{}` blocks only
*add*, and Cloudflare does not strip CSP by default. It did **not** upgrade a well-supported
inference into a verified fact.

**Drift 2 has its own silent-failure shape, already hit once.** `deploy-prod.yml`
triggers on a `v*.*.*` tag push, but the `production` GitHub Environment's deployment
policy had been created with `type: "branch"` instead of `type: "tag"` — so it silently
rejected every real tag push ("a tag can never match a branch-type policy"). The
workflow file was correct; the environment policy — config living entirely in GitHub's
API, outside this repo's Pulumi/pyinfra IaC and invisible to `git log` — was not
(`git-workflow/SKILL.md`, found live 2026-09-11).

**Drift 3 is the same lesson in documentation form, and it is the one to remember when
reading any status claim.** `CLAUDE.md`'s VM section records that the provisioning
scripts were believed to have been run — and a real SSH connection on 2026-09-01 proved
**none of them had**: `docker` 0 packages, `op` missing, `ufw` not found, no swap,
`PasswordAuthentication no` absent, disk 46.6 GB not 200 GB. The text is kept, marked
"**it is not the real state**", for traceability. A doc that records what was *believed*
is not evidence of what *is* — which is why this skill's whole evidence standard exists.

An adjacent, sharper variant: the `/api/auth/migrate` route was found publicly reachable
and unauthenticated during an adversarial review of an *unrelated* incident — and the
premise that "no automation existed for this" was itself false; automation existed and
was **failing silently** (`CLAUDE.md`, "Never bypass automation manually"). A silent
failure is drift's natural habitat.

## How to verify

**Establish the artifact identity first — before testing anything.** A probe against an
unknown build answers a question nobody asked.

```bash
# Is this the real app at all, and which build?
curl -sSI https://fabber.com.br/ | grep -iE "^(via|x-nextjs-cache|server|age|cf-cache-status)"
# The image identity is its build metadata (GIT_SHA + digest), not the release tag
# (git-process-spec.md §5.3) — compare that, not a version string.

# Our own WordPress container reports its build metadata publicly (a deliberate
# exemption, Caddyfile:424) — the cheapest artifact-identity check we have:
curl -s https://api.fabber.com.br/wp-json/fabber/v1/health | \
  grep -oE '"(git_ref|git_sha|image_build_time|deploy_timestamp|image_digest)":"[^"]*"'
# → image_build_time 2026-09-10T22:14:30-03:00 / deploy_timestamp 2026-09-11T02:19:02Z
#   is how HIGH-1 dated the running artifact to ~10 days behind main.
```

**The route date-boundary technique — no build metadata needed, works on any app.** Pick
routes whose commit date you know, and compare live status against that date: in the audit,
every route added 2026-09-05/06 returned **200** while every route added 2026-09-14 or later
returned **404** (Next's own 404 page, i.e. not in the build) — a clean boundary that dates
the artifact from outside. Build output confirms it independently
(`apps/web/.next/app-path-routes-manifest.json` lists what shipped). Reach for this whenever
a target has no provenance endpoint, which is most of them:

```bash
curl -s -o /dev/null -w '%{http_code} %{url_effective}\n' \
  https://fabber.com.br/status/api/cleanup \
  https://fabber.com.br/api/me \
  https://fabber.com.br/api/revalidate
```

```bash
# Was the deploy a deploy? (tag-triggered prod, promotion-PR stg)
gh run list --workflow=deploy-prod.yml --limit 5
gh api repos/<org>/<repo>/environments/production/deployment-branch-policies   # type: tag, not branch
```

```bash
# Then re-run the ORIGINAL reproduction, not a proxy for it.
# A finding is DOWN only when the command that showed the defect now shows it blocked.
curl -s -o /dev/null -w '%{http_code}\n' https://api.fabber.com.br/graphql/
```

Also worth doing whenever a "fixed" claim arrives: check the *diff* that landed against
the *file the running image was built from* — a fix merged to a file that the image
copies from a different path, or a config change that requires a container recreate, is
drift wearing a green check.

## What "covered" means (with evidence)

- **Every `DOWN` classification names the artifact it was verified against** — the
  commit SHA/deploy run, plus the command output from the target itself.
- **For any finding whose fix is on `main` but not yet promoted, the report says so in
  the finding row**, with both classifications. Never a bare "fixed".
- **The reproduction command is kept as the regression guard**, so the next audit
  re-runs the same thing instead of inventing a new one.
- **A "deployed" claim for `prod` is backed by a specific successful run of
  `deploy-prod.yml` and a `type: tag` environment policy**, not by the merge of a
  promotion PR.
- **A status claim sourced from a doc is re-verified against the system** before it is
  repeated — the standard `CLAUDE.md` itself now states for its own DNS section
  ("Verify DNS/proxy status live before trusting this doc on production state again").

## Known false positives

- **A CDN serving a cached old response looks exactly like drift.** The cache chain runs
  origin→edge (`Valkey` → Next `revalidateTag` → Cloudflare purge), and purging the edge
  before regenerating ISR makes Cloudflare re-cache the old content — which reads as
  "the purge didn't work" (`CLAUDE.md`, cache section). Confirm which layer answered
  (headers) before concluding the deploy is stale.
- **`stg` and `prod` disagreeing is the design, not a bug.** Every target is classified
  separately for this reason.
- **A fix with no observable external effect cannot be verified by probing.** For those,
  the evidence is the artifact identity plus the code path — and the report should say
  the live check was not possible rather than implying it passed.
- **"The workflow file is correct" is not "the deploy works."** Environment protection
  policies, required reviewers, tag-vs-branch type and repository variables all live
  outside the file.
- **A skipped deploy job is not a successful one** — the same collapsed-state trap as
  `modules/ci-gates.md`, one layer up.
- **An infra change that needs a container recreate** can leave the old process serving
  while the config on disk is already correct; do not verify an edge/config fix by
  reading the config file.
- **"The header is missing in production" is not "the header was never implemented."**
  `HIGH-1`'s CSP half is exactly this trap: `next.config.ts:149-161` emits the header
  unconditionally, so the *config* is correct and the *artifact* is old. Read the config
  (or the file's own git date) before filing a missing control — otherwise you file a
  deploy-drift finding as a code finding, and the fix you propose (write the CSP) is not
  the fix that is owed (promote the artifact). The reverse also holds: a control that
  *looks* present in code can be absent from traffic for this reason.
- **A stale artifact silently re-classifies other findings.** Run this module *first*: an
  app-level finding verified only against a doc, a branch, or a local build may be LATENT
  rather than LIVE, and the audit's own app-level findings were — because routing to those
  pages returned 404 in production. Getting the order wrong inflates today's severity and
  understates tomorrow's.
