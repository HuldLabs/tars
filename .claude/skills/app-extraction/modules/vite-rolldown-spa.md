# Module — Vite / Rolldown SPAs

> **Related:** `spa-routing-basename`, `supabase-direct`, `node-local-server`.

## What it covers

Apps built with Vite/Rolldown: a small entry + many **hashed lazy chunks**, a preload helper,
and often `import.meta.url`-relative assets.

## Why (the incident)

PrintCal: route CSS 404'd because the Vite preload helper resolves chunks against a base that
was `/`, while the app was served under `/apps/printcal/`. One-line patch in
`vendor-*-app.js`: `o=function(e){return "<base>"+e}` → `/apps/printcal/` (the helper's
first argument table). ~285 chunks were mirrored; the lazy graph came from `__vite__mapDeps`
and dynamic `import()`.

## How to extract

1. Save the entry `index.html` verbatim; set `<base href="/apps/<slug>/">`.
2. Mirror every `assets/*` chunk + CSS; the lazy names are in `__vite__mapDeps` / `import()`.
3. Patch the preload/`base` helper in the vendor chunk so preloaded CSS/JS resolve under the
   sub-path (a single `return`+string-literal).
4. Hash routing (see `spa-routing-basename`) needs **no** basename patch.

## What "done" means

- Zero 404 across every route (Network), CSS loads per route, lazy chunks resolve.

## Known pitfalls

- The **preload helper base** is the usual 404 source, not the router.
- `new URL("...", import.meta.url)` for workers/WASM needs mirroring too.
- Hashed filenames change on re-extract — re-mirror the whole `assets/`.
