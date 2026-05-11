# Three-lens review — Bbron centre-of-excellence vision

Review of `docs/bbron-centre-of-excellence.md` by **Stratty**, **Amy** and **Critty** ahead of sending to Matt Graham. The doc was written as the shipping version (not internal thinking) and the reviewers were briefed accordingly.

> **Verdict — do not send as-is.** Stratty: ship after a structural fix. Amy: rework. Critty: too many HIGH-severity holes for a shipping doc. Consensus: rework, then send.

---

## Convergence — agreed across two or more lenses

1. **Throughput claim is still unevidenced and is now load-bearing.** Carried forward from the previous review and now leaned on operationally (*"OrthoPilot Elite delivers the volume the marketing brings in. Faster theatre turnaround and no CT-planning lead-time are the reasons the centre can physically run the throughput without adding staff."*). Critty HIGH; Amy flagged it again. **Fix:** caveat as conditional on UK time-and-motion data still to be produced.

2. **Budget is unstated and is a fatal gap for a shipping doc.** Stratty: *"A vision without a number is a brochure."* Critty HIGH: a B. Braun marketing director reading this has no idea whether AGENCY is asking for £200k or £8M annually. **Fix needs your call:** indicative annual band, benchmarked against the Stryker DTC line item, or an explicit "scope and budget to be agreed at next stage" statement.

3. **The `[the Centre]` placeholder is a credibility leak.** Stratty: *"the square-bracket placeholder broadcasts that the centre doesn't exist yet. Rewrite without the bracket or hold the doc until you have a working name."* Critty LOW: cosmetic but telegraphs that the strategy is upstream of the work. **Fix:** rewrite the line.

4. **Compliance is a real issue, not a footnote.** Critty HIGH/guardrail: B. Braun-funded patient marketing routed through a hospital brand may be a promotional inducement under ABHI Code §8 / MHRA Blue Guide. The centre-as-brand strategy may only work if the device stays invisible in patient comms, which contradicts *"OrthoPilot Elite is the engine inside it"* being the operational rationale. The doc currently lists *"MHRA/ABHI guardrails"* as a discussion item. **Fix:** escalate to a named pre-condition — no patient-facing work designed before a written compliance read.

5. **Centre-and-funnel-vs-sales-enablement question is buried.** Stratty wants it removed from the doc and put in the cover email (which we've now done). Amy wants it moved to the opening of the doc itself. **Resolution:** the email asks the question explicitly as Q1; consider also a one-line up-front frame in the doc making it clear the vision is conditional on that answer.

---

## Per-lens unique findings

### Stratty (strategy)

- **Channel cannibalisation is unspoken.** A funnel that drives patients to one named host directs volume away from every other OrthoPilot site B. Braun already supplies. The doc never says this. Matt will have to defend channel cannibalisation internally; if we don't name it, he'll spot it and we'll look naive.
- **No quantification of "measured patient pipeline."** Even a year-one referral-volume range gives Matt something concrete to react to.
- **The "Open context still to fold in" section is internal throat-clearing on a shipping doc.** Either fold the Parker paper in or don't mention it; bury the assumption check into the cover email instead.
- **Cut the first two background paragraphs.** They tell Matt what he already knows; the doc earns its place at "The implication."

### Amy (account management)

- **Vision quietly creates implicit P&L commitments.** *"The host hospital gains list volume and margin"* puts AGENCY on the hook for the host's commercial outcome.
- **Three-party data dashboard is unscoped info-governance / DPA work.** Not agency remit at brand-engagement fees.
- **"Patient-acquisition engine"** commits us to performance-marketing accountability for surgical bookings — a KPI we don't own data sources for.
- **Naming a host in the vision** quietly puts B. Braun in the position of having to deliver one without being asked. (The right place for the host question is the cover email — Q2 — which we've done.)
- **The HCA-Mako relationship risk has been softened but not eliminated.** *"Hospitals need patients more than they need another capital robot"* still patronises the private-group audience B. Braun's reps face.
- **Uncomfortable question:** *"Matt — before we cost this, can you confirm two things: is B. Braun willing to co-fund a host hospital's patient acquisition as a line item, and do you have a candidate host in mind, or are you expecting us to find one? Because the engagement we've described only works if both answers are yes."*

### Critty (adversarial)

- **Single-site brand vs. national multi-site brand at smaller budget — load-bearing claim, no proof point.** Previous review's hole 7 has been rephrased, not closed. **Evidence needed:** a comparable UK destination clinic (Bupa Cromwell Knee Unit, Schoen Clinic, Fortius) with measured self-referral volume attributable to brand pull, not consultant pull.
- **Why exclusivity?** A private-group commercial director's first question. The doc has no answer for why a host would let one supplier brand their centre and tie surgical mix to one implant family when Mako brings a national funnel + multi-vendor optionality elsewhere.
- **Drop insurer-directed referrals from KPI list** unless an insurer is already at the table — that channel is gated by Bupa/AXA/Vitality network economics, not brand.
- **Steel-manned counter-case (Spire commercial director):**
  > "You are asking me to put my hospital's name on a centre branded around your implant family, fund part of the operating cost, and route my consultants' surgical mix through your jig — in exchange for a marketing programme that has not yet been built, against a competitor whose national patient campaign is already in market and whose robot my consultants already ask for by name. The risk is asymmetric: if the funnel underdelivers, I have a branded clinic with a single-vendor lock-in and no Mako; if it overdelivers, I have grown a brand that B. Braun owns the equity in, not me. Stryker offers me a national pull I plug into; you are offering me a regional pull I have to help build."
  >
  > "Your throughput case is the same one I heard six months ago and it still rests on minutes-per-case data nobody has produced. Your compliance position on B. Braun-funded patient marketing through my brand is unwritten. Your budget is unstated. Come back with a named comparable destination clinic that out-pulled a manufacturer-funded national campaign, a written ABHI read, and a number — and I'll take the meeting. Otherwise this is a slide."

- **Defend as-is:** the strategic diagnosis (the race is now where patients go, not which device is in the theatre), the engine-not-story reframe, the three pre-conditions list, and the self-flag that centre-and-funnel is a hypothesis to confirm with Matt.

---

## Fix list — priority order

### Priority 1 (apply before sending — surgical fixes)

| # | Fix | Source |
|---|---|---|
| 1 | Caveat the throughput claim as conditional on UK case-time data still to be produced. | Critty + Amy |
| 2 | Replace `[the Centre]` placeholder with non-placeholder wording. | Stratty + Critty |
| 3 | Escalate MHRA/ABHI from discussion item to named pre-condition: no patient-facing work designed before a written compliance read. | Critty |
| 4 | Drop "insurer-directed referrals" from the KPI line; soften to "self-referrals and GP referrals as the primary KPI, with insurer pathways evaluated as a second-stage extension." | Critty |
| 5 | Soften "host hospital gains list volume and margin — not a £1M capex line" so it does not patronise the audience or imply P&L accountability. Reframe as "the host's commercial leverage is the funnel, not the kit," dropping the "£1M capex line" comparison. | Amy + Stratty |
| 6 | Remove the "Open context still to fold in" section; the assumption check is now in the cover email. | Stratty |
| 7 | Trim the first two background paragraphs; cut to "The implication." | Stratty |

### Priority 2 (need your judgement — bring back to me with a steer)

| # | Decision needed | Why it can't be auto-applied |
|---|---|---|
| A | **Indicative budget band.** A floor and a ceiling, even wide. | Needs your view on what AGENCY can deliver at what spend, and what B. Braun's appetite likely is. Without it the doc is a brochure (Stratty), and the budget gap is a HIGH (Critty). |
| B | **Channel cannibalisation.** Name it in the doc, or leave it for the call? | Commercial judgement. Naming it shows we've thought it through; not naming it lets Matt raise it himself. |
| C | **Year-one quantification.** Put a referral-volume range on "measured patient pipeline" — yes or no? | Needs ballpark from you on what's plausible at a UK CoE. |
| D | **Comparable proof point.** Which (if any) UK destination clinic do we cite as the precedent? Cromwell Knee Unit, Schoen, Fortius, or none? | Editorial — depends on whether you'd rather cite or hold. |

---

## Suggested next move

1. You give me a steer on Priority-2 items A–D.
2. I apply Priority-1 fixes 1–7 and the agreed Priority-2 items.
3. We re-run all three lenses on the revised doc (cheap insurance, ~1 minute).
4. Send to Matt with the email wrap.
