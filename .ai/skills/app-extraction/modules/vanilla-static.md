# Module — vanilla / static apps & widgets

> **Related:** `node-local-server`, `stubs-and-mocks`.

## What it covers

Plain HTML/CSS/JS apps and embeddable widgets (no framework), single-page or a few pages.

## Why (the incident)

PrintPal Vase (HTML) and Zap3D Calculadora (static) are self-contained and trivial to mirror;
the failure mode when they aren't treated verbatim is the one in the golden rule — recreating
them by hand broke render.

## How to extract

1. Save the HTML/CSS/JS **verbatim**; add `<base href="/apps/<slug>/">` and make refs relative.
2. Serve fonts/images locally; remove tracking `<script>`s.
3. If it's a widget embed, keep its mount contract (a global init function / data attributes).

## What "done" means

- Renders identically offline; the widget's init API still works when embedded.

## Known pitfalls

- **Absolute paths** (`/assets/…`) collide across apps → namespace under the app route.
- Google Fonts / CDN deps silently fail offline — vendor them.
