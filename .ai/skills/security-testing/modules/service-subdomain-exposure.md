# Module — service subdomain exposure (non-app services behind the same edge)

> **Related:** `secrets` (the bundle names the vendor/stack), `hardening-baseline` (#8 headers,
> #10 abuse, #11 errors), `deploy-drift` (which artifact answers), `defensive-posture`
> (backoffice/app separation). Answers: "which **other** hosts under this domain answer, and are
> they meant to be public?"

## What it tests

Whether the target domain has **non-application services** reachable on the public internet —
automation (n8n, Airflow), container/edge admin (Portainer, Traefik dashboard, Rancher), CI,
DB UIs (pgAdmin), monitoring, object storage — and whether each is protected (auth, IP allowlist,
edge Access) with secure cookies + HSTS. The app can be a fortress while an ops host next to it
is wide open; the **edge is one domain**, so the weakest host is the real attack surface.

## Why

In the multi-tenant Django engagement (`docs/security/ecommerce-pro-report.md`), the storefront
and the partner API were hardened (per-store key, CSRF, server-side roles) — but Certificate
Transparency listed ops subdomains under the same domain, and **two of them served a live,
unauthenticated-`settings` automation tool (n8n)** on the public internet. The exploit path is
not the app; it is `n8n login → (weak cred / cookie theft, no HSTS + `authCookie.secure=false`)
→ workflow RCE → stored integration credentials (payments, messaging, SMTP)`. A passive name
listing turned into the engagement's highest-severity exposure — found **without touching the app**.

The same day, `portainer`/`traefik` names also appeared in CT but only answered the reverse
proxy's catch-all `404 page not found` — i.e. a name in CT is a **lead**, not a finding.

## How to verify

1. **Enumerate names first, passively** — CT logs, not brute force:
   ```bash
   curl -s "https://crt.sh/?q=%25.<domain>&output=json" | \
     node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=new Set();JSON.parse(d).forEach(r=>String(r.name_value).split('\n').forEach(n=>s.add(n)));[...s].sort().forEach(n=>console.log(n))})"
   # crt.sh 502s: fall back to https://api.certspotter.com/v1/issuances?domain=<domain>&include_subdomains=true&expand=dns_names
   ```
2. **Per name, one read-only GET** on `/`, plus the service's own public probes:
   - n8n: `/healthz` (`{"status":"ok"}`), `/rest/settings` (leaks `authCookie.secure`, version via the `n8n:config:sentry` meta `release`).
   - Portainer/Traefik: `/api/status`, `/api/endpoints`, `/api/rawdata` — a real dashboard answers these; a proxy catch-all returns a Go `404 page not found` (19B, `text/plain`).
3. **Cookie/HSTS posture** of the service host (n8n often ships `secure:false`): read headers, and `curl -sS -D - -o NUL http://<host>/` to see whether plain HTTP is force-upgraded.
4. **CVE triage of the exact version — programmatically, never assume:**
   ```bash
   # list advisories affecting the package, then filter to the running version
   curl -s "https://api.github.com/advisories?ecosystem=npm&affects=n8n&per_page=100&page=1"
   ```
   Parse `vulnerabilities[].vulnerable_version_range` / `first_patched_version` and test the exact
   version against the ranges. In the engagement, **0 of 1000 advisories covered the running build**
   (ranges ended `< 2.37.7` or covered only `>= 2.38.0,< 2.38.2`) → **no CVE claim** (not "probably
   vulnerable"). Caveat the 1000-result API cap; a single source is single-sourced.

## What "covered" means (with evidence)

- One row per enumerated name: `status` on `/` + the service fingerprint + `public?` verdict, with
  the raw body/sha256 (`manifest-key.json`). "Exposed" = it answers a real service, not the catch-all.
- The **cookie/HSTS** result per service host, and the **exact version** where disclosed.
- The **CVE result stated as verified** (list the API query + count filtered), or explicitly "not
  verified" — never a bare "outdated ⇒ vulnerable".
- For a live service: the exposure is the finding even with auth on; escalate only with a demonstrated
  bypass (weak creds tested within policy, or a matching advisory).

## Known false positives

- **A name in CT is not a live service** — `portainer`/`traefik` here returned the proxy catch-all `404`
  (`text/plain`, 19B). Distinguish a real dashboard from a router default.
- **A `200` on `/healthz` is not a compromise** — it proves reachability, not access. `401 Unauthorized`
  on the login/settings route is the **control** (Positive), not a finding.
- **Version disclosure ≠ vulnerability** — filter advisories against the **exact** version; a version
  that is *newer* than every patch (`>= last-patched` and `< next-major-fix`) is **not** affected.
- **`http://` answering `301 → https` (edge "Always Use HTTPS") reduces the cookie-theft risk** — the
  MITM needs a network position and the first plaintext request; record the precondition, don't claim capture.
- **A wildcard `*.domain` answering `500` for any name is not an exposure** — it is a routing/robustness
  gap (host not recognised), not a service; verify the body is the app's generic error, not a stack.
