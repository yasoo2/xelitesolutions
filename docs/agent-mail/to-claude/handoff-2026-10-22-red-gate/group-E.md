# Group E: 14 suites, 36 failing tests

## src/__tests__/wiring-policy.test.ts
- TEST: the planner is offered the whole toolbox, not a frozen list of seven an event with no address of its own inherits the run it came from
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /\}, \{ userId: goal\.context\?\.userId, sessionId: goal\.context\?\.sessionId \|\| goal\.id, runId: goal\.id \}\)/
        Received string:  "import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
        import { isArabicReply, say } from '../shared/reply-language';
        import { unrunnableShellStep } from '../core/orchestrator/plan-tools';
        import { IntentParser } from '../core/intelligence/IntentParser';
        import { executeTool } from '../modules/services/ToolService';
        import { broadcastThinkingDetail, broadcast } from '../api/ws';·
        import { announcePhase } from '../core/orchestrator/phaseAnnounce';
        import { narrate, narrationEnabled } from '../core/agents/narrator';
        import { routeToModel, isProviderFailure, PROVIDER_FAILURE_PREFIX } from '../core/llm/intelligent-router';
        import { emitDepartment } from './departments';
        import { randomUUID } from 'crypto';
        import { BaseAgent } from './agents/BaseAgent';
        import { SecurityAgent } from './agents/SecurityAgent';
        import { BrowserAgent } from './agents/BrowserAgent';
        import { ExecutionMemory, compactRuntimeValue } from '../core/orchestrator/ExecutionMemory';
        import { traceManager } from '../modules/services/TraceManager';
        import { executionFirewall } from './AgentExecutionFirewall';
        import intelligentRouter from '../core/llm/intelligent-router';
- TEST: an application build ships a program, not a brochure the app templates carry real behaviour, and the scaffolder reaches them
  culprit (first-parent commit where it turned red): 38d84ffc (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /for \(const c of appBp \? \[\] : \['Navbar', \.\.\.sections, 'Footer'\]\)/
        Received string:  "/**
         * STAGE 2 OF THE WORLD-CLASS ROADMAP — real Vite + React projects.
         *
         * Bolt and Lovable generate framework projects, not pages. Joe now does too —
         * with the discipline that makes his pages reliable applied to React: the
         * PROJECT SHAPE is deterministic (hand-written, parameterized templates that
         * compile by construction — a weak model is never asked to write JSX it might
         * break), the DESIGN comes from Joe's own palette engine (same tokens, same
         * AA guarantees, RTL first), and the CONTENT is derived from the request.
         *
         * The scaffold is a complete runnable project: package.json, vite.config,
         * React 18 components, router-free single-page App, tokens.css from the
         * palette. When npm is available the tool INSTALLS and BUILDS it on the spot
         * — streamed live to the terminal — so what is reported as working compiled
         * for real. `dev_server_start` (already in Joe) then serves it live.
         */
        import fs from 'fs';
        import http from 'http';
- SKIP (handled by the coordinator, routing cluster): what was not built is said out loud a bug report or an enhancement edits the app instead of rebuilding it
- TEST: a feed ships with a feed server the feed branch is the one that actually gets written to disk
  culprit (first-parent commit where it turned red): 0e2ff096 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /'auth\.js': fileAuthJs\(\),\n\s*'seed\.js': fileSeedJs\(\[\]/
        Received string:  "/**
         * THE BACKEND FRONT — Joe builds real APIs, not just faces.
         *
         * Every world-class builder eventually hits the same wall: a beautiful
         * frontend with nowhere to PUT anything. This tool scaffolds a complete,
         * runnable Express API with a REAL database and ZERO native dependencies:
         *
         *   - node:sqlite when the runtime carries it (Node ≥ 22.5 — the user's
         *     machine runs Node 24, where it is stable);
         *   - a JSON file store with the IDENTICAL interface otherwise, chosen at
         *     boot by the generated db.js itself — the API works on every Node, and
         *     /api/health tells you honestly which backend you got.
         *
         * The discipline is the same as the React scaffolder: hand-written
         * parameterized templates that run by construction (no model writes code),
         * kind-aware resources (a restaurant's API serves dishes, a store's serves
         * products), bounded validation, parameterized statements, and a LIVE PROOF
         * at the end — the tool boots the real server (through the Execution
- TEST: the full-stack claim matches the server that was built a feed is not told it has an orders table
  culprit (first-parent commit where it turned red): 3917fe1d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /apiLink && !feedApi \? apiLink\.replace/
        Received string:  "/**
         * STAGE 2 OF THE WORLD-CLASS ROADMAP — real Vite + React projects.
         *
         * Bolt and Lovable generate framework projects, not pages. Joe now does too —
         * with the discipline that makes his pages reliable applied to React: the
         * PROJECT SHAPE is deterministic (hand-written, parameterized templates that
         * compile by construction — a weak model is never asked to write JSX it might
         * break), the DESIGN comes from Joe's own palette engine (same tokens, same
         * AA guarantees, RTL first), and the CONTENT is derived from the request.
         *
         * The scaffold is a complete runnable project: package.json, vite.config,
         * React 18 components, router-free single-page App, tokens.css from the
         * palette. When npm is available the tool INSTALLS and BUILDS it on the spot
         * — streamed live to the terminal — so what is reported as working compiled
         * for real. `dev_server_start` (already in Joe) then serves it live.
         */
        import fs from 'fs';
        import http from 'http';
- TEST: the React head is publish-ready a console error names the resource it came from
  culprit (first-parent commit where it turned red): 862ba27b (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /l\?\.url \? ` ← \$\{String\(l\.url\)\.slice\(-60\)\}` : ''/
        Received string:  "/**
         * SELF-QA — Joe opens a REAL browser on the app it just built and MEASURES
         * it before handing it over. Not a linter, not a guess: the production dist
         * is served, Chromium loads it, and the checks are the ones a careful
         * reviewer runs by hand:
         *
         *   - page errors and console errors (a broken app announces itself here)
         *   - failed asset requests (the 404 that ships silently)
         *   - images that never painted (naturalWidth 0)
         *   - dead controls (href=\"\" / href=\"#\") — the oldest field complaint
         *   - tap targets under 40px among real controls
         *   - exactly one h1
         *   - the theme toggle actually CHANGES the colours (a shipped build once
         *     flipped the attribute while every colour stayed put)
         *
         * Honest by contract: when the browser cannot launch (a machine without the
         * Playwright browsers), the audit reports itself SKIPPED — it never invents
         * a score.
- TEST: a run keeps going while you read another conversation persists a fatal answer before releasing the run
  culprit (first-parent commit where it turned red): 49af37f2 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "persistChatStores()"
        Received string:    "Fatal runtime error:`, error);
                    // A deadline expiry is explained in the user's language, with the
                    // truthful promise the checkpoints make good on.
                    const failText = error?.message === CANCELLED
                        ? (language === 'ar'
                            ? '⛔ أوقفتُ التشغيل بناءً على طلبك. لم أتابع التخطيط ولم أنفّذ أي خطوة جديدة.'
                            : '⛔ The run was stopped at your request. I did not continue planning or execute any new step.')
                        : error instanceof DeadlineError
                        ? (language === 'ar'
                            ? `⚠️ تجاوزت المهمة حدّها الزمني الكلي (${Math.round(RUN_DEADLINE_MS / 60000)} دقيقة) فأوقفتُها بصدق بدل تركها معلّقة. أعد إرسال نفس الطلب وسيستأنف البناء من نقطة الحفظ دون إعا
                            : `⚠️ The task exceeded its total time limit (${Math.round(RUN_DEADLINE_MS / 60000)} min) and was stopped honestly instead of hanging. Send the same request again — the build r
                        : `⚠️ ${error?.message || uiText('unexpectedError', language)}`;
                    // A fatal path used to broadcast the answer but omit it from the
                    // offline chat archive. After a reconnect or session switch that
                    // made Joe's honest failure disappear and left only the old
                    // working line. Persist the same user-facing text as the success
                    // path so live delivery and recovery have one source of truth.
                    try {
- TEST: a run keeps going while you read another conversation serves persisted chat history in explicit offline mode
  culprit (first-parent commit where it turned red): 32db3692 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /readyState !== 1 && !isPersistenceDisabled && process\.env\.OFFLINE_MODE !== 'true'/
        Received string:  "import { Request, Response } from 'express';
        import { persistChatStores, usesLocalChatStore } from '../chat-store';
        import mongoose from 'mongoose';
        import { Session } from '../../shared/models/session';
        import { Tenant } from '../../shared/models/tenant';··
        import { workspaceService } from '../../modules/services/WorkspaceService';
        import { readJoeProjectForRun } from '../page-store';
        import { getRunEvidenceForSession } from '../../shared/run-evidence-store';
        import { sessionLogLines } from '../../core/session/session-log-store';
        import { logTextFor, logStampFor } from '../../core/session/log-line';
        import { publicUrlFor } from '../../shared/utils/publicUrl';·
        function isOfflineSessionStore(): boolean {
            return usesLocalChatStore();
        }·
        function requestUserId(req: Request): string {
            return String((req as any).auth?.sub || '').trim();
        }·
        function ownsSession(session: any, userId: string): boolean {
- TEST: a run keeps going while you read another conversation the stop control clears its session immediately after a confirmed stop
  culprit (first-parent commit where it turned red): c219da21 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /if \(rid \|\| sid\)[\s\S]{0,260}runs\/stop/
        Received string:  "import { useEffect, useMemo, useRef, useState, lazy, Suspense, forwardRef } from 'react';·
        import { uiTime } from '../lib/plainText';
        import { createPortal } from 'react-dom';
        import ReactMarkdown from 'react-markdown';
        import remarkBreaks from 'remark-breaks';
        import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
        import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';·
        import { useTranslation } from 'react-i18next';
        import i18next from 'i18next';
        import { API_URL as API, WS_URL as WS } from '../config';
        import { resolveIdentity } from '../lib/userIdentity';
        import { setRunBusy } from '../lib/run-activity';
        import { markRunning } from '../services/runningSessions';
        import { SocketService } from '../services/socket';
        import { motion, AnimatePresence } from 'framer-motion';·
        import NeuralThinkingIndicator from './NeuralThinkingIndicator';
        import TodosPanel from './TodosPanel';··
        // Web Speech API types
- TEST: a plan may only name tools that exist the executor checks again, because a phase can arrive from anywhere
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /if \(!resolved\.tool\)[\s\S]{0,400}execution:\s*['"]skipped['"][\s\S]{0,40}continue;/
        Received string:  "import { ToolDefinition, ToolPermission } from '../types';
        import fs from 'fs';
        import path from 'path';
        import { isWithinRoot } from '../path-containment';
        import { persistJoeProjects, samePipelineRun, writeJoeProject } from '../../../api/page-store';
        import { workspaceService } from '../../services/WorkspaceService';·
        import { recoverMissingNpmLauncher } from '../npm-launcher-recovery';
        export { recoverMissingNpmLauncher } from '../npm-launcher-recovery';
        import { executeTool } from '../../services/ToolService';
        import { normalizeConceptualArtifactPath } from '../runtime-artifact-path';
        import { compactApiSelectionArtifact } from '../../../core/api-discovery/integration-profiles';
        import type { ApiSelectionArtifact } from '../../../core/api-discovery/types';
        import { capabilityProfilesFor } from '../../../core/capabilities/decision-profiles';
        import {
            compactVerificationLedger,
            isVerificationTool,
            recordVerification,
            selectVerification,
- TEST: the biggest request gets the strongest route the pipeline discovers evidence, plans phases, then executes verification
  culprit (first-parent commit where it turned red): 3d0b0be6 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "projectPath ? { request: productRequest, path: projectPath } : { request: productRequest }"
        Received string:    "import { ToolDefinition, ToolPermission } from '../types';
        import { ensurePlanFinalVerification } from '../../../core/quality/plan-verification';
        import { isWithinRoot } from '../path-containment';
        import fs from 'fs';
        import path from 'path';
        import { executeTool } from '../../services/ToolService';
        import { workspaceService } from '../../services/WorkspaceService';
        import { isArabicReply, say as pick } from '../../../shared/reply-language';
        import { brandFrom } from '../../../core/design/page-head';
        import { scopeReport } from '../../../core/quality/scope-audit';
        import { verifyProviderDirect } from '../../../core/llm/intelligent-router';
        import { detectStart, missingRuntimeDependencies, reconcileMissingRuntimeTarget, resolveRunnableProject } from './ProjectRunTool';
        import { auditBuiltApp, AppAudit, findingText } from '../../../core/quality/app-audit';
        import { readJoeProjectForRun } from '../../../api/page-store';
        import { hasExplicitRecordSchema } from '../../../core/design/app-blueprints';
        import { guardUnverifiedBuilderClaims } from '../../../core/api-discovery/reporting';
        import { publicUrlFor } from '../../../shared/utils/publicUrl';
        import { integrationProfile } from '../../../core/api-discovery/integration-profiles';·
- TEST: the server stores what the app sends the schema comes from the same blueprint the interface renders
  culprit (first-parent commit where it turned red): 3917fe1d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /const columns = isProductivity[\s\S]{0,240}primaryDesignedColumns[\s\S]{0,240}promotedColumns[\s\S]{0,120}requestColumns/
        Received string:  "/**
         * THE BACKEND FRONT — Joe builds real APIs, not just faces.
         *
         * Every world-class builder eventually hits the same wall: a beautiful
         * frontend with nowhere to PUT anything. This tool scaffolds a complete,
         * runnable Express API with a REAL database and ZERO native dependencies:
         *
         *   - node:sqlite when the runtime carries it (Node ≥ 22.5 — the user's
         *     machine runs Node 24, where it is stable);
         *   - a JSON file store with the IDENTICAL interface otherwise, chosen at
         *     boot by the generated db.js itself — the API works on every Node, and
         *     /api/health tells you honestly which backend you got.
         *
         * The discipline is the same as the React scaffolder: hand-written
         * parameterized templates that run by construction (no model writes code),
         * kind-aware resources (a restaurant's API serves dishes, a store's serves
         * products), bounded validation, parameterized statements, and a LIVE PROOF
         * at the end — the tool boots the real server (through the Execution
- TEST: the server stores what the app sends a declared parent table reaches the database, the routes and the interface
  culprit (first-parent commit where it turned red): 3917fe1d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /'server\.js': fileServerJs\(resource, brand, path\.basename\(proj\), relation, model\)/
        Received string:  "/**
         * THE BACKEND FRONT — Joe builds real APIs, not just faces.
         *
         * Every world-class builder eventually hits the same wall: a beautiful
         * frontend with nowhere to PUT anything. This tool scaffolds a complete,
         * runnable Express API with a REAL database and ZERO native dependencies:
         *
         *   - node:sqlite when the runtime carries it (Node ≥ 22.5 — the user's
         *     machine runs Node 24, where it is stable);
         *   - a JSON file store with the IDENTICAL interface otherwise, chosen at
         *     boot by the generated db.js itself — the API works on every Node, and
         *     /api/health tells you honestly which backend you got.
         *
         * The discipline is the same as the React scaffolder: hand-written
         * parameterized templates that run by construction (no model writes code),
         * kind-aware resources (a restaurant's API serves dishes, a store's serves
         * products), bounded validation, parameterized statements, and a LIVE PROOF
         * at the end — the tool boots the real server (through the Execution
- TEST: the generated app can sign in to its own server and one Joe-built system never borrows another's session
  culprit (first-parent commit where it turned red): 0e2ff096 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /const TOKEN_KEY = 'joe:auth:' \+/
        Received string:  "/**
         * THE APPLICATION HALF OF A REACT BUILD.
         *
         * `ReactProjectTool` knows how to make a beautiful presentation site. That is
         * the right answer for a café and the wrong answer for «تطبيق خرائط»: the user
         * received Hero + Features + FAQ + a restaurant menu and no map at all, and
         * said so — «معرض صور وكلمات وليس تطبيقات حقيقية».
         *
         * So an app request no longer goes through the section library. It goes
         * through here, and gets a program: state, storage, input, validation,
         * computed numbers, and a real integration where the domain demands one
         * (Leaflet + OpenStreetMap for a map, open-meteo for weather, the session's
         * own Joe API for anything that owns rows).
         *
         * The shell and low-level primitives are hand-written and parameterized — the
         * same discipline the page builder uses. They are scaffolding, not a substitute
         * for domain reasoning: a request-driven engine may be omitted here and authored
         * by Joe's AI file writer from the user's evidence, then `vite build` proves the
- TEST: the team reaches the roles the accounts screen is written into the project whenever a server exists
  culprit (first-parent commit where it turned red): 0e2ff096 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /\.\.\.\(o\.api \? \{ 'src\/components\/Accounts\.jsx': fileAccountsJsx\(o\.isArabic\) \} : \{\}\)/
        Received string:  "/**
         * THE APPLICATION HALF OF A REACT BUILD.
         *
         * `ReactProjectTool` knows how to make a beautiful presentation site. That is
         * the right answer for a café and the wrong answer for «تطبيق خرائط»: the user
         * received Hero + Features + FAQ + a restaurant menu and no map at all, and
         * said so — «معرض صور وكلمات وليس تطبيقات حقيقية».
         *
         * So an app request no longer goes through the section library. It goes
         * through here, and gets a program: state, storage, input, validation,
         * computed numbers, and a real integration where the domain demands one
         * (Leaflet + OpenStreetMap for a map, open-meteo for weather, the session's
         * own Joe API for anything that owns rows).
         *
         * The shell and low-level primitives are hand-written and parameterized — the
         * same discipline the page builder uses. They are scaffolding, not a substitute
         * for domain reasoning: a request-driven engine may be omitted here and authored
         * by Joe's AI file writer from the user's evidence, then `vite build` proves the
- TEST: the team reaches the roles and the shell imports it and renders it
  culprit (first-parent commit where it turned red): 0e2ff096 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /'src\/App\.jsx': fileAppShellJsx\(bp, o\.isArabic, !!\(o\.model && o\.model\.length\), !!o\.api\)/
        Received string:  "/**
         * THE APPLICATION HALF OF A REACT BUILD.
         *
         * `ReactProjectTool` knows how to make a beautiful presentation site. That is
         * the right answer for a café and the wrong answer for «تطبيق خرائط»: the user
         * received Hero + Features + FAQ + a restaurant menu and no map at all, and
         * said so — «معرض صور وكلمات وليس تطبيقات حقيقية».
         *
         * So an app request no longer goes through the section library. It goes
         * through here, and gets a program: state, storage, input, validation,
         * computed numbers, and a real integration where the domain demands one
         * (Leaflet + OpenStreetMap for a map, open-meteo for weather, the session's
         * own Joe API for anything that owns rows).
         *
         * The shell and low-level primitives are hand-written and parameterized — the
         * same discipline the page builder uses. They are scaffolding, not a substitute
         * for domain reasoning: a request-driven engine may be omitted here and authored
         * by Joe's AI file writer from the user's evidence, then `vite build` proves the
- TEST: the built system is ready for a domain and the interface is packaged INTO the server when both exist
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /prevEntry\?\.type === 'api' && prevEntry\?\.dir && fs\.existsSync\(prevEntry\.dir\)/
        Received string:  "/**
         * STAGE 2 OF THE WORLD-CLASS ROADMAP — real Vite + React projects.
         *
         * Bolt and Lovable generate framework projects, not pages. Joe now does too —
         * with the discipline that makes his pages reliable applied to React: the
         * PROJECT SHAPE is deterministic (hand-written, parameterized templates that
         * compile by construction — a weak model is never asked to write JSX it might
         * break), the DESIGN comes from Joe's own palette engine (same tokens, same
         * AA guarantees, RTL first), and the CONTENT is derived from the request.
         *
         * The scaffold is a complete runnable project: package.json, vite.config,
         * React 18 components, router-free single-page App, tokens.css from the
         * palette. When npm is available the tool INSTALLS and BUILDS it on the spot
         * — streamed live to the terminal — so what is reported as working compiled
         * for real. `dev_server_start` (already in Joe) then serves it live.
         */
        import fs from 'fs';
        import http from 'http';

## src/__tests__/the-run-opens-the-system.test.ts
- TEST: readiness does not adopt a stranger's server an unconfirmed server yields an explicit verification failure, never a dead URL
  culprit (first-parent commit where it turned red): 75e32c75 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "ok: false"
        Received string:    "if (!livePort) {
                    // A verified bundle is still a useful browser target when a dev
                    // server cannot boot in the host environment (for example when
                    // esbuild is blocked by a Windows sandbox). Stop the failed child
                    // first, then serve only the already-built artifact through the
                    // same gateway. Browser QA remains mandatory and can still expose
                    // missing backend behaviour instead of turning this into success.
                    if (pid) await killTree(Number(pid)).catch(() => {});
                    const builtRoot = builtPreviewRoot(cwd);
                    if (builtRoot) {
                        logs.push(`project_run: dev server unconfirmed; trying verified static bundle (${builtRoot})`);
                        const fallback = await startStaticBuildPreview(builtRoot, port);
                        if (fallback.ready && fallback.url && fallback.pid) {
                            RUNNING.set(key, { pid: fallback.pid, port, cwd: builtRoot, command: 'node static-preview', startedAt: Date.now() });
                            rememberLiveProject(context, builtRoot, { url: fallback.url, port, pid: fallback.pid }, cwd);
                            say(pick(isAr,
                                `✅ الخادم التطويري لم يبدأ، لكن نسخة الإنتاج المبنية تعمل الآن — المعاينة: ${fallback.url}`,
                                `✅ The dev server did not boot, but the verified production bundle is live — preview: ${fallback.url}`));
- TEST: an already-running system is adopted, not raced project_run probes the remembered address before starting anything
  culprit (first-parent commit where it turned red): 3917fe1d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /if \(!input\?\.cwd && !input\?\.command && liveUrl && canAdoptRecordedLive\(live, cwd\) && await answersHttp\(liveUrl\)\)/
        Received string:  "import { ToolDefinition, ToolPermission } from '../types';·
        import { isWithinRoot } from '../path-containment';·
        import { ExecutionGateway } from '../../../kernel/ExecutionGateway';·
        import { NpmManagerTool } from './SystemTools';·
        import { workspaceService } from '../../services/WorkspaceService';·
        import { isPortOpen } from '../../../shared/utils/network';·
        import { isArabicReply, say as pick } from '../../../shared/reply-language';·
        import * as fs from 'fs';
        import * as http from 'http';
        import * as path from 'path';
        import { builtinModules } from 'module';·
        import { persistJoeProjects, readJoeProjectForRun, writeJoeProject } from '../../../api/page-store';···
        /**·
         * project_run / project_stop — actually RUN a built system, not just render a·
         * static page.·
         *·
         * A web PAGE previews by loading an HTML file. A SYSTEM (a Node/Express backend,·
         * a React/Vite app, a full-stack project) is a PROGRAM: it must be started, kept·
- TEST: an already-running system is adopted, not raced adoption needs a real HTTP answer, not just an open port
  culprit (first-parent commit where it turned red): c219da21 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "return res.status < 500;"
        Received string:    "import { ToolDefinition, ToolPermission } from '../types';·
        import { isWithinRoot } from '../path-containment';·
        import { ExecutionGateway } from '../../../kernel/ExecutionGateway';·
        import { NpmManagerTool } from './SystemTools';·
        import { workspaceService } from '../../services/WorkspaceService';·
        import { isPortOpen } from '../../../shared/utils/network';·
        import { isArabicReply, say as pick } from '../../../shared/reply-language';·
        import * as fs from 'fs';
        import * as http from 'http';
        import * as path from 'path';
        import { builtinModules } from 'module';·
        import { persistJoeProjects, readJoeProjectForRun, writeJoeProject } from '../../../api/page-store';···
        /**·
         * project_run / project_stop — actually RUN a built system, not just render a·
         * static page.·
         *·
         * A web PAGE previews by loading an HTML file. A SYSTEM (a Node/Express backend,·
         * a React/Vite app, a full-stack project) is a PROGRAM: it must be started, kept·
- TEST: an already-running system is adopted, not raced an explicit cwd or command still starts fresh — adoption is the default only
  culprit (first-parent commit where it turned red): 3917fe1d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "!input?.cwd && !input?.command && liveUrl"
        Received string:    "import { ToolDefinition, ToolPermission } from '../types';·
        import { isWithinRoot } from '../path-containment';·
        import { ExecutionGateway } from '../../../kernel/ExecutionGateway';·
        import { NpmManagerTool } from './SystemTools';·
        import { workspaceService } from '../../services/WorkspaceService';·
        import { isPortOpen } from '../../../shared/utils/network';·
        import { isArabicReply, say as pick } from '../../../shared/reply-language';·
        import * as fs from 'fs';
        import * as http from 'http';
        import * as path from 'path';
        import { builtinModules } from 'module';·
        import { persistJoeProjects, readJoeProjectForRun, writeJoeProject } from '../../../api/page-store';···
        /**·
         * project_run / project_stop — actually RUN a built system, not just render a·
         * static page.·
         *·
         * A web PAGE previews by loading an HTML file. A SYSTEM (a Node/Express backend,·
         * a React/Vite app, a full-stack project) is a PROGRAM: it must be started, kept·

## src/__tests__/terminal-wiring.test.ts
- TEST: the stream is live, not a post-hoc flood a tool that streamed live is not flushed a second time
  culprit (first-parent commit where it turned red): 3917fe1d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /if \(!\(res as any\)\?\.logsStreamedLive\)/
        Received string:  "
        import { tools } from '../tools/registry';
        import { vectorDb } from './vectorDb';
        import fs from 'fs';
        import path from 'path';
        import { glob } from 'glob';
        import { ToolDefinition } from '../tools/types';
        import { redactSecretsFromString } from '../../shared/utils/redaction';
        import { paintLine } from '../../core/terminal/paint';
        import { normalizeUrlForGoto } from '../../shared/utils/url';
        import { traceManager } from './TraceManager';
        import { isArabicReply, say } from '../../shared/reply-language';
        import { executionFirewall } from '../../orchestration/AgentExecutionFirewall';
        import { isApologyOnly, apologyText } from '../../shared/utils/honestResult';
        import { agentSearchUrl } from '../browser/challenge';·
        // Rate Limiting Logic (Ported) with periodic cleanup to prevent memory leaks
        const toolRateBuckets = new Map<string, { minute: number; count: number }>();
        const TOOL_RATE_BUCKET_MAX = 1000;·

## src/__tests__/attachments.test.ts
- TEST: attachments — visible in the chat, and after a reload, with real names the server echo and the stored message both carry the chips (meta only)
  culprit (first-parent commit where it turned red): 862ba27b (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /role: 'user', content: text, attachments: attachmentMeta\(\)/
        Received string:  "import { Router, Request, Response } from 'express';
        import mongoose from 'mongoose';
        import fs from 'fs';
        import path from 'path';
        import { AgentLoopService } from '../../modules/services/AgentLoopService';
        import { authenticate, authenticateOptional } from '../middleware/auth';
        import { loadUploadedFiles } from './files';
        import { persistChatStores } from '../chat-store';
        import { Run } from '../../shared/models/run';
        import { ToolExecution } from '../../shared/models/toolExecution';
        import { Artifact } from '../../shared/models/artifact';
        import { Session } from '../../shared/models/session';
        import { traceManager } from '../../modules/services/TraceManager';
        import { broadcast } from '../ws';
        import { getRunEvidence, getRunEvidenceForSession } from '../../shared/run-evidence-store';
        import { getActiveRunSessions, registerRunSession, unregisterRunSession, sessionOwnerOf, runOwnerOf } from '../ws';
        import { registerRun, releaseHandle } from '../../core/session/attended-run';
        import { workspaceService } from '../../modules/services/WorkspaceService';

## src/__tests__/run-start-browser-fallback.test.ts
- TEST: run/start preserves browser ownership on the first message resolves a new chat session before it can touch attachment memory or persistence
  culprit (first-parent commit where it turned red): 862ba27b (state before it: pass)
  raw failure at 917c70e:
        expect(received).toBeGreaterThan(expected)
        Expected: > 9743
        Received:   -1
          64 |         expect(attachmentMemory).toBeGreaterThan(resolved);
          65 |         expect(persistedMessage).toBeGreaterThan(resolved);
        > 66 |         expect(trace).toBeGreaterThan(resolved);
             |                       ^
          67 |     });
          68 | });
          69 |
          at Object.<anonymous> (__tests__/run-start-browser-fallback.test.ts:66:23)

## src/__tests__/command-composer-browser-session.test.ts
- TEST: each Joe run carries the browser of its chat session derives the browser session before any text-specific browser detection
  culprit (first-parent commit where it turned red): c219da21 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toBeGreaterThan(expected)
        Expected: > 0
        Received:   -1
          10 |         const deriveAt = src.indexOf('let effectiveBrowserSessionId = browserSessionId || (sessionId ? `browser:${sessionId}` : undefined);');
          11 |         const textGateAt = src.indexOf('needsBrowserForText(inputText)');
        > 12 |         expect(deriveAt).toBeGreaterThan(0);
             |                          ^
          13 |         expect(textGateAt).toBeGreaterThan(deriveAt);
          14 |     });
          15 |
          at Object.<anonymous> (__tests__/command-composer-browser-session.test.ts:12:26)
- TEST: each Joe run carries the browser of its chat session sends that effective session in the run payload
  culprit (first-parent commit where it turned red): c219da21 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /sessionId,\s*\n\s*browserSessionId: effectiveBrowserSessionId \|\| undefined,/
        Received string:  "const payload: any = {
                type: 'run_start',
                text: inputText,
                sessionId: runSessionId,
                browserSessionId: effectiveBrowserSessionId || undefined,
                fileIds: filesForRun.map(f => f.id),
                provider: providerToSend,
                model: providerCfgToSend?.model,
                apiKey: providerCfgToSend?.apiKey,
                baseUrl: providerCfgToSend?.baseUrl,
                workspaceId: workspaceId || undefined,
                // The language chosen in the switcher. Without it the server had no idea
                // which language to answer in and every reply came back Arabic, however
                // the interface was set.
                // Read the language from the rendered document at send time. The
                // switcher updates <html lang> immediately, while the i18next object
                // can still hold the previous value during a language transition.
                language: String(
- TEST: each Joe run carries the browser of its chat session preserves an explicitly supplied browser session over the derived fallback
  culprit (first-parent commit where it turned red): c219da21 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "browserSessionId || (sessionId ? `browser:${sessionId}` : undefined)"
        Received string:    "import { useEffect, useMemo, useRef, useState, lazy, Suspense, forwardRef } from 'react';·
        import { uiTime } from '../lib/plainText';
        import { createPortal } from 'react-dom';
        import ReactMarkdown from 'react-markdown';
        import remarkBreaks from 'remark-breaks';
        import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
        import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';·
        import { useTranslation } from 'react-i18next';
        import i18next from 'i18next';
        import { API_URL as API, WS_URL as WS } from '../config';
        import { resolveIdentity } from '../lib/userIdentity';
        import { setRunBusy } from '../lib/run-activity';
        import { markRunning } from '../services/runningSessions';
        import { SocketService } from '../services/socket';
        import { motion, AnimatePresence } from 'framer-motion';·
        import NeuralThinkingIndicator from './NeuralThinkingIndicator';
        import TodosPanel from './TodosPanel';··
        // Web Speech API types

## src/__tests__/project-preview.test.ts
- TEST: the preview loop is WIRED, end to end the local Joe UI proxies durable previews to the API instead of serving its own SPA
  culprit (first-parent commit where it turned red): a9b88495 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "const apiTarget = 'http://127.0.0.1:5000'"
        Received string:    "import { defineConfig } from 'vite';
        import react from '@vitejs/plugin-react-swc';
        import { Buffer } from 'node:buffer';·
        const createJson = (res: any, statusCode: number, body: any) => {
          res.statusCode = statusCode;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };·
        const createNoContent = (res: any) => {
          res.statusCode = 204;
          res.end();
        };·
        const createApiShim = () => {
          return (_req: any, _res: any, next: any) => next();
        };·
        // An isolated worktree can run its own API without disturbing the user's
        // existing local Joe instance. The default remains the normal development API.
        const apiTarget = process.env.JOE_API_TARGET || 'http://127.0.0.1:5000';

## src/__tests__/a-server-that-outlives-its-round.test.ts
- TEST: the previous server is retired before a new one is born a retirement exists and runs before the launch
  culprit (first-parent commit where it turned red): aa64954a (state before it: pass)
  raw failure at 917c70e:
        expect(received).toBeGreaterThan(expected)
        Expected: > 0
        Received:   -1
          45 |         const launch = SOURCE.indexOf('const res = await ExecutionGateway.execute(detected.command');
          46 |         expect(retire).toBeGreaterThan(0);
        > 47 |         expect(launch).toBeGreaterThan(0);
             |                        ^
          48 |         expect(retire).toBeLessThan(launch);
          49 |     });
          50 |
          at Object.<anonymous> (__tests__/a-server-that-outlives-its-round.test.ts:47:24)

## src/__tests__/a-flag-nothing-reads-is-a-flag-that-was-never-set.test.ts
- TEST: the key the router reads is the key every caller writes ⛔ NEGATIVE — no production file passes a key the router does not read
  culprit (first-parent commit where it turned red): a8ebf2e0 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toEqual(expected) // deep equality
        - Expected  - 1
        + Received  + 3
        - Array []
        + Array [
        +   "intelligent-router.ts:287",
        + ]
          93 |             });
          94 |         }
        > 95 |         expect(offenders).toEqual([]);
             |                           ^
          96 |     });
          97 |
          98 |     it('⛔ NEGATIVE — and the correct key is what the tree is actually built on', () => {
          at Object.<anonymous> (__tests__/a-flag-nothing-reads-is-a-flag-that-was-never-set.test.ts:95:27)

## src/__tests__/react-project.test.ts
- TEST: dependency reuse only trusts a complete Vite tree identifies Rollup when esbuild starts but the Rollup native binding cannot load
  culprit (first-parent commit where it turned red): 5d2cac0e (state before it: absent)
  raw failure at 917c70e:
        expect(received).toBe(expected) // Object.is equality
        Expected: "rollup"
        Received: null
          253 |             return args.some(part => part.includes('rollup')) ? 1 : 0;
          254 |         });
        > 255 |         expect(broken).toBe('rollup');
              |                        ^
          256 |         expect(executed).toEqual([
          257 |             [path.join('node_modules', 'esbuild', 'bin', 'esbuild'), '--version'],
          258 |             [path.join('node_modules', 'rollup', 'dist', 'bin', 'rollup'), '--version'],
          at Object.<anonymous> (__tests__/react-project.test.ts:255:24)
- TEST: dependency reuse only trusts a complete Vite tree keeps dependencies untouched when the native executable probe times out
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: absent)
  raw failure at 917c70e:
        expect(received).resolves.toBe(expected) // Object.is equality
        Expected: "indeterminate"
        Received: null
          264 |         const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-native-probe-timeout-'));
          265 |         writeTree(tmp, baseManifest);
        > 266 |         await expect(findBrokenNativeBuildTool(tmp, async () => -2)).resolves.toBe('indeterminate');
              |                                                                               ^
          267 |         fs.rmSync(tmp, { recursive: true, force: true });
          268 |     });
          269 |
          at Object.toBe (../node_modules/expect/build/index.js:2140:20)
          at Object.<anonymous> (__tests__/react-project.test.ts:266:79)

## src/__tests__/npm-quarantine-integration.test.ts
- TEST: generated-project npm quarantine boundary runs the held install script through scoped approval plus rebuild in a fresh project
  culprit (first-parent commit where it turned red): 82179eeb (state before it: absent)
  raw failure at 917c70e:
        expect(received).toEqual(expected) // deep equality
        - Expected  - 3
        + Received  + 4
          Object {
        -   "approvalExit": 0,
        -   "ok": true,
        -   "rebuildExit": 0,
        +   "approvalExit": 1,
        +   "failedAt": "approval",
        +   "ok": false,
        +   "rebuildExit": null,
          }
          55 |
          56 |             const repaired = await repairQuarantinedEsbuildInstall(project, run, verify);
        > 57 |             expect(repaired).toEqual({ ok: true, approvalExit: 0, rebuildExit: 0 });
             |                              ^
          58 |             expect(fs.readFileSync(path.join(project, 'node_modules', 'esbuild', 'install-proof.txt'), 'utf8')).toBe('rebuilt');
          59 |             await expect(verify()).resolves.toBe(true);

## src/__tests__/deadline.test.ts
- TEST: deadline wiring — the guards are actually in the pipeline every node execution branch in the orchestrator runs under a deadline
  culprit (first-parent commit where it turned red): 862ba27b (state before it: pass)
  raw failure at 917c70e:
        expect(received).toBeGreaterThanOrEqual(expected)
        Expected: >= 5
        Received:    4
          45 |         const rawAwaits = src.match(/(?<!const )result = await (?!deadline\()/g) || [];
          46 |         expect(rawAwaits).toHaveLength(0);
        > 47 |         expect((src.match(/result = await deadline\(/g) || []).length).toBeGreaterThanOrEqual(5);
             |                                                                        ^
          48 |     });
          49 |
          50 |     test('the whole run is capped in AgentLoopService, with a localized explanation', () => {
          at Object.<anonymous> (__tests__/deadline.test.ts:47:72)

## src/__tests__/what-orion-got-wrong.test.ts
- TEST: a missing interpreter is a skipped check, never a manufactured failure the shared pipeline discovers first and propagates verification evidence
  culprit (first-parent commit where it turned red): 3d0b0be6 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "projectPath ? { request: productRequest, path: projectPath } : { request: productRequest }"
        Received string:    "import { ToolDefinition, ToolPermission } from '../types';
        import { ensurePlanFinalVerification } from '../../../core/quality/plan-verification';
        import { isWithinRoot } from '../path-containment';
        import fs from 'fs';
        import path from 'path';
        import { executeTool } from '../../services/ToolService';
        import { workspaceService } from '../../services/WorkspaceService';
        import { isArabicReply, say as pick } from '../../../shared/reply-language';
        import { brandFrom } from '../../../core/design/page-head';
        import { scopeReport } from '../../../core/quality/scope-audit';
        import { verifyProviderDirect } from '../../../core/llm/intelligent-router';
        import { detectStart, missingRuntimeDependencies, reconcileMissingRuntimeTarget, resolveRunnableProject } from './ProjectRunTool';
        import { auditBuiltApp, AppAudit, findingText } from '../../../core/quality/app-audit';
        import { readJoeProjectForRun } from '../../../api/page-store';
        import { hasExplicitRecordSchema } from '../../../core/design/app-blueprints';
        import { guardUnverifiedBuilderClaims } from '../../../core/api-discovery/reporting';
        import { publicUrlFor } from '../../../shared/utils/publicUrl';
        import { integrationProfile } from '../../../core/api-discovery/integration-profiles';·

## src/__tests__/what-you-built-and-what-you-did-not.test.ts
- TEST: the builder's own words survive the phase a FAILED task still reports its error, not a message
  culprit (first-parent commit where it turned red): 0f866ad2 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /task:\s*taskDesc,\s*tool:\s*toolName,\s*ok:\s*false,\s*execution:\s*['"]ran['"],\s*error:\s*(?:errMsg|currentRunError),/
        Received string:  "import { ToolDefinition, ToolPermission } from '../types';
        import fs from 'fs';
        import path from 'path';
        import { isWithinRoot } from '../path-containment';
        import { persistJoeProjects, samePipelineRun, writeJoeProject } from '../../../api/page-store';
        import { workspaceService } from '../../services/WorkspaceService';·
        import { recoverMissingNpmLauncher } from '../npm-launcher-recovery';
        export { recoverMissingNpmLauncher } from '../npm-launcher-recovery';
        import { executeTool } from '../../services/ToolService';
        import { normalizeConceptualArtifactPath } from '../runtime-artifact-path';
        import { compactApiSelectionArtifact } from '../../../core/api-discovery/integration-profiles';
        import type { ApiSelectionArtifact } from '../../../core/api-discovery/types';
        import { capabilityProfilesFor } from '../../../core/capabilities/decision-profiles';
        import {
            compactVerificationLedger,
            isVerificationTool,
            recordVerification,
            selectVerification,
- TEST: the delivery report relays what was measured it collects every message the phases carried
  culprit (first-parent commit where it turned red): 3e3ea28f (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /const msg = String\(t\?\.message \|\| ''\)\.trim\(\);/
        Received string:  "import { ToolDefinition, ToolPermission } from '../types';
        import { ensurePlanFinalVerification } from '../../../core/quality/plan-verification';
        import { isWithinRoot } from '../path-containment';
        import fs from 'fs';
        import path from 'path';
        import { executeTool } from '../../services/ToolService';
        import { workspaceService } from '../../services/WorkspaceService';
        import { isArabicReply, say as pick } from '../../../shared/reply-language';
        import { brandFrom } from '../../../core/design/page-head';
        import { scopeReport } from '../../../core/quality/scope-audit';
        import { verifyProviderDirect } from '../../../core/llm/intelligent-router';
        import { detectStart, missingRuntimeDependencies, reconcileMissingRuntimeTarget, resolveRunnableProject } from './ProjectRunTool';
        import { auditBuiltApp, AppAudit, findingText } from '../../../core/quality/app-audit';
        import { readJoeProjectForRun } from '../../../api/page-store';
        import { hasExplicitRecordSchema } from '../../../core/design/app-blueprints';
        import { guardUnverifiedBuilderClaims } from '../../../core/api-discovery/reporting';
        import { publicUrlFor } from '../../../shared/utils/publicUrl';
        import { integrationProfile } from '../../../core/api-discovery/integration-profiles';·
