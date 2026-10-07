# Changelog — security-testing skill bundle

What changed, when, and why. Newest first. This file exists so a future auditor can see
*what was learned from real engagements* and *which modules already carry it*, instead of
re-deriving it. Provenance rule (`SKILL.md` §1): a client may appear **only** as the source
of a generic lesson — never its hosts, keys, tokens, URLs or data.

## 2026-09-27 (21st round) - Command injection in the secrets wrapper (own tooling)

**Incident.** `tools/secrets.mjs` rebuilt `argv` into a string and ran it with `shell: true`;
a metacharacter in any argument executed with the decrypted secrets in the environment
(segtools SEG-222, fixed in `537e8cc`). **Carried in:** `modules/injection.md` (last bullet).

## 2026-09-25 (20th round) - Service hardening anti-patterns (own hub)

**Incident.** Building our own service (`segtools` hub) reproduced six mechanism mistakes that
survive code review and green tests: app connecting as **DB superuser**; cookie `Secure` derived
from `NODE_ENV`; **secret in the URL** before hydration (native GET); **`X-Forwarded-For`** trusted
for rate limiting; **DNS rebinding** defeating an Origin↔Host check; **timing enumeration** on login.

**Change.** New module `modules/service-hardening-antipatterns.md` — six anti-patterns, each with a
detect / why-it-matters / test row, plus false-positive cautions. Provenance: `docs/security/hub-lessons.md`.
Promotion to `hardening-baseline` pending a second engagement.

## 2026-09-24 (19th round) - Versioning & backup mandatory (git + OneDrive mirror, commit every step)

**Incident.** The engagement repo carried no version control — no rollback, no backup.

**Change.** `RUNBOOK.md` opens with the mandatory versioning rule: **commit after every step** and
`git push onedrive --all` (bare repo in OneDrive added once). Full rule in
`app-extraction/SKILL.md` §2.1.

**Why.** Real-time backup + rollback; an audit/extract without history is one edit from loss.

## 2026-09-24 (18th round) - Deliverables standardized: professional HTML template + exploit flow

**Incident.** The dossier needed a **standard of its own** — high bar, readable, organized, easy to
understand — not ad-hoc HTML per engagement.

**Change.** A reusable, self-contained template at **`docs/security/_templates/exploitability.html`**
(cover, sticky **TOC**, exec-summary facts, per-finding cards with **severity color**, an offline
**CSS exploit-chain flowchart**, action-plan table, print stylesheet). `modules/exploitability-dossier.md`
gained the visual standard: copy the template, one color per severity, a **flowchart when it helps**
(Atacante → ação → falha → efeito), self-contained/offline, design ref `frontend-design`.

**Why.** Consistency + readability is part of the deliverable; a template makes every client report the
same high bar.

## 2026-09-24 (17th round) - Second deliverable: client-facing exploitability dossier (HTML/PDF, TOC)

**Incident.** The technical report (codes, matrices) does not move a non-technical owner, and the
owner asked for the *exploitability story* as a **professional, scoped HTML/PDF with TOC** — "the
vulnerability is Y; anyone can do X; doing X causes Z", with real-world cases + CVE/CWE/OWASP.

**Change.** New module **`modules/exploitability-dossier.md`** (per-finding template *Y / quem / como /
impacto / CVE-CWE-OWASP / prova*; professional self-contained **HTML** with cover + exec summary + TOC +
action plan, PDF derived; narrative only, raw proof stays in the report/panel). `SKILL.md` §2 Phase 4
now mandates **two deliverables** (technical report + dossier) and adds the §8 row.

**Why.** Same finding, two audiences; the dossier is what the client forwards — and it is part of what
the engagement is paid for.

## 2026-09-24 (16th round) - Canonical order fixed: pentest anon -> pentest auth -> extraction

**Incident.** The order kept being re-discussed per client. The owner fixed it: it is not case-by-case.

**Change.** `RUNBOOK.md` states the ORDER as the default for every client: **Pass A anon -> Pass B
authenticated -> extraction**, "do not re-litigate". Mirrored in `app-extraction/SKILL.md` §3 as a
numbered ORDER block.

**Why.** Anon = worst case without a credential + cheapest surface map; authenticated completes the
tenant data and the privilege picture; extraction reimplements and proves both. One loop, fixed order.

## 2026-09-24 (15th round) - Contract: complete capture into the client's unified SQLite (no masking)

**Incident.** The evidence standard said "measure volume, never exfiltrate" + "PII masked / raw copy
deleted at close". The owner's contract is the opposite and is now explicit: **complete capture** —
**every row, every field, PII included** — persisted in the client's **unified SQLite**
(`apps/<app>/_data/<app>.db`), from which the **offline version** and the **navigable evidence
dashboard** are derived. That DB is the deliverable that proves the exposure and is billed.

**Change.** `SKILL.md` §3 replaces the volume/masked/deleted block with the absolute rule (complete
capture into the client's SQLite; the only hygiene limit is that the *generic bundle* embeds no client
host/key/token/row). Removed the masking/deletion clauses from `modules/baas-direct-exposure.md` and
`modules/evidence-parity-and-provenance.md`; app-extraction mirrors it (`live-to-offline-parity`,
`evidence-panel`, SKILL §3 Phase 5: **one unified DB, different surfaces**).

**Why.** Ambiguity about masking was blocking the very deliverable the client pays for. One base,
several surfaces.

## 2026-09-24 (14th round) - Ordering: the audit's recon runs before extraction

**Incident.** The audit and the extraction were done as parallel activities; the owner pointed out the
recon pass is, in practice, the **first** thing — it discovers the endpoints, RPCs/tables, authz and
BaaS/RLS exposure that the extraction then reimplements.

**Change.** `RUNBOOK.md` opens with the ordering: run the audit recon (steps 0–4) **before** extracting;
it feeds `app-extraction` Phase 0/5, and the extraction proves the same surface offline. Mirrored as a
"Sequencing" note in `app-extraction/SKILL.md` §3.

**Why.** One loop, not two: the audit finds what to extract, the extraction proves what the audit found.

## 2026-09-24 (13th round) - Two passes (anon then authenticated) + session autonomy, as default

**Incident.** The audit was implicitly "whatever session is open". The owner wants every property
measured **twice and in order** — **anon first, then authenticated** — and the authenticated pass must
be **autonomous** (no "please log in" each time), the same way extraction persists the session.

**Change.** `RUNBOOK.md` opens with the two-pass order (Pass A anon → Pass B authenticated) and
`SKILL.md` §2 Phase 2 states it as the default: Pass A is the strongest proof and is never skipped
"because we have a login"; Pass B captures/persists the session for autonomy (refresh token +
auto-refresh for token auth; test-account credential + auto-login for server-side sessions — the same
`app-extraction` Phase 1.5). A run that stops at one pass is incomplete.

**Why.** The two failures that matter are what **anon** already reaches and what an authenticated
**stranger** can cross; testing only one half hides the other. And autonomy turns "re-verify after the
fix" into a one-command step.

## 2026-09-24 (12th round) - Probe classification: HTTP 200 + error body is a denial (soft-deny)

**Incident.** The QVE Financeiro engagement (`apps/qve-financeiro`, `docs/security/qve-financeiro-lessons.md`)
swept all 94 actions of a single-dispatcher PHP API as one role. Classifying by **status code** was
wrong: `adminAtivar`/`adminDefinirVitalicio`/`getSaasMetrics` answered **HTTP 200 with
`{"error":"Acesso negado"}`** while `updateUser`/`getUsers`/`savePlanejamentoDRE` answered a real
`403`. A status-only sweep reads all four as "ok". The inverse also appeared: `trocarPlano` returned
`200 {"error":"Plano invalido"}` for a non-purchasable plan - a **validated** input, not an open door.

**Change.** `modules/authz-idor.md` "Known false positives" gained the soft-deny bullet (classify by
**body**, re-read the effect for writes; a body-error can also mean a *validated* input).

**Why.** Per-action authorization is the security unit in this app family (see the extraction module
`php-action-api`), and a status-code classifier fabricates a coverage matrix. The fix is orthogonal
to any single app: never equate "HTTP 200" with "authorized".

## 2026-09-24 (11th round) — "Client-side allowlist: hardcoded owner/admin e-mail in the bundle"

Source: a Supabase-direct engagement (`docs/security/makers3d-report.md`).

**Changed** — `modules/client-supplied-identity.md`: an **allowlist baked into the bundle**
(`user.email === "owner@…"`) is authority decided in the client. It leaks the owner's address (Info)
and is a control in the wrong layer (Low); the real gate is the table/RLS that serves the data.
Grep the bundle for `@` literals and check each against its use. (Also covers the "gate = one table
row, server-side" positive: a free account receives only `/auth` + the gate row and nothing else.)

## 2026-09-24 (10th round) — "Retrospective sweep: origin exposure, dispatcher authz, soft-403"

Source: the auto-evolution retrospective over the multi-client session
(`docs/RETROSPECTIVE-2026-09-24-session.md`) — closing the gaps left by the earlier rounds across
the PHP/`?action=` apps and the Fabber origin question.

**Added**
- `modules/origin-exposure.md` — a **non-web** subdomain (mail/smtp/vpn/…) leaking the **origin IP**
  behind a CDN/WAF, and whether the origin **accepts traffic that bypassed the edge** (origin
  lock-down). Read-only single-request probe (`--resolve` `Host` to the candidate IP vs via-edge),
  and the "say which layer answered" rule.

**Changed**
- `modules/authz-idor.md` — the **single-dispatcher** case (`api.php?action=` / one RPC): coverage is
  the **action**, enumerate every action × {anon, own, foreign}; undocumented-action wordlist.
- `modules/write-path-authz.md` + `authz-idor.md` — **soft-403** (`HTTP 200` + error body): classify
  by body, re-read the effect; not a pass, not a bypass.
- `SKILL.md` §3 — reconcile chain-of-custody: a **reusable session credential** (authorized) is kept;
  a **raw third-party PII copy** is deleted at close. §8 — `origin-exposure` row.

**Why.** The per-action dispatcher app and the finance app taught that "the API requires auth" is
false at the action granularity and that a `200` can mean "denied" — neither was a dedicated module;
and the origin question (CDN block ≠ control) recurred, so it earned its own file.

## 2026-09-24 (9th round) — "Multi-tenant Django SaaS: ops-host exposure + client-identity channels"

Source: a multi-tenant storefront platform (Django server-rendered + Cloudflare), audited **anon**
and **as a customer**; report `docs/security/ecommerce-pro-report.md`, lessons
`docs/security/ecommerce-pro-lessons.md`.

**Added**
- `modules/service-subdomain-exposure.md` — CT-derived ops subdomains (automation/admin UIs: n8n,
  Portainer, Traefik, CI, DB). A name in CT is a **lead**; reachability is the proof (a real dashboard
  vs the proxy catch-all `404`). Checks service cookie/HSTS posture and does **exact-version CVE
  triage** (here: 0 of 1000 GitHub advisories covered the running build → **no CVE claim**).
- `modules/client-supplied-identity.md` — the **channel matrix** (cookie / param / header /
  `localStorage` / body) with a session-only **baseline**. "The server ignores every channel" is the
  covering-control result. Contrasts a real client-side gate (prior round's `localStorage.adminAuth`)
  with a server-side role that held.
- `modules/hardening-baseline.md` — **"Beyond the twelve"**: **#13** tenant boundary (server-derived,
  per-object), **#14** deliberate destructive actions (typed confirm, no GET side effects), **#15**
  stateful server-side session / **no client refresh token**, **#16** CSRF on **all** writes,
  **#17** echo-and-ignore identity, **#18** minimal client surface (server-rendered/MPA — the whole
  bundle/BaaS-direct class is structurally absent), **#19** scoped per-tenant server-to-server keys.

**Changed**
- `SKILL.md` — §8 rows for the two modules; §8.1 cross-refs (`client-supplied-identity ↔
  authz-idor`/`write-path-authz`; `service-subdomain-exposure → secrets`/`deploy-drift`); description.

**Method notes (why)**
- The strongest class here was **server-side identity**: every client channel was ignored and mass
  assignment whitelisted. The suite must frame the **positive** ("control present / class absent"),
  not only "no hole" — and name *where* the check lives so a future refactor that moves it client-side
  is visible.
- **CVE claims require the exact serving version**, verified programmatically; a disclosed version is
  a lead, not a vulnerability. State the API query + the filtered count, and caveat source/caps.
- **Persist a session with no refresh token** (Django: `sessionid` + `csrftoken` in
  `apps/<app>/_auth/session.json` + a loader; re-capture from CDP on expiry) so a run continues
  autonomously.
- **Baseline the whole domain, not just the app** — a hardened app sat next to a public automation host.

**Bundle process (same round)**
- Added `../EVOLUTION.md` — the **mandatory, automatic retrospective** at the end of every
  engagement (harvest → coverage-delta matrix → update bundles/`CHANGELOG` → `<scope>-lessons.md`),
  and wired it into `SKILL.md` §2 (Phase 6) + §7 (step 9) and `RUNBOOK.md` (step 11 + definition of
  done). Triggered repo-wide by `AGENTS.md`/`CLAUDE.md`, so it runs **without the user asking**.

**Provenance:** from an authorized engagement; no host, key, token or client data recorded — lessons only.

## 2026-09-24 (8th round) - "Cloudflare-fronted target: Camoufox + per-action authz"

Auditing a PHP `?action=` API behind Cloudflare (shared hosting, cPanel) surfaced two
reusable lessons.

**Added**
- **CF-live technique** (documented in the repo's `docs/BYPASSES.md` "Cloudflare (live)"):
  use **Camoufox** (via global `@askjo/camofox-browser`) for anti-detect fetches, or the
  **real Chrome over CDP** with in-page `fetch`. Windows gotcha: camoufox-js WebGL sampling
  needs `better-sqlite3` native — pass `block_webgl:true, i_know_what_im_doing:true`. A
  Cloudflare `403` on `/.env`/`/api/config.php` is the **edge**, not the origin (say which layer answered).
- **Per-action authz is the unit of coverage.** A single `api.php` dispatcher had 4 actions
  returning `401` for anon while **18 sibling read actions returned `200`** (member list,
  phone list, partner emails/CNPJ, coupon codes). "The API requires auth" is false at the
  action granularity — enumerate **every** action × {anon} and classify, don't sample.
- **Undocumented-action probe**: unknown action returns a typed error (`400 Acao invalida`),
  so a wordlist (admin/dev/debug/root/impersonate/install/sql/export) can be swept cheaply —
  all here were `400`, i.e. no hidden admin action.
- **Evidence store without masking**, when the engagement contract requires concrete proof:
  keep raw responses + sha256 manifest in the app's `_evidence/`, and expose a local
  SQLite-backed **evidence panel** (same UI as prior clients) for the client to triage.

## 2026-09-23 (7th round) - "Header reference + entitlement/enumerable patterns"

Four audits in one run (Lovable/Supabase SPA; Next.js/Firebase; vanilla/Firebase; Next.js BFF)
produced three reusable patterns and a header reference posture.

**Added**
- `HARDENING-PLAYBOOK.md` **4.3** - the **reference header posture**: CSP **nonce + strict-dynamic**,
  `object-src 'none'`, `base-uri`/`form-action`/`frame-ancestors`, allow-listed `connect-src`,
  `X-Frame-Options: DENY`, `X-Robots-Tag: noindex`. With **how to implement** per stack (Next
  `headers()`+middleware nonce; Caddy `header{}`; `firebase.json`; `.htaccess`) and the **anti-pattern
  table** seen live: only `upgrade-insecure-requests`; `Report-Only` (non-enforcing); `unsafe-inline`
  /`unsafe-eval`; no CSP; HSTS-only; `X-Powered-By` exposed. This is the target to converge Fabber to.
- `modules/headers-cookies.md` - "The strong reference posture (target state)" + the anti-pattern table.
- `modules/baas-direct-exposure.md` - three patterns: (1) **entitlement/role the owner can write =
  the bypass (High)** - and the **block** (`403`, or a `P0001` trigger) is the evidence of control;
  (2) **a *listable* collection makes its per-item token meaningless (Medium/LGPD)** - anon `list`
  on a "share by token" collection enumerates PII + the token; (3) **a BFF (Supabase server-only, no
  anon key in the browser) eliminates the whole class**.
- `modules/defensive-posture.md` - "**Deterrence layers (anti-inspection/anti-copy)**": devtools-key
  blocking, console hardening banners, obfuscation/anti-debug are **deterrence (bypassable), NOT a
  boundary** - record them in the matrix as `deterrence`, never as `enforced server-side`; the real
  anti-copy is the **BFF** (logic/data server-side) + server-side authz + CSP.
- `HARDENING-PLAYBOOK.md` **§4.4 - "Teto de hardening"** (anti-scrape/anti-cópia/anti-inspeção/anti-
  invasão): the full ceiling - architecture (BFF, no logic in client, payload minimization, opaque ids,
  caps), session (httpOnly cookie, short/rotating tokens, origin check + Fetch Metadata), anti-
  automation (edge rate-limit, lockout, **server-verified** captcha, bot mgmt/WAF, request signing),
  headers (nonce+strict-dynamic, **Trusted Types**, no `X-Powered-By`, SRI), cache/privacy, payments
  (hosted checkout + signed webhook), monitoring (audit+alerting) - each marked ✅ (done by the
  reference target, 3DPricing) or ➕ (still missing). Grade against the ceiling, not one probe.
- `HARDENING-PLAYBOOK.md` **§4.5 - "Detecção de abuso/automação e conta comprometida"** + note in
  `modules/auth-identity.md`: VPN/multi-IP rotation **defeats IP-only rate-limits** - the unit is the
  **account/session**, not the IP. Covers impossible-travel, session/risk binding, datacenter/VPN/Tor
  ASN reputation, automation signals (webdriver, JA3/JA4, timing), step-up, and per-account alerting.
  Tester rule: validate limits **by IP *and* by account**, and report the **axis**.
  **Golden rule of axes:** limit the **pair (account x IP x session)**, not one axis - a per-account
  cooldown survives IP rotation, and a per-IP limit catches a fresh account on the same IP, so resetting
  needs *both* (and session/device may still catch it). Check both directions: **N accounts on one IP**
  (farming) and **1 account across N IPs** (VPN). IP-only and account-only are both findings.
- `HARDENING-PLAYBOOK.md` §4.5 + `modules/auth-identity.md`: **CGNAT-aware abuse controls** (researched
  from RFC 6598, RFC 6269 §13.1, Cloudflare "Detecting CGNAT" 2025-10-29) - the server sees the shared
  carrier IP, not the device; detect shared IPs (traceroute `100.64.0.0/10`, PTR/WHOIS keywords,
  behavioral **diversity** per IP /24) **before** punishing by IP; keep enforcement per account/session;
  log **source port** for traceability; prefer IPv6/device signals. Per-IP penalty boxes are both
  bypassable (VPN) and harmful (collateral damage) behind CGNAT.
- `HARDENING-PLAYBOOK.md` §4.5: **"local IP client-side is not obtainable"** - WebRTC host candidates
  are now **mDNS-obfuscated** (`<uuid>.local`, IETF draft-ietf-mmusic-mdns-ice-candidates updating RFC
  8839); the Next.js **server** can read the **public** IP (`x-forwarded-for`/`cf-connecting-ip`, only
  from a trusted edge) but behind CGNAT it's shared; STUN/PCP/NAT-PMP reveal the external IP:port, not
  the machine, and are spoofable. Market pattern to work around CGNAT: account+session+cookie+device
  fingerprint, device-bound tokens, risk engines (fingerprint + JA3/JA4 + ASN), server-verified
  attestation (Play Integrity/App Attest, Private Access Tokens), per-account limits + step-up.
- `HARDENING-PLAYBOOK.md` §4.5: **use the Cloudflare edge instead of building it** - `CF-Connecting-IP`;
  **Rate limiting with `cf.unique_visitor_id` ("IP with NAT support")** = Cloudflare's native
  CGNAT/NAT-aware visitor counter (cookie `_cfuvid`); combine with Cookie/Header (your session), Path,
  `ip.src.asnum`, JA3/JA4 (`cf.bot_management.*`); **Bot Management** score + **Turnstile** (server
  siteverify) for step-up. Caveats: cookie-based (incognito collapses to a shared bucket -> combine
  with Path/Header on critical endpoints), can't combine `ip.src` with `cf.unique_visitor_id`, explicit
  "is CGNAT" is **not exposed** to customers, fields are plan-gated.
- `modules/defensive-posture.md` (new layer **12**) + `HARDENING-PLAYBOOK.md` **§4.6 MUST-HAVE**: **separate
  the backoffice/admin app from the client app** (distinct build/deploy/host, own auth + CF Access, own
  CSP; never import admin/pro modules/RPC/route names into the public bundle; all authz server-side).
  Observed across the extract series: a same-bundle admin/pro let us unlock admin panels, use PRO without
  paying, and read admin functions/reports - even when the server held (no data leak), it **leaked the
  architecture/logic/competitive differentiator**. Check: `grep` the public bundle for admin/report/RPC
  names must be empty.
- `HARDENING-PLAYBOOK.md` §4.4 + `fabber-bindings.md` §2: **default-deny edge + minimal allowlist**
  (Cloudflare Access identity on everything; expose only punctual endpoints - payment webhooks, OAuth
  callback, health). **Every exception self-authenticates** (webhook signature fail-closed, OAuth
  state/nonce) because it bypasses the gate, and the matcher must match **exactly** the served path
  (`edge-allowlist-bypass`). Fabber specifics recorded in the bindings: the **anonymous allowlist is
  only the storefront routes the customer needs to browse and buy** (catalog/cart/checkout/login) -
  no admin/internal/ops route is anonymous; each public route must be safe-for-anon (no leak).
- `modules/defensive-posture.md`: **test the paid endpoint directly** - a client-side entitlement gate
  whose endpoint answers to **anon** is a **real bypass** (extension flips the flag and the UI loads
  data) *and* leaks the logic. Live example: a Next.js BFF's `POST /api/pricing/advanced` returned the
  full PRO payload (pricing + marketplace fees/strategy) to an **unauthenticated** request while the
  `!isPro && <Locked>` gate was client-only (**High**). Read the bundle for the `fetch("/api/…")`, call
  it directly (anon + free session); a `401/403` = cosmetic, a `200`-to-anon = finding. This is why a
  "most secure-looking" target can still have the one real hole.

**Provenance:** from external engagements; no host, key, token or client data recorded - lessons only.

## 2026-09-22 (6th round) — "Write-path authz + the suite runbook"

Closing the biggest methodological gap: reads were covered, **writes** were not.

**Added**
- `modules/write-path-authz.md` — authorization on **state-changing** requests (BFLA, write-IDOR,
  privilege/plan tampering, mass assignment). The rule: **only self-owned writes, reverted**, with a
  **post-state re-read** to distinguish a control from an ignored handler. Carries the printer-case
  contrast: PrintCal's `PATCH user_profiles role=admin → 400 P0001` (a trigger, invisible to reads)
  vs CordeiroFlow's client-uid `affiliate_balance` whose **write** correlate is the money finding.
- `RUNBOOK.md` — the ordered 11-step **suite** (module + tool + artifact per step), so a run is
  comparable across targets and "toda a suíte" is a procedure, not a phrase.

**Changed**
- `SKILL.md`: module row (`write-path-authz`), description, and §7 pointing at `RUNBOOK.md`.

**Why.** A read-only sweep answers "can they read?"; privilege escalation, plan/billing fraud and
data tampering are **writes**. The suite must state that half explicitly.

## 2026-09-22 (5th round) — "Patterns: CSP strict-dynamic, server-verified anti-bot, supply chain"

From Split3MF (open app) + the self-contained tools pass.

**Changed**
- `modules/hardening-baseline.md`: new **"Patterns observed (present × gap)"** — strongest CSP
  (**nonce + `strict-dynamic`**), the anti-bot rule (**widget ≠ control; require server-side
  verification**), framework codes that echo internals (`PGRST205` leaked a table name), commented
  secrets/static CSRF tokens still count, blast-radius caps, and the "plan/admin literals in the
  bundle" tell for client-side authz.
- `modules/defensive-posture.md`: added **layer 11 — supply chain** (third-party scripts / CDN /
  GitHub Raw must be pinned + **SRI**; a "self-contained" tool that fetches a CDN at runtime is not)
  and the "anti-bot must be server-verified" corollary.
- `docs/security/FRAGILITIES-CATALOG.md`: **Split3MF** + **self-contained tools** sections; the
  control × target matrix gained a **Split3MF** column (+ supply-chain note).

**Why.** These rounds surfaced *good* hardening worth naming (nonce+strict-dynamic CSP, HSTS preload,
per-object BFF authz, `5→429` login lockout) alongside new gap shapes — the bundle should teach both,
so a clean control is recognized and named, not silently assumed.

## 2026-09-22 (4th round) — "Defensive posture + re-audit of the early clients"

Two things this round: a new lens, and the re-audit of the pre-bundle clients.

**Added**
- `modules/defensive-posture.md` — how a system resists **scraping / privileged-API abuse /
  unlocking paid features**: ten layers (client JS → transport/key → key scope → endpoint authz →
  per-object scoping → entitlement → anti-automation → blast-radius caps → storage → minimization),
  and **where an abuse collapses them**. Carries the "same surface, opposite outcomes" evidence:
  anon-RPC + unrestricted key (LetraMaker) vs referrer-restricted key + rules (Calc3D); one unscoped
  collection beating an otherwise-scoped system (CordeiroFlow `storefronts`); BFF making the bundle
  cosmetic (Primu3D/NeoBrix).

**Changed**
- `SKILL.md`: §8 module row; §8.1 pairing `defensive-posture ↔ hardening-baseline`; description.

**Re-audit (early clients, current bundle) — highlights**
- **LetraMaker:** L2/L3 still **LIVE** — `get_all_users_admin` answers **anon** (1000 rows/call, no
  params, no paging); `get_admin_user_stats` reports **10900** users. Evidence re-captured.
- **CordeiroFlow:** new **CF-1** `storefronts` cross-tenant (155 rows / 155 owners) and **CF-2**
  `affiliate_balance(user_id)` trusting a client uid; C1/C5/C6 now **DOWN**.
- **NeoBrix:** BFF posture strong (per-object authz, CORS allowlist, login rate limit `5→429`, CSP) —
  gap is the SPA (token in `localStorage`, no local CSP). Reports: `docs/security/*-report.md`.

## 2026-09-22 (3rd round) — "Hardening baseline (positive controls)"

Compiled across all audited clients (LetraMaker, CordeiroFlow, Primu3D, PrintCal, 3D Print
Manager, Calc3D): the skill used to hunt holes; this round adds the **positive** pass so a clean
run states what is present, and a gap becomes an improvement opportunity.

**Added**
- `modules/hardening-baseline.md` — twelve controls to verify **present** per target (server-side
  authz, per-object scoping, public-key scope, function authz, storage lock, auth hardening,
  session reachability, headers, secrets/maps, abuse controls, generic errors, data minimization),
  the control × target matrix, and the cross-client-delta method. Carries the evidence that the
  secure systems are exactly the ones that applied the controls the leaky ones lacked
  (BaaS anon key is the same surface; the difference is key scope + server-side checks).

**Changed**
- `SKILL.md`: §6.2 "Test the baseline positively" ("no finding" is never a status; missing control
  = finding); §8 module row; §8.1 cross-reference; description.

**Why.** An audit on an empty/narrow scope was reporting "no finding" while missing that controls
every peer had (App Check not enforced, CSP `unsafe-inline`). The security product must name both
the hole **and** the practice that closes it.

## 2026-09-22 (2nd round) — "Evidence parity & provenance"

Same engagement, second pass: the findings were **reproduced into an offline copy** of the
target for functional proof, which raises the "you seeded it, a model wrote it" rebuttal. This
round is about making the *evidence* survive that.

**Added**
- `modules/evidence-parity-and-provenance.md` — parity matrix (live count vs copy count per
  table), tamper-evident provenance (raw bytes + `sha256` + endpoint + auth level + time), source
  labeling (live API vs client bundle), id-set equality for bundle datasets, and the negative
  proof that privileged endpoints return denial codes (no hidden store).

**Changed**
- `modules/baas-direct-exposure.md` — added the crawl-the-privileged-surface step (capture
  response bodies; `401 42501` / `400 P0001` are evidence) and a false positive for UI-derived
  counts.
- `SKILL.md` §3 — "make the evidence reconcilable" (parity + provenance, never reconcile against
  a screen); §8.1 — the collection→parity chain.

**Why.** In the case, 12/13 tables matched the live host exactly and a bundle dataset matched by
**id-set** (3.504 = 3.504); a UI number of "4.174" was a merge/dedup artifact with an empty API
behind it. Without parity + hashes, a subject's cheapest rebuttal defeats a real finding; with
them, a third party can re-fetch and recompute the hash.

## 2026-09-22 — "BaaS-direct" expansion (from the 4th audited SPA)

Source engagement: a React + Supabase-direct SPA (browser talks to the BaaS with a public
key). Verdict: **mostly hardened, one real RLS gap** — a per-owner table lacked owner
scoping (anon read private rows across 11 owners) and a second exposed contact PII to any
account; the admin RPCs, user tables, aggregate views and storage all held. Full write-up:
`printcal-report.md`; catalog rows in `FRAGILITIES-CATALOG.md` (PrintCal); playbook note in
`HARDENING-PLAYBOOK.md` ("the middle case").

**Added**
- `modules/baas-direct-exposure.md` — a new class: RPC authorization, RLS per table,
  `security_invoker` views, storage listing, public auth-config, and the self-elevation
  probe. Carries the "client-side bypass is cosmetic when authz is server-side" result and
  the measured anon × authenticated matrix.

**Changed**
- `modules/authz-idor.md` — BaaS-level ladder measured with `count=exact`; the `42501`
  (platform) vs `P0001` (function) denial distinction; the self-elevation probe; a
  UUID-is-not-PII false positive; a **Related** line.
- `modules/secrets.md` — a sixth surface, **the dataset** (a product catalog/seed shipped
  in client JS = an asset delivered by the bundle), its verify step, and the public-source
  vs proprietary false positive; a **Related** line.
- `SKILL.md`:
  - §1 — scope exception: a public client key is ours by design (read-only), and a write to
    **your own** privilege field is allowed and reverted; bulk-exporting third parties is
    not.
  - §2 — the **access ladder** as a general rule of live verification.
  - §3 — **"measure volume, never exfiltrate"** + chain-of-custody (masked deliverable; raw
    copy deleted at engagement close).
  - §5 — Medium anchor for cross-tenant data (anon reading a private row / PII behind a
    free account).
  - §8 — new module in the index; §8.1 **cross-references** (chains between modules);
    front-matter description updated.
- All three touched modules gained a **Related** line at the top (bidirectional with §8.1).

**Why now.** The prior modules framed BaaS-direct systems as a single contrast (leaked vs
safe). The new engagement showed the real answer is a **per-table matrix** — one missing
policy out of many is a live leak, and "hardened in most places" is not a verdict. The
method (access ladder + measured matrix + volume-not-payload evidence) generalizes to any
BaaS-direct target.

## 2026-09-21 — baseline

Origin of the skill: the `external-benchmark-audit-2026-09-21` engagement (27 findings)
found live problems no existing gate caught while the gates were green. That produced the
five-phase method, the LIVE/LATENT/DOWN classification, the coverage matrix, the severity
calibration, and the first modules: `authz-idor`, `injection`, `edge-allowlist-bypass`,
`auth-identity`, `secrets`, `headers-cookies`, `webhooks-payments`, `ci-gates`,
`ai-code-flaws`, `deploy-drift`.

## Conventions (hold for every change)

- A module keeps the five sections, in order: **What it tests → Why (incident + source) →
  How to verify → What "covered" means → Known false positives**, plus a **Related** line.
- An addition without a real incident behind it is not allowed — it is a guess.
- New module → add a row to `SKILL.md` §8, a **Related** line, and an entry here.
- Never add a target host, key, token or client data to this bundle; cite the lesson.
