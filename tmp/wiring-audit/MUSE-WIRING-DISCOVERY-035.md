# MUSE Wiring Discovery 035 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 35)
HEAD=a06f709b + this checkpoint (survey/docs only, no source edits)
DATE=2026-09-30
METHOD=fixture-contained equivalence probes (equiv35.mts): live-registry
declaration capture + main-tree read-only parity grep + 26 canonical-path
legs (7 dormant negatives, 10 lead {} legs, 9 minimal/read-only legs).
Filed runs A/B exit 0, JSON SHA256-identical
(2ECB1EEB...0858E013D). One pilot pair preceded the filed pair and is
honestly discarded: docDemand used docs/production_sync.md (real path is
api/src/core/knowledge/) and the tsx run needed a scratch TEMP redirect
+ synthetic JWT (sandboxed env artifacts, recorded in fx log header).
No live process survived; no source edits; NVIDIA tree untouched
(read-only). tsx IPC scratch (tmp/tsx-tmp) removed after filing.
EVIDENCE=tmp/wiring-audit/equiv35.mts + fx-equiv35/equiv35_run{A,B}.json
+ fx-equiv35/equiv35_run{A,B}.log (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=checkpoint 34 (dormant-15 triage, filed in 990f9c3c/a06f709b).

## E0 headline: checkpoint-34 terraform verdict SUPERSEDED (F227)

Triage34 assessed terraform_ops as "3 WEAK leads (suffix-only)".
WRONG: registered `terraform_manager` (InfrastructureTools.ts:62,
registry.ts:173 safeNew, required {action,directory}, honest guards,
"Manage Infrastructure as Code using Terraform") is a STRONG lead,
declared+registered in BOTH trees with identical required arrays.
The dormant leg's own did-you-mean lists terraform_manager FIRST.
Root cause of the miss: stem-substring hunt paired "terraform_ops"
against "_ops"-suffixed names and never tested the same-stem /
different-suffix candidate. Lesson: cross-check stem hunts with the
tool suggestion oracle (F231). All other triage34 verdicts stand.

## Equivalence verdicts (7 pairs, 10 leads)

E1 business_logic -> business_logic_parser: STRONG_COVER.
Required {requirements}; did-you-mean confirms. Caveat: lead is an
UNGUARDED Elite ({} -> ok:true + {} both runs, MISMATCH #11 6th
instance, F230). Alias/wire must ship the input guard with it.
E2 cost_estimator -> cloud_cost_estimator: COVER_WITH_SCOPE_NOTE.
Required {resources}; honest {} guard; did-you-mean confirms. Scope:
lead is CLOUD-scoped ("Estimate cloud costs") vs the generic dormant
name — record the narrowing in any alias.
E3 self_confidence -> self_confidence_evaluator: STRONG_COVER.
Required {content}; honest {} guard; did-you-mean confirms.
E4 chaos_testing -> chaos_test_plan: COVER_WITH_SCOPE_NOTE. Lead
GENERATES A PLAN (description verbatim) vs the activity-implying
dormant name; doc-demanded (production_sync.md:17, both trees
identical). {} -> ok:true + {} unguarded (MISMATCH #11 7th, F230).
E5 security_scan_repo -> secrets_scan_repo: PARTIAL. Lead scans 6
SECRET-PATTERN regexes only (not vulns/config/licensing); {} ->
ok:true scannedFiles=0 findings=0, absence-as-success (F228, F85
class); did-you-mean does NOT bridge the names (explicit mapping
required). Positive control GREEN: seeded fixture 1/1 found,
scannedFiles=2. Alias as-is would overclaim.
E6 terraform_ops -> terraform_manager: STRONG_COVER (see E0). {}
honest guard; action legs EMBARGOED (binary/side-effect risk) so
equivalence is contract-level (schema+guard+description+registration),
behavior legs deferred to an authorized repair batch with fixtures.
The weak triple are NOT terraform equivalents (different domains):
k8s `get pods` + swarm `list_services` fail honest-but-hollow
("Tool reported failure without an error message", F229, F170/P2-035
class); git_ops `--version` ok:true with zero repo contact.
E7 shell_status -> shell_check_status: STRONG_COVER with AMBIGUITY
NOTE. Tags [shell,status] exact; required {id}; honest not-found on
{} and unknown id. But did-you-mean ALSO suggests shell_execute
first — a planner could pick execution for a status intent. Record
in the alias decision.

## Cross-tree parity (read-only)

All 10 leads BOTH_PRESENT with requiredMatch=true (required arrays
identical). mainRegistryMentions=false for the 4 Elite leads is
EXPECTED (class-construction registration, registry.ts:277-284 —
checkpoint-34 mechanism), not absence. Doc demand lines 17-19
byte-identical both trees. All findings inherited.

## New findings

F227 triage34 terraform weak-triple verdict SUPERSEDED (strong lead
terraform_manager; method lesson F231).
F228 secrets_scan_repo {} absence-as-success (scannedFiles=0 ok:true).
F229 k8s/swarm missing-binary hollow failure (no error field;
ToolService wrapper substitutes; P2-035 class).
F230 Elite unguarded pair business_logic_parser/chaos_test_plan {}
ok:true+{} (MISMATCH #11 6th/7th; guarded siblings cost/self in the
SAME file prove inconsistency, not design).
F231 did-you-mean as endogenous oracle: confirms 5/7 mappings,
refutes auto-bridging for security_scan_repo, flags shell_status
ambiguity. Method note, not a defect.
ENV-NOTE: git_ops {} errorHead carries sandbox git-config warning
noise ("safe.directory '*' not absolute") — environment artifact,
not a Joe defect.

## Counts (this checkpoint)

EQUIV_PROBED=7 pairs / 10 leads (26 legs: 7 dormant + 10 empty +
9 minimal; A/B verdict-identical)
STRONG_COVER=4 (E1,E3,E6,E7) COVER_WITH_SCOPE_NOTE=2 (E2,E4)
PARTIAL=1 (E5)
NEW_FINDINGS=F227(supercession) F228 F229 F230 F231(method)
NEW_BATCHES=P2-055 dormant-lead alias/wire batch, P2-056
security-scan intent decision (appended to staging backlog,
UNASSIGNED, no owner)
PARITY_NOTES=all 10 leads BOTH_PRESENT inherited; Elite registry-
mention caveat documented; no NVIDIA-dirty file overlap (leads live
in Elite/Quality/Infra/Git/System definition files, all clean)
INHERITED=all verdicts/failures both trees by shape

## Staging updates (this checkpoint)

- JOE-WIRING-REPAIR-BACKLOG.md: +P2-055, +P2-056 (UNASSIGNED).
- JOE-WIRING-AUDIT-SUMMARY.md: checkpoint-35 line + NEXT step.
- No matrix/register/architecture change (verdicts feed the shared
  files at import time; E6 supercession noted for the F224 row).
