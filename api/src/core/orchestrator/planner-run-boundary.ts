/**
 * planner-run-boundary — execution-owned cancellation/deadline boundary for ProjectPlannerTool.
 *
 * Planner-only: builds no prompts, calls no provider, executes nothing. It only
 * bridges the owner's cancellation signal into one execution-owned AbortSignal
 * that is propagated to EVERY callLLM, plus one total finite planner deadline.
 *
 * Sources bridged (fail closed):
 * - context.signal (AbortSignal-like)
 * - context.isCancelled (function callback only; polled only when present)
 * - context.cancellation (native Promise settles => cancelled; AbortSignal-like
 *   retained only as a tracked source for compatibility)
 *
 * Guarantees:
 * - No polling interval unless an isCancelled function callback exists.
 * - A provider ignoring AbortSignal still settles promptly via wrap(); the
 *   late resolve/reject is observed (no unhandled rejection) but never used.
 * - Backoff waits are capped to the remaining total deadline and abortable.
 * - cleanup() removes every listener/timer the boundary created.
 */

export const PLANNER_CANCELLED_CODE = 'planner_cancelled';
export const PLANNER_DEADLINE_CODE = 'planner_deadline_exceeded';

export class PlannerCancelledError extends Error {
  readonly code = PLANNER_CANCELLED_CODE;
  constructor(message = 'Planner run was cancelled by the owner.') {
    super(message);
    this.name = 'PlannerCancelledError';
  }
}

export class PlannerDeadlineError extends Error {
  readonly code = PLANNER_DEADLINE_CODE;
  constructor(message = 'Planner run exceeded its total finite deadline.') {
    super(message);
    this.name = 'PlannerDeadlineError';
  }
}

const DEFAULT_TOTAL_MS = 120000;
const MIN_TOTAL_MS = 10;
const MAX_TOTAL_MS = 300000;
const CALLBACK_POLL_MS = 10;

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  );
}

function isSignalLike(value: unknown): value is AbortSignal {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as AbortSignal).aborted === 'boolean' &&
    typeof (value as AbortSignal).addEventListener === 'function' &&
    typeof (value as AbortSignal).removeEventListener === 'function'
  );
}

function isNativePromise(value: unknown): value is Promise<unknown> {
  return value instanceof Promise;
}

/** Bounded trusted planner budget -> one total finite deadline. Never NaN/Infinite. */
export function clampPlannerTotalMs(raw: unknown, maxMs: number = MAX_TOTAL_MS): number {
  const num = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : (raw as number);
  if (typeof num !== 'number' || !Number.isFinite(num) || num <= 0) return DEFAULT_TOTAL_MS;
  const ceiling = Number.isFinite(maxMs) && maxMs > 0 ? Math.floor(maxMs) : MAX_TOTAL_MS;
  return Math.max(MIN_TOTAL_MS, Math.min(ceiling, Math.floor(num)));
}

/**
 * The ceiling for a plan the LOCAL model serves: the operator's local leash
 * (LOCAL_BRAIN_LEASH_MAX), never less than the general five minutes, never
 * past the local inference hard maximum. A CPU model reads ~6 tokens/s (2026-10-23); five minutes
 * is not a plan on that hardware, and a fixed cut made every build a stock app.
 */
export function localPlannerCeilingMs(): number {
  const configured = Number.parseInt(String(process.env.LOCAL_BRAIN_LEASH_MAX || '').trim(), 10);
  return Math.min(require('../llm/local-throughput').LOCAL_INFERENCE_HARD_MAX_MS, Math.max(MAX_TOTAL_MS, Number.isFinite(configured) && configured > 0 ? configured : 0));
}

/** Estimated tokens of the compact local brief (fixed text + evidence cap) and of a compact plan. */
export const LOCAL_COMPACT_BRIEF_TOKENS = Math.ceil((4500 + 3000) / 3);
/**
 * Estimated tokens of the FULL planning brief a local plan now gets (measured
 * 2026-10-23: 15.6k bytes of fixed text) plus the evidence a plan may carry.
 */
export const LOCAL_PLAN_BRIEF_TOKENS = Math.ceil((15_600 + 3000) / 3);
export const LOCAL_PLAN_OUTPUT_TOKENS = 1500;

/**
 * The DEFAULT deadline for a plan the local model serves: its size over this
 * machine's measured speed, never below the general 180 s default, never past
 * the local ceiling. A deadline a caller set explicitly is not replaced.
 *
 * The output it is sized for is everything the plan may write — the room the
 * window leaves the brief — not a typical plan. Round 8 (2026-10-23): the full
 * brief was armed for 51 min on a 1500-token guess while the call allowed
 * 12000; a longer plan would have been cut mid-JSON. A deadline is a ceiling:
 * a plan that finishes early returns early, on a GPU in seconds.
 */
export function localPlanDeadlineMs(requestText: string): number {
  const { estimatePromptTokens, localDeadlineMs } = require('../llm/local-throughput');
  const { managedContextCeilingTokens } = require('../llm/providers/managed-ollama-chat');
  const promptTokens = estimatePromptTokens(String(requestText || '')) + LOCAL_PLAN_BRIEF_TOKENS;
  const outputTokens = Math.max(LOCAL_PLAN_OUTPUT_TOKENS, managedContextCeilingTokens() - promptTokens);
  return Math.min(localPlannerCeilingMs(), Math.max(180_000, localDeadlineMs(promptTokens, outputTokens)));
}


export function resolvePlannerTotalMs(context?: any): number {
  if (!context || typeof context !== 'object') return DEFAULT_TOTAL_MS;
  const candidates = [context?.plannerTimeoutMs, context?.plannerBudgetMs, context?.plannerDeadlineMs];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      const n = Number(candidate);
      if (Number.isFinite(n) && n > 0) return clampPlannerTotalMs(n);
      // A supplied but non-finite/positive budget is malformed: fail closed
      // to the smallest finite total rather than an unbounded run.
      return clampPlannerTotalMs(MIN_TOTAL_MS);
    }
  }
  return DEFAULT_TOTAL_MS;
}

export class PlannerRunBoundary {
  readonly signal: AbortSignal;
  readonly deadlineAt: number;
  readonly totalMs: number;
  private readonly controller = new AbortController();
  private cancelError: PlannerCancelledError | PlannerDeadlineError | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly sourceSignals: AbortSignal[] = [];
  private callbackFn: (() => unknown) | null = null;
  private readonly onSourceAbort = (): void => {
    if (this.cleaned) return;
    this.cancel(new PlannerCancelledError('Planner run was cancelled via context.signal.'));
  };
  private readonly pendingTimers = new Set<ReturnType<typeof setTimeout>>();
  private cleaned = false;

  constructor(context?: any, totalMsOverride?: number, maxMs: number = MAX_TOTAL_MS) {
    this.signal = this.controller.signal;
    this.totalMs =
      typeof totalMsOverride === 'number' && Number.isFinite(totalMsOverride)
        ? clampPlannerTotalMs(totalMsOverride, maxMs)
        : resolvePlannerTotalMs(context);
    this.deadlineAt = Date.now() + this.totalMs;
    this.bridge(context);
    // An already-aborted source or a malformed fail-closed source aborts above.
    // A past-due deadline (tiny budget) is observed lazily by isCancelled() so
    // construction never throws and legacy no-context use stays compatible.
  }

  private cancel(error: PlannerCancelledError | PlannerDeadlineError): void {
    // Prevent terminal mutation: first terminal state wins.
    if (this.cancelError) return;
    if (this.controller.signal.aborted) return;
    this.cancelError = error;
    try {
      this.controller.abort(error);
    } catch {
      try {
        this.controller.abort();
      } catch {
        /* owned controller only */
      }
    }
    this.stopPolling();
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      try {
        clearInterval(this.pollTimer as unknown as Parameters<typeof clearInterval>[0]);
      } catch {
        /* timer-only cleanup */
      }
      this.pollTimer = null;
    }
  }

  private trackSourceSignal(source: AbortSignal): void {
    try {
      source.addEventListener('abort', this.onSourceAbort, { once: true });
    } catch {
      // Listener add errors fail closed: an unusable source cannot be trusted.
      this.cancel(new PlannerCancelledError('Planner run received a malformed context.signal.'));
      return;
    }
    this.sourceSignals.push(source);
  }

  private observeCallbackPromise(value: PromiseLike<unknown>): void {
    try {
      (value as PromiseLike<unknown>).then(
        () => undefined,
        () => undefined,
      );
    } catch {
      // Attaching observers must never throw; fail-closed cancel is already set.
    }
  }

  /**
   * Strict synchronous callback evaluation. Only boolean false means "run";
   * boolean true, thrown errors, non-boolean values, and Promise/thenable
   * returns all fail closed. Never throws.
   */
  private evalCallbackSync(): boolean {
    // Terminal runs must not call the owner callback again: each invocation
    // may create a distinct rejected Promise even when its shape is invalid.
    if (this.cleaned || this.cancelError || this.controller.signal.aborted) return true;
    const fn = this.callbackFn;
    if (!fn) return false;
    let value: unknown;
    try {
      value = fn();
    } catch {
      this.cancel(new PlannerCancelledError('Planner run cancellation callback threw.'));
      return true;
    }
    let thenable = false;
    try {
      thenable = isThenable(value);
    } catch {
      this.cancel(new PlannerCancelledError('Planner run received an unreadable isCancelled result.'));
      return true;
    }
    if (thenable) {
      // Malformed: a callback must return a strict boolean synchronously.
      // Observe the rejection so a late reject cannot become unhandled,
      // then fail closed immediately; every distinct Promise is observed.
      this.observeCallbackPromise(value as PromiseLike<unknown>);
      this.cancel(new PlannerCancelledError('Planner run received a malformed isCancelled result.'));
      return true;
    }
    if (value === true) {
      this.cancel(new PlannerCancelledError('Planner run was cancelled via isCancelled().'));
      return true;
    }
    if (value === false) return false;
    this.cancel(new PlannerCancelledError('Planner run received a malformed isCancelled result.'));
    return true;
  }

  private bridge(context?: any): void {
    if (!context || typeof context !== 'object') return;

    // 1) context.signal — documented AbortSignal contract only.
    const source = context.signal;
    if (source !== undefined && source !== null) {
      if (isSignalLike(source)) {
        if (source.aborted) {
          this.cancel(new PlannerCancelledError('Planner run was already cancelled via context.signal.'));
        } else {
          this.trackSourceSignal(source);
        }
      } else {
        // Malformed cancellation (boolean, foreign shape, listener-less
        // object) fails closed.
        this.cancel(new PlannerCancelledError('Planner run received a malformed context.signal.'));
      }
    }

    // 2) context.isCancelled — strict function contract only.
    if (context.isCancelled !== undefined && context.isCancelled !== null) {
      const cb = context.isCancelled;
      if (typeof cb === 'function') {
        this.callbackFn = cb as () => unknown;
        const check = (): boolean => {
          if (this.cleaned) return true;
          if (this.controller.signal.aborted || this.cancelError) {
            this.stopPolling();
            return true;
          }
          if (Date.now() >= this.deadlineAt) {
            this.stopPolling();
            return true;
          }
          const cancelled = this.evalCallbackSync();
          if (cancelled) this.stopPolling();
          return cancelled;
        };
        check();
        if (!this.controller.signal.aborted && !this.cancelError && !this.cleaned) {
          try {
            this.pollTimer = setInterval(check, CALLBACK_POLL_MS);
          } catch {
            this.pollTimer = null;
            this.cancel(new PlannerCancelledError('Planner run cancellation polling failed.'));
            return;
          }
          try {
            if (typeof (this.pollTimer as unknown as { unref?: () => void }).unref === 'function') {
              (this.pollTimer as unknown as { unref: () => void }).unref();
            }
          } catch {
            // unref failure is non-fatal; polling still stops via stopPolling().
          }
        }
      } else {
        // Present non-function (including boolean false) fails closed.
        this.cancel(new PlannerCancelledError('Planner run received a malformed isCancelled.'));
      }
    }

    // 3) context.cancellation — native Promise contract (either settlement
    // means cancelled) plus tracked AbortSignal-like compatibility. Every
    // other present shape (boolean, foreign thenable, malformed) fails closed.
    if (context.cancellation !== undefined && context.cancellation !== null) {
      const c = context.cancellation;
      if (isSignalLike(c)) {
        if (c.aborted) {
          this.cancel(new PlannerCancelledError('Planner run was cancelled via cancellation signal.'));
        } else {
          try {
            c.addEventListener('abort', this.onSourceAbort, { once: true });
          } catch {
            this.cancel(new PlannerCancelledError('Planner run received a malformed cancellation.'));
            return;
          }
          this.sourceSignals.push(c);
        }
      } else if (isNativePromise(c)) {
        (c as Promise<unknown>).then(
          () => {
            // Cleanup disables future cancellation callbacks.
            if (this.cleaned) return;
            this.cancel(new PlannerCancelledError('Planner run was cancelled via cancellation promise.'));
          },
          () => {
            // Rejected cancellation settles as cancelled, matching the
            // existing ToolService floor (either settlement == cancelled).
            if (this.cleaned) return;
            this.cancel(new PlannerCancelledError('Planner run was cancelled via cancellation promise.'));
          },
        );
      } else {
        // Thenables other than an actual Promise are not a trusted handle.
        if (isThenable(c)) {
          try {
            (c as PromiseLike<unknown>).then(
              () => undefined,
              () => undefined,
            );
          } catch {
            /* observation only */
          }
        }
        this.cancel(new PlannerCancelledError('Planner run received a malformed cancellation.'));
      }
    }
  }

  /** True when the owner cancelled or the total deadline passed. Never throws. */
  isCancelled(): boolean {
    if (this.controller.signal.aborted) return true;
    if (this.cancelError) return true;
    try {
      if (this.evalCallbackSync()) return true;
    } catch {
      return true;
    }
    try {
      if (Date.now() >= this.deadlineAt) return true;
    } catch {
      return true;
    }
    return false;
  }

  /** Synchronous live callback re-check (fail closed on throw). Used before dispatch. */
  private liveCallbackCancelled(): boolean {
    try {
      return this.evalCallbackSync();
    } catch {
      return true;
    }
  }

  remainingMs(): number {
    return Math.max(0, this.deadlineAt - Date.now());
  }

  hasPollTimer(): boolean {
    return this.pollTimer !== null;
  }

  get aborted(): boolean {
    return this.controller.signal.aborted || this.isCancelled();
  }

  throwIfCancelled(): void {
    // Synchronous live callback re-check wins before any provider dispatch.
    this.liveCallbackCancelled();
    if (this.controller.signal.aborted || this.cancelError) {
      if (this.cancelError) throw this.cancelError;
      throw new PlannerCancelledError();
    }
    if (Date.now() >= this.deadlineAt) {
      const error = new PlannerDeadlineError();
      this.cancel(error);
      throw error;
    }
  }

  /**
   * Start the provider only after the cancellation check and deadline/listener
   * installation, then race its promise against cancellation/deadline.
   * The provider may ignore AbortSignal: this still settles promptly, keeps
   * observing the late promise (no unhandled rejection), and never resolves
   * with a late value after cancellation/deadline.
   */
  wrap<T>(start: () => Promise<T>): Promise<T> {
    try {
      this.throwIfCancelled();
    } catch (error) {
      return Promise.reject(error);
    }
    const remaining = this.remainingMs();
    if (remaining <= 0) {
      const error = new PlannerDeadlineError();
      this.cancel(error);
      return Promise.reject(error);
    }
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        const error = new PlannerDeadlineError();
        this.cancel(error);
        reject(error);
      }, remaining);
      this.pendingTimers.add(timer);
      const onAbort = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        if (this.cancelError) reject(this.cancelError);
        else reject(new PlannerCancelledError());
      };
      const cleanup = (): void => {
        this.pendingTimers.delete(timer);
        try {
          clearTimeout(timer);
        } catch {
          /* timer-only cleanup */
        }
        try {
          this.signal.removeEventListener('abort', onAbort);
        } catch {
          // Listener remove errors fail closed on next re-check; the current
          // settlement already holds the terminal state.
          try {
            this.cancel(new PlannerCancelledError('Planner run listener cleanup failed.'));
          } catch {
            /* cancel never throws */
          }
        }
      };
      try {
        this.signal.addEventListener('abort', onAbort, { once: true });
      } catch {
        if (!settled) {
          settled = true;
          cleanup();
          const error = new PlannerCancelledError('Planner run listener setup failed.');
          this.cancel(error);
          reject(error);
          return;
        }
      }
      let promise: Promise<T>;
      try {
        this.throwIfCancelled();
        promise = Promise.resolve(start());
      } catch (error) {
        settled = true;
        cleanup();
        reject(error);
        return;
      }
      // Attach both handlers even if start synchronously cancelled the run;
      // a provider ignoring abort remains observed without accepting its result.
      promise.then(
        (value) => {
          if (settled) return;
          settled = true;
          cleanup();
          // A cancel that landed while the provider was settling wins over a
          // late acceptance: the caller must re-check, never accept silently.
          try {
            this.throwIfCancelled();
          } catch (error) {
            reject(error);
            return;
          }
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          try {
            this.throwIfCancelled();
          } catch (boundaryError) {
            reject(boundaryError);
            return;
          }
          reject(error);
        },
      );
    });
  }

  /**
   * Abortable bounded wait. Caps ms to the remaining total deadline, returns
   * false when cancellation/deadline interrupted the wait, true when the full
   * (capped) delay elapsed. Never throws for cancellation.
   */
  sleep(ms: number): Promise<boolean> {
    try {
      this.throwIfCancelled();
    } catch {
      return Promise.resolve(false);
    }
    const capped = Math.max(0, Math.min(Number.isFinite(ms) ? ms : 0, this.remainingMs()));
    if (capped <= 0) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        resolve(true);
      }, capped);
      this.pendingTimers.add(timer);
      const onAbort = (): void => {
        if (done) return;
        done = true;
        cleanup();
        resolve(false);
      };
      const cleanup = (): void => {
        this.pendingTimers.delete(timer);
        try {
          clearTimeout(timer);
        } catch {
          /* timer-only cleanup */
        }
        try {
          this.signal.removeEventListener('abort', onAbort);
        } catch {
          /* listener-only cleanup; abort already terminal */
        }
      };
      try {
        this.signal.addEventListener('abort', onAbort, { once: true });
      } catch {
        if (!done) {
          done = true;
          cleanup();
          resolve(false);
        }
      }
    });
  }

  cleanup(): void {
    if (this.cleaned) return;
    this.cleaned = true;
    this.stopPolling();
    for (const source of this.sourceSignals.splice(0)) {
      try {
        source.removeEventListener('abort', this.onSourceAbort);
      } catch {
        // Listener remove errors fail closed: keep the run terminal.
        try {
          this.cancel(new PlannerCancelledError('Planner run listener cleanup failed.'));
        } catch {
          /* cancel never throws */
        }
      }
    }
    for (const timer of Array.from(this.pendingTimers)) {
      try {
        clearTimeout(timer as unknown as Parameters<typeof clearTimeout>[0]);
      } catch {
        /* timer-only cleanup */
      }
    }
    this.pendingTimers.clear();
  }
}

export function createPlannerRunBoundary(context?: any, totalMsOverride?: number, maxMs?: number): PlannerRunBoundary {
  return new PlannerRunBoundary(context, totalMsOverride, maxMs);
}

export function isPlannerBoundaryError(error: unknown): boolean {
  return error instanceof PlannerCancelledError || error instanceof PlannerDeadlineError;
}
