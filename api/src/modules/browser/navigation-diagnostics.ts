export type DocumentState = 'loading' | 'interactive' | 'complete' | 'unavailable';

export function normalizeDocumentState(value: unknown): DocumentState {
    return value === 'loading' || value === 'interactive' || value === 'complete' ? value : 'unavailable';
}

/** A failed/closed renderer must not delay the original error indefinitely. */
export async function readDocumentState(read: () => Promise<unknown>, timeoutMs = 300): Promise<DocumentState> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return normalizeDocumentState(await Promise.race([
            Promise.resolve().then(read),
            new Promise(resolve => { timer = setTimeout(() => resolve('unavailable'), timeoutMs); }),
        ]));
    } catch {
        return 'unavailable';
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}
