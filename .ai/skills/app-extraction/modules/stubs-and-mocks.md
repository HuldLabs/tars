# Module — stubs & mocks

> **Related:** `auth-bypass`, `supabase-direct`, `realtime-websocket`.

## What it covers

Neutralizing the real backend at the earliest possible point: `window.fetch`, `window.WebSocket`,
analytics/captcha/Sentry providers, and third-party scripts.

## Why (the incident)

Mocks that return the wrong shape are the #1 "why is the page broken offline" cause. The method
is explicit: **REST lists return `[]`, never `{}`** — real code does `forEach`/`.map` and throws.
RPCs must return their real shape (`true`/object), not a generic value (`docs/METHODOLOGY.md` §3).

## How to stub

1. **Before the bundle runs** (inline `document_start` script or server-injected stub).
2. `window.fetch = (url, init) => …` returning a real `Response` with `Content-Type: application/json`.
3. `window.WebSocket` → inert stub for realtime (`realtime-websocket`), carefully.
4. **Turnstile/Cloudflare**: `Object.defineProperty(window,'turnstile',{get:()=>({render,getResponse,reset,remove})})`.
5. **Analytics** (GA/PostHog/GTM/FB/Clarity/Sentry): `204`/no-op; remove the `<script>` when possible.
6. Prefer a server-side mock (route in `node-local-server`) when the app calls the origin.

## What "done" means

- No live third-party request remains; list screens render instead of "Erro ao carregar".

## Known pitfalls

- **Shape**: `[]` vs `{}`; `{data:[…]}` wrappers; `{success,data}` for auth.
- **Timing**: a stub injected after the bundle is too late — `document_start`.
- **A bad WebSocket stub** can black-screen the app (seen on CordeiroFlow).
