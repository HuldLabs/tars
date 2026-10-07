# Module — client-supplied identity (role / account-type / plan trust)

> **Related:** `authz-idor` (identity-from-input is its parent class), `write-path-authz`
> (mass assignment is the body channel), `baas-direct-exposure` (entitlement the owner can write),
> `defensive-posture` (paid-feature unlock). Answers: "can the caller **change who they are** by
> controlling a value the server reads?"

## What it tests

Every channel through which a client can name its own **role / account type / plan / privilege**
and whether the server **derives authorization from the session** or **trusts the input**:

- **cookies** (`role=admin`, `is_admin=1`, `account_type=admin`, `adminAuth=1`…)
- **query params** (`?role=admin`, `?plan=pro`)
- **headers** (`X-Role`, `X-Account-Type`, `X-Forwarded-User`…)
- **localStorage / sessionStorage** flags the SPA reads for UI gating
- **request body** (mass assignment — see `write-path-authz`)

A server that derives identity from the session ignores all of them; a server that trusts any of
them is one `curl` from privilege escalation.

## Why

Two engagements, opposite outcomes on the same class:

- **Client-side gate that was real (querovender):** the admin panel was unlocked by a
  `localStorage.adminAuth` flag — forcing the flag surfaced the admin UI, and the server only
  barred the admin **actions** (403). A client-trusted role, even when the server held, is a
  finding (it gates by UI, not by authority).
- **Client-side flags that held (this round — `docs/security/ecommerce-pro-report.md`):** the
  multi-tenant Django storefront ignored **every** channel — `role/is_admin/is_staff/account_type/
  plan/tipo_conta/adminAuth` cookies, `?role=`/`?plan=` params, `X-Role`/`X-Account-Type`/
  `X-Forwarded-User` headers, and `localStorage.adminAuth/role/…` — the protected routes stayed
  `302 → home`. And the mass-assignment body (`username,is_staff,is_superuser,role,plan,user_id,
  is_admin`) was whitelisted away; the profile was re-read unchanged. The **positive** result is
  itself the deliverable: role is server-side, so the whole class is structurally absent.

Same test, two lessons: run the **channel matrix**, and report the result as a *control* when it
holds — "the server ignores client identity" is what a future refactor can silently break.

## How to verify

1. Establish the **baseline** on the guarded route(s) with the real session (e.g. `/dashboard/`,
   `/admin/`, `/painel/`): record `status + Location` with **no** injection.
2. Re-request each route with **one channel at a time**; a change in `status/Location/body` is the
   signal:
   ```bash
   # cookies / headers / params
   for c in 'role=admin' 'is_admin=1' 'account_type=admin' 'adminAuth=1'; do
     curl -s -o /dev/null -w "$c -> %{http_code} %{redirect_url}\n" <route> -H "Cookie: <session>; $c"; done
   curl -s -o /dev/null -w '%{http_code}\n' <route> -H 'Cookie: <session>' -H 'X-Role: admin' -H 'X-Account-Type: admin'
   ```
3. **localStorage** needs the browser (CDP): set the candidate keys in-page, navigate to the guarded
   route, and read the result:
   ```js
   ['adminAuth','role','is_admin','account_type','plan'].forEach(k=>localStorage.setItem(k,'admin'));
   location.href='/dashboard/'; // then read location + body
   ```
4. **Body channel:** do the mass-assignment probe from `write-path-authz` (self-owned, reverted).
5. Generalize: grep the public bundle for the tell — `planType`/`isAdmin`/`subscriptionStatus:"active"`
   literals and the routes they gate.

## What "covered" means (with evidence)

- A **channel × route × result** matrix, with the **baseline** (session-only) row beside it — a
  matrix with no positive control proves nothing.
- Either a **bypass** (a channel that changed access) **or** the explicit control: "identity is
  server-side; every channel ignored (`302 → home` unchanged)".
- For localStorage, the **before/after URL + body** after setting the flags.
- Where the role is server-side, **name where** it is enforced (session middleware / role check),
  so a future refactor that moves it client-side is visible.

## Known false positives

- **Echoing a parameter is not honoring it** — `?user_id=1` and `?user_id=999999` returned the
  **same own account** (the param was reflected, not used). Compare the **body identity**, not just
  the status.
- **A UI change with no server effect is cosmetic** — the finding is the *server authority*, so
  re-read a server-rendered protected field; don't stop at the DOM.
- **`302 → home`/`302 → login` is denial, not a bypass** — the redirect target is the verdict.
- **A `403` from the edge is not the app's check** (`authz-idor` false positive applies here too).
- **`X-Forwarded-User`-style headers only matter behind a trusted proxy** that maps them to identity —
  if the app ignores them, that is the positive result, not a gap.
- **An allowlist baked into the bundle is client-side authority.** A hardcoded owner/admin e-mail
  compared in the JS (`user.email === "owner@…"`) is not authorization — it leaks the owner's address
  (Info) and is a control in the wrong layer (Low). The real gate must be server-side (the table/RLS
  that actually serves the data). Report both: the leak, and the fact that the decision lives in the
  client. Grep the bundle for `@` literals; check each against how it is used.
