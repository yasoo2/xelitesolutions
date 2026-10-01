# Muse wiring checkpoint 071 — predicate R2/R6 restore VERIFIED at helper level + :5002 runtime state change
MUSE_HEAD=8a705a11
DATE=2026-10-01
SCOPE=intent-routing wiring edges harvested during REQUESTED-ACTION-TRANSFER-002 535 exact review (pristine 535d07d8 vs 166bea99 overlays; candidate tree clean at 535, zero drift this review)

## Restored authorization edges (pristine-verified, helper level)
535 widens hasRequestedAction authorization along 3 small mechanisms (3 modified lines, no new machinery):
- clause splitter: bare `,`/`;` now split clauses (was comma-only-before-then) — mixed 'report, build X' and multi-imperative inputs reach independent clause verdicts.
- EN artifact nouns: + platform/marketplace/storefront/panel/portal/console/workspace; AR: + بوابة/خدمة.
- AR verbs: + اصنع/اصمم/اطور/ابرمج/اقم/ارغب/ابغي/محتاج.
Evidence: 94/94 focused (48+6+37+3) + tsc0 reproduced; 13-suite 256/279 vs 166 249/279 = 7 fixed / 0 broken / 23 pre-existing; 49-case A/B battery 37/46 with 12/12 flips correct-direction; transfer 10/10 intact.
Transfer datapoint: long-form marketplace brief via PlanningEngine.looksLikeBuild fixed (build-not-chat umbrella) — restore works on natural long prompts, not just short pins.
Containment datapoint: 14/14 535-adversarial negatives hold (noun-restore contained by verb anchor; verb-restore contained by artifact co-requirement; comma-split does not authorize 'version 2, build 5' or denial-led clauses).

## Still-open contract items AT 535 (carry-over, all identical at 166 — none caused by 535)
V2-R1 framing-substring (now 3 noun classes: صفحة/مراجعة/مقارنة — systematic); V2-R2 carrier veto (اداة-class); V2-R3 colon-less fail-open (only fail-open item); R4 ask+contents (decision pending); R2-residue deploy/give-me/كشف (missed genuine builds). Full map: t2-535-probe-20261001.json + t2-regress-attribution-20261001.json.

## Runtime node (observation, not acceptance)
:5002 STATE CHANGE: TCP listener UP + /api/health HTTP 200, uptime ~1440s (~24min at 19:01Z), version=no-commit-file. Restarted by unknown hand; provenance UNBOUND; possible live use by another worker. NO UI launch from this review (unbound bundle + collision risk + reviewed fix not loaded anywhere). :5000 healthy (200 OK, uptime ~31h) but NVIDIA-live unknown provenance — not an acceptance target.

## Classification delta
- intent-routing family: PARTIALLY_WIRED (unchanged: predicate R2/R6 edges now CONNECTED at helper level; V2-R1/R2/R3 + R4 + consumer composition still gate end-to-end acceptance; 002 ownership now has a path per NVIDIA response but adoption not reviewed here).
- No global count changes claimed (totals remain last-reported/UNKNOWN).

## Method node (reusable, corrected this cycle)
PowerShell `git archive ... | tar -x` CORRUPTS bytes (text-mode pipe) — use `git archive -o file.tar` + `tar -xf`. Separately, `git archive` applies checkout CRLF conversion: verify overlays against tar/live-tree bytes (SHA256), not git blob hashes. 535 overlay == tar == live-tree bytes proven (b665fcee...).
