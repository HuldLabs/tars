---
name: senior-research
description: Runs a disciplined, adversarial research pass — web search, source triage, cross-verification, explicit citation — instead of a single-shot search-and-summarize. Use when the user asks for research, investigation, a comparison, "o que existe sobre X", fact-checking, or when an answer would otherwise rest on a single unverified source.
---

# Senior Research

> **Origem (R1):** **portada** do vault `ai-brain` (`.ai-brain/skills/senior-research`) — não
> escrita do zero. O Tars passa a ser a **fonte** do método; a original fica como proveniência.
> Registro em `docs/CURATION.md` §3.

The default failure mode this skill exists to prevent: one search, one source,
one confident-sounding answer. A senior researcher never stops there.

## Workflow

1. **Decompose the question first.** Split it into the specific sub-claims that
   need an answer. A vague question ("o que existe sobre X") still decomposes into
   concrete sub-claims before searching — don't search on the vague version.
2. **Fan-out** — for each sub-claim, generate a *set* of parallel queries, not one
   reused phrasing (this is how Google AI Mode, Perplexity, Copilot and ChatGPT
   retrieve — one prompt → many sub-queries, run in parallel):
   - **semantic variants:** equivalent/rephrase, synonyms, PT↔EN (our repos are
     bilingual), canonicalization (standardize the term), specification (narrow)
     and generalization (broaden), follow-up (adjacent angle).
   - **source classes:** primary/official, critique/disconfirming, alternative framing.
   - **sources we control** (for this repo/vault work): the real projects
     (`D:\onedrive\clients\fabber`, `X:\nexus`, WSL projects) **and** their
     `HANDOFF*`, **tests**, `BACKLOG`/`ROADMAP` — they concentrate decisions, bugs
     and "how we avoided it", and stay fresher than prose docs.
   - scale the number of queries to the claim's complexity (AI Mode fires ~8–12;
     Deep Search, dozens–hundreds) and run them in parallel.
   - **record the queries you fire** so the search is auditable and repeatable.
3. **Fan-in** — merge the results, **de-duplicate** overlapping hits (fan-out often
   returns the same "perfect chunk" for several variants), group by theme, then
   rank by authority for the claim (next step) — never by which phrasing surfaced it.
4. **Intent anchor & drift guard.** Hold the original sub-claim fixed and reject
   variants that drifted from it. Named failure modes to actively avoid:
   **semantic drift** (e.g. "runner headphones" → "sports equipment" → "fitness gear"),
   **iterative expansion divergence** (each query spawning ever more tangential
   ones), and **filter bubble** (one source's/project's framing treated as consensus).
5. **Rank sources by authority for the specific claim**, not by convenience:
   - primary/official source (spec, vendor docs, the standard itself, the paper)
   - beats a reputable secondary analysis
   - beats a blog/listicle repeating the primary source
   - beats an AI-generated summary of the topic (including this skill's own
     unverified first pass)
6. **Cross-verify every load-bearing claim against a second, independent
   source** before it goes in the answer. "Independent" means not the same
   author, not one citing the other in a chain. A claim that only one source
   makes gets flagged as single-sourced, not stated as fact.
7. **Actively look for disagreement and disconfirming evidence**, not just
   confirmation. If two sources conflict, say so and give both, with dates —
   don't silently pick the more convenient one.
8. **Track freshness.** Note publication/update dates. A fact from a 2019 page
   answering a question about current behavior needs a newer check before it's
   trusted, especially for anything that changes often (pricing, APIs, product
   features, algorithms/rankings).
9. **Cite inline as you go**, not reconstructed from memory at the end — one
   source per claim, linked or pathed, so every non-obvious statement in the
   final answer is traceable to where it came from.
10. **Report confidence explicitly per claim**: confirmed (2+ independent
    sources agree), single-sourced (only one source, name it), or unresolved
    (sources disagree or nothing authoritative found) — never blend these into
    one uniformly confident-sounding paragraph.

## What to flag instead of silently smoothing over

- A claim you could only find one source for.
- Sources that disagree, especially when one is more authoritative than the
  other but the less authoritative one is more convenient to cite.
- A source that is itself an AI-generated summary, an SEO listicle with no
  named author/institution, or otherwise low-provenance — usable as a lead to
  the primary source, never as the citation itself.
- Anything time-sensitive where the source's date isn't visible or is old.
- A sub-claim the search genuinely couldn't resolve — say so, don't paper over
  the gap with a plausible-sounding guess.

## Output shape

- Lead with the direct answer to what was asked.
- Then the sub-claims, each with its confidence level and citation(s).
- Close with what's still open/unresolved, if anything is.
- Skip the workflow narration ("first I searched X, then I searched Y") in the
  final answer — the citations carry the provenance, not a search diary.

## Measuring a claim you cannot read off a page

The steps above assume the answer is *written* somewhere. Some of the load-bearing claims a
session makes are not — they are measurements, and a measurement has failure modes prose does
not.

**Say which version you measured, and promise only that** (B4.3). "There is nothing ready for
this" is a claim about a *specific* release line, not about the software. Measure the newest
line — the last release **and** `main`/HEAD — never the stable one alone: the feature you are
about to build by hand is often already on the branch. Name the ref (`main@a1b2c3d`,
`v0.0.1-dev.19`), because a bare "the latest" is unfalsifiable the moment it moves.

**Do not decide on a contested machine** (B4.2). A benchmark that ran while something else was
compiling measures the machine, not the change. Record the load alongside the number, run both
sides under the same conditions, and write the numbers up in `docs/research/` **with a date and
an explicit caveat** — a number without its conditions is a guess with decimals. When the
conditions are not comparable, the honest output is "not measured", not the better-looking
number.

**Adopting an alternative: the "why not" is mandatory, per row** (B4.4). Comparing options on
their merits answers half the question; the other half is why the rejected ones lost. For every
candidate, each as a checkable fact rather than an impression:

- **Maintainer alive?** last commit / last release, and whether anyone answers the issues.
- **License?** the actual license, and whether it fits the use — a copyleft dep in a product is
  a different decision from the same dep in a tool.
- **Cost?** money, ops weight, and what it drags in.
- **Why not?** the reason *this* one is out — mandatory even for candidates you never intended
  to pick. A grid without a "why not" column is a wish list.

**Prove the feature exists in the version you have — the deserialization probe** (B4.5). Do not
trust the changelog or the docs page; they describe the project, not your installed artifact.
Send the wrong thing and read the error: hand a refusal to the type, a malformed payload to the
endpoint, a field from the new release to the old parser. If your version supports it, the shape
error names the feature; if not, you get "unknown field" or a different schema entirely. The
error message is the proof — it is the artifact answering.

**A grid before your own rubric** (B4.6). Before designing an evaluation rubric, dataset or gold
standard, spend one search asking whether it already exists — a public dataset, a mature
system's harness, a standard benchmark for exactly this task. A rubric invented in an afternoon
measures what you remembered to put in it; one that already exists carries the failures of
everyone who used it before you. Same grid as above: candidates, and why not each.

## Guardrails

- **Fan-out is not free.** Scale the number of queries to the claim and stop when a
  variant adds nothing new. Fan out wide for cheap/local searches (grep, repo reads)
  and narrow for expensive/rate-limited ones.
- **Don't let fan-out dilute specificity.** Broadening is a variant, not the goal —
  the narrow, exact query must stay in the set and in the ranking.
- **Drift guard is mandatory:** after fanning out, re-check that each kept result
  still answers the *original* sub-claim (semantic drift / iterative divergence /
  filter bubble — see workflow step 4).
- Do not present a single source's framing as the consensus view.
- Do not cite a source you did not actually check the content of.
- Do not let a well-written low-authority source outrank a terse
  high-authority one.
- Do not silently drop a disconfirming source because it complicates the
  narrative.
- Do not fabricate a citation, a date, or a number when the search didn't
  actually surface it — say it wasn't found.
