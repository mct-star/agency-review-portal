# Three-lens review — Bbron problem statement

Review of `docs/bbron-market-analysis.md` by **Stratty** (strategy), **Amy** (account management) and **Critty** (adversarial critic), run in parallel.

> **Known gaps at time of review** — both reviewers were told to treat these as gaps, not to speculate on them:
> - The Parker paper `ABS_24553` (sent by Matt Graham, B. Braun) is not readable in this environment yet.
> - Matt Graham's email context has not been pasted in.

---

## Convergence — where all three agreed

These are the findings that came back independently from more than one lens. These are the items to action first.

1. **"Clinically equivalent" is the load-bearing claim and it is the weakest.**
   Stratty called it *the* weakest claim. Critty opened the memo with a guardrail flag: the draft cites the JAAOS 2024 paper ("Do Claims Align With the Literature?") to support clinical equivalence, but that paper is about *surgeon marketing claims* — it is not a head-to-head equivalence determination. Using it this way is factually exposed and, if B. Braun sales reps repeat it, regulatorily risky. **Action:** narrow the claim to "equivalent on radiographic alignment in published comparisons" and concede PROMs/soft-tissue balancing are contested. Evidence that would save it: an Elite-specific RCT vs. Mako/ROSA on PROMs + revision.

2. **"Award-grade patient-acquisition programme" needs pricing or pulling.**
   Stratty flagged it as agency throat-clearing. Amy flagged it as a delivery-level commitment and scope-creep. Either commit to it with a price tag (and decide who delivers the marketing work) or remove it from the client-facing frame.

3. **The engagement is two bets welded together — pick one.**
   Stratty: sell *against* the robot (capex/throughput, to procurement/CFO) **or** sell *like* the robot (DTC patient-pull, to marketing). Doing both concedes Stryker's battleground at parity budget. Amy's uncomfortable question for Matt is the same collision: *"is this a sales-enablement engagement, or are we running a patient-acquisition programme on B. Braun's behalf?"* Different engagements, different budgets.

4. **Throughput/list-integrity is the commercial lever and we have no UK data for it.**
   Critty HIGH severity: claim is asserted, not measured. Stratty: the Section 6 open-question (*"do we have anonymised case-time data?"*) is the draft admitting the load-bearing lever is unsupported. A Mako rep will produce site data. **Action:** get minutes-per-case data from live OrthoPilot Elite UK sites before any version of this goes to a private group.

5. **The "28% reduction" and ">100 studies" figures are presented competitively but are not competitive figures.**
   Critty: both are generation-on-generation or whole-family numbers, re-shelved next to capital-robot claims in a way that will collapse on first challenge. Re-caveat or drop.

---

## Divergence — where each lens added something the others didn't

- **Only Amy** caught the HCA relationship risk — HCA Healthcare UK runs Mako and is one of our own listed sources. If this doc reaches an HCA decision-maker (which the brief flags as a path), §4.1's *"Hospitals are paying ~£1M of capital… often without proportionate gain in clinical outcome or theatre efficiency"* tells them their capital decision was unsound. Not a persuasion move.
- **Only Critty** caught the implant lock-in inconsistency: §5 claims "no implant lock-in tax," while §2's own table shows OrthoPilot lock-in to Columbus / VEGA System 7000. The §2 table contradicts the §5 bullet.
- **Only Stratty** called out the five-POV cascade (§3.2–3.5) as structural padding — patient and agency-commercial POVs carry less than hospital and surgeon; fold the weaker two into symptoms.

---

## Stratty — strategy memo

### 1. The recommendation in one sentence
Kill the "reframe OrthoPilot as a commercial programme + patient-acquisition marketing wrap" pitch as the lead idea — it is two bets welded together, and the sharper, more defensible one is the throughput/list-integrity bet aimed at private-group finance directors, with marketing as a downstream deliverable, not the headline.

### 2. The main tradeoff
You can sell *against* the robot (capex avoidance, throughput, no lock-in, to the procurement/CFO buyer) **or** you can sell *like* the robot (DTC patient-pull, surgeon recruitment halo, to the marketing buyer). The draft wants both and pretends they reinforce — they don't. Going DTC concedes that "patient pull" is the battleground Stryker has already defined, and B. Braun enters it years late with a smaller budget. Going throughput/TCO forces a different conversation the incumbents can't easily answer. The doc's §5 bullet *"Wrapped in an award-grade patient-acquisition programme — the feature competitors don't have"* is the collision point — pick one lane.

### 3. The weakest claim
The assertion in §3.1 that *"The gap is one of framing and commercial storytelling, not of clinical substance."* Load-bearing for the whole doc; will not survive a sceptical CMO, because it assumes the clinical evidence is already at parity in the eyes of the people who matter. §4 point 3 softens the claim by pointing to JAAOS 2024 — but that reads as an argument against robots' *marketing*, not as proof of OrthoPilot's *equivalence*. What would save it: head-to-head functional-outcome data (not alignment-accuracy data) showing OrthoPilot Elite non-inferior to Mako/ROSA at 1–2yr PROMs, plus minutes-per-case list data from live UK sites. The Parker paper (ABS_24553) may cover this — flagged as a material gap until read.

### 4. What to kill
- "Award-grade" language in §5 — agency throat-clearing.
- The five-POV cascade in §3.2–3.5. Keep hospital decision-maker and surgeon; fold patient and agency-commercial into symptoms.
- §4 point 6 (*"Clinician conflation"*) — restatement of point 5.
- The caveat block at the top of the doc before it goes to the client. Internal hygiene, not a client-facing artefact.
- §2's "Lock-in" column unless you commit to using it as evidence.

---

## Amy — account-management read

### 1. What the client actually wants vs. what they said
Matt's email isn't in yet, so we're reading sideways. The commission reads as *"help me defend OrthoPilot against the robots"* — and the draft answers with *"let us build you a commercial programme and an award-grade patient-acquisition wrap."* Not the same ask. Matt probably wants ammunition for an internal argument (sales enablement, a sharper story his reps can carry into HCA/Spire). The draft quietly promotes the engagement from **messaging work** to **a commercial transformation programme with a marketing engine attached**.

### 2. Scope-creep flags
- *"Wrapped in an **award-grade** patient-acquisition programme"* — commits us to effectiveness *and* creative recognition. Drop or defend.
- *"the **knee-arthroplasty commercial programme**"* — we've renamed their product category. Implies end-to-end ownership of positioning, sales narrative, channel, patient marketing.
- *"go to **private groups** with a throughput partnership (patient acquisition + list productivity)"* — "list productivity" is operational consulting inside a hospital theatre, not agency remit.
- *"Reframe OrthoPilot Elite… → 'the knee-arthroplasty commercial programme'"* — medical-device repositioning is a regulated-comms exercise (MHRA, ABHI code). Compliance workload not priced.
- *"**Is there appetite to run a named pilot** with one UK private group"* — reads as us offering to broker and run the pilot. Huge delivery tail.
- *"**28% reduction**…"* and *"**>100 international studies**"* — repeating B. Braun's own claims without sourcing. If we put these in client-facing comms we're on the hook for substantiation.

### 3. Relationship risk
- HCA already runs Mako. If this memo reaches an HCA decision-maker, §4.1's "hospitals are paying ~£1M of capital… without proportionate gain" tells them their capital decision was unsound. That's an insult, not a persuasion move.
- *"Surgeons equate 'robot' with recruitment pull — a real commercial effect, but not an exclusive property of capital robots"* — patronises the consultant audience B. Braun's reps have to face.
- *"B. Braun currently sells a better jig"* — cute internally; briefing against our client's sales team if it leaks upstairs.
- Material gap: Parker paper and Matt's email unread. §3 and §5 are written as if we already know what Matt thinks. We'll be quoted back on conclusions we reached without his input.

### 4. The uncomfortable question
*"Matt — is the outcome you want from this piece of work **a sharper story your existing sales team can carry into private groups**, or are you asking us to stand up and run a patient-acquisition programme on B. Braun's behalf? Because those are different engagements, different budgets, and this draft currently points at the second."*

### 5. Verdict
**Hold.** Don't send until (a) Matt's email and the Parker paper are in and folded through §3–§5, (b) "award-grade," "commercial programme," and "throughput partnership" are either priced or pulled, and (c) the HCA-Mako line in §4.1 is softened.

---

## Critty — adversarial critique

### Guardrail flag (top of memo)
The draft asserts *"clinically equivalent implant alignment"* and cites "JAAOS 2024 review" in support. That review (PMC10958061, "Do Claims Align With the Literature?") concerns *surgeon marketing claims*, not a head-to-head equivalence determination. Using it to ground a clinical-equivalence claim B. Braun's sales team will repeat is legally and regulatorily exposed. Fix or drop before external use.

### 1. Holes

1. **[HIGH]** *"delivers clinically equivalent implant alignment at a fraction of the capex"* (§3.1) and *"Head-to-head data shows navigation-guided and robotic-arm cuts converge on implant alignment"* (§4.3). "Implant alignment" is a radiographic surrogate, not a functional outcome. The argument equivocates between "alignment parity" and "clinical equivalence" and will not survive a surgeon asking about PROMs, 5y revision, or soft-tissue balancing. **Evidence needed:** a named RCT or meta-analysis comparing OrthoPilot Elite specifically (not the OrthoPilot family) to Mako/ROSA on PROMs + revision, not alignment.

2. **[HIGH]** *">100 international studies"* (§1, §5). Count-of-studies bundles the whole OrthoPilot family across 20+ years, not Elite. Procurement will ask "how many RCTs on Elite, vs. a current-generation robot?" and the number will collapse. **Evidence needed:** filtered count — Elite only, comparator-controlled, post-2020.

3. **[HIGH]** *"Throughput tax… set-up, CT planning, docking and turnover time per case compress the theatre list"* (§4.2). Asserted, not measured. §6 admits the load-bearing lever is unsupported. A Mako rep will produce site data showing docking time amortises after ~20 cases. **Evidence needed:** minutes-per-case at matched UK sites, or a published time-and-motion study.

4. **[HIGH]** *"28% reduction in intra-operative data-acquisition time"* (§1). Generation-on-generation internal B. Braun figure ("vs. the preceding software generation"), not vs. competitor. Reads as a Mako-beating number and isn't. **Evidence needed:** head-to-head set-up + case-time vs. Mako/ROSA, or re-caveat the number.

5. **[MEDIUM]** *"Every 'robot' ties a hospital to one manufacturer's implants"* (§4.4), while the OrthoPilot row shows lock-in to *"Columbus / VEGA System 7000 implants"*. OrthoPilot is also implant-tied. The "no lock-in tax" bullet in §5 is inconsistent with the table. **Evidence needed:** show OrthoPilot Elite driving *non-B.Braun* implants, or drop the "no lock-in" claim.

6. **[MEDIUM]** *"UK procurement centre of gravity is moving… (Clarivate 2025 commentary)"* (§2). One analyst blog ≠ procurement trend. **Evidence needed:** NHS Supply Chain / HFMA / private-group capex data.

7. **[MEDIUM]** *"A navigation system with a proper patient-marketing wrap can replicate the pull"* (§4.6). Counterfactual with no proof point. Patients search "robotic knee," not "navigated knee." "Scan. Plan. Mako Can." spend is reportedly eight figures; a comms wrap doesn't neutralise that at parity budget. **Evidence needed:** a non-robotic device that has demonstrably won patient pull via marketing — or concede a budget floor.

8. **[MEDIUM]** *"Image-free… no additional radiation"* (§1) listed as B. Braun advantage, but ROSA, Velys and CORI are also image-free. Neutralised in the §2 table. **Evidence needed:** narrow to "vs. Mako" or drop from differentiators.

9. **[LOW]** Parker paper (ABS_24553) is referenced as context but not read. Any argument leaning on it is currently unbacked.

### 2. Steel-manned counter-case (Mako sales director)

"You are pitching a private group that has already signed a Mako contract, or is about to. The £1M is not a device price — it is the cost of entry to a patient-acquisition funnel my company funds nationally. In the twelve months after our DTC launch, self-referred robotic-knee enquiries at partner sites rose materially; B. Braun has run no equivalent campaign and has no evidence a bolt-on agency programme closes that gap against a sustained eight-figure media spend. Alignment parity is the weakest ground you could pick: surgeons care about soft-tissue balancing and gap kinematics, and the contemporary RCTs (MAKO-PRCT, RACER-Knee readouts) are trending toward PROM and early-function advantages, not just radiographic ones."

"Your 'throughput tax' argument concedes itself — your own document asks whether the minutes-per-case data exists. Ours does, and amortised docking time after the learning curve is smaller than your 28% figure, which is a self-comparison. 'No implant lock-in' is not true of OrthoPilot either — it runs Columbus and VEGA. You are selling a cheaper jig and a marketing retainer to a buyer whose consultants will tell them, correctly, that the robot is what patients Google. Procurement directors who already bought Mako will not retrospectively agree they overspent — you will simply not be shortlisted."

### 3. What to defend vs. retreat from

**Defend as-is**
- The commercial framing: capex avoidance, list integrity as the real lever, patient-acquisition as an open flank (§3.1, §4.5, §4.8).
- The observation that Stryker has set a DTC bar no competitor has answered.
- The NHS capex-avoidance angle against RTT/backlog pressure (§5).
- The lock-in critique — of Mako specifically, not robots generically.

**Soften, caveat or drop**
- "Clinically equivalent" — narrow to radiographic alignment; concede PROMs/soft-tissue contested.
- ">100 studies" — re-cut to Elite-specific, comparator-controlled, or drop.
- "28% reduction" — label as generation-on-generation, not vs. competitors.
- "No implant lock-in" — drop or restate as "lighter lock-in than Mako's Triathlon-only family."
- "Image-free" as differentiator — scope to "vs. Mako."
- "Procurement drift to value" — back with NHS/HFMA data or soften to hypothesis.
- The implicit claim that a comms wrap replicates DTC pull at parity budget — needs a proof point or budget number.

---

## Suggested next step

Amy's question is the one to answer first. Everything else downstream — scope, tone, claim rigour, what lands in §5 — moves depending on whether this is sales-enablement or a patient-acquisition programme. Ask Matt. Then rework §3.1, §4.3, §4.4, §4.6 and §5 against Critty's evidence list, and soften §4.1 before anything is shared outside B. Braun.
