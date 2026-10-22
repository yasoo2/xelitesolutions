/**
 * The model selection that will actually serve a call, for budgeting.
 *
 * ⛔ MEASURED 2026-10-22 (eval L1-en-answer): the UI sends `provider: 'auto'` by
 * default, the server is pinned to local Ollama (LLM_PROVIDER=local,
 * LOCAL_LLM_STRICT=1), and the answer deadline still used the 45 s cloud cap —
 * so on a CPU-only machine a two-sentence answer died at 45 s while the same
 * question with the local model named explicitly finished in 2.3 min.
 *
 * The deadline must follow the provider that serves, not the label the UI
 * sent. When Auto (or nothing) is selected and the operator pinned the local
 * model, that model IS the selection. A named provider is never overridden.
 */
export function servedModelConfig<T extends { modelConfig?: any }>(context: T | undefined): T | undefined {
    const selected = String(context?.modelConfig?.provider || '').trim().toLowerCase();
    if (selected && selected !== 'auto') return context;
    const pinnedLocal = String(process.env.LOCAL_LLM_STRICT || '').trim() === '1'
        || String(process.env.LLM_PROVIDER || '').trim().toLowerCase() === 'local';
    const model = String(process.env.LOCAL_LLM_MODEL || '').trim();
    if (!pinnedLocal || !model || String(process.env.LOCAL_LLM_DISABLE || '').trim() === '1') return context;
    const baseUrl = String(process.env.LOCAL_LLM_BASE_URL || 'http://127.0.0.1:11434/v1').trim();
    return { ...(context || {}), modelConfig: { ...(context?.modelConfig || {}), provider: 'local', model, baseUrl } } as T;
}
