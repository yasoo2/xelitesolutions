import {
    ASSERT_VISIBILITY_CHECK_CAP,
    classifyActionError,
    evaluateAssertObservation,
    isSelectorSyntaxError,
    observeAssertState,
    parseAssertTarget,
    type AssertLocatorOps,
} from '../modules/browser/actionVerification';

function fakeLocator(matched: number, visibleFlags: boolean[], opts?: { countThrows?: unknown; visibleThrowsAt?: number }): { ops: AssertLocatorOps; probed: number[] } {
    const probed: number[] = [];
    const ops: AssertLocatorOps = {
        count: async () => {
            if (opts?.countThrows !== undefined) throw opts.countThrows;
            return matched;
        },
        isVisibleAt: async (i: number) => {
            probed.push(i);
            if (opts?.visibleThrowsAt === i) throw new Error('probe failed');
            return visibleFlags[i] === true;
        },
    };
    return { ops, probed };
}

describe('assert observed state', () => {
    describe('parseAssertTarget', () => {
        it('prefers selector over text, exactly like the old branching', () => {
            expect(parseAssertTarget({ selector: '#a', text: 'b' })).toEqual({ kind: 'selector', value: '#a' });
            expect(parseAssertTarget({ selector: '#a' })).toEqual({ kind: 'selector', value: '#a' });
            expect(parseAssertTarget({ text: 'b' })).toEqual({ kind: 'text', value: 'b' });
        });
        it('reports missing for absent, empty or non-string targets', () => {
            expect(parseAssertTarget({})).toEqual({ kind: 'missing', value: '' });
            expect(parseAssertTarget({ selector: '', text: '' })).toEqual({ kind: 'missing', value: '' });
            expect(parseAssertTarget({ selector: 42, text: null })).toEqual({ kind: 'missing', value: '' });
            expect(parseAssertTarget(null)).toEqual({ kind: 'missing', value: '' });
        });
    });

    describe('observeAssertState', () => {
        it('counts matched and visible without probing past the matches', async () => {
            const { ops, probed } = fakeLocator(3, [false, true, false]);
            expect(await observeAssertState(ops)).toEqual({ matched: 3, visible: 1, checked: 3, truncated: false });
            expect(probed).toEqual([0, 1, 2]);
        });
        it('caps visibility probes and marks truncation', async () => {
            const flags = new Array(25).fill(false);
            flags[9] = true;
            const { ops, probed } = fakeLocator(25, flags);
            const obs = await observeAssertState(ops);
            expect(obs).toEqual({ matched: 25, visible: 1, checked: ASSERT_VISIBILITY_CHECK_CAP, truncated: true });
            expect(probed.length).toBe(ASSERT_VISIBILITY_CHECK_CAP);
        });
        it('propagates a throwing count so the caller maps the real error', async () => {
            const err = new Error('locator.count: Unexpected token while parsing css selector');
            const { ops } = fakeLocator(0, [], { countThrows: err });
            await expect(observeAssertState(ops)).rejects.toBe(err);
        });
        it('propagates a throwing visibility probe instead of inventing a state', async () => {
            const { ops } = fakeLocator(2, [true, true], { visibleThrowsAt: 1 });
            await expect(observeAssertState(ops)).rejects.toThrow('probe failed');
        });
    });

    describe('evaluateAssertObservation', () => {
        it('passes with one visible node and names the counts', () => {
            const v = evaluateAssertObservation({ matched: 4, visible: 1, checked: 4, truncated: false });
            expect(v.pass).toBe(true);
            expect(v.detail).toBe('assert_ok matched=4 visible=1');
        });
        it('fails as element_not_found only when nothing matched', () => {
            const v = evaluateAssertObservation({ matched: 0, visible: 0, checked: 0, truncated: false });
            expect(v).toEqual({ pass: false, reason: 'element_not_found', detail: 'assert_failed matched=0 visible=0' });
        });
        it('fails as element_hidden when nodes matched but none are visible', () => {
            const v = evaluateAssertObservation({ matched: 3, visible: 0, checked: 3, truncated: false });
            expect(v).toEqual({ pass: false, reason: 'element_hidden', detail: 'assert_failed matched=3 visible=0' });
        });
        it('notes truncation on the failure detail instead of hiding it', () => {
            const v = evaluateAssertObservation({ matched: 40, visible: 0, checked: 10, truncated: true });
            expect(v.pass).toBe(false);
            expect(v.reason).toBe('element_hidden');
            expect(v.detail).toBe('assert_failed matched=40 visible=0 checked=10 truncated');
        });
        it('never embeds page content in any detail string', () => {
            const verdicts = [
                evaluateAssertObservation({ matched: 2, visible: 2, checked: 2, truncated: false }),
                evaluateAssertObservation({ matched: 0, visible: 0, checked: 0, truncated: false }),
                evaluateAssertObservation({ matched: 7, visible: 0, checked: 7, truncated: false }),
            ];
            for (const v of verdicts) {
                expect(v.detail).toMatch(/^(assert_ok|assert_failed) matched=\d+ visible=\d+( checked=\d+ truncated)?$/);
            }
        });
    });

    describe('isSelectorSyntaxError', () => {
        it('recognises genuine Playwright selector parse failures', () => {
            expect(isSelectorSyntaxError(new Error('locator.waitFor: Unexpected token "" while parsing css selector "div[[[oops". Did you mean to CSS.escape it?'))).toBe(true);
            expect(isSelectorSyntaxError('invalid selector: Unable to locate an element')).toBe(true);
        });
        it('rejects timeouts, missing elements and plain text', () => {
            expect(isSelectorSyntaxError(new Error('locator.waitFor: Timeout 3000ms exceeded'))).toBe(false);
            expect(isSelectorSyntaxError(new Error('waiting for locator("#x") to be visible'))).toBe(false);
            expect(isSelectorSyntaxError('assert_missing_target')).toBe(false);
        });
    });

    describe('classifyActionError invalid_selector', () => {
        it('names selector syntax failures without disturbing neighbours', () => {
            expect(classifyActionError(new Error('Unexpected token "" while parsing css selector "div[[[oops"'))).toBe('invalid_selector');
            expect(classifyActionError(new Error('locator.click: Timeout 20000ms exceeded'))).toBe('timeout');
            expect(classifyActionError(new Error('element is not enabled'))).toBe('element_disabled');
            expect(classifyActionError(new Error('strict mode violation: resolved to 4 elements'))).toBe('selector_ambiguous');
        });
    });
});
