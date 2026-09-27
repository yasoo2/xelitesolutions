import {
    classifyActionError,
    compareFieldValue,
    ensureTypedValue,
    typeActionText,
    type FieldOps,
} from '../modules/browser/actionVerification';

function fakeField(script: Array<string | { throw: true }>, onSet?: (text: string) => void): { ops: FieldOps; sets: string[] } {
    const sets: string[] = [];
    let i = 0;
    const ops: FieldOps = {
        read: async () => {
            const next = script[Math.min(i++, script.length - 1)];
            if (typeof next === 'object' && next.throw) throw new Error('read failed');
            return next as string;
        },
        clearAndSet: async (text: string) => {
            sets.push(text);
            if (onSet) onSet(text);
        },
    };
    return { ops, sets };
}

describe('action verification', () => {
    describe('typeActionText', () => {
        it('reads text for type and fill, nothing for other actions', () => {
            expect(typeActionText('type', { text: 'hello' })).toBe('hello');
            expect(typeActionText('fill', { text: 'hello' })).toBe('hello');
            expect(typeActionText('click', { text: 'hello' })).toBe('');
            expect(typeActionText('fill', {})).toBe('');
            expect(typeActionText('type', {})).toBe('');
        });
    });

    describe('classifyActionError', () => {
        it('keeps the existing timeout and overlay behaviour', () => {
            expect(classifyActionError(new Error('locator.click: Timeout 20000ms exceeded'))).toBe('timeout');
            expect(classifyActionError(new Error('page.goto: Timeout 5000ms exceeded'))).toBe('timeout');
            expect(classifyActionError(new Error('locator.click: Element intercepts pointer events'))).toBe('overlay_blocking_click');
            expect(classifyActionError(new Error('overlay blocking click on submit'))).toBe('overlay_blocking_click');
        });

        it('names the specific cause even with Playwright timeout suffixes', () => {
            expect(classifyActionError(new Error("locator.click: Element intercepts pointer events\nTimeout 2000ms exceeded"))).toBe('overlay_blocking_click');
            expect(classifyActionError(new Error("locator.fill: Element is not enabled\nTimeout 2000ms exceeded"))).toBe('element_disabled');
            expect(classifyActionError(new Error('waiting for selector "#missing"\nTimeout 1000ms exceeded'))).toBe('element_not_found');
            expect(classifyActionError(new Error("locator.click: Element is not visible\nTimeout 2000ms exceeded"))).toBe('element_not_found');
            expect(classifyActionError(new Error("strict mode violation: locator.click resolved to 2 elements\nTimeout 2000ms exceeded"))).toBe('selector_ambiguous');
        });

        it('names detached, ambiguous and disabled failures', () => {
            expect(classifyActionError(new Error('locator.click: Element is not attached to the DOM'))).toBe('element_detached');
            expect(classifyActionError(new Error("strict mode violation: getByText('save') resolved to 2 elements"))).toBe('selector_ambiguous');
            expect(classifyActionError(new Error('locator.fill: Element is not enabled'))).toBe('element_disabled');
            expect(classifyActionError(new Error('locator.click: Element is disabled'))).toBe('element_disabled');
        });

        it('keeps not-found failures on element_not_found', () => {
            expect(classifyActionError(new Error('locator.click: Element is not visible'))).toBe('element_not_found');
            expect(classifyActionError(new Error('waiting for selector "#missing"'))).toBe('element_not_found');
            expect(classifyActionError(new Error("locator.click: Timeout 800ms exceeded.\nCall log:\n  - waiting for locator('#missing')"))).toBe('element_not_found');
            expect(classifyActionError(new Error('not_found'))).toBe('element_not_found');
        });

        it('leaves the unrecognised as unknown', () => {
            expect(classifyActionError(new Error('Target page, context or browser has been closed'))).toBe('unknown');
            expect(classifyActionError(new Error('boom'))).toBe('unknown');
            expect(classifyActionError(null)).toBe('unknown');
        });
    });

    describe('compareFieldValue', () => {
        it('compares without ever returning the values', () => {
            const hit = compareFieldValue('s3cret', 's3cret');
            expect(hit).toMatchObject({ match: true, expectedLength: 6, observedLength: 6, readOk: true });
            expect(JSON.stringify(hit)).not.toContain('s3cret');
            const miss = compareFieldValue('s3cre', 's3cret');
            expect(miss).toMatchObject({ match: false, expectedLength: 6, observedLength: 5, readOk: true });
            expect(JSON.stringify(miss)).not.toContain('s3cre');
        });

        it('reports unreadable fields without a match', () => {
            expect(compareFieldValue(null, 'x')).toMatchObject({ match: false, readOk: false, observedLength: -1 });
            expect(compareFieldValue(undefined, 'x')).toMatchObject({ match: false, readOk: false });
        });
    });

    describe('ensureTypedValue', () => {
        it('does nothing when the first read already matches', async () => {
            const fake = fakeField(['hello']);
            const result = await ensureTypedValue(fake.ops, 'hello');
            expect(result).toMatchObject({ match: true, repaired: false, readOk: true });
            expect(fake.sets).toEqual([]);
        });

        it('repairs a mismatch once and reports the second read', async () => {
            const fake = fakeField(['stale', 'fresh']);
            const result = await ensureTypedValue(fake.ops, 'fresh');
            expect(result).toMatchObject({ match: true, repaired: true, expectedLength: 5, observedLength: 5 });
            expect(fake.sets).toEqual(['fresh']);
        });

        it('reports a persisting mismatch with positive evidence', async () => {
            const fake = fakeField(['stale', 'stale']);
            const result = await ensureTypedValue(fake.ops, 'fresh');
            expect(result).toMatchObject({ match: false, repaired: true, expectedLength: 5, observedLength: 5 });
            expect(fake.sets).toEqual(['fresh']);
        });

        it('marks unreadable fields unverified instead of failing them', async () => {
            const fake = fakeField([{ throw: true }]);
            const result = await ensureTypedValue(fake.ops, 'fresh');
            expect(result).toMatchObject({ match: false, repaired: false, readOk: false });
            expect(fake.sets).toEqual([]);
        });

        it('propagates a throwing repair so the caller classifies the real error', async () => {
            const ops: FieldOps = {
                read: async () => 'stale',
                clearAndSet: async () => { throw new Error('Element is not attached to the DOM'); },
            };
            await expect(ensureTypedValue(ops, 'fresh')).rejects.toThrow('not attached');
        });
    });
});
