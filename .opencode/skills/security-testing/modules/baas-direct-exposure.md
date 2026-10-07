# Module — BaaS-direct exposure (Supabase/Firebase from the browser)

> **Related:** `authz-idor` (the per-object ladder this specializes), `secrets` (the
> bundle surface — client key and embedded datasets), `deploy-drift` (the artifact that
> is actually serving), `headers-cookies` (session reachability).

## What it tests

Whether a backend-as-a-service that the browser talks to **directly** (Supabase REST/RPC/
storage, Firebase) enforces authorization *on the server*, or leaves it to the client.
The BaaS is reachable with a **public key by design** (a Supabase anon/publishable key, a
Firebase apiKey) — so the whole question is what that public key can reach.

Six checks, in order of how often they are the real one:

1. **RPC authorization** — is every database function that returns another tenant's data
   gated by a role check *inside the function*?
2. **RLS per table** — does each table scope reads to the owner, or is the policy `true`
   / missing for one of them?
3. **Views** — a Postgres view is `security definer` unless `security_invoker=true`, so an
   aggregate view can bypass the RLS of its base tables.
4. **Storage** — can a caller list buckets/objects, or fetch another tenant's file?
5. **Auth config** — what does the public auth settings endpoint say about enumeration,
   signup, captcha, MFA?
6. **Self-elevation** — can the caller write `role`/`plan`/`is_admin` onto *their own*
   row and become privileged?

This module owns the *class*. `modules/authz-idor.md` owns the per-object ladder that
this is the same defect at the BaaS layer; load both when the target is BaaS-direct.

## Why

The strongest evidence is a contrast inside one ecosystem of audited SPAs, all built
React + Supabase **from the browser**:

- One leaked a full user list — an unauthenticated RPC returned `id, email, created_at`
  for ~9,729 users (`HARDENING-PLAYBOOK.md` §1; `FRAGILITIES-CATALOG.md`, client catalog).
  **Critical.**
- Another (the most recent, PrintCal) was **mostly hardened and still had a real gap**:
  every admin RPC answered `401 permission denied` / `400` with the function's own
  "admin required" raise, the user tables were RLS-scoped (`user_profiles` returned one
  row — the caller's own), the aggregate admin *views* returned zero for anon, and
  storage listed no buckets. But **one table** (`suppliers`) had no owner scoping: anon
  read all 22 rows across 11 owners, 17 of them flagged private — and any authenticated
  account could read another owner's rows by id. A second table (`classifieds`) exposed
  `contact_email`, `email`, `whatsapp_number`, `publisher_name` to any logged-in account.
  **Medium, LGPD.** (`FRAGILITIES-CATALOG.md`, PrintCal section.)

Two lessons that generalize:

- **"Hardened in most places" is not a verdict — the matrix is.** Authz at the BaaS layer
  is per-table and per-function; one missing policy out of eighty is a live leak. The only
  honest output is a row per table/function with its anon result and its authenticated
  result.
- **The two denial layers are different findings.** A `401` with Postgres code `42501`
  (`permission denied for function/table`) is the *platform* refusing; a `400`/`401` with
  the function's own `P0001` and a message like "admin required" is the *function*
  refusing. Both mean "gated", but only the first survives a function that was mistakenly
  marked `SECURITY DEFINER`. Record which layer answered.

**Client-side "bypass" is cosmetic when authorization is server-side — and that is a
result, not a failure.** A browser extension that forced `is_admin=true`, rewrote the
profile to `role:"admin"`, and substituted the admin reports changed only the UI; the
server kept answering `401`/`P0001` and the real `is_admin(uid)` stayed `false`. The same
extension technique against a system that decided admin in the client leaked data
(`modules/authz-idor.md`; `HARDENING-PLAYBOOK.md` §1's bypass column). **Run the bypass and
compare it against the raw transport (`XHR`, not the patched `fetch`) before calling a
system bypassable.**

**Self-elevation is worth one probe, and its block is evidence too.** `PATCH
/rest/v1/<profiles>?id=eq.<own-uid>` with `{role:"admin"}` answered `400 P0001 "only
admins can change profile roles"` — a DB trigger, not RLS. That single probe tells you the
privilege field is guarded where it matters; a system that accepts it is a Critical. The
probe writes to **your own** row only (allowed for a live audit) and must be reverted if it
succeeds.

**A dataset can be the asset, and the bundle is a delivery channel.** The same app shipped
its ~3,500-item filament catalog **inside a client chunk** (1.8 MB), downloadable with no
login and no Supabase call — the column-exposure product was itself the exposure
(`modules/secrets.md`, "the bundle" surface). Whether it is a finding depends on the
source: a catalog seeded from a public database is provenance; a curated proprietary one is
an asset leak.

**An entitlement/role field the owner can write is the bypass — and its *block* is the fix.**
Three audits, three outcomes for the same idea (the client's plan/privilege):
- **HypeBuild3D (High):** the owner's own `users/<uid>.subscriptionStatus` was **writable**
  (`PATCH … → 200`) and drove `hasPremiumAccess(status)` → **self-granted Premium**, no
  payment. A writable privilege field is a Critical/High, not a nit.
- **EiPrint (blocked):** `isPremium`/`premiumExpiry` on the own doc → **`403`** (rules protect
  it) → premium server-enforced; the write attempt is the evidence of the control.
- **PrintGest (blocked at the DB):** `PATCH profiles.role='admin'` → **`400 P0001`** "Apenas o
  Admin pode alterar cargos" — a **trigger**, not just RLS.
Rule: the privilege/plan field must be **immutable by the client** (rules deny the column, or a
trigger/`SECURITY DEFINER` decides it, or a custom claim set server-side). Probe it on **your own
row** and record the denial code.

**A collection you can *list* makes its per-item token meaningless — and it is enumerable.**
EiPrint's `publicQuotes`: anon `GET` on the collection returned **all 14 docs** across 5 owners,
including `clientName` (PII), `ownerUid` and the **`token`** (the secret of the share link). The
design ("open by link/token") presupposes the collection is **not listable**; a `list` policy that
returns rows to anon exposes everything and reduces the token to decoration. Verify with
`Prefer: count=exact` + `Range: 0-0` (measure, don't dump), then inspect **field names** of one doc
(mask values) to classify PII. Distinct from a public catalog by design (`plans`, `announcements`,
`service_types`) — those are intended; a share/secret collection is not.

**A public key that reaches *public* catalogs is not the finding; a key that reaches *other
tenants'* rows is.** PrintGest (multi-tenant) was clean: anon saw `*/0` on every data table
(RLS org-scoped) while `plans/addons/announcements` were intentionally public (206). Contrast
with the tenant-scoped tables — the matrix, not a single probe, is the verdict.

## How to verify

White-box first: enumerate the surfaces, don't sample. The client bundle names every table
and function it calls — extract the surface from the code, then prove it against the live
host.

```bash
# The full call surface, from the built chunks (placeholder repo path)
grep -rhoE "\.from\(['\"][a-z0-9_]+['\"]"  <build>/assets | sort -u   # tables
grep -rhoE "\.rpc\(['\"][a-z0-9_]+['\"]"   <build>/assets | sort -u   # functions
```

Then, live and read-only, against the named target, with the **public key** (placeholders —
never a real key in this skill):

```bash
B="${SUPABASE_URL}"; K="${ANON_KEY}"; T="${YOUR_JWT}"      # your own session only
# 1. RPC reachability: anon, then your token. Record status + the error CODE.
for f in <functions-from-grep>; do
  curl -s -o /dev/null -w "%{http_code} $f\n" -X POST "$B/rest/v1/rpc/$f" \
    -H "apikey: $K" -H 'Content-Type: application/json' -d '{}'
done
# 2. Per-table RLS: MEASURE, never dump. Count exact, one row of schema.
for t in <tables-from-grep>; do
  curl -s -D - -o /dev/null "$B/rest/v1/$t?select=id&limit=1" \
    -H "apikey: $K" -H "Authorization: Bearer $K" -H 'Prefer: count=exact' -H 'Range: 0-0' \
    | grep -i content-range
done
# 3. Views: same as tables — an aggregate view that returns rows to anon is the finding.
# 4. Storage: list buckets, then objects (both anon and token).
curl -s "$B/storage/v1/bucket" -H "apikey: $K" -H "Authorization: Bearer $K"
# 5. Auth config (what is public): providers, signup, captcha, MFA, enumeration posture.
curl -s "$B/auth/v1/settings" -H "apikey: $K"
# 6. Self-elevation: your own row only; expect a P0001 trigger refusal.
curl -s -X PATCH "$B/rest/v1/<profiles>?id=eq.$YOUR_UID" \
  -H "apikey: $K" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"role":"admin"}'
```

The authenticated pass is what turns "anon can't" into "and neither can a logged-in
stranger". Use **your own** account, and only your own. Cross-tenant checks read the
**column that names the owner** plus a count — never the payload of a third party.

**Then crawl the privileged surface, capturing response bodies.** Reload each admin route
with the network recorder on and read `Network.getResponseBody` for every BaaS call: the
denial codes (`401 42501` / `400 P0001`) are the evidence that the reachable data is *all*
there is — no hidden store the client-side view left out. Pair this with
`modules/evidence-parity-and-provenance.md` when the collected data is being reproduced.

## What "covered" means (with evidence)

- **A table × {anon, your token} matrix** with the `count=exact` total and the verdict per
  cell, plus the `42501`/`P0001` distinction where denied. An empty `200` is NOT a pass
  until the code side confirms the policy — see false positives.
- **Every function that returns another tenant's data shown gated**, with the exact denial
  code, and the one(s) that are not named as the finding.
- **Views classified**: `security_invoker=true` (respects RLS) vs `security definer`
  (checked live, not read from a migration that may not be applied — `modules/deploy-drift.md`).
- **Storage proven non-listable** for anon *and* authenticated, or the exposed bucket named.
- **The self-elevation probe result recorded**, whichever way it went.
- **Every cross-tenant read is captured in full into the client's SQLite** (`apps/<app>/_data/<app>.db`),
  PII included — that DB is the deliverable, not a masked sample (`SKILL.md` §3).

## Known false positives

- **A public catalog is not a leak.** `blog_posts`, `roadmap_items`, `system_announcements`,
  manufacturer/model catalogs are readable by design. Read the intent (the storefront shows
  them unauthenticated) before filing. The finding is owner-scoped data (a supplier, a
  client, an order, a lead) reachable across tenants.
- **A `200` with an empty list for a foreign owner is not automatically safe.** Consistent
  with a correct policy *and* with a policy that silently swallowed the query. Confirm the
  policy in code before calling it clean (`modules/authz-idor.md`, same trap).
- **The public key in the bundle is expected, not a finding** (`modules/secrets.md`). The
  finding is what the key reaches. Do not file "anon key in JS" as the vulnerability.
- **An aggregate view returning zeros may be correct.** A dashboard view that returns
  `{users:0,...}` to anon is either filtering to the caller (safe) or genuinely empty;
  distinguish by probing with a token and by reading the view's definition/`security_invoker`.
- **A user UUID in a public payload is pseudonymous, not PII** in the strong sense — record
  it as a Low/LGPD correlation item, not as a data breach. E-mail/phone/name is the real PII.
- **A `401` from the edge (Cloudflare/WAF/captcha) is not the app's authorization.** Note
  which layer answered; the app's own check must still exist underneath.
- **`is_admin` "true" in the client is not admin.** A spoofed client value, an extension, or
  a patched bundle proves nothing about the server — always re-read the value over the raw
  transport (`XHR`) as in the "cosmetic" note above.
- **A dataset embedded in the bundle is only an asset leak if the source is not public.**
  A seed from an open database is provenance; a curated proprietary catalog is the asset.
  Say which, per `modules/secrets.md`.
- **A dataset the UI shows larger than the API returns is not a hidden store.** It may be
  bundle-embedded or a UI-derived count (merge/dedup). Capture the response body the page
  itself received — if it is empty, the number is UI-side. See
  `modules/evidence-parity-and-provenance.md`.
