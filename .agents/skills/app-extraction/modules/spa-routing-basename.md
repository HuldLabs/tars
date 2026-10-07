# Module — SPA routing under a sub-path

> **Related:** `vite-rolldown-spa`, `nextjs-ssr`, `node-local-server`.

## What it covers

Getting a client-side router (React Router, TanStack Router) to run under `/apps/<slug>`
instead of `/`, and choosing between a basename patch and an isolated port/iframe.

## Why (the incident)

CordeiroFlow: `BrowserRouter` reads `window.location.pathname`; served under a sub-path it
matched no route. The minified constructor was `function ije(e){let{basename:t,...}=e;…}`;
inserting `t=t||"/apps/cordeiro-flow";` fixed it. The general alternatives are tabulated in
`docs/METHODOLOGY.md` §4.

## How to extract

1. **Hash routing** (`#/route`): no patch needed — the pathname is constant.
2. **History routing**: patch the router constructor's `basename` (one line), or
3. **Serve at its own port** (like Next.js) and let the hub iframe it.
4. Never use `history.replaceState('/')` — it hijacks the URL and breaks coexistence.

## What "done" means

- Deep links and reload on a sub-route work under the local base.
- The hub can navigate to the app without a URL collision.

## Known pitfalls

- Router may be TanStack (`createRouter`) not React Router — find the equivalent creation site.
- Nested `<base>` + relative links can double-apply; keep one strategy.
