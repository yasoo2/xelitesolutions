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
import { ToolDefinition } from '../types';
import { runEngine } from '../../../core/engine/loop';
import { planUpdateTool } from '../../../core/engine/plan';
import { finishTool } from '../../../core/engine/finish';
import { engineModelChoice, engineBrain } from '../../../core/engine/model';
import { projectFolderFor, registerProjectFolder, uiEmitter } from '../../../core/engine/run';
import { fileTools } from '../../../core/engine/tools/files';
import { shellTools, createProcessRegistry } from '../../../core/engine/tools/shell';
import { browserTools, createBrowserSession } from '../../../core/engine/tools/browser';
import { machineFacts } from './EngineShellTools';
import { createVerifier, deliveryOutput } from '../../../core/engine/verify';
import { seedRequirementsFromRequest } from '../../../core/engine/seed';
import { RUN_DEADLINE_MS } from '../../../shared/utils/deadline';
import { bindRunCancellation } from '../../../core/session/attended-run';
import { workspaceService } from '../../services/WorkspaceService';

/** The engine stops this long before the run's own deadline, so it can end honestly and say why. */
const DEADLINE_MARGIN_MS = 2 * 60_000;

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
        //  The request's own language: an Arabic request is answered and built
        //  in Arabic even when the interface is set to English.
        const language = /[؀-ۿ]/u.test(request) ? 'ar' : String(context.language || 'en');

        //  A run that cannot start says why in the delivery shape, so the
        //  orchestrator takes it as the build's final, honest answer instead
        //  of handing the request to a recovery planner.
        const refused = (why: string, projectRoot = '') => ({
            ok: false, error: why,
            output: deliveryOutput({ result: { status: 'failed', summary: why, reason: why, filesChanged: [], served: [], steps: 0, model: '' }, projectRoot, request }).output,
        });
        const choice = engineModelChoice();
        if ('error' in choice) return refused(`agent_engine cannot choose a model: ${choice.error}`);

        const cancellation = bindRunCancellation(context.cancellation);
        const deadlineAt = Date.now() + Math.max(60_000, RUN_DEADLINE_MS - DEADLINE_MARGIN_MS);
        //  The model and its budget first: a run that cannot pay for its
        //  model leaves no empty project folder behind.
        const brain = await engineBrain(choice, { ...context, runId, language }, cancellation.signal, deadlineAt);
        if ('error' in brain) { cancellation.dispose(); return refused(`agent_engine cannot start its model: ${brain.error}`); }

        const activeRoot = workspaceService.getActiveRoot(context.workspaceId);
        const folder = await projectFolderFor(activeRoot, runId, input?.path || context.resumeProjectRoot);
        if ('error' in folder) { cancellation.dispose(); return refused(folder.error); }
        registerProjectFolder(context.sessionId, runId, folder.dir, request);

        //  Every engine_* tool sees the run's stop: a search or a command stops
        //  when the owner presses Stop, not when its own timer runs out.
        const toolContext = {
            ...context, runId, language, projectRoot: folder.dir, projectRootRuntimeBound: true,
            isCancelled: () => cancellation.signal.aborted || (typeof context.isCancelled === 'function' && context.isCancelled() === true),
        };
        const { model, ask } = brain;
        //  ToolService is read when the run starts: it imports the registry,
        //  which imports this file, so a top-level import would register
        //  agent_engine as undefined whenever this file loads first.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { executeTool } = require('../../services/ToolService');
        const runTool = (name: string, args: any) => executeTool(name, args, toolContext);
        const verifier = createVerifier({ ask, runTool });

        try {
            const result = await runEngine({
                runId, request, language, projectDir: folder.dir, deadlineAt,
                signal: cancellation.signal, emit: uiEmitter(context.sessionId, runId),
                joe: { toolContext, runId, sessionId: context.sessionId, userId: context.userId, workspaceId: context.workspaceId },
            }, {
                model,
                tools: [planUpdateTool, ...fileTools, ...shellTools, ...browserTools, finishTool(verifier)],
                processes: createProcessRegistry(toolContext),
                browser: () => createBrowserSession(toolContext),
                machine: await machineFacts(),
                seedRequirements: (req, lang) => seedRequirementsFromRequest(req, lang, ask),
            });
            //  deliveryOutput returns { ok, error, output }: the tool's output is
            //  its `output`, so the summary, the verdict and pipelineFinal sit
            //  at the top, where the answer composer and the final-outcome
            //  rule read them.
            const delivery = deliveryOutput({ result, projectRoot: folder.dir, request, language });
            const delivered = result.status === 'delivered' && delivery.ok;
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
