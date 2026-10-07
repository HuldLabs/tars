# Module — write-path authorization (BFLA, privilege/plan tampering, mass assignment)

> **Related:** `authz-idor` (the read ladder this completes), `hardening-baseline` (#1/#2/#4 on
> writes too), `defensive-posture` (entitlement is a write), `ai-code-flaws`.

## What it tests

Whether authorization holds on **state-changing** requests — `POST`/`PUT`/`PATCH`/`DELETE`, RPCs
that mutate, and "activate/claim/upgrade" flows — not only on reads. Four shapes:

- **BFLA (vertical):** call a privileged write without the role (grant self a plan, change a role).
- **Write-IDOR (horizontal):** mutate, delete, or reassign **another tenant's** object.
- **Privilege/plan tampering:** set your own `plan`/`role`/`is_admin`/quota fields.
- **Mass assignment:** send extra fields (`isAdmin`, `plan`, `credits`) the UI never offers.

Reads show *exposure*; writes show *integrity, privilege and money*. The most damaging outcomes
(account takeover, billing fraud, data tampering) live here, and a read-only sweep cannot see them.

## Why

The contrasting evidence is already in the catalog:

- **A control that only a write test can find (PrintCal):** `PATCH /rest/v1/user_profiles?id=eq.<self>`
  with `{role:'admin'}` → `400 P0001 "Only admins can change profile roles"`. A **DB trigger** on the
  write path — invisible to any read probe — and the single strongest piece of evidence in that
  engagement. Without it, "no exposure found" would have left "can I promote myself?" unanswered.
- **The same pattern, un-tested and money-shaped (CordeiroFlow):** `rpc/affiliate_balance(user_id)`
  **trusts a client-supplied uid** on read; the write correlate (crediting an affiliate via that uid)
  was never exercised — exactly where privilege escalation becomes fraud.
- **Mass assignment is a write bug (Primu3D):** the *only* reason it did not bite was a server-side
  **field whitelist** — a property of the write handler, not the reader.

The discipline the read-only rule needs: you may **write to your own objects and revert**, never to
another tenant's. A probe that mutates a foreign object is out of scope even to "prove" a finding;
an attempt that is **refused** (no state change) is enough evidence, and you verify the no-op by
**re-reading** your own view afterward.

## How to verify

White-box first: enumerate write handlers and, for each, the check on *that* object/role.

```bash
# state-changing handlers / server actions
grep -rn "export async function \(POST\|PUT\|PATCH\|DELETE\)" apps/*/src
grep -rn "\.insert(\|\.update(\|\.upsert(\|\.delete(" apps/*/src | head
grep -rn "set_user\|update.*role\|plan\s*[:=]\|is_admin\|credits" apps/*/src
```

Then live, **only on your own account/objects**, each probe reverted and re-read to confirm no-op:

1. **Self privilege:** `PATCH …/user_profiles?id=eq.<self>` `{role:'admin'}` (or `plan:'pro'`) → expect
   `4xx`/trigger (PrintCal) — a `200` that **stuck** is Critical; a `200` that did **nothing** (re-read
   shows unchanged) is a no-op handler, not a bypass.
2. **Mass assignment:** include `is_admin`/`plan`/`credits` in a normal profile update → expect ignored
   (whitelist); re-read to confirm.
3. **Cross-tenant write:** `PATCH`/`DELETE` a **foreign** id → expect `403` **and no state change**;
   never target a real tenant's row — use a non-existent/own-decoy id where possible.
4. **Admin write without role:** call a privileged write RPC as a non-admin → expect `403`.
5. **Client-uid RPC:** call a balance/credit RPC passing a foreign uid → expect `4xx`; a `200` making
   the caller's number move is the money finding.

## What "covered" means (with evidence)

- A **write matrix**: endpoint × {own / foreign / no-role} × status + **post-state re-read**.
- **Every successful self-write shown reverted** (or shown legitimate), with the before/after.
- The **privilege field's guard named** where it exists (trigger/RLS/whitelist) — a control, not a silence.
- Client-uid RPCs explicitly classified: *derived from session* vs *trusted from input*.

## Known false positives

- **A `400` on a malformed body is not a control** — only a well-formed, in-scope write that is refused counts.
- **A `200` is not a bypass unless it changed state** — re-read; an idempotent/ignored update is safe.
- **A successful update to *your own* legitimate field is not a finding** — the question is the
  *privilege* field and *foreign* objects.
- **A write that fails at the DB (constraint/trigger) is still a control**, even without a clean `403`
  (PrintCal's `P0001` from a trigger is the proof).
- **Do not test writes against third parties** to "make it real" — a refused attempt plus a no-op
  re-read is the evidence; mutating a real tenant is a breach, not a test.
- **Soft-403 (`HTTP 200` + error body) is not a pass and not a bypass** — some dispatchers answer
  `200 {"error":"Acesso negado"}` for a denied action. Classify by the **body**, not the status
  code, and for a write **re-read the effect**: a 200 that changed nothing is a no-op handler (safe);
  a 200 that changed state is the finding. Report which shape (HTTP `403` vs soft-`200`) answered —
  they are different controls. (Seen in a single-dispatcher PHP app; also list this in the read
  ladder's false positives, `authz-idor`.)
