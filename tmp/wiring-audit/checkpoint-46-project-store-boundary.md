# Wiring audit checkpoint 46 — project-store (joeProjects) boundary census
HEAD=16070ec0 (muse/joe-development) DATE=2026-10-01 SCOPE=api/src production only (tests/manual excluded)

## Question
Is the session-project store written through its declared single boundary, and how wide is the
direct-read surface? (Feeds JOE-CAPABILITY-WIRING-MATRIX store rows + orphan/legacy register input,
and independently scopes the TOOL-HTTP-OWNER owner-binding follow-ups.)

## Method
Literal code search over api/src at HEAD (no edits): `joeProjects` sites, `writeJoeProject` writers,
`readJoeProjectForRun` readers; direct-read of holder neighborhoods (ApiProjectTool:3306-3318,
PhaseExecutorTool:743-756); regex sweep for direct `x[key] = ` assignments outside page-store (empty).

## WRITE side: SINGLE FUNNEL HOLDS (8 tools + PhaseExecutor, 12 call sites, 0 bypasses)
All production writes go through writeJoeProject (page-store.ts:147):
- ApiProjectTool.ts:3353 | ImportProjectTool.ts:327 | PhaseExecutorTool.ts:746
- ProjectEditTool.ts:654,737,857,2304 | ProjectRunTool.ts:273 | ProjectUndoTool.ts:162
- ReactProjectTool.ts:7933 | SystemTools.ts:1468
Mutable-reference holders (Api:3306, PhaseExec:744, Edit:621, Run:269, React:7932, SysTools:1463)
read-then-call-writeJoeProject; no direct `projects[key]=` assignment found outside page-store.
GitLocalWorkflowTool:20, ProjectRepairTool:105, ProjectUndoTool:89, UiFixTool:59 use read-only `|| {}` shape.
CLASSIFICATION: FULLY_WIRED write path. 35bf42dd stamping point covers 100% of production writers;
the `{...(entry||{})}` spreads (ProjectEditTool x4 etc.) are safe under it (input owner stripped,
existing owner preserved). No bypass writer needs separate handling.

## READ side: WIDE DIRECT SURFACE (gated reader used by 4, direct reads by ~20)
Gated readJoeProjectForRun callers (production): sessionController:827 (runId=null legacy passthrough),
EngineeringDiscoveryTool:258, ProjectPipelineTool:339, ProjectRunTool:1266,1847.
Direct `(global).joeProjects` readers (no owner/run gate at HEAD): routes/formsPublic:25,
routes/projectPreview:22,39 (UNAUTHENTICATED by design — session key acts as capability URL),
deploy/publish-source:61, orchestrator/active-built-project:54, plan-tools:1232,1258,1273,
PlanningEngine:1025,1407,1408(length-only routing check),1968,2003,2133,2151,3005,3151,
toolCatalog:346, workspace-evidence:39, BrowserRunTool:16, BrowserSmartTools:941, FormInboxTool:31,
GitLocalWorkflowTool:20, ImageStudioTool:127 (35bf42dd gates this one), OrdersReadTool:66,
PhaseExecutorTool:765,2052, ProjectEditTool:621(+5c541537 path-switch RED, separate proposal),
ProjectRepairTool:105, ProjectRunTool:269, ProjectUndoTool:89, ReactProjectTool:4634,7932,
SystemTools:1463, UiFixTool:59.
CLASSIFICATION: PARTIALLY_WIRED read path (write-gated, read-open). Matches pending
PROJECT-ENTRY-PATH-BOUNDARY-001 scope; do NOT claim store-wide safety from the image-only fix.

## Counts (this checkpoint, Muse HEAD)
STORE_WRITERS=9 files / 12 call sites, BYPASS_WRITERS=0, GATED_READERS=4 files / 5 call sites,
DIRECT_READ_SITES=~20 files / ~35 lines, UNAUTH_DESIGNED_READERS=1 (projectPreview, capability-URL shape).
UNKNOWN=whether any orchestrated caller invokes image_studio with zero identity (flagged as integration
condition 1 in TOOL-HTTP-OWNER-CANDIDATE-6965D584-MUSE.response.md; fail-closed direction).
