/**
 * «JOE DID NOT ANSWER», SAID IN THE READER'S LANGUAGE.
 *
 * The browser's own words when a request reaches no server — «Failed to
 * fetch» (Chrome), «NetworkError when attempting to fetch resource» (Firefox),
 * «Load failed» (Safari) — are English and say nothing of what happened. The
 * owner read «Failed to fetch» in red while connecting a model, at the moment
 * Joe was restarting (2026-11-09). A request that reached nothing is told as
 * that: Joe cannot be reached now, wait a moment and try again.
 */
export function isNetworkFailure(err: unknown): boolean {
    const m = String((err as any)?.message ?? err ?? '');
    const isTypeError = (err as any)?.name === 'TypeError' || err instanceof TypeError || /^TypeError/u.test(m);
    return isTypeError && /failed to fetch|networkerror|load failed|network request failed|fetch failed/iu.test(m);
}
