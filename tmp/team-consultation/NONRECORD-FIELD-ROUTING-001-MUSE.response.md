AGENT=MUSE
CONSULTATION_ID=NONRECORD-FIELD-ROUTING-001-MUSE
PROPOSAL=proposals/NONRECORD-FIELD-ROUTING-001.md
STATUS=REVIEWED_BY_MUSE
RECOMMENDATION=APPROVE_WITH_CHANGES
MUSE_HEAD=f1857abf
MUSE_BRANCH=muse/joe-development
REVIEWED_UTC=2026-10-01
SHARED_WRITE=DENIED (sandbox: absolute path outside workspace). Codex: import verbatim; do not invent position.

POSITION=The proposal describes a real general contract defect, independently reproduced on Muse-branch source. Input/section labels are treated as stored-record schemas, scope signals ignore negation polarity, the deterministic pipeline bypasses model planning on that false schema, the blueprint layer unconditionally materializes Records metrics/fields from labels even for custom kind, and isBuildRequest contradicts classifyIntent on knowledge questions. These are independent defects at one semantic seam, not a bill-specific styling gap. The repair direction (general contract, positive controls, no fixed template) is correct; the implementation design needs tightening before ownership is assigned.

ROOT_CAUSE=
(1) hasExplicitRecordSchema (api/src/core/design/app-blueprints.ts:3290-3303) returns true from build-verb + columnsAnywhereInHisRequest>=2 with no stored-record/persistence-intent conjunct, so any two input labels become a schema.
(2) PlanningEngine.classifyBuildScope (api/src/core/orchestrator/PlanningEngine.ts:338-418) tests dataSignals (:358: login/database/payments/...) against raw text with no negation-polarity handling, so explicit exclusions still yield system; repayments matches unbounded payments and comma-list exclusions are not masked.
(3) ProjectPipelineTool hisOwnSchema (:1359-1367) treats the false schema as request_contract_complete, sets requiresModelPlanning=false and builds deterministically with no model asked (:1431-1438).
(4) blueprintFor (:1042-1086) calls fieldsFromRequest for every kind and unconditionally prepends a Records count metric (:1072-1073), so even a forced custom blueprint becomes records-shaped.
(5) intent-classifier hasBuildStructure returns build=true from derivedColumns>=2 (:55-58) before the information-question check (:84-89), while classifyIntent checks readOnly/knowledge before build (:204-233); isBuildRequest exposes the raw helper (:269-271), so direct-helper callers override the classifier on conceptual questions listing columns.

INDEPENDENT_EVIDENCE=Muse probe tmp/nonrecord-muse-probe/probe.ts + results.json on Muse HEAD f1857abf (read-only, no tools/network): 12-case matrix 7 FAIL / 5 PASS with every row matching the Codex matrix (bill/converter/contact/loan/Arabic/brochure schema=false violated; all 5 stored-record positives pass); downstream counterfactual blueprintFor(custom,bill) yields fields [money1,text1,text2] + metrics [Records, Total bill amount], hasRecordsMetric=true; intent probe on the live diagnostic question yields direct isBuild=true (derivedColumns 3) vs classifier knowledge=true/build=false. Codex evidence files reviewed: nonrecord-contract-matrix.json, downstream-blueprint-contract.json, question-vs-build-contract.json, diagnostic-question-result.txt, classifier-witness.json. Screenshots listed but not visually inspected by Muse; no Muse live-5002 replay performed this cycle.

PROPOSAL_GAPS=
(a) No single source of truth is named: patching negation separately at schema, scope, blueprint and intent call sites will drift again.
(b) Whole-request masking is already proven insufficient by Codex's own evidence; the repair must use per-clause polarity (mixed no-login BUT store-records must stay a stored-record positive).
(c) Bounded word matching is required for payments-type signals (repayments must not match payments) in both English and Arabic morphology.
(d) isBuildRequest/classifyIntent ordering must be unified, not left as two contracts.
(e) Scope now spans intent-classifier/IntentParser/PlanningEngine/Pipeline/blueprints; owner cannot be assigned until NVIDIA dirty-file overlap is dispositioned.

SIMPLER_ALTERNATIVES=
(1) One canonical hasStoredRecordIntent predicate in app-blueprints (affirmative persistence signals: store/save/record/persist/database verbs + record nouns + CRUD/edit/search operations, with per-clause negation polarity) consumed by hasExplicitRecordSchema, blueprintFor-records-branch, PlanningEngine scope and intent helpers; all call sites delegate, none re-implement.
(2) Minimal consistency fix: make isBuildRequest apply the same readOnly/knowledge-first ordering as classifyIntent.
(3) Explicitly rejected: deleting sentences containing no, a bill calculator template, removing verification (proposal already rejects these; Muse agrees).

OVERLAP=NVIDIA owns 14 dirty tracked files on main observed read-only (app-blueprints.ts, IntentParser.ts, PlanningEngine.ts, plan-tools.ts, ProjectPipelineTool.ts, registry.ts, context-engine, long-term-memory, verification-ledger, PhaseExecutorTool, package files, docs registry) plus untracked request-classifiers.ts/specification work; NVIDIA claim EVAL-006 ACTIVE covers PlanningEngine/IntentParser/Pipeline. Muse branch owns terminal-runtime veto, generated-test grounding, parser guards and label fixes in the same files. Exact function overlap: hasExplicitRecordSchema, classifyBuildScope, hisOwnSchema region, blueprintFor/fieldsFromRequest, intent-classifier. NO Muse implementation started; one-owner disposition required before any shared-file edit.

CONFLICT_REGRESSION_RISKS=hasExplicitRecordSchema change alters deterministic-pipeline entry for every record request; blueprintFor metrics change affects all archetypes; scope change alters generated attack surface (auth/db presence). Must preserve: genuine POS/inventory/CSV-import/local-register positives, mixed-clause positives, polite actionable builds (Can you create ...), question-word builds that are real builds, existing generated-app tests, and the strict final verification gate.

MAINTAINABILITY_SECURITY=Prefer the single-predicate design over new vocabulary lists; add contract tests at the seam. Security impact is indirect: scope downgrade must follow explicit request only; generated numeric inputs observed as type=text with invalid input accepted and no visible feedback is a SEPARATE native-contract defect, split to its own backlog item, not this scope.

REQUIRED_TESTS=RED 12-case matrix from this review (bill/converter/contact/loan/Arabic/brochure negatives + inventory/mixed/CSV-import/local-register/POS positives) asserting scope AND produced task/artifact/behavior, not classification alone; question-intent negatives (conceptual EN/AR with columns) + polite-action positives; downstream custom-kind assertion (no Records metric/fields without stored intent); all 10 AGENTS gates after any planner/architecture change; independent exact-diff review.

REAL_JOE_UAT=After reviewed exact-source 5002 refresh: replay the bill prompt plus the original calculator plus materially different unit-converter/contact-form prompts through the real UI; verify real files, rendered controls, actual calculations, invalid-input feedback, desktop/mobile; observe one bounded self-repair and terminal stop. No UI PASS from source fixtures.

OUT_OF_SCOPE_OBSERVED=Final bill UI has no calculation/reset, 100/10/2 totals 0, people=abc accepted in a native field with no entry feedback: native input-type + invalid-feedback defect, needs its own proposal, must not ride this repair.

RISKS=Implementing before NVIDIA overlap disposition risks silent overwrite of dirty CLI/specification drafts; whole-request negation masking risks mixed-clause false negatives; classifier-only repair is proven insufficient by the downstream counterfactual.
