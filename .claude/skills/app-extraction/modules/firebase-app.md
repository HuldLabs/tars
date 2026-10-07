# Module — Firebase apps (Auth + Firestore + Storage)

> **Related:** `stubs-and-mocks`, `auth-bypass`, `spa-routing-basename`, `live-to-offline-parity`.

## What it covers

SPAs (usually Vite/React) that talk **directly to Firebase** — Auth (`identitytoolkit`/`securetoken`),
Firestore (WebChannel/*Listen* + REST), Storage (`firebasestorage`), AppCheck (`content-firebaseappcheck`).
No app-owned REST API. Proven on a Firebase SPA (Calc3D).

## Why (the incident)

Calc3D: identity/plan live in **Firebase**; nothing works offline unless Auth + Firestore are stubbed.
The bundle shipped an **intentional dev-localhost mode** (mock user in `sessionStorage`, plan override
in `localStorage`, CRM/inventory falling back to `calc3d_local_*`) — gated by `hostname in
{localhost,127.0.0.1,.local}`. Reusing that mode was far cheaper than reimplementing Firebase.

## How to extract

1. **Mirror** the Vite assets (loader + `appBootstrap` + roots + `firebase-*.js` + CSS), `<base href>`,
   patch the router `basename`. (`spa-routing-basename`.)
2. **Stub the network** (`firebase-stub.js`, before the bundle): `window.fetch`/`XHR` answer Firebase
   domains — `GetAccountInfoResponse`, securetoken `{id_token,...}`, `{documents:[]}` for Firestore.
   Removes all external traffic; console shows only "Could not reach Cloud Firestore backend".
3. **Prefer the app's dev-localhost mode** when it exists: seed `sessionStorage['<app>_mock_user']`
   (hostname is `localhost` offline, so the gate passes) + the plan override. This logs the app in
   without touching Firebase Auth.
4. **Disable AppCheck** if it breaks: patch the bundle (`E0=null`) — reCAPTCHA won't run offline.
5. **Admin/role gates** (see below): the admin check is usually a **token claim**
   (`(await user.getIdTokenResult(true)).claims.admin === true`).

## Bundle gate patches (when no dev mode / to unlock UI)

Not all gates are data gates — some are pure **UI redirects** that block an offline copy. Patch
them in the mirrored bundle (documented per app):

- **Route gate**: a `requireAdmin` wrapper that renders `<Navigate to="…">` for non-admin → delete
  the redirect branch.
- **In-page gate**: an `isAdmin ? <content> : <AcessoNegado/>` → force the content branch (`return !0?…`).
- **Nav gate**: a section builder `Sections = t => t ? [...base, adminSection] : base` → always
  include the admin section (`Sections = t => [...base, adminSection]`).

`getIdTokenResult` is **server-verified**; you cannot forge the claim cleanly (the real `User`
method shadows a prototype patch). Prefer the bundle patch over faking the claim.

## What "done" means

- App opens **authenticated/anonymous as designed**, no external requests, 0 exceptions/404.
- Gated screens render (admin sections, PRO-only pages) after the patches above.
- Data is **local** (dev-mode/localStorage) or captured separately (`live-to-offline-parity`).

## Known pitfalls

- **`sessionStorage` mock user survives `JSON.parse` only as data** — any method on it (e.g.
  `getIdTokenResult`) is lost; don't rely on it. Patch the gate, not the claim.
- **AppCheck reCAPTCHA** blocks offline — disable it (`E0=null`).
- Firestore realtime (`*Listen*`) retries forever offline; inert responses stop the errors but the
  subscriptions still log a warning every ~25s (non-fatal).
- Firebase `apiKey` is **public by design**; the real control is **referrer restriction** + rules
  (see the security skill's `hardening-baseline`).
