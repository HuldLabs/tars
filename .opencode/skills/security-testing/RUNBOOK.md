# Runbook — the full audit suite (one target, in order)

Read `SKILL.md` first. This is the ordered execution of the modules so a run is comparable
across targets. Each step names the module(s), the tool(s), and the artifact to keep.
Authorization + read-only defaults from `SKILL.md` §1 apply; the only writes allowed are
**self-owned and reverted** (`modules/write-path-authz.md`).

**ORDER (fixed — the default for every client): pentest anon → pentest authenticated → extraction.**
1. **Pass A — anon (deslogado):** full read-only sweep (steps 1–9) with no session — the worst case
   and the cheapest surface map (endpoints, tables/RPCs, anon reachability, storage).
2. **Pass B — authenticated (logado):** the owner logs in **once**; the session is captured/persisted
   for autonomy (token auth → refresh + auto-refresh; server-side → credential + auto-login); repeat
   the sweep **with** the session (tenant data, the ladder foreign/sibling, elevation).
3. **Extraction** (`app-extraction`) then materializes the **client's own DB** and proves the same
   surface offline (from the dossier both passes produced).
Do not re-litigate this order — it is the default.

**Two passes, in order — never one.** Every property is measured twice:

1. **Pass A — anon (deslogado), first:** no session/cookie. This is the strongest proof (unauthenticated
   reach = the worst case) and it must not be skipped because "we have a login".
2. **Pass B — authenticated (logado), then:** the owner signs in **once**; the session is **captured and
   persisted for autonomy** (`apps/<slug>/_auth/session.json`; refresh token + auto-refresh for
   token-based auth, or a test-account credential + auto-login for server-side sessions — the same
   **extraction Phase 1.5**, `app-extraction/SKILL.md`). Then the ladder (own→foreign→sibling), the
   writes, and the confirmed surfaces are re-measured **with** the session.

A run that stops at one pass is incomplete: the two interesting failures are what **anon** already
reaches, and what an authenticated **stranger** can cross.

**Versioning & backup — MANDATORY, after every step.** This repo is versioned in git and the history is
**mirrored to OneDrive** for real-time backup + rollback. **Commit after every step** and
`git push onedrive --all` (a bare repo at `D:/onedrive/segtools.git`, added once as a remote).
Full rule: `app-extraction/SKILL.md` §2.1. No step ends without a commit.

| # | Step | Module(s) | Tool(s) | Artifact |
|---|---|---|---|---|
| 0 | Scope, target matrix, artifact named | `SKILL.md` §2/§4 | — | scope block in the report |
| 1 | Passive recon: routes/endpoints/assets/secrets | `secrets` | `tools/method/pentest/recon-passive.mjs` | endpoint list, secret grep (file:line/hash) |
| 2 | Headers/CORS/methods/files, per target | `headers-cookies` | `tools/method/pentest/check-safe.mjs` | per-target header table |
| 3 | Auth config: providers, enumeration, lockout, captcha | `auth-identity` | `auth-review.mjs`, live probes | auth table |
| 4 | Anon surface (if BaaS-direct: Supabase/Firebase) | `baas-direct-exposure` | `printcal-audit.mjs` (pattern) | anon × token matrix |
| 5 | Authz ladder **read**: no-session→own→foreign→sibling | `authz-idor` | `tools/method/pentest/authz-matrix.mjs`, CDP | per-route verdict table |
| 6 | Authz ladder **write** (BFLA/IDOR/tamper/mass-assign) | `write-path-authz` | CDP/curl, self-owned only | write matrix + post-state re-read |
| 7 | Defensive posture (how it resists scrape/unlock) | `defensive-posture` | CDP network, anon probes | layers matrix + collapse point |
| 8 | Baseline 12 controls, positively | `hardening-baseline` | mixed | control × target matrix (P/F/N-A/UNTESTED) |
| 9 | Evidence parity/provenance | `evidence-parity-and-provenance` | `*-dump.mjs` | raw + `sha256` manifest |
| 10 | Gates + report | `ci-gates`, `SKILL.md` §7 | — | `docs/dev/security/<scope>-audit-<date>.md` |
| 11 | **Self-evolution retrospective** (mandatory, automatic) | `EVOLUTION.md`, `SKILL.md` §2 Phase 6 | — | `<scope>-lessons.md` + bundle modules/baseline updates + `CHANGELOG.md` |

## Per-target quick commands
```bash
node tools/method/pentest/recon-passive.mjs <base> <chunks-dir>
node tools/method/pentest/check-safe.mjs <base>
node tools/method/pentest/authz-matrix.mjs --base <base> --cookie "<cookie>" --org <own> --foreign <other>
node tools/method/pentest/rate-probe.mjs <base>
node tools/method/cdp-eval.js <port> "<expr>" <urlMatch>
```

## Definition of done (per target)
- Every step has an artifact; every control/route has **P/F/N-A/UNTESTED** with evidence.
- No bare "no finding": state keys, **which controls were verified present** (assets), and which are
  missing (improvement opportunities).
- The report ends with the two "what each side has the other lacks" sections and the review cadence.
- **Step 11 is closed**: the coverage-delta matrix exists, every MISSING/PARTIAL item has an action
  (a change or a reasoned backlog line), and `CHANGELOG.md` cites the incident + files changed.
