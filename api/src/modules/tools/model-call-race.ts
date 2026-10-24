/**
 * A MODEL CALL THAT LOSES ITS RACE IS STOPPED, NOT LEFT BEHIND.
 *
 * Eval round 15 (2026-10-24, P051 and P251): react_project raced each model
 * call against a 12 s timer and moved on when the timer won — but nothing told
 * the call. It stayed in the single local inference lane and in the build's
 * heavy lease, and RequestResourceManager rightly keeps a lease open until
 * every child settles: the tool returned 98 and 149 minutes after its verdict,
 * waiting on calls nobody needed, which then ended as RESOURCE_CANCELLED.
 *
 * `askWithin` gives the call a signal of its own, linked to the run's: when
 * the leash wins, the call is aborted, the router stops its provider, and a
 * call still waiting in the inference queue is removed from it.
 *
 * And the CONTRACT calls — reading the request, judging the build against it —
 * are not on a leash at all when the local model serves them (`askForTheContract`):
 * a fixed 12 s counted from the queue made every requirement «unprovable» on a
 * CPU model that needs minutes per call. The router's own deadline, sized for
 * the call and started when the model starts on it, governs there; the run's
 * signal still cancels.
 */
import { servedByLocalModel } from '../../core/llm/served-local-selection';

/**
 * Receives the run's context — with the call's own signal — and must hand it
 * to the router, which reads the provider he chose from it alone.
 */
export type ModelCall<T> = (context: any) => Promise<T>;

function linkedSignal(signals: Array<AbortSignal | undefined>): AbortSignal {
    const live = signals.filter((s): s is AbortSignal => !!s);
    const any = (AbortSignal as any).any as ((s: AbortSignal[]) => AbortSignal) | undefined;
    if (typeof any === 'function') return any(live);
    const controller = new AbortController();
    for (const signal of live) {
        if (signal.aborted) { controller.abort(signal.reason); break; }
        signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    }
    return controller.signal;
}

/**
 * The run's own context for every read and write, except that `signal` is
 * `signal`. Not a copy: the router keeps per-run budgets on the context it is
 * handed (deadBrainRecoveryAttempted, localEngineeringRecoveryAttempted), and a
 * copy would grant a fresh budget to every call.
 */
function withSignal(context: any, signal: AbortSignal): any {
    const target = context && typeof context === 'object' ? context : {};
    return new Proxy(target, {
        get: (t, key) => key === 'signal' ? signal : Reflect.get(t, key),
        has: (t, key) => key === 'signal' || Reflect.has(t, key),
        ownKeys: (t) => {
            const keys = Reflect.ownKeys(t);
            return keys.includes('signal') ? keys : [...keys, 'signal'];
        },
        getOwnPropertyDescriptor: (t, key) => key === 'signal'
            ? { value: signal, writable: true, enumerable: true, configurable: true }
            : Reflect.getOwnPropertyDescriptor(t, key),
    });
}

/** Race `call` against `timeoutMs`; when the timer wins, the call is aborted. */
export async function askWithin<T>(
    call: ModelCall<T>,
    context: any,
    timeoutMs: number,
    timeoutMessage = 'the model did not answer in time',
): Promise<T> {
    const leash = new AbortController();
    const signal = linkedSignal([context?.signal, leash.signal]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            call(withSignal(context, signal)),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                    // Settle first: the abort makes the call reject too, and
                    // the caller must be told why it stopped, not «aborted».
                    const error = new Error(timeoutMessage);
                    reject(error);
                    leash.abort(error);
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

/**
 * A call the build's verdict depends on. Served by the local model it waits
 * for the router's sized, admission-started deadline (and the run's signal);
 * on any other provider it keeps the caller's leash, which now aborts.
 */
export function askForTheContract<T>(call: ModelCall<T>, context: any, leashMs: number): Promise<T> {
    return servedByLocalModel(context) ? call(context) : askWithin(call, context, leashMs);
}
