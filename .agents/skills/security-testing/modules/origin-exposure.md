# Module — origin exposure & origin lock-down

> **Related:** `service-subdomain-exposure` (a *live* service host), `edge-allowlist-bypass`
> (a path matcher), `deploy-drift` (which artifact answers), `headers-cookies` (which layer's
> headers you are reading). Answers: "can I reach the origin **around** the CDN/WAF, and does the
> origin accept traffic that bypassed the edge?"

## What it tests

Two halves of the same control:

1. **Origin IP exposure** — a **non-web** subdomain (mail/`mail.`, `smtp`, `vpn`, `ftp`, `direct`,
   `origin`) whose DNS still points at the **origin server**, revealing the IP behind the CDN/WAF.
   Once the IP is known, `Host: <app-domain>` against that IP bypasses the CDN (WAF rate-limits,
   Access, geo rules, bot management).
2. **Origin lock-down** — whether the origin **refuses** requests that did not come through the
   edge (allow-list of the CDN's egress ranges, mTLS, a shared secret header). If it accepts any
   `Host`, the CDN is cosmetic for any attacker who learns the origin IP.

## Why

In a PHP `api.php` engagement (`docs/security/querovender-report.md` §"origin"), the app was
behind Cloudflare and the DNS for a **mail subdomain** exposed the **origin IP**; a request with
`Host: <app-domain>` to that IP reached the origin, and the Cloudflare `403`s that blocked
`/.env`/`/api/config.php` (QVE-12) were the **edge**, not the origin — i.e. the block is bypassable
once the origin is known. The same question recurs in the Fabber bindings ("does the origin accept
traffic that bypassed the CDN?"). This is the classic "the WAF is not the control" finding.
`edge-allowlist-bypass` covers a *path matcher*; this module covers the *network layer beneath it*.

## How to verify

Read-only; do **not** hammer the origin.

1. **Enumerate names** (CT / passive DNS, see `service-subdomain-exposure`) and resolve each:
   ```bash
   for h in mail smtp vpn ftp direct origin cdn mta mx; do
     nslookup "$h.<domain>" | grep -A2 "Name:"; done
   # Also: historical DNS (passive), SPF/MX records often name the origin.
   nslookup -type=MX <domain>; nslookup -type=TXT <domain>
   ```
2. **Compare** each candidate IP to the CDN's published ranges / the app host's A records
   (`dig <app-domain>`). A non-CDN IP that also serves the app is the origin.
3. **Origin lock-down probe (one request):** with the candidate IP, send the app `Host` and compare
   to the CDN answer — a **different** response (or a `200` where the edge gave `403`) proves the
   origin accepts bypassed traffic:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' "https://<APP_HOST>/" --resolve "<APP_HOST>:443:<ORIGIN_IP>"
   curl -s -o /dev/null -w '%{http_code}\n' "https://<CDN_HOST>/"        # via edge, for the delta
   ```
   Also test a path the edge blocks (`/.env`): if the origin returns a **real 404** (not the edge
   `403` html), the block lives only at the edge. **Say which layer answered** (`headers-cookies`).
4. **Never** run a load/DoS probe against the origin; a single comparison request is the proof.

## What "covered" means (with evidence)

- A row per enumerated subdomain: resolved IP, CDN-or-origin verdict, with the `dig`/`nslookup` output.
- The **delta** between the edge response and the origin response for the same `Host`+path (codes +
  a one-line body hint), naming the layer that answered each.
- The verdict stated as a control: **origin locked down** (origin refuses non-CDN traffic) **or**
  **origin exposed** (accepts it) — with the single command that showed it.

## Known false positives

- **A shared/CDN IP is not an origin leak** — many subdomains legitimately resolve to the CDN
  (orange-cloud proxied). The finding is a name resolving **outside** the CDN's ranges.
- **A mail server on the same box is not automatically the web origin** — confirm the IP actually
  serves the **web app** for the app's `Host`.
- **A different `200` at the origin may be the origin's own default vhost** — check the body/Host
  handling, not just the code.
- **`--resolve` to the origin from your own machine still hits the origin** — good; but a local
  `hosts` override to a container tests *your edge + app*, not the internet edge (see `SKILL.md` §4).
- **Passive DNS / CT names can be stale** — a name that no longer resolves is not an exposure.
- **Do not treat the origin exposing `/.env` as proven until you fetched it** — the edge `403` and
  the origin `404` are different results; report the one you actually saw.
