# Joe — خريطة المعمارية | Architecture Map

> The authoritative map of the system: layers, stores, tool families, routing,
> and the integration contracts every new tool must honour. Kept next to the
> code; update it in the same commit that changes a contract.

## الطبقات | Layers

```
web/  (React + Vite UI)
 └─ WebSocket events ⇆ api/src/api/ws.ts
api/src/
 ├─ api/            HTTP surface: routes, controllers, app assembly, DISK STORES
 ├─ core/
 │   ├─ orchestrator/   PlanningEngine (deterministic fast-paths → semantic router → DAG)
 │   │                  clarify.ts (the pre-build dialogue gate)
 │   ├─ llm/            intelligent-router (provider mesh) + providers/
 │   ├─ design/         the page design system: palette, layouts, forms, pwa, theme,
 │   │                  section-editor, content-contract, images, dataviz, language
 │   ├─ quality/        visual-audit, behaviour audit, html-qa, repair-engine
 │   ├─ project/        analyze.ts (deterministic project understanding)
 │   └─ deploy/         publish-source (what «انشر المشروع» publishes)
 ├─ orchestration/  AgentOrchestrator (DAG execution, recovery, deadlines) + agents/
 ├─ modules/
 │   ├─ tools/          registry.ts (THE single registration point) + definitions/
 │   └─ services/       AgentLoopService (run entry), ToolService (dispatch + aliases)
 └─ shared/         attachments, vision, ocr, language utils, config
```

## مخازن القرص | Disk stores (all under `data/db/`, override: `JOE_CHAT_STORE_DIR`)

| File | Global | Written by | Read by |
|---|---|---|---|
| chat-sessions/messages.json | mockSessions/mockMessages | chat-store.ts | sessions routes, UI reload |
| joe-pages.json | joePages | page-store.ts | planner (hasActivePage), builder (edit/versions), publish |
| joe-projects.json | joeProjects | page-store.ts | planner (project precedence), project_edit, project_run, publish, form_inbox |
| form-inbox.json | — | form-inbox.ts (public POST) | form_inbox tool |

**Contract:** every mutation of a global store calls its `persist*()`; every
store loads at app construction in `app.ts`; keys are always
`sessionId.replace(/[^a-zA-Z0-9._-]/g,'_')`.

## عائلات الأدوات | Tool families (144 registered — `registry.ts` is the only door)

- **Build:** web_page_builder (pages/sites/PWA), react_project (Vite+React), project_pipeline (full-stack)
- **Edit:** web_page_builder (section edits + page versions/rollback), project_edit (SEARCH/REPLACE + esbuild gate + build-verify + undo)
- **Understand:** import_project (+ core/project/analyze), codebase tools
- **Run/Deploy:** project_run (defaults to the ACTIVE project), dev_server_start, deploy_pages (publishes the ACTIVE artifact — project dist/ wins when newer)
- **Data:** form_inbox (+ /api/public/forms/:site)
- **Browser:** browser_* smart tools + user_browser
- **Answer:** central_answer (language contract enforced)

**Registration contract:** a tool exists only when (1) defined in
`definitions/`, (2) instantiated in `registry.ts`, (3) — if it must never go
through the weak-model tool-picker — listed in `DETERMINISTIC_TOOLS`
(AgentOrchestrator), and (4) — if users phrase it directly — given a
deterministic fast-path in PlanningEngine. The 2026-08 audit found three
tools stuck at step (1) for months (npm_manager among them, with the whole
npm_* alias family silently dead); the audit script lives in this commit's
history — re-run it after adding tools.

## من الرسالة إلى التنفيذ | Message → execution

1. `run.ts` → attachment memory (strong/weak recall) → `AgentLoopService.execute`
2. clarify gate (thin build prompt → dialogue, answers merge back)
3. vision/OCR pass on attached images → blocks assembled (language contract)
4. `AgentOrchestrator.execute` → `PlanningEngine.generatePlan`:
   deterministic fast-paths IN ORDER: attachments-are-the-subject guard →
   run/stop/deploy → import_project → form_inbox → project_edit (project
   newer than page) → full-project pipeline → react_project → page
   build/edit → browser/google paths → semantic router → dynamic DAG
5. Nodes run with deadlines; deterministic tools bypass the tool-picker;
   `purpose:'internal'` calls go local-first (intelligence economy).

## الأثر العصبي في الدردشة | The neural trace

What Joe shows while he works is now an object with a life after the run.

- `api/src/api/ws.ts` — `broadcastThinkingPhase` (the headline that is replaced
  in place) and `broadcastThinkingDetail` (the reasoning stream). Unchanged.
- `web/src/services/socket.ts` — keeps them as **structure**: every line gets
  the wall clock and the phase that was running (`TraceStep`). On
  `run_finished` / `text` the run is **sealed** into a `NeuralTrace` and stored
  under its session. A finished run always returns to `idle`, quiet mode or not.
- `web/src/lib/neuralTrace.ts` — the store (`localStorage`, 30 per session, 14
  days), the measured durations, the phase grouping, and `attachTraces`, which
  pairs each sealed run with the assistant reply that followed it **by time**:
  the live path mints its own message id and the reload path reads the stored
  one, so ids can never match — the clock can.
- `web/src/components/NeuralTraceView.tsx` — the timeline, the proportional
  phase ribbon, and the receipt kept in the chat
  («فكّرتُ ونفّذت · ٨ خطوات · ١:١٢ · ▾»). The rail mirrors with the UI
  **language** (`<html dir>` stays ltr by design); every LINE carries
  `dir="auto"` so mixed Arabic/Latin keeps its own order.
- `web/src/components/NeuralThinkingIndicator.tsx` — one line for a short
  answer, the full timeline from four steps up, either way switchable by the
  «N steps ▾» chip.

Locks: `api/src/__tests__/neural-trace.test.ts` +
`api/src/tests/manual/verify_neural_trace.ts` (real Chromium, real server,
including a full page reload).

## نظام الجودة | The quality law

Every capability ships with: a Jest lock in `api/src/__tests__/` AND a wire
proof in `api/src/tests/manual/verify_*.ts` that exercises the REAL thing
(real browser, real npm, real clone, real disk). A repair is kept only if a
re-measurement agrees. The repo typechecks clean end to end
(`npx tsc --noEmit` = 0 errors) — keep it that way.

## لماذا لا نُحرّك الملفات جماعياً | Why no mass file moves

The layout above IS the order: one registration door, one dispatch door, one
planner, stores in one directory, design system in one folder. Physically
reshuffling hundreds of files would churn every import for zero behavioural
gain and put working history at risk; order here means **contracts +
enforcement + this map**, and the map must move with the code.
