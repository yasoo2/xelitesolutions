# xelitesolutions
from pathlib import Path

content = r"""JOE MASTER SPEC (XElite Solutions) — v1.0
=================================================
Owner: Jonas (XElite Solutions)
Primary Domain: xelitesolutions.com
Backend: Render
Frontend: Cloudflare
Database: MongoDB
Timezone: Europe/Istanbul

PURPOSE
-------
Build “JOE” as a real, fully integrated AI Operating System that can plan and execute end-to-end creation of websites/apps/systems with minimal/no human intervention, using 200+ REAL tools (no fake/demo tools), a real Browser Operator Agent, live streaming task execution, strong memory, multi-tenant security, and a simple beautiful UI where Yellow is the dominant brand color.

This document is intended to be a single, complete, builder-ready specification.


SECTION 0 — NON-NEGOTIABLE RULES (MUST)
---------------------------------------
0.1 No fake functionality
- No placeholder buttons.
- No “demo mode” pretending to execute.
- If a feature is shown in UI, it must call real backend logic and produce real logs/results/artifacts.
- “Mock Layer” is allowed ONLY for testing/staging and must be explicitly labeled, isolated, and never used in production by default.

0.2 Tool realism requirement
- “200+ tools” means 200+ tool entries in the Tool Registry where each tool:
  - has an implementation, not just a description,
  - can be executed via the orchestrator,
  - generates an execution log,
  - returns verifiable outputs or errors,
  - has permissions/side-effects metadata.

0.3 Autonomy requirement
- In Builder/Owner mode, JOE must execute tasks end-to-end:
  Plan → Execute tools → Verify → Deliver artifacts → Observe/Self-fix.
- It may pause only for:
  - Missing credentials/secrets that only the owner can provide,
  - Policy-required approvals for risky actions,
  - External service outage beyond the system’s control.

0.4 Security-by-default
- Least privilege by default.
- Strong audit trail for every action.
- Secrets never printed to logs.
- Browser Operator and any external actions must run in a sandbox.

0.5 Consistency requirement
- Theme and language toggles must apply to the ENTIRE system (all pages/components/modals/widget).
- No components left unthemed/untranslated.


SECTION 1 — DEPLOYMENT TARGETS (MUST)
-------------------------------------
1.1 Domains
- Frontend (Cloudflare): https://xelitesolutions.com
- Backend API (Render): https://api.xelitesolutions.com
- WebSocket endpoint: wss://api.xelitesolutions.com/ws
- Optional recommended (if needed):
  - https://admin.xelitesolutions.com (internal admin)
  - https://joe.xelitesolutions.com (console)
  (If not used, keep console under https://xelitesolutions.com/joe while API stays on api.xelitesolutions.com.)

1.2 Hosting requirements
- Frontend: Cloudflare Pages (or Cloudflare hosting) serving a SPA with routing.
- Backend: Render Web Service (Node.js/Express recommended).
- Database: MongoDB (Atlas recommended).

1.3 CORS & WebSockets
- Backend must allow CORS for:
  - https://xelitesolutions.com
  - https://www.xelitesolutions.com
  - plus any approved preview domains (optional).
- WebSocket must function in production on Render and survive deploys.
- Ensure correct preflight handling, credentials policy, and consistent Allow-Origin matching.

1.4 Environment separation (recommended)
- Dev/Staging/Prod with separate env vars and database namespaces.
- Staging can use Mock Layer; Prod must not.

ACCEPTANCE TESTS (Section 1)
- Visiting https://xelitesolutions.com loads Cloudflare hosted frontend.
- https://api.xelitesolutions.com returns /health OK from Render.
- WebSocket connects successfully to wss://api.xelitesolutions.com/ws and streams events.
- MongoDB persists chats, sessions, and runs across refresh/login/logout.


SECTION 2 — ENTRY EXPERIENCE: “LOGIN → WORLD OF JOE” (MUST)
-----------------------------------------------------------
2.1 Home page
- xelitesolutions.com shows:
  - Big “JOE” brand presence,
  - A highly visible “LOGIN” button,
  - Optional “Open Console” (if already logged in).

2.2 Login flow
- /login page supports:
  - Email/Password login (mandatory),
  - Optional: Google OAuth (recommended).
- After successful login:
  - Redirect to /joe (Joe Console).
- Users who are not logged in cannot access /joe.

2.3 Roles & modes
- Roles:
  - OWNER/SUPER_ADMIN: full power,
  - ADMIN: advanced but restricted,
  - USER/CUSTOMER: restricted safe mode.
- Role dictates:
  - which tools can be used,
  - which approvals are required,
  - cost/time limits,
  - whether browser operator can access certain domains/actions.

ACCEPTANCE TESTS (Section 2)
- Click LOGIN → login page.
- Successful login → /joe.
- Unauthorized access to /joe redirects to /login.
- Customer role cannot execute risky actions without explicit approval and cannot access restricted tools.


SECTION 3 — CORE PRODUCT: JOE CONSOLE (MUST)
--------------------------------------------
3.1 Layout (simple + powerful)
- 3-column layout:
  A) Left Sidebar: sessions/projects navigation
  B) Center: chat + blocks + command composer
  C) Right Panel: LIVE RUN / BROWSER LIVE / ARTIFACTS / MEMORY / COSTS / OBSERVABILITY

3.2 Yellow-dominant design
- Brand primary: strong yellow (dominant).
- Companion color: Midnight Navy or Graphite (recommended: Midnight Navy).
- Dark theme: Night mode with yellow highlights and dark background.
- Light theme: Day mode (white + sky blue) while yellow remains the primary action color.

3.3 UI rules (MUST)
- Yellow must be visually dominant in:
  - RUN button,
  - Status bar badges,
  - Timeline progress line,
  - Important headers,
  - Approval gates.
- UI must stay minimal and readable:
  - Avoid long text in yellow on dark backgrounds.
  - Use dark text on yellow surfaces.

3.4 Theme toggle (global)
- A single button in top bar switches:
  - Night (Dark) ↔ Day (Light, white + sky-blue).
- Must apply to: all pages, modals, dropdowns, tooltips, widget, charts, timeline, composer, tables.

ACCEPTANCE TESTS (Section 3)
- Toggle theme: entire UI changes instantly with no unthemed components.
- Yellow remains primary action color in both themes.
- Layout remains clean and responsive on mobile (tabs instead of 3 columns).


SECTION 4 — FULL INTERNATIONALIZATION (MUST)
--------------------------------------------
4.1 Default language
- Entire system defaults to English.

4.2 Language button (global)
- Single language selector toggles whole system UI to:
  - English (en)
  - Arabic (ar) — RTL
  - French (fr)
  - German (de)
  - Russian (ru)
  - Spanish (es)
- Must translate 100% of UI strings:
  menus, buttons, placeholders, statuses, tooltips, empty states, errors, approvals, agent names/descriptions (display names).

4.3 RTL requirements (Arabic)
- Root container switches to dir="rtl".
- Sidebar alignment, icons, padding, timeline direction must flip correctly.
- Arabic-friendly font fallback included.

4.4 What not to auto-translate by default
- User chat messages,
- Raw logs,
- Code blocks,
- URLs/file names.
(Optional: a per-message “Translate” action.)

ACCEPTANCE TESTS (Section 4)
- Switching language updates all UI labels without reload.
- Arabic mode is fully RTL and visually correct on all major pages/components.
- Theme toggle still works in all languages.


SECTION 5 — CHAT SESSIONS + STRONG MEMORY (MUST)
-------------------------------------------------
5.1 Sessions list in sidebar
- Must include:
  - + New Chat button
  - Search bar “Search chats…”
  - List of sessions with:
    - auto title,
    - last message snippet,
    - last updated time,
    - mode badge,
    - pin/star.

5.2 Auto titles
- Auto-generate title (6–10 words) after first user request or first plan block.
- If conversation scope changes, suggest rename (Apply/Keep).

5.3 Persistence
- Everything persists:
  messages, runs, tool calls, artifacts, summaries.
- Reload/refresh must restore state.

5.4 Hybrid memory layers
- Session Memory: full transcript + session summary updates every N messages.
- Project/Workspace Memory: cross-session key facts/decisions/artifacts.
- User Memory: preferences (theme/language/provider defaults, etc.).
- Semantic search (embeddings) for recall across sessions/projects.

5.5 New chat inherits previous context
- Default: Project memory ON.
- Toggles:
  - Include last session summary ON/OFF
  - Start clean (no inherited context)
- Must never “silently” lose memory.

5.6 Memory panel
- Right panel tab “MEMORY” shows:
  - What Joe remembers,
  - Source: Session / Project / User,
  - actions: Pin (keep), Forget, Edit.

ACCEPTANCE TESTS (Section 5)
- Create chat → auto title appears in list.
- Create new chat → inherits project memory + optional last summary.
- Search finds chats by title and content.
- Memory panel shows items and supports pin/forget/edit.


SECTION 6 — COMMAND COMPOSER CONTROLS (MUST)
--------------------------------------------
The instruction input must be one unified “Command Composer” with:

6.1 One Agents button (5 agents in one menu)
- A single “Agents” button opens a popover listing these 5 agents:
  1) Planner Agent
  2) Builder Agent
  3) Verifier/QA Agent
  4) DevOps Agent
  5) Browser Operator Agent (mandatory)
- Default mode: Auto Team ON (JOE selects who to activate).
- Allow manual selection of agents.

6.2 Thinking style (deep + fast)
- Provide a toggle in the same popover:
  - Rapid / Balanced / Deep
- “Rapid” must produce quick plan and execute fast with minimum checks.
- “Deep” must produce deeper analysis, alternatives, stronger verification and safer rollbacks.

6.3 Microphone & attachments
- Microphone button for voice input.
- Attachment pin for files (images, PDFs, ZIP, TXT, JSON, logs).
- Attachments appear as chips in composer.
- Support drag-and-drop.

6.4 Providers button (two AI providers)
- A single “Providers” button to switch between Provider A and Provider B.
- Optional “Auto” routing mode.
- Provider choice persists per session, optionally per project.

6.5 RUN / PLAN
- Yellow primary RUN button: executes real actions.
- Secondary PLAN: plan-only, no side effects.
- RUN shows running state + Stop control.

ACCEPTANCE TESTS (Section 6)
- Composer shows: Agents, Mic, Attach, Providers, RUN/PLAN.
- Changing provider affects run in a traceable manner (shown in run metadata).
- Rapid vs Deep behavior is clearly different in plan output and verification steps.


SECTION 7 — LIVE RUN STREAMING SYSTEM (MUST)
--------------------------------------------
7.1 Live panel (“LIVE RUN”)
- Must display in real time:
  - NOW: current action (one line)
  - NEXT: next planned action (one line)
  - Numbered step timeline with status:
    Pending / Running / Done / Blocked / Failed
- Each step expands to show:
  - What (action)
  - Why (one short reason)
  - Evidence (screenshot/log snippet/artifact link)

7.2 Artifacts live
- Artifacts appear as soon as created:
  - PR link, deploy link, generated file references, reports.

7.3 Approval gates (policy-based)
- For risky actions (DNS changes, deleting data, payments, etc.):
  - show approval modal with:
    what changes, risk, rollback plan, Approve/Deny.
- OWNER may enable policy auto-approval within safe bounds (optional).

7.4 Streaming protocol (must be implemented)
- Use WebSocket streaming events for:
  step_started, step_progress, step_done, step_failed,
  evidence_added (log/screenshot), artifact_created,
  approval_required, approval_result, run_finished.

ACCEPTANCE TESTS (Section 7)
- Starting RUN shows step-by-step updates live (not after completion).
- Evidence is attached to steps (screenshots/log snippets).
- Approval gates actually block until approved.


SECTION 8 — BROWSER OPERATOR AGENT (MANDATORY)
----------------------------------------------
This is the “operator” you requested: open browser, read, move mouse, input data, test, analyze, infer, build steps, close/open, and control fully — integrated into JOE.

8.1 Capabilities (must work in production)
- Start/stop browser runtime in sandbox
- Open/close tabs, navigate, back/forward/reload
- Mouse movement, hover, click/double-click/right-click
- Scroll, drag-drop
- Type into inputs, fill forms, pick dropdowns/checkboxes
- Upload files from chat attachments
- Download files and save as artifacts
- Screenshot capture (on demand + automatic per step)
- Extract readable text + DOM snapshot
- Assertions (element exists, login success, message appears)
- Restart browser if stuck

8.2 Browser Live UI tab
- Right panel tab “BROWSER LIVE” shows:
  - Current URL
  - Large latest screenshot
  - Action queue
  - Last action result (success/fail + reason)
  - Optional “Take Control” for OWNER only

8.3 Real sandbox runtime
- Must ship with a real Chromium runtime (no “Chrome not found” failures).
- Use Playwright recommended (or Puppeteer with proper install).
- Must run isolated (container sandbox) with timeouts and kill switch.

8.4 Safety
- Domain allowlist/denylist configurable.
- Sensitive inputs handled via secure prompt (never logs secrets).
- Approval gate for sensitive actions (payments, account deletions, DNS changes).

ACCEPTANCE TESTS (Section 8)
- Browser agent opens a real site, fills a form, clicks submit, asserts success, captures screenshot.
- Failure scenario returns actionable reason and next steps.
- Downloaded artifact is stored and visible in artifacts panel.


SECTION 9 — TOOL REGISTRY (200+ REAL TOOLS) (MUST)
--------------------------------------------------
9.1 Tool Registry foundation
- Tools are first-class objects with a uniform contract:
  - name, version
  - capability tags
  - input_schema / output_schema
  - required permissions
  - side effects (read/write/deploy/delete)
  - rate limits
  - audit log fields
  - mock_supported (testing only)

9.2 Required tool categories (minimum coverage)
- Repo/Git tools: GitHub read/write, PR creation, checks, diffs, issues.
- Code generation/build tools: scaffolding, component generators, API scaffolding.
- Testing tools: unit, e2e, lint, type checks, smoke tests.
- Deploy tools: Render deploy controls, Cloudflare deployment integration, env sync checks.
- Observability tools: logs, metrics, incident creation, rollback actions.
- Browser tools: operator actions (Section 8).
- Data tools: MongoDB migrations/backup/restore (restricted by policy).
- Docs tools: generate docs, diagrams, runbooks.
- Security tools: secret scanning, policy checks, permission audits.
- Economics tools: cost estimation and usage metering (“Joe Hours”).

9.3 Tool count requirement
- Production must expose Tool Registry with >200 tools.
- Each tool must be executable and logged.
- Provide “tool self-test” suite that verifies tool readiness.

ACCEPTANCE TESTS (Section 9)
- /tools endpoint returns >200 tool entries.
- Running a sample of tools produces real outputs and logs.
- Tool execution history is persisted and searchable.


SECTION 10 — AUTONOMOUS BUILD SYSTEM (MUST)
-------------------------------------------
10.1 Execution pipeline
- Intake → Business reasoning → Plan → Simulate (optional) → Execute → Verify → Deliver → Observe/Self-fix.

10.2 Modes (must exist)
- Advisor Mode: plan only.
- Builder Mode: execute tools.
- Safe/Customer Mode: restricted tools + more approvals.
- Owner/God Mode: full tools + configurable auto-approval policies.

10.3 “No human intervention” guarantee
- In Builder/Owner mode, JOE continues until completion or policy/credentials block.
- Must produce artifacts: PR/Deploy/Files/Reports, not just text.

ACCEPTANCE TESTS (Section 10)
- Provide a run that creates a real artifact (PR or deploy) from a single instruction.
- Provide a run that fixes an issue via PR + verification steps.


SECTION 11 — SECURITY, PERMISSIONS, SECRETS (MUST)
--------------------------------------------------
11.1 Least privilege + RBAC
- Role-based access controls.
- Tool permissions tied to role/tenant/project.
- Customer mode restrictions enforced server-side (not only UI).

11.2 Policy-as-code (recommended but strongly preferred)
- Central policy engine that can block/require approval for actions.

11.3 Secrets management
- Secrets stored server-side only (vault pattern).
- Ephemeral privileges: grant temporary access tokens when needed.
- Never log secrets.
- Provide secure UI prompts for entering credentials.

11.4 Audit trail
- Immutable audit log for:
  - tool calls,
  - approvals,
  - credential usage events (without revealing secrets),
  - run lifecycle events.

ACCEPTANCE TESTS (Section 11)
- Attempting restricted action as customer is denied.
- All tool calls produce audit entries.
- Secrets never appear in logs or UI traces.


SECTION 12 — OBSERVABILITY + SELF-FIX LOOP (MUST)
--------------------------------------------------
12.1 Observability dashboard (within console)
- Must show:
  - current system status,
  - running jobs,
  - recent errors/incidents,
  - run history,
  - decision summaries (why key actions happened),
  - environment (dev/staging/prod).

12.2 Self-fix loop
- On failure:
  - detect error,
  - generate RCA (5 Whys) summary,
  - propose fix,
  - execute fix (if allowed),
  - verify,
  - create ticket if unresolved.

12.3 Ticketing (recommended)
- Automatic incident ticket creation with severity classification.

ACCEPTANCE TESTS (Section 12)
- A controlled failure triggers RCA summary + fix attempt + verification.
- Incidents are recorded and visible in dashboard.


SECTION 13 — AI PROVIDER INDEPENDENCE (MUST)
--------------------------------------------
- Implement provider adapter layer so JOE is not tied to one provider.
- Providers button in UI switches active provider.
- Provider routing may be Auto (optional), but must be traceable in run metadata.

ACCEPTANCE TESTS (Section 13)
- Switch provider and run: system uses selected provider (visible in run record).


SECTION 14 — INTEGRATIONS: OAUTH + GITHUB APP (MUST)
----------------------------------------------------
14.1 OAuth integration (like Manus-style login/connectors)
- Users can connect accounts through OAuth (e.g., Google), subject to policy.

14.2 GitHub App integration (official + secure)
- JOE interacts with GitHub via a GitHub App integration:
  - read repo, create branch, open PR, run checks.
- Must respect permissions separation:
  - Public keys can be visible to developer.
  - Secret keys remain with owner and never exposed.

ACCEPTANCE TESTS (Section 14)
- JOE opens a PR through GitHub App integration and links it as an artifact.


SECTION 15 — UI CONTENT & COMPONENTS (MUST)
-------------------------------------------
15.1 Required right panel tabs
- LIVE RUN
- BROWSER LIVE
- ARTIFACTS
- MEMORY
- COSTS (Joe Hours, tokens/time, budgets)
- OBSERVABILITY

15.2 Required chat blocks
- PLAN block
- RUN block (tool calls + step status)
- VERIFY block
- RESULT/ARTIFACT block

15.3 Yellow dominance implementation
- RUN button: full yellow with dark text.
- Status badges: yellow.
- Timeline progress: yellow.
- Approval headers: yellow.
- Keep background dark or white/sky-blue depending on theme.

ACCEPTANCE TESTS (Section 15)
- UI remains consistent with theme + language across all components.


SECTION 16 — DATA MODEL (MUST, HIGH-LEVEL)
------------------------------------------
Must store (at minimum):
- tenants
- users (roles, preferences)
- projects/workspaces
- chat_sessions
- messages
- runs (timelines)
- tool_executions (inputs/outputs/logs/permissions)
- artifacts (metadata + storage references)
- approvals
- memory_items (session/project/user)
- summaries
- embeddings index (for semantic search)

All must be persisted in MongoDB and tied to tenant/project boundaries.


SECTION 17 — DELIVERY PACKAGE (BUILDER MUST PROVIDE)
----------------------------------------------------
17.1 Working production
- Frontend deployed on Cloudflare to xelitesolutions.com
- Backend deployed on Render to api.xelitesolutions.com
- MongoDB connected (Atlas recommended)

17.2 Proof of “real system”
Provide demos/logs showing:
1) Login → /joe
2) Create chat → auto title → session list updated
3) New chat inherits project memory
4) Live Run streaming steps in real time
5) Browser operator opens site, fills form, asserts, screenshots
6) Real artifact produced (PR or deploy or generated file stored)
7) Theme toggle affects entire system
8) Language toggle affects entire system, Arabic RTL works
9) Tool registry returns >200 tools, sample tools execute and log

17.3 Documentation
- Architecture overview + module boundaries
- Threat model + permissions policy
- Deployment guide (Cloudflare + Render + domains + env vars)
- Runbooks + incident playbooks
- Tool catalog documentation
- List of required secrets/keys (with clear separation what builder can see vs owner-only)

FINAL STATEMENT
---------------
This is a strict build spec. The system must be a true integrated product, not a prototype with fake features. Every major feature must be testable and demonstrated with logs/artifacts.

End of spec.
"""

out_path = Path("/mnt/data/JOE_Master_Spec_XEliteSolutions_v1.0.txt")
out_path.write_text(content, encoding="utf-8")

str(out_path)
