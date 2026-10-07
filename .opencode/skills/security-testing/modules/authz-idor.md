# Module — authorization per object (IDOR/BOLA/BFLA)

> **Related:** `baas-direct-exposure` (same ladder when the browser talks to the BaaS
> directly — denial codes and the measured matrix), `injection` (how identifiers are
> parameterized), `deploy-drift` (which artifact is answering).

## What it tests

Whether every surface that acts on a *specific object* checks that this caller may act
on **that** object — as opposed to only checking that the caller is authenticated.

Three shapes, all the same defect:

- **Horizontal (IDOR/BOLA):** swap an object id for someone else's.
- **Vertical (BFLA):** call a privileged function without the role.
- **Identity-from-input:** the server accepts an owner/tenant/role identifier **from the
  request** instead of deriving it from the session. This is the parent class — when the
  server derives identity from the session and ignores the parameter, IDOR is not
  "mitigated", it is structurally absent.

## Why

The strongest available evidence that this is *the* class worth testing first is a
contrast, not a single incident. Two client systems in the same ecosystem — React SPAs
talking to Supabase **from the browser** — leaked a full user list (an unauthenticated
RPC returned `id, email, created_at` for ~9,729 users), because authorization was
decided on a surface the client could reach directly. A third, built as Next.js + BFF
with server-side guards, returned `403` on every equivalent attempt and leaked nothing
(`HARDENING-PLAYBOOK.md` §1–§2; `FRAGILITIES-CATALOG.md`, both client catalogs).

The lesson is not "Supabase is insecure" — the same catalog shows RLS present on some
tables and bypassed anyway, and `security-spec.md` §9–§10 carries the same shape
(`INV-SEG-9`: **no identifier handed to the client can, by itself be an
authorization**; `INV-SEG-10`: a `SECURITY DEFINER`-equivalent checks authorization as
its first statement). The lesson is: **where authorization is decided determines whether
it can be bypassed** (`HARDENING-PLAYBOOK.md` §1). Our equivalent of the safe column is
`INV-SEG-12` (the browser never calls `/wp-json/**`; cart/checkout goes through the BFF)
and `INV-SEG-6` (a Server Action re-checks auth inside itself).

The AI-code specific amplification: generated code reliably does authentication ("is
logged in?") and forgets **authorization per resource** ("may this user see *this*
one?"), and reliably adds a new route handler without its guard
(`primu3d-ai-code-test-plan.md` §1.1, §1.4; `modules/ai-code-flaws.md`).

## How to verify

**White-box first** — enumerate the surfaces, don't sample them:

```bash
# Every route handler / server action that takes an object identifier
grep -rn "export async function \(GET\|POST\|PUT\|PATCH\|DELETE\)" apps/web/src/app apps/id/src/app
grep -rn "'use server'" apps/web/src apps/id/src
# Owner/tenant/role identifiers arriving from the request
grep -rn "searchParams.get(\|params\.\(id\|slug\|userId\|orgId\)\|formData.get(" apps/web/src apps/id/src
```

For each one, answer and write down: what object does it act on, and what in the code
is the authorization check for *that* object?

**Then one read-only probe per surface**, against our own host, using only your own
session (never a real customer's, never a credential you found):

1. Level 1 — no session at all → expect `401`.
2. Level 2 — your session, your object id → expect success (the positive control; a
   matrix where everything is `403` has proven nothing).
3. Level 3 — your session, a **foreign or non-existent** object id → expect `401/403`,
   and expect the body to carry **no data**.
4. Level 4 — the same object via a *different* entrypoint (a second route, a batch
   endpoint, an export, an SSE stream) — the sibling endpoint is where the missing
   guard usually lives.

**At the BaaS layer (Supabase/Firebase-direct), the same ladder is a table × {anon,
own-session} matrix — and it is measured, not dumped** (`modules/baas-direct-exposure.md`):

- Use `Prefer: count=exact` + `Range: 0-0` to get the row total and one schema row, never
  the payload. The finding is "anon can read 22 rows across 11 owners", not a copy of the
  rows.
- Record *which* denial layer answered: `42501 permission denied` (platform) vs the
  function's own `P0001` "admin required". Both gate; the first is the one that survives a
  function accidentally marked `SECURITY DEFINER`.
- One extra probe: **write the privilege field on your own row** (`PATCH … {role:"admin"}`).
  A DB-trigger refusal (`P0001 "only admins can change profile roles"`) is evidence the
  privilege field is guarded where it matters; acceptance is Critical. Your own row only,
  and revert if it succeeds.

## What "covered" means (with evidence)

- **A route inventory with a verdict per route**, each verdict backed by the probe's
  real status code and body — not a sample. `primu3d-report.md`'s evidence table is the
  shape to copy: one row per vector, the exact request, the result.
- **"No such route exists yet" is a result, and it needs the grep that proves it.** The
  audit's cleanest answer in this class was structural: no user-scoped resource route
  exists at all (`/conta/*` has no auth check → `MEDIUM-4`, and `getAccountPayload()` is a
  hardcoded fixture at `mock-bff.ts:648-657`), and the only two routes taking a client id
  are the theme routes. The grep that establishes it —
  `grep -rn "params\.\(id\|slug\|key\|userId\|orderId\|customerId\|orgId\)" apps/web/src`
  → only the two theme routes — is what turns "I found no IDOR" into a bounded claim about
  an enumerated surface. Probes alone cannot show that: absence of a probe target reads
  exactly like absence of a finding.
- **Every parameter that names an owner is either ignored or checked** — and you can
  say which. "Ignored (identity from the session)" is the stronger answer; state it
  explicitly when true, because it changes what a future refactor can break.
- **At least one sibling entrypoint probed per resource**, since a guard added to one
  route is not a guard added to the resource.
- A clean run has **evidence of the positive control succeeding** — otherwise you
  cannot distinguish "blocked" from "broken".

## Known false positives

- **`200` with an empty list is not a pass.** In the audited catalog, an endpoint
   answered `200` and empty for a foreign owner parameter — recorded as "probably ignores
   the parameter (safe); confirm on the code side" (`FRAGILITIES-CATALOG.md`, P8). An
   empty result is consistent with *both* safe behaviour and a guard that silently
   swallowed the query. Confirm in code before calling it clean.
- **`200` with an error body is a denial, not a pass (soft-deny).** A single-dispatcher API can
  answer **HTTP 200 + `{"error":"Acesso negado"}`** for an admin-only action while returning `403`
  for another — so a sweep that classifies by **status code** marks both the open and the closed
  action "ok". Classify by the **body** (`error`/`ok`), and re-read the effect for writes. The
  inverse also bites: `trocarPlano` answered `200 {"error":"Plano invalido"}` for a non-purchasable
  plan — a **validated** input, not a broken one (`write-path-authz`).
- **Confusing the two denial layers.** `42501 permission denied` (Postgres refused the
  function/table) and `P0001` raised *by* the function ("admin required") are both
  "blocked", but they are different controls with different blast radii. Record which one
  answered — a function that relies on its own `P0001` while being `SECURITY DEFINER` is
  one edit away from open (`modules/baas-direct-exposure.md`).
- **A user UUID in a public payload is not "data loss".** Record it as a Low correlation
  item; severity tracks e-mail/phone/name/financial data, not the id alone.
- **`403` from the edge is not authorization.** A Caddy matcher, Cloudflare Access, or
  a WAF rule returning `403` says nothing about the application's own per-object check.
  Note which layer answered.
- **An unauthenticated endpoint taking a client-supplied id is not automatically IDOR —
  ask whether the id is a secret at all.** The theme routes (`api/themes/route.ts:15-20`)
  are unauthenticated **by design**, with the reasoning written down: "which theme ids
  exist is not secret". They are regex-gated (`THEME_ID_PATTERN`) before any `path.join`
  anyway. IDOR is about reaching *someone else's object*; an id that names no owner and
  guards nothing is a different, smaller question — record which one you are answering.
- **A route serving a hardcoded fixture is LATENT, and its severity is about what the
  payload becomes.** `MEDIUM-4` is `/conta` rendering with no auth check *and* a fixture
  payload — the audit's own words are "a latent CRITICAL: the moment `getAccountPayload()`
  reads real order history, the route serves it to anonymous callers". Severity for a
  latent object-level gap is set by the resource it will carry, not by the placeholder it
  carries today; say both, so the finding is not dismissed as harmless *or* escalated as
  though real data were exposed.
- **A `404` where you expected `403` may be deliberate** (not leaking existence) — but
  it may also mean you are probing a route that does not exist under that spelling.
  Distinguish by probing a route you *know* exists and comparing.
- **Same-body different-status traps:** if two levels return identical bodies and
  different statuses, trust neither until you have re-run with the positive control.
- **Admin-only routes returning `403` for a non-admin prove the guard exists, not that
  it is complete** — probe the admin surface with an admin session too, for the
  object-level check beneath it.
- **A single dispatcher (`api.php?action=`, or one RPC name) has no route inventory to sample**
  — the unit of coverage is the **action**, not "the API". Enumerate **every** action from the
  client bundle and classify each × {anon, own-session, foreign}: in one app 4 actions were `401`
  for anon while **18 sibling read actions returned `200`** (member list, phones, partner emails).
  Sweep an undocumented-action wordlist too (`admin/dev/debug/root/impersonate/install/sql/export`)
  — an unknown action usually answers a typed error, cheaply proving there is no hidden one.
- **Soft-`200` denial** — a dispatcher may answer `HTTP 200 {"error":"Acesso negado"}`. The status
  is not the verdict; classify by the body (see `write-path-authz`).
