# Module — Clerk-gated apps

> **Related:** `nextjs-ssr` (where this usually appears), `auth-bypass`, `stubs-and-mocks`.

## What it covers

Apps whose auth is Clerk (React/Next), where `@clerk/nextjs` components read a global
`window.Clerk` and throw if it isn't a valid logged-in state.

## Why (the incident)

Primu3D: with the external `clerk.primu3d.com/...clerk.browser.js` script removed, the app
threw **"Invalid state"** from `@clerk/nextjs`, because the auth-state builder in the bundle
expected the provider. Two-part fix (`apps/primu3d/EXTRACTION.md`):
1. inject `clerk-stub.js` defining a **logged-in** `window.Clerk` (session + org + pro plan)
   with every internal/experimental and component method (`mount`/`unmount`) as no-ops;
2. **patch the bundle** — the function `c` that builds the `useAuth` auth-state (`M2:()=>c`)
   was changed to **always** return logged-in (`tools/clients/patch-primu-auth.js`).

## How to extract

1. Remove the Clerk `<script>` from the captured HTML.
2. Inject `clerk-stub.js` before the bundle; define `window.Clerk` with the shape the app reads.
3. Patch the auth-state builder to always return a signed-in state.
4. Keep the app's own guards — you're supplying the session, not deleting checks.

## What "done" means

- The app behaves as a signed-in user (name/avatar/plan render); no "Invalid state".
- Reload on a sub-route stays signed-in.

## Known pitfalls

- **Re-download ⇒ re-apply** the patch (`patch-primu-auth.js`) — it's on the copy, not the source.
- Clerk exposes many **internal/experimental** methods; stub them all, or a call throws.
- The `Account Portal` (`accounts.<domain>`) is out of scope for the mirror.
