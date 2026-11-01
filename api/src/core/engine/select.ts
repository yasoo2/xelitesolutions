/**
 * WHICH ENGINE BUILDS THIS RUN'S PROJECT.
 *
 * Two engines exist side by side. The first plans phases and calls Joe's
 * project tools. The second (this folder) is the general agent loop. The
 * second takes a build only when it is asked for: by the run itself (an
 * `engine` field on the run's context) or by the deployment (JOE_ENGINE).
 * It stays off by default until it beats the first engine on the exam. It
 * is read on every call, never at module load, so an operator can switch it
 * without a rebuild.
 */
export type EngineName = 'agent' | 'legacy';

export function engineFor(context?: { engine?: unknown } | null, env: NodeJS.ProcessEnv = process.env): EngineName {
    const asked = String(context?.engine ?? env.JOE_ENGINE ?? '').trim().toLowerCase();
    return asked === 'agent' ? 'agent' : 'legacy';
}

/**
 * WHICH REQUESTS THE AGENT ENGINE TAKES, BEFORE THE OLD PLANNER PICKS A TOOL.
 *
 * Measured on 2026-11-01: with JOE_ENGINE=agent a build request reached the
 * engine, but «عدّل نفس التطبيق: اجعل زر الإضافة أخضر…» in the same chat went
 * to the first planner, which chose project_planner, found it lacking input,
 * and turned the request into a question to the user; the tool that asks
 * answered «Request sent. Agent loop should now pause.» and nothing changed.
 *
 * With the agent engine on, a request to build software, and a request to
 * change the project this chat already has, go to the engine directly. A
 * change goes back into the chat's own project folder. Everything else (a
 * question, a page to read, a file to look at) stays with the first planner.
 * The readers are Joe's own: the build reader and the edit reader the first
 * engine uses.
 */
export type AgentRoute = { kind: 'build' } | { kind: 'change'; path: string };

export async function agentEngineRoute(
    goal: string,
    context?: { engine?: unknown; sessionId?: unknown } | null,
    env: NodeJS.ProcessEnv = process.env,
): Promise<AgentRoute | null> {
    if (engineFor(context, env) !== 'agent') return null;
    const text = String(goal || '').trim();
    if (!text) return null;
    const project = await chatProjectFolder(context?.sessionId);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { isActionableEditRequest } = require('../../modules/tools/definitions/ProjectEditTool');
    if (project && isActionableEditRequest(text)) return { kind: 'change', path: project };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { isBuildRequest } = require('../intelligence/intent-classifier');
    return isBuildRequest(text)?.isBuild ? { kind: 'build' } : null;
}

/** The folder the agent engine last built for this chat, when it still exists. */
export async function chatProjectFolder(sessionId: unknown): Promise<string | null> {
    const sid = String(sessionId || '').trim();
    if (!sid) return null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { readJoeProjectForRun } = require('../../api/page-store');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { previewKey } = require('../../modules/tools/preview-site');
        const entry = readJoeProjectForRun(previewKey(sid), null);
        const dir = entry?.type === 'agent' ? String(entry.dir || '').trim() : '';
        if (!dir) return null;
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const stat = await require('fs').promises.stat(dir);
        return stat.isDirectory() ? dir : null;
    } catch {
        return null;
    }
}
