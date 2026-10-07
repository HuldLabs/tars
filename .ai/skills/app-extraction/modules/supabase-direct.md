# Module — Supabase-direct apps

> **Related:** `stubs-and-mocks` (shape rules), `auth-bypass` (the `.auth` stub),
> `realtime-websocket` (the ~60s loading trap), `live-to-offline-parity` (real rows).

## What it covers

Apps where the browser talks **directly** to Supabase (REST `.from`, `.rpc`, `.storage`,
`.functions`, `.channel`) with the anon key inlined in the bundle. Typical of Vite/React SPAs.

## Why (the incident)

PrintCal: the whole app hung on load because `navigator.locks` deadlocked in the auth client
(`lock:sb-...-auth-token`, 1 held + 4 pending) — auth pending ⇒ route loaders never resolve ⇒
infinite spinner, modal flicker, inputs losing focus. Disabling the lock removed the deadlock
but the session still didn't hold. The working fix was to **replace only `.auth`** with a stub
that always returns a logged-in user (keep the SDK for data). And the realtime channel had to
answer `phx_join` or the app sat ~60s "loading" (`docs/METHODOLOGY.md`, PrintCal API-MAP).

## How to extract

1. **Repoint the API**: replace every `https://<ref>.supabase.co` literal with
   `http://localhost:<port>/apps/<slug>/sb` (usually 4 chunks carry it).
2. **Auth**: seed a session in `localStorage`, or (better) **stub `client.auth`** — find where
   the client is created and, after construction, return a mock object for `getSession`,
   `getUser`, `onAuthStateChange` (emit `INITIAL_SESSION` async), `signIn*`, `signOut`,
   `updateUser`, `refreshSession`, `getClaims`, `admin.*`. No `navigator.locks`.
3. **REST/RPC mock**: serve list endpoints as `[]`, RPCs in their real shape
   (`true`/object — never a generic `{}` for a list).
4. **Realtime**: answer the WS handshake (`modules/realtime-websocket.md`).
5. **Storage/functions**: return the shapes the app expects (`{Key}`, `{ok:true,data:{}}`).

## What "done" means

- No `*.supabase.co` request remains (Network).
- Every route renders; a CRUD write persists to the local store (if the mock persists).
- Console clean; no lingering `pc-route-progress`.

## Known pitfalls

- **List vs object**: `[]` for lists; a wrong `{}` breaks `.map`.
- **RPC shape** matters per function; sample the real response first.
- **Anon key in the bundle is normal** — not a leak to "fix".
- **The DB row count you get ≠ what an admin sees** (RLS) — not a cloud of hidden data.
