# Module — webhooks & payment endpoints

## What it tests

The trust boundary of every endpoint that **changes money state**, in this order of
how often each is the actual defect:

1. **Fail-closed** — does a missing/unconfigured secret reject, or does it accept?
2. **Signature on every path** — is verification done *before* any topic/action
   dispatch, including the surprising topics?
3. **Signature over the raw body** — not over a re-serialized parse.
4. **Replay** — is the timestamp (or a nonce) checked, with a window justified from the
   provider's own docs?
5. **Ordering & idempotency** — can a duplicate or out-of-order delivery double-apply?
6. **Reachability** — the endpoint stays public *by design*; the signature is the trust
   boundary, so nothing else may be.

## Why

**HIGH-6, our own audit, 2026-09-21.** The Mercado Pago webhook
(`infra/docker/wordpress/custom-plugins/fabber-mercadopago-orders/includes/class-fb-mercadopago-orders-webhook.php`)
had a **correct** signature implementation — HMAC-SHA256 over
`id:{id};request-id:{rid};ts:{ts};`, compared with `hash_equals` — and was still
exploitable, because of two defects around it:

- `:217-227` **returns `true` when `webhook_secret` is unset** — fail-open. An
  unconfigured environment does not reject; it accepts everything.
- `:41-50` handles **chargeback topics before the signature check**, so that class of
  event bypasses verification entirely.

Both are worth internalizing as a pair: **the crypto being right is not the property.**
The property is that no path reaches a state change without passing through the check.
This is why the module's first two questions are about control flow, not about the
algorithm.

**A webhook is the money-equivalent of `INV-SEG-6`.** Our route is deliberately public
with its `permission_callback` open and the Bearer checked inside the handler — the same
"the guard is inside the handler" shape, chosen because a webhook cannot authenticate as
a WordPress user. The consequence (from the audit's own clean-result table): the
signature is the *only* thing standing between an anonymous POST and a state change,
which is exactly why "verify before dispatch" is non-negotiable rather than stylistic.

**Two reachability forms, both live.** After the edge-matcher fix, `145e1c7` re-verified
both webhook spellings on the dev stack — `?wc-api=fb_mercadopago_orders_webhook` and
`/wc-api/fb_mercadopago_orders_webhook/` — precisely because a security fix at the edge
is the most likely thing to have broken the payment path. A webhook fix that silently
stops deliveries is a production incident; the re-verification is part of the change,
not an extra.

**The reachability control is IaC, and it must exist in both directions.** Our webhook
paths are reachable because `cloudflare_access_apps.py:287-307` creates `bypass` /
`everyone: True` policies for `*/wc-api/fb_mercadopago_orders_webhook/*`
(`cloudflare_tunnel.py:196-230` does the same for dev). That is the correct shape and it is
worth *verifying as code* rather than assuming: the failure mode is silent — a webhook
behind Access is not rejected loudly, it just never arrives, and the store keeps selling
while confirmations stop landing. Which is also why the audit's rule of thumb holds: **a
webhook endpoint behind Cloudflare Access is the finding, not the fix** — the gateway cannot
authenticate to Access.

**The other end of the money path is the gateway *selector*.** `MEDIUM-5`:
`store-actions.ts:125` takes `payment_method` straight from `FormData` with no whitelist and
forwards it to the Store API (`store-api-client.ts:258`), so a client can name any gateway
id. WooCommerce recomputes totals from the product record, so this is **not** a
price-integrity break — but "which rail this payment goes down" is a decision the server
owns, and `modules/payment/` exists precisely to make that decision. Check every
client-supplied value that reaches the money path, not just the amounts (`INV-SEG-8` covers
amounts, which **hold**).

**Efí has no handler here — and confirming that absence is the deliverable.** The audit's
whole Efí section is a negative result: no webhook handler exists in this repo,
`infra/pyinfra/deploy_wp_payment_gateways.py:166-167` registers
`wc_gerencianet_pix`/`wc_gerencianet_cartao` as **installed but disabled**, and
`config/payment_gateways.toml:108` mentions Efí's webhook only as an inventory entry —
nothing to test. Write it down rather than skipping it: "no handler, gateways disabled" is
what makes the next pass cheap, and it is the honest contrast to the MP handler's two
defects.

**Failover is a state machine, not a retry.** Efí is primary, Mercado Pago is fallback
via a circuit breaker in the BFF — for **new** checkout sessions only; an in-flight
transaction never switches gateway mid-flow. Both webhooks stay active at all times and
reconciliation is keyed by **order, not gateway**, and a failover must raise an alert in
both directions (`CLAUDE.md`, Payment section). Each of those is testable.

## How to verify

```bash
# Where the signature is computed, and where it is *called* relative to dispatch
sed -n '1,120p' infra/docker/wordpress/custom-plugins/fabber-mercadopago-orders/includes/class-fb-mercadopago-orders-webhook.php
grep -n "hash_equals\|hash_hmac\|webhook_secret\|chargeback\|return true\|return false" \
  infra/docker/wordpress/custom-plugins/fabber-mercadopago-orders/includes/class-fb-mercadopago-orders-webhook.php
# Every entrypoint that can reach the money path
grep -rn "wc-api\|register_rest_route\|permission_callback\|Bearer" \
  infra/docker/wordpress/custom-plugins/ apps/web/src
sed -n '380,430p' infra/docker/Caddyfile      # the exemptions that keep these reachable
```

Then, live and read-only against our own hosts (never with a real gateway signature):

1. `POST` the webhook with **no signature** → expect rejection and **no state change**.
2. `POST` with a **malformed** signature → same.
3. `POST` a topic that is *not* the one you expect to be verified (the chargeback class)
   with no signature → expect rejection. This is the finding that HIGH-6 was.
4. Confirm the endpoint is still reachable from outside (a plain request should reach
   the application and be rejected *by the application*, not by the edge).

## What "covered" means (with evidence)

- **A control-flow statement, not just a crypto statement:** "verification runs at
  `file:line`, before every branch that can change state" — with the branches
  enumerated. A test that only exercises the happy signed path proves neither half of
  this.
- **The fail-closed branch proven**, ideally structurally: a contract test asserting
  that the missing-secret path rejects, since a live test cannot unset the secret on a
  running environment. The audit's own dispatch allowed exactly this fallback
  ("PHP unit tests if the plugin already has a harness… otherwise a Python contract test
  under `tests/contracts/` asserting the ordering and the fail-closed branch
  structurally").
- **A replay window stated with its source** — the tolerance must be justified from the
  provider's official documentation, not chosen by feel.
- **Both webhook spellings verified live after any edge change**, with output.
- **Idempotency stated per event type**: what happens on a duplicate delivery of the
  same `id`? The answer should be in the code, and reconciliation keyed by order rather
  than by gateway.
- **The public-reachability precondition checked**, because "the guard is inside the
  handler" only holds while the handler is reachable and nothing upstream is silently
  rejecting valid deliveries.

## Known false positives

- **A `200` with an error body is not a rejection.** Confirm the status *and* that no
  state changed — the fail-open bug returned `true`, which the platform reads as
  accepted.
- **A missing secret in dev looks reasonable and is the bug.** "It's only unset
  locally" is precisely how fail-open ships: the branch that returns `true` for an
  unset secret is indistinguishable from a convenience until production inherits it.
  Treat any `if (!secret) return <accepted>` as a finding regardless of environment.
- **The gateway's own retries look like replay.** Distinguish a legitimate provider
  retry (same `id`, same signature, newer delivery timestamp) from a replayed captured
  request *before* tightening the window — a window too tight silently drops real
  deliveries.
- **A signed request that fails on business rules is not a signature failure** — do not
  conflate a `400` for an unknown order with the signature check.
- **The Store API checkout route being publicly reachable is correct** (`INV-SEG-12` puts
  it behind the BFF over `localhost`, with the guest-cart exemption at the edge). Its
  `permission_callback` being open is by design, not the finding; what matters is what
  the handler checks inside.
- **A webhook endpoint behind Cloudflare Access would be the finding**, not the fix —
  the gateway cannot authenticate to Access.
