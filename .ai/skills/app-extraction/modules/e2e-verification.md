# Module — end-to-end verification (CDP)

> **Related:** all modules — this is how "done" is proven.

## What it covers

Proving an extracted app really works: renders on every route, responds to interaction, and has
a clean Network/console — via the CDP tools in `tools/`.

## Why (the incident)

The method's definition of done is browser-verified, not assumed: **zero 404 in Network**, and
the key flow executing. The extracted PrintCal was verified with a route audit (135/136 routes
render) and a click/interaction audit, both CDP-driven (`tools/clients/printcal-audit.js`,
`printcal-click.js`).

## How to verify

- **Routes**: `tools/clients/printcal-audit.js` (or the per-app equivalent) — navigate each route, assert
  body text and no error boundary. **Reload per route**: same-document hash navigation contaminates
  a long-lived SPA (see pitfalls).
- **Interaction**: `tools/clients/printcal-click.js` — click safe elements, assert the app responds
  (route change / value change).
- **Network/console**: `tools/clients/printcal-net.js`, `cdp-eval.js` — status codes, console errors.
- **State**: `cdp-inspect.js` — `localStorage`/session shape.

## What "done" means

- A route audit passes and the app's key flow executes offline; console clean.
- The verification is re-runnable (a script in `tools/`), not a one-off manual click.

## Known pitfalls

- **Same-document navigation contaminates the SPA**: once a route throws, later "routes" render
  the error page. Reload the document (or a fresh tab) per route; the "37/136" cascade in the
  PrintCal audit was exactly this, not a regression.
- A long-lived tab accumulates bad state (stuck progress bar) — restart the tab before judging
  "infinite loading".
