/**
 * agent_engine: ONE BUILD, RUN BY THE GENERAL AGENT ENGINE.
 *
 * The orchestrator hands a build node here when the run asks for the agent
 * engine (core/engine/select.ts). This tool assembles one run of it:
 *
 *   - the project folder, inside the workspace root Joe resolved for this
 *     request, registered where the preview finds it;
 *   - the model the deployment configured;
 *   - the fixed tool list, every action of which is a registered engine_*
 *     ToolService tool, so approval, ownership, cancellation and the Single
 *     Execution Authority all still apply;
 *   - the verifier: Joe's delivery gates plus the acceptance judge;
 *   - the live events.
 *
 * It returns the shape the project pipeline returns (pipelineFinal, the
 * delivery-verification phase with projectRoot and task receipts). The
 * orchestrator therefore treats the outcome as final, the run receipt carries
 * the project root, and the exam reads the run exactly as it reads the first
 * engine's.
 */
import path from 'path';
import { ToolDefinition } from '../types';
import { runEngine } from '../../../core/engine/loop';
import { planUpdateTool } from '../../../core/engine/plan';
import { finishTool } from '../../../core/engine/finish';
import { engineModelChoiceFor, engineBrain } from '../../../core/engine/model';
import { changeContextFor, projectFolderFor, projectOriginFor, recordRunHistory, registerProjectFolder, registeredRequestFor, uiEmitter } from '../../../core/engine/run';
import { fileTools } from '../../../core/engine/tools/files';
import { shellTools, createProcessRegistry } from '../../../core/engine/tools/shell';
import { browserTools, createBrowserSession } from '../../../core/engine/tools/browser';
import { webTools } from '../../../core/engine/tools/web';
import { machineFacts } from './EngineShellTools';
import { createVerifier, deliveryOutput, measureProjectSource, type DeliveryVerification } from '../../../core/engine/verify';
import { clearDeliveryProof, deliveryProof, writeDeliveryCertificate } from '../../../core/engine/certificate';
import { seedRequirementsFromRequest } from '../../../core/engine/seed';
import { RUN_DEADLINE_MS } from '../../../shared/utils/deadline';
import { replyLanguageCode } from '../../../shared/reply-language';
import { bindRunCancellation } from '../../../core/session/attended-run';
import { workspaceService } from '../../services/WorkspaceService';
import { deviceTools, forgetDeviceRecord } from '../../../core/engine/tools/devices';
import { androidTools, forgetAndroid } from '../../../core/engine/tools/android';
import { isPhoneRequest, operateOutput, operateVerifier } from '../../../core/engine/operate';
import { noteOperateResult } from '../../../core/engine/device-work';
import fs from 'fs';

/** The engine stops this long before the run's own deadline, so it can end honestly and say why. */
const DEADLINE_MARGIN_MS = 2 * 60_000;

/**
 * An operate run: the same loop, the device tools, the operate verifier. Its
 * folder holds only the run's state (screens, logs, the transcript), under
 * the workspace's «operate» folder; it is never registered as the chat's
 * project, so a later «change it» does not mistake it for one.
 */
async function runOperate(o: {
    request: string; runId: string; language: string; replyLanguage: string; deadlineAt: number;
    activeRoot: string; context: any; brain: any; signal: AbortSignal; target?: 'phone' | 'computer';
}) {
    const dir = path.join(o.activeRoot, 'operate', o.runId.replace(/[^A-Za-z0-9_.-]/gu, '_'));
    fs.mkdirSync(dir, { recursive: true });
    const toolContext = {
        ...o.context, runId: o.runId, language: o.language, projectRoot: dir, projectRootRuntimeBound: true,
        isCancelled: () => o.signal.aborted || (typeof o.context.isCancelled === 'function' && o.context.isCancelled() === true),
    };
    try {
        const result = await runEngine({
            runId: o.runId, request: o.request, language: o.language, projectDir: dir, deadlineAt: o.deadlineAt,
            replyLanguage: o.replyLanguage, operate: true, ...(o.target ? { operateTarget: o.target } : {}),
            signal: o.signal, emit: uiEmitter(o.context.sessionId, o.runId, o.replyLanguage, path.basename(dir)),
            joe: { toolContext, runId: o.runId, sessionId: o.context.sessionId, userId: o.context.userId, workspaceId: o.context.workspaceId },
        }, {
            model: o.brain.model,
            tools: [planUpdateTool, ...deviceTools, ...androidTools, ...webTools, finishTool(operateVerifier())],
            processes: createProcessRegistry(toolContext),
            browser: () => createBrowserSession(toolContext),
            machine: await machineFacts(),
        });
        const out = operateOutput(result, o.replyLanguage);
        //  The chat's answerer reads what was done here (operate.ts deviceWorkFacts).
        noteOperateResult(o.context.sessionId, { target: o.target || (isPhoneRequest(o.request) ? 'phone' : 'computer'), request: o.request, summary: String(result?.summary || out.output?.summary || ''), ok: out.ok });
        return {
            ok: out.ok,
            ...(out.ok ? {} : { error: out.error }),
            output: out.output,
            logs: [`agent engine (operate): ${result.status} after ${result.steps} steps (${result.model}${o.brain.model.spentUsd != null ? `, $${o.brain.model.spentUsd.toFixed(4)}` : ''})`],
        };
    } finally {
        forgetDeviceRecord(o.runId);
        forgetAndroid(o.runId);
    }
}

export const AgentEngineTool: ToolDefinition = {
    name: 'agent_engine',
    description: 'Build or change a software project with the general agent engine: the model reads, writes, runs, looks at the result and fixes it, and the run is delivered only when Joe\'s delivery checks pass.',
    version: '1.0.0',
    tags: ['engineering', 'build', 'agent'],
    permissions: ['read', 'write', 'execute'],
    sideEffects: ['write', 'execute'],
    rateLimitPerMinute: 6,
    auditFields: ['request', 'path'],
    mockSupported: false,
    inputSchema: {
        type: 'object',
        properties: {
            request: { type: 'string', description: 'The user\'s complete request.' },
            path: { type: 'string', description: 'An existing project folder to change, when the request is a change.' },
        },
        required: ['request'],
    },
    outputSchema: { type: 'object', properties: { pipelineFinal: { type: 'boolean' }, summary: { type: 'string' } } },
    async execute(input: any, context: any = {}) {
        const request = String(input?.request || '').trim();
        if (!request) return { ok: false, error: 'agent_engine needs the request.' };
        const runId = String(context.runId || context.traceId || `engine-${Date.now()}`);
        //  Two languages, each with its owner. The app Joe builds speaks the
        //  request's language. Joe himself speaks the language the user set
        //  in the interface (replyLanguageCode), the one rule all of Joe uses.
        const language = /[؀-ۿ]/u.test(request) ? 'ar' : String(context.language || 'en');
        const replyLanguage = replyLanguageCode(context.language, request);

        //  A run that cannot start says why in the delivery shape, so the
        //  orchestrator takes it as the build's final, honest answer instead
        //  of handing the request to a recovery planner.
        const refused = (why: string, projectRoot = '') => ({
            ok: false, error: why,
            output: deliveryOutput({ result: { status: 'failed', summary: why, reason: why, filesChanged: [], served: [], steps: 0, model: '' }, projectRoot, request }).output,
        });
        //  The provider the user chose in the interface binds the run.
        const choice = engineModelChoiceFor(context.modelConfig);
        if ('error' in choice) return refused(`agent_engine cannot choose a model: ${choice.error}`);

        const cancellation = bindRunCancellation(context.cancellation);
        const deadlineAt = Date.now() + Math.max(60_000, RUN_DEADLINE_MS - DEADLINE_MARGIN_MS);
        //  The model and its budget first: a run that cannot pay for its
        //  model leaves no empty project folder behind.
        const brain = await engineBrain(choice, { ...context, runId, language }, cancellation.signal, deadlineAt);
        if ('error' in brain) { cancellation.dispose(); return refused(`agent_engine cannot start its model: ${brain.error}`); }

        const activeRoot = workspaceService.getActiveRoot(context.workspaceId);
        //  Operate: something to do on the owner's computer, not a project to build (core/engine/operate.ts).
        if (input?.mode === 'operate') {
            try {
                const target = input?.target === 'phone' || input?.target === 'computer' ? input.target : undefined;
                return await runOperate({ request, runId, language, replyLanguage, deadlineAt, activeRoot, context, brain, signal: cancellation.signal, target });
            } finally {
                cancellation.dispose();
            }
        }
        const folder = await projectFolderFor(activeRoot, runId, input?.path || context.resumeProjectRoot);
        if ('error' in folder) { cancellation.dispose(); return refused(folder.error); }
        //  A change is kept before it touches the project, and told what the
        //  project is: read before this run registers its own request.
        const change = folder.resumed ? changeContextFor(folder.dir, request, registeredRequestFor(context.sessionId)) : undefined;
        //  The user's own repository: what was already wrong in its source is
        //  measured now, before the change, so the delivery never charges the
        //  change with it (verify.ts, repository mode).
        if (change && projectOriginFor(context.sessionId, folder.dir) === 'imported') {
            const before = await measureProjectSource(folder.dir, Math.min(deadlineAt, Date.now() + 120_000), () => cancellation.signal.aborted)
                .catch(() => ({ problems: [] as string[] }));
            change.repository = { baselineSourceProblems: before.problems };
        }
        registerProjectFolder(context.sessionId, runId, folder.dir, request);
        clearDeliveryProof(folder.dir);

        //  Every engine_* tool sees the run's stop: a search or a command stops
        //  when the owner presses Stop, not when its own timer runs out.
        const toolContext = {
            ...context, runId, language, projectRoot: folder.dir, projectRootRuntimeBound: true,
            isCancelled: () => cancellation.signal.aborted || (typeof context.isCancelled === 'function' && context.isCancelled() === true),
        };
        const { model, ask, look } = brain;
        //  ToolService is read when the run starts: it imports the registry,
        //  which imports this file, so a top-level import would register
        //  agent_engine as undefined whenever this file loads first.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { executeTool } = require('../../services/ToolService');
        const runTool = (name: string, args: any) => executeTool(name, args, toolContext);
        const verifier = createVerifier({ ask, runTool, ...(look ? { look } : {}) });

        try {
            const result = await runEngine({
                runId, request, language, projectDir: folder.dir, deadlineAt,
                replyLanguage, ...(change ? { change } : {}),
                signal: cancellation.signal, emit: uiEmitter(context.sessionId, runId, replyLanguage, path.basename(folder.dir)),
                joe: { toolContext, runId, sessionId: context.sessionId, userId: context.userId, workspaceId: context.workspaceId },
            }, {
                model,
                tools: [planUpdateTool, ...fileTools, ...shellTools, ...browserTools, ...webTools, finishTool(verifier)],
                processes: createProcessRegistry(toolContext),
                browser: () => createBrowserSession(toolContext),
                machine: await machineFacts(),
                seedRequirements: (req, lang) => seedRequirementsFromRequest(req, lang, ask),
            });
            //  deliveryOutput returns { ok, error, output }: the tool's output is
            //  its `output`, so the summary, the verdict and pipelineFinal sit
            //  at the top, where the answer composer and the final-outcome
            //  rule read them.
            const delivery = deliveryOutput({ result, projectRoot: folder.dir, request, language: replyLanguage });
            const delivered = result.status === 'delivered' && delivery.ok;
            recordRunHistory(folder.dir, { request, status: delivered ? 'delivered' : result.status, summary: result.summary });
            //  A verified project says, in his language, how it was proven and how to run it.
            if (delivered) {
                const receipts: Array<{ tool: string; ok: boolean }> = delivery.output?.results?.[0]?.taskReceipts || [];
                writeDeliveryCertificate(folder.dir, {
                    request, summary: result.summary, language: replyLanguage,
                    earlier: (change?.history || []).filter(run => run.status === 'delivered').map(run => run.request),
                    passed: receipts.filter(r => r.ok).map(r => String(r.tool).replace(/^delivery:/u, '')),
                    unproven: (result.verification?.unproven || []).map(u => `${u.text}: ${u.reason}`),
                    howToRun: result.howToRun, liveUrl: delivery.output?.liveUrl,
                    durationMs: result.durationMs, costUsd: result.costUsd, model: result.model,
                    screenshots: deliveryProof(folder.dir),
                    signedInAs: (result.verification as DeliveryVerification | undefined)?.delivery?.signedInAs,
                    roles: (result.verification as DeliveryVerification | undefined)?.delivery?.roleViews,
                });
            }
            return {
                ok: delivered,
                ...(delivered ? {} : { error: delivery.error || result.reason || result.summary }),
                output: delivery.output,
                logs: [`agent engine: ${result.status} after ${result.steps} steps (${result.model}${model.spentUsd != null ? `, $${model.spentUsd.toFixed(4)}` : ''})`],
            };
        } finally {
            cancellation.dispose();
        }
    },
};
