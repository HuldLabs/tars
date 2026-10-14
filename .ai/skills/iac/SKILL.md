---
name: iac
description: How to write infrastructure as a declaration — the ficha/host file is the single source of what exists, each recipe ends with a check that fails LOUD, what is manual is written down as manual, and bootstrap (provision the machine) is separated from reconciliation (keep it in the declared state). Covers FQDN over IP, aliases as versioned code, and receipts that prove instead of just run. Load BEFORE writing any deploy recipe, host manifest, provisioning script or GitOps loop.
---

# IaC — infrastructure by declaration

> **Origem (R1):** portada de `homelab-infra/README.md` + `docs/decisoes.md` +
> `.../gitops-docker.md`; a escolha pyinfra+Pulumi vem do **Fabber** (a ideia, nunca
> credenciais/hosts). Nenhuma skill equivalente existia em `/projects/*/.ai/skills`,
> `/projects/*/.claude/skills` ou `/projects/fabber*`. Registro em `docs/CURATION.md` §3.

**A declaration is the single source of what exists.** Everything below follows from
taking that sentence seriously: the machine, the deploy and the check all read from the
declaration, and nothing lives only in someone's head or in a web panel.

## 1. The ficha/manifest is the single source

- The declared set (a host file, a manifest, a config) is **what exists**. What is not
  declared is treated as drift or as garbage — never as "oh, that one we set up by hand".
- Each host/context has its **own ficha**, and the ficha is both **inventory and manifest**:
  it lists what is there *and* drives the recipe that puts it there. One artifact, two
  readings — so they cannot disagree.
- The declaration is **versioned**. "What the infra looks like" is a decision with a history
  and a reason; a change to it shows up in review like any other change.
- **Reconciliation** compares the world to the declaration and reports both directions:
  declared-but-missing (a regression) and present-but-undeclared (a discovery — declare it or
  remove it). This is what keeps the declaration honest as the world changes underneath it.

## 2. FQDN, never IP

- Refer to a service by its **name** (FQDN), not its address. The address is where it
  happens to be today; the name is what it *is*. Hard-coding an address bakes a snapshot of
  the network into every dependency.
- Internal DNS is its **own single source** — the resolver config declares the names, and
  everything else consumes them. Nobody re-types the list in a second place (that second
  place is the one that goes stale).
- A UI/panel alias is **versioned code**, not state living in the panel's database. What is
  clicked into a web form cannot be reviewed, diffed or restored; what is in the repo can.

## 3. A recipe ends with a check that fails loud

**"It ran" is not "it worked".** Every recipe closes with a check that **fails** if the
declared state was not reached — connection established, service answering, resource
present. Exit 0 from the last command in a script is not a proof.

- The check asserts the **outcome the ficha declares**, not that the steps executed. A
  recipe that ran all its steps and left the service down must exit non-zero, naming what
  is missing.
- Checks are **cheap and local** to the recipe — the point is that the recipe cannot lie
  about its own result.
- A recipe without a check is a plan, not a delivery. (R4: fail fast and loud.)

## 4. Bootstrap ≠ reconciliation

Two different jobs, two different tools — do not merge them.

- **Bootstrap** provisions the machine: the base OS state, the packages, the things that
  exist *before* the workload can run. It runs rarely, on a fresh host.
- **Reconciliation** keeps the workload in the declared state, continuously — it is the
  loop, not the install. It assumes a bootstrapped machine and converges from there.
- They fail differently and are debugged differently: a bootstrap failure means the machine
  is not ready; a reconciliation failure means the machine drifted. Merging them makes a
  drift look like a fresh install and re-runs bootstrap on a running host.

## 5. What is manual is written down as manual

- Anything a human must do (a one-time approval, a DNS record at a registrar, a physical
  action) is **explicit in the doc**, with the reason it cannot be automated. Hidden manual
  steps are the ones that surprise the person doing the recovery at 3am.
- The doc distinguishes **automated** (the recipe does it) from **manual** (a human does it)
  for every step — a reader must be able to tell without running anything.
- Manual steps that recur are automation that has not been written yet; name them, so the
  debt is visible.

## 6. Secrets never enter the declaration

- The ficha declares **which** secret is needed and **where** it comes from (the port to the
  secrets layer), never the value. The declaration is versioned; a secret in it is a leak
  with a commit history.
- A recipe reads the secret at run time from the secrets layer, same as any other process —
  it does not template it into a config file that then sits in the repo.

## Checklist before delivering a recipe

- [ ] The ficha/host file is the declaration: inventory and manifest in one, versioned.
- [ ] Services are referenced by FQDN; the DNS name list has one source.
- [ ] Panel aliases are versioned code, not state in the panel.
- [ ] The recipe **ends with a check that fails loud** if the declared state is not reached.
- [ ] Bootstrap and reconciliation are separated (different jobs, different failure modes).
- [ ] Every manual step is written as manual, with why it is not automated.
- [ ] Secrets are referenced by name/location, never inlined.
- [ ] Reconciliation covers both drift directions (missing and undeclared).
