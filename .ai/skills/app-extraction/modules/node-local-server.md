# Module — the local one-port server

> **Related:** all serving modules; `powershell-windows` for the process gotchas.

## What it covers

The shared server (`server/index.js`, port 8081) that hosts the hub, every app under
`/apps/<slug>/`, and the mocks — plus per-app servers on their own ports (Primu3D :8083).

## Why (the incident)

The hub + 18 apps + mocks + a realtime handshake needed to coexist offline on one port. Two
recurring traps bit us: port **8080** is taken by `wslrelay`/Docker (use 8081), and hidden
`Start-Process` can kill the server (`docs/METHODOLOGY.md` §7).

## How to build it

1. **Static** with a complete MIME map (js, css, wasm, hdr, 3mf, gif, webp, woff2, bin…).
2. **SPA fallback**: unknown paths under an app → that app's entry HTML.
3. **Mocks before static**: route `/apps/<slug>/sb/*`, `/api/*`, etc. to mock handlers.
4. **CORS** on, for workers/popups; **WebSocket upgrade** handler for realtime apps.
5. Absolute-path assets per app (`/assets/*`, `/fonts/*`) served from the app root.

## What "done" means

- One command serves everything; zero 404 in Network across apps; hub links resolve.

## Known pitfalls

- Kill the port by owner: `Get-NetTCPConnection -LocalPort 8081 | Stop-Process`.
- Zombie `node` processes cause phantom 404s — kill all before restart.
- Don't hide the process window if it dies silently; set `-WorkingDirectory`.
