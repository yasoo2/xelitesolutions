/**
 * One budget for every `npm install` that downloads packages for a project Joe
 * builds, whichever tool runs it.
 *
 * Measured: a fresh Windows install remained healthy but silent for 124 s, so
 * the idle bound allows one cold registry/package extraction while staying
 * finite. Eval run500 P001, 2026-10-23: the API tool still capped the whole
 * install at 30 s and reported «The API dependencies were not installed» for a
 * healthy cold install on a CPU busy with the local model.
 */
export const NETWORK_INSTALL_TIMEOUTS = Object.freeze({
    absoluteMs: 15 * 60_000,
    idleMs: 5 * 60_000,
});
