import { classifyExplicitLocalSelection, ExplicitLocalSelectionInput } from './explicit-local-selection';

/** Pure total answer deadline: five minutes for a named loopback model, including correction. */
export function selectedLocalAnswerBudgetMs(context?: {
    modelConfig?: ExplicitLocalSelectionInput;
    providerTimeoutMs?: unknown;
    plannerTimeoutMs?: unknown;
}): number {
    const cap = classifyExplicitLocalSelection(context?.modelConfig || {}).eligible ? 300_000 : 45_000;
    const requested = [context?.providerTimeoutMs, context?.plannerTimeoutMs]
        .map(Number).filter(value => Number.isFinite(value) && value > 0);
    return Math.min(cap, ...requested);
}
