# Module — auth bypass (extraction)

> **Related:** `supabase-direct`, `clerk-auth`, `stubs-and-mocks`; security side: the
> `security-testing` skill's `baas-direct-exposure` and `authz-idor`.

## What it covers

Getting past a login gate to extract the authenticated UI/data, without deleting the app's
checks. Three patterns, in order of preference.

## Why (the incident)

The adopted pattern (LetraMaker/Cordeiro) is **maximum access**: inject a **logged-in user with
the top plan** (`plan_type:"empresa"`, `isAdmin:true`, `subscribed:true`) instead of removing
checks, plus optionally a `MutationObserver` to strip "Bloqueado/Assinar" overlays. For
Supabase-direct apps the cleaner move is stubbing `.auth` (PrintCal); for Clerk apps it's the
stub + auth-state patch (Primu3D). See `docs/METHODOLOGY.md` §3 "Acesso máximo em vez de remover login".

## How to bypass

1. **Max-access seed**: write a session + user into `localStorage`; serve profile/subscription
   endpoints as admin/top-plan.
2. **Auth-client stub**: return a signed-in session from the client's auth API
   (`getSession`/`onAuthStateChange`/`currentUser`).
3. **Provider stub** (Clerk): `window.Clerk` logged-in + auth-state patch.

## What "done" means

- The authenticated surface renders; the app makes authenticated calls successfully (to the mock).

## Known pitfalls

- **Server-side authz still wins** — bypassing the client does not unlock data the server gates
  (this is the extraction vs security boundary; see the companion skill).
- Prefer supplying a session over mocking the *result* of queries when the app derives UI from it.
