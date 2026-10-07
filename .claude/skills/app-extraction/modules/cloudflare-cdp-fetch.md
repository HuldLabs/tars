# Module — fetching a Cloudflare/WAF-protected source, and the CDP tool family

> **Related:** `powershell-windows` (quoting/process traps), `stubs-and-mocks`, `e2e-verification`,
> `live-to-offline-parity`, `live-api-reverse-engineering`; security side:
> `security-testing/origin-exposure` (origin lock-down / `Host` bypass) and
> `service-subdomain-exposure`. Answers: "the source is behind a challenge — how do I capture it
> without fighting the WAF, and what do I drive it with?"

## What it covers

Reaching and capturing a **Cloudflare/WAF-protected** target for extraction, and the **CDP tool
family** used throughout (evaluate, run a script, screenshot, session save/restore, cookies,
console, per-navigation script injection, SSR/skeleton capture).

## Why (the incident)

Several sources (QVE family, makers3d, PrintCal) sit behind **Cloudflare**. A plain `curl`/`fetch`
gets a **challenge/403**, so the served HTML, the assets and the live requests cannot be read from
the shell. Two working paths were adopted and reused:

- **A real, persistent Chrome driven over CDP** (`--remote-debugging-port` + a fixed
  `--user-data-dir`): it solves the JS challenge like a user, keeps the CF cookie across runs, and
  a **manual one-time login** yields the authenticated session. Fetching **from the page context**
  (`fetch` in-page, same-origin) then carries the CF cookie — the most faithful capture.
- **Camoufox** (`tools/method/camofox-fetch.mjs`) as a headless alternative when no interactive browser is
  wanted.

A second incident: a captured `session.json` **could not be restored** — the auth was a
**server-side PHP session** (no refresh token), so once the server invalidated it, the cookie was
inert. The lesson (also in `php-action-api`): a cookie is continuity, not autonomy.

## How to fetch and drive

1. **Real Chrome + CDP (preferred).** Launch with a persistent profile and read the JSON endpoint:
   `chrome --remote-debugging-port=<p> --user-data-dir=%TEMP%\opencode\chrome-cdp-<p> <url>`.
   The tools connect to `http://127.0.0.1:<p>/json/list` and pick the page by URL substring.
2. **Fetch in-page** (not from the shell): evaluate `fetch(url,{credentials:'same-origin'})` — the
   CF cookie and the origin apply exactly as the app sees them.
3. **Camoufox fallback:** `node tools/method/camofox-fetch.mjs <url> <out>`; pass
   `block_webgl:true, i_know_what_im_doing:true` (Windows gotcha) or it hangs.
4. **Session continuity:** `tools/method/cdp-session.mjs <port> <match> <out.json>` saves
   `{cookies, localStorage}`; `tools/method/cdp-restore.mjs <port> <match> <session.json>` sets them and
   reloads. For a **server-side** session, restoring cookies is **not** enough after expiry — keep a
   dedicated **test-account credential** and auto-login (`login {email,password}`).
5. **CDP tool family** (`tools/`): `cdp-eval.js` (eval an expression), `cdp-run.js` (run a `.js`
   file in the page, `awaitPromise`), `cdp-shot.mjs` (screenshot), `cdp-cookies.mjs`,
   `cdp-console.mjs`, `cdp-net.mjs`, `cdp-inspect.js` (localStorage/session), `cdp-ssr.js` (capture
   the **skeleton** with JS disabled — anti hydration-mismatch), `cdp-addscript.mjs` (inject at
   `document_start`, tied to the session), `cdp-focus.mjs` (bring the window to front for a manual
   login), `app-parity.mjs` + `app-parity-diff.mjs` (per-view action + response-signature parity).
6. **Origin lock-down (security side):** to test whether the origin accepts traffic that bypassed
   the CDN, resolve a **non-web** subdomain (`mail.`) to the origin IP and send the app `Host` with
   `curl --resolve <host>:443:<ip>` — that is `security-testing/origin-exposure`, done once,
   read-only.

## What "done" means

- The source's HTML/assets/requests were captured **despite** the challenge (in-page fetch or
  Camoufox), with the capture time and the session labeled.
- The session is saved (`_auth/session.json`) and, if server-side, a **re-login** path exists
  (test-account credential + auto-login); the run does not depend on one long-lived cookie.
- The specific tool used and the exact command are recorded in the app's `_recon`/`EXTRACTION.md`.

## Known pitfalls

- **Cloudflare cookie ≠ auth.** `__cf_bm` solves the challenge; the app's session (e.g.
  `QVE_FIN_SESS`, `PHPSESSID`) is separate and server-side — never confuse the two.
- **Camoufox on Windows** hangs without `block_webgl:true, i_know_what_im_doing:true`.
- **`cdp-addscript` is per-CDP-session:** inject, navigate and read **inside one connection**, or
  the injected script is gone (same trap as the per-document request buffer).
- **Don't fetch the challenge from the shell** and conclude "the site is down" — it is the WAF
  answering, not the app.
- **Never hammer** the origin or the challenge; one interactive session is enough.
