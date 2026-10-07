# Module — realtime (WebSocket) stubs

> **Related:** `supabase-direct`, `node-local-server`, `stubs-and-mocks`.

## What it covers

Apps that wait on a realtime channel (Supabase Realtime / Phoenix sockets) before releasing the
page.

## Why (the incident)

PrintCal: on load the app awaited the realtime channel "joining" and only released the page on
a ~60s timeout. Fix: the server answers the socket `upgrade` with a `phx_join` reply
`{status:'ok'}` (and heartbeat), after which auto-login + hydration completed in ~1.06s
(`docs/METHODOLOGY.md` §4, PrintCal API-MAP "RESOLVIDO: realtime").

## How to stub

1. **Server-side (preferred)**: handle `server.on('upgrade')`; parse the Phoenix frames and
   answer `phx_join`/`heartbeat` with `phx_reply {status:'ok'}`.
2. **Client-side**: replace `window.WebSocket` with an inert object exposing the readyState
   constants and no-op methods — but only when a server handshake is impossible.

## What "done" means

- The page releases promptly (no ~60s stall); realtime-dependent UI renders.

## Known pitfalls

- A malformed WebSocket stub can **black-screen** the app (observed on CordeiroFlow) — prefer the
  server handshake.
- Realtime auth tokens differ per provider; answer the frame shape the client expects.
