# Muse consultation response — NVIDIA-PROVIDER-UI-CONTINUITY-001
AGENT=MUSE
CONSULTATION_ID=NVIDIA-PROVIDER-UI-CONTINUITY-001
PROPOSAL=D:\Joe\coordination\team\proposals\NVIDIA-PROVIDER-UI-CONTINUITY-001.md
EVIDENCE=c8524f01 (D:\Joe\worktrees\codex-integration-20260928) full diff read; tracked-source greps on main e8fd9589 + Muse f1421ec3; read-only git apply --check on both trees; official NVIDIA NIM docs fetched 2026-09-30
HEAD=f1421ec3
TRACKED_TREE=CLEAN (verified via git status; extensive untracked audit evidence preserved, nothing deleted)
UNTRACKED=PRESERVED (audit/probe/UAT artifacts + 4 Muse drafts incl. providers/nvidia.ts; NVIDIA worktree read-only, untouched)
UPDATED=2026-09-30 (this cycle; source inspection + read-only git checks + one docs fetch; no key used, no live provider call, no UI run by Muse)
SHARED_FILE_WRITE=DENIED_BY_SANDBOX (coordination dir not writable; caller persists via COORDINATION_FALLBACK import)
NO_AGREEMENT_IMPLIED=YES
POSITION=APPROVE_WITH_CHANGES (candidate routing/verification/cost-policy mechanics independently verified sound; integration BLOCKED on (1) license-accurate labeling instead of bare isFree:true, (2) reconciling the second untracked Muse nvidia draft to one provider seam, (3) semantic rebase review since the candidate's parent is Codex-branch-only)
RECOMMENDATION=APPROVE_WITH_CHANGES

## 1. What I verified myself

- ABSENT from current main tracked source: `git grep -i 'nvidia|nemotron'` on
  main HEAD e8fd9589 returns zero files. ABSENT from Muse tracked product
  source: same grep on muse/joe-development f1421ec3 over api/src + web/src
  returns zero files (matches exist only in tmp/team-consultation docs, where
  "NVIDIA" is the agent name). The proposal's absence claim is CONFIRMED at
  source level on both trees. Served-bundle absence was NOT re-verified by
  Muse this cycle (no live-server inspection); Codex's bundle observation
  stands as REPORTED_BY_CODEX.
- CANDIDATE content (c8524f01, 4 files +38/-3, parent a926caee on
  codex/integration-20260928, NOT on main): UI entry `nvidia/NVIDIA NIM`
  key-required + disconnected-by-default; VENDOR_BASE
  `https://integrate.api.nvidia.com/v1`; NVIDIA_API_KEY env wiring; a
  `verifyProviderDirect` nvidia case; continuity alias/host/envkey rows; a
  cost-policy allowlist of exactly the two Nemotron-3 models on the official
  endpoint (unknown-model and foreign-endpoint cases return false).
- UI-KEY PATH IS HONORED (correction of the naive reading): the `case
  'nvidia'` switch branch is env-only, but it is reached ONLY when no UI key
  was supplied — the function head (`hasRealKey` branch) routes any real
  cfg.apiKey through the generic custom route with strictProviderCheck and
  returns key_ok/key_empty. The candidate test's two halves (no_key without
  key; key_ok with `apiKey: 'test-nvidia-key'`) are therefore jointly
  satisfiable, consistent with the reported 43/43. The branch message naming
  "NVIDIA_API_KEY or the UI key" is accurate in its no-UI-key context.
- TEXTUAL APPLICABILITY (not semantic approval): `git apply --check` of the
  c8524f01 patch succeeds on BOTH main e8fd9589 and Muse f1421ec3 working
  trees (offsets only, all hunks). This proves no textual conflict, NOT that
  the Codex-branch assumptions (provider-continuity behavior, router state)
  hold on either target. A semantic rebase review is still required.
- NO FILE OVERLAP with NVIDIA's active dirty work: candidate touches
  intelligent-router.ts, provider-continuity.ts, provider-continuity.test.ts,
  CommandComposer.tsx; NVIDIA's dirty tracked set is IntentParser,
  context-engine, long-term-memory, PlanningEngine, plan-tools,
  ProjectPipelineTool, registry, tool-aliases.test.ts, package files, docs.
  Zero files in common. SEQUENCING overlap instead: provider-continuity.ts
  and intelligent-router.ts are also touched by Codex's isolated lease-fence
  (a8543bf9) and DuckAI (9633139c) candidates — the NVIDIA integration must
  be ordered against those with re-verification, not blind-merged.
- OFFICIAL TERMS (primary source, fetched 2026-09-30 from
  https://docs.api.nvidia.com/nim/docs/product): "NIM access through the
  NVIDIA Developer Program is for prototyping, research, development and
  testing purposes only"; "Production use involves any use ... serving real
  end-users. Using NIM in production requires an NVIDIA AI Enterprise
  license" (licenses from $4500/GPU/year). The proposal's policy concern is
  therefore CONFIRMED and stronger than "needs review": a bare `isFree: true`
  + free_only allowlist misrepresents a dev-program endpoint as
  unconditionally free, including for production traffic Joe may generate.

## 2. Errors / gaps in the candidate (must fix before integration)

- G1 (POLICY, blocking): `isFree: true` with `tagKey: 'provFree'` and
  free_only allowlisting present the endpoint as free without qualification.
  Required: a dev-program-qualified label (e.g. "Free dev key" +
  build.nvidia.com link + one-line "production needs an NVIDIA AI Enterprise
  license" note in the provider panel), and a cost-policy comment/test
  stating free_only inclusion means "no per-call charge under NVIDIA
  Developer Program dev/test terms", not "free for production".
- G2 (DUPLICATE SEAM, blocking): a SECOND Muse-authored NVIDIA approach
  exists untracked in the Muse worktree:
  api/src/core/llm/providers/nvidia.ts (NvidiaProvider class, native fetch
  with AbortSignal, env-configurable base, default
  nvidia/nemotron-3-super-120b-a12b) — different seam AND different default
  model from c8524f01 (router custom route, ultra-550b default). Integrate
  exactly one seam. My recommendation: keep the c8524f01 router seam (UI +
  continuity + cost-policy + tests as one coherent unit) and explicitly park
  or delete the untracked class at integration time; if the class survives
  for direct non-SDK calls it needs registry wiring, the same policy labels,
  and its own tests. (Side note: the class's AbortSignal support is
  technically nicer than the SDK path given the open lease/adapter abort
  reviews — the integrator may weigh that with tests, not by assertion.)
- G3 (REBASE, blocking): parent a926caee is Codex-branch-only; main lacks
  the intervening provider-continuity/router evolution. The integrator must
  re-derive the 4-file change onto the chosen base (main) and re-run the
  provider suites there; textual apply-clean is insufficient evidence.
- O1 (observation, non-blocking): duplicate `case 'grok'` labels exist in
  verifyProviderDirect (env-handling case plus a later paid-group case) —
  pre-existing dead code, out of scope, noted for the router owner.

## 3. Safe smaller alternative (if full integration stalls)

Land ONLY the UI entry + honest no-key verify + cost-policy allowlist with
the G1 qualified label (no default-model routing change, no mesh fallback
inclusion), behind the existing key-required gate. This restores the user's
visible option and honest verification without widening any automatic
provider selection. Everything else (defaults, fallback order) stays for a
second reviewed batch.

## 4. Ownership recommendation

- IMPLEMENTATION_OWNER: Codex (already owns runtime/version diagnosis for
  this batch; can build the isolated current-main candidate). NOT Muse
  (owns the wiring audit this cycle) and NOT NVIDIA without a checkpoint
  decision (owns CLI batch1 + EVAL-006 drafts).
- REVIEW_OWNER: NVIDIA preferred after its CLI-batch1 checkpoint (provider
  continuity is shared surface); Muse can second-review mechanics but must
  be marked AUTHOR-BIASED on the candidate's core (Muse authored c8524f01),
  while my G1/G2/G3 objections above are independent and stand regardless.
- INTEGRATION_OWNER: Codex audit, per the proposal; no main merge before
  reviewer ACCEPT + tests + UAT below.

## 5. Tests required (before ACCEPT)

- Keep the candidate's 19 added test lines; add: (a) selected-nvidia 429
  and auth-failure honesty (no silent fallback, no false connected dot);
  (b) no-key UI message wording incl. the G1 license note; (c) no secret in
  logs (redaction check on the verify path); (d) cost-policy unknown-model
  + foreign-endpoint negatives (already present — keep).
- Full provider-continuity + router suites + tsc/build + AGENTS
  architecture/package-script gates on the integration base.

## 6. Real Joe UAT required (before VERIFIED)

On one reviewed build: authenticated provider panel visibly offers NVIDIA
NIM with the corrected label; select with no key -> honest no-key; select
with a user-supplied test key -> direct verify of THAT endpoint/model; a
forced quota/auth failure -> honest message; served bundle contains the
entry (rebuild proof, not cache assertion); no paid/license-incompatible
call without explicit user action. No production deployment, no secret
copying, no use of the user's real key by any agent.

## 7. Overlap statement

No overlap with Muse's current wiring-audit work (probes + staging docs;
Muse touches no provider source this cycle). No file overlap with NVIDIA's
dirty planning/spec work (verified above). Sequencing dependency on Codex's
lease-fence/DuckAI candidates sharing provider-continuity.ts /
intelligent-router.ts — order explicitly at the integration checkpoint.
