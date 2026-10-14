---
name: senior-research
description: How to research before deciding — decompose the question into sub-questions, answer each with a dated primary source, declare "not found" instead of inferring, and close with a one-line verdict per sub-question. Covers source quality, cross-checking, the DET/LLM/EXT design mark, and how to hand the result to a decision. Load BEFORE any "what is the best way to…", "does X support Y", or architecture choice that leans on the outside world.
---

# Senior research

Research is not "search and summarise". It is a **falsifiable procedure**: the output is a
set of answers that a reader could re-check, each one carrying its source and its date —
or the explicit admission that it was not found. This skill is method, not domain; it works
for a benchmark, an architecture choice, a library comparison or a "does this exist".

## 1. Sub-questions before searching (owner rule)

**Never search the question.** Decompose first, in writing, then search each piece. One
search on the whole question returns prose that *sounds* like an answer; sub-questions
return facts you can check one by one.

- Write the question verbatim at the top of the working note — the **literal** one, not a
  cleaned-up version. The wording is data: it tells you which ambiguity the asker had.
- Split into **2–6 sub-questions**, each answerable independently and each starting from
  the **primary artifact** (`docs`, `changelog`, `release notes`, source), not from a
  blog that summarises it.
- A sub-question that is itself a decision ("should we use X?") is not a sub-question —
  rewrite it as the fact that would settle it ("does X hold property Y, and at what cost?").
- **Cheap first, expensive last.** If sub-question 1 answers it, stop. Do not research the
  whole tree to justify a conclusion reached at the root.

## 2. Every claim carries a source and a date

A claim without a dated source is an opinion wearing a lab coat.

- **Primary over secondary.** Official docs, the changelog, the release notes, the source
  file. A blog post that summarises the changelog is a *pointer*, never the citation.
- **Date it.** Software changes; the citation is `source + date` (or version/commit), never
  the source alone. "The docs say X" ages into "the docs said X in 2024".
- **Cite the smallest unit** — `file:line`, a section anchor, a specific version — not "the
  docs" or "somewhere in the repo".
- **Quote or paraphrase-exactly.** If you quote, quote; if you paraphrase, stay close enough
  that a reader can grep the original and land on it.
- When a source **contradicts** another, both are reported with their dates — the newer does
  not silently win. Say which you believe and why.

## 3. "Not found" is a result, not a failure

The characteristic failure of research is filling the gap with what is merely *plausible*.

- After a real attempt (the primary source and 2–3 independent angles), if the answer is not
  there, write **"not found"** — literally — and say **where you looked**. Do not infer, do
  not extrapolate, do not write the answer you expected to find.
- Never present a guess in the same voice as a sourced fact. If you must hypothesise, label
  it: `hipótese (não verificado)`.
- An unverifiable claim is worse than a missing one: the missing one costs a second search,
  the unverifiable one costs the decision built on it.

## 4. Cross-check before you conclude

- Any claim that drives a decision needs **two independent sources** or one **primary**
  source plus a confirmation. Independent means *not* both quoting a third source.
- When they agree, say so and move on. When they disagree, the disagreement **is** the
  finding — report it with both citations, dates and your call.
- Prefer the source you can inspect over the source you must trust. A repo's own
  `CHANGELOG` beats a blog; a running command beats both.

## 5. Verdict per sub-question, one line

Close the research with a table, one row per sub-question: **sub-question → verdict (1 line)
→ source + date**. The verdict is the answer, not the journey; the journey is the citations.

- The whole result must be re-checkable **from the table alone**: someone with the table and
  a browser can falsify any line.
- No prose without a row. If a paragraph carries a new claim, it needs a row (or is it
  decoration?).
- State the **confidence**, not just the answer: `confirmado (2 fontes)` · `único (1 fonte)`
  · `não encontrado`.

## 6. The DET / LLM / EXT mark (design, not domain)

Every step of the method is one of three kinds — mark it, because it decides where the step
belongs in a design:

| mark | meaning | where it belongs in code |
|---|---|---|
| **DET** | deterministic — a rule, a lookup, an arithmetic | a unit with a test; no model |
| **LLM** | judgement — decomposition, ranking, "does this feel right" | behind an interface; expect to swap the model |
| **EXT** | external context — a search, a fetch, a human's knowledge | a boundary that can fail; cache it; never inline it |

A method whose steps are unmarked drifts into "the model does all of it". Marking pulls the
**DET** steps out into testable code and leaves the **LLM** steps where a model is honestly
the right tool. (This is the `senior-research` step list from the ecosystem's
`COMO-PENSAMOS`, generalised — the 9-step walkthrough with each step marked.)

## 7. Handing off to a decision

Research ends at the **decision boundary**, not past it. The output is the table from §5
plus, if asked, a **recommendation** with its cost — never a plan, never an implementation.
Whoever owns the decision owns it; the researcher hands over the material to decide, marked
with what is confirmed and what is not.

- State the **cost** of each option (time, resource, risk), because a verdict without cost
  is not decidable.
- When two options are within noise, say "tie" and name the tiebreaker the owner should use
  — do not invent a winner to look useful.
- Anything you could not settle is listed as **open**, with the test that would settle it.

## Checklist before delivering

- [ ] The literal question is written at the top.
- [ ] Every sub-question has a dated source, or an explicit "not found" with where you looked.
- [ ] Every decision-driving claim has two independent sources or one primary + confirmation.
- [ ] The verdict table stands alone (re-checkable without the prose).
- [ ] Confidence is stated per row.
- [ ] Steps that are DET are marked so, and pulled out of the model path.
- [ ] Nothing is inferred into the gap; hypotheses are labelled.
