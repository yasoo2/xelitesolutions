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
