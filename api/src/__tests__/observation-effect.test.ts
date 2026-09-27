import {
    buildExtractReadEval,
    captureEvidence,
    ELEMENTS_READ_SCRIPT,
    ELEMENTS_RETURN_CAP,
    evaluateElementsObservation,
    evaluateExtractObservation,
} from '../modules/browser/actionVerification';

describe('observation receipts', () => {
    describe('buildExtractReadEval', () => {
        it('bakes the selector in as a JSON literal payload', () => {
            const built = buildExtractReadEval('#blurb');
            const payload = `(${JSON.stringify({ selector: '#blurb' })})`;
            expect(built.endsWith(payload)).toBe(true);
            expect(JSON.parse(payload.slice(1, -1))).toEqual({ selector: '#blurb' });
        });

        it('keeps hostile selector text inert inside the payload', () => {
            const hostile = 'x"});alert(1);//';
            const built = buildExtractReadEval(hostile);
            const payload = `(${JSON.stringify({ selector: hostile })})`;
            expect(built.endsWith(payload)).toBe(true);
            expect(JSON.parse(payload.slice(1, -1))).toEqual({ selector: hostile });
        });

        it('is a complete expression that reports found/invalid instead of throwing', () => {
            const built = buildExtractReadEval('p');
            expect(built.startsWith('((arg) => {')).toBe(true);
            expect(built).toContain('document.querySelector(arg.selector)');
            expect(built).toContain('{ found: false, invalid: true, text:');
            expect(built).toContain('{ found: true, invalid: false, text:');
        });
    });

    describe('evaluateExtractObservation', () => {
        it('reports a hit with found and length', () => {
            const verdict = evaluateExtractObservation({ found: true, invalid: false, text: 'spare hinges' }, '#blurb');
            expect(verdict).toMatchObject({
                ok: true, found: true, verified: true,
                textLength: 12, text: 'spare hinges', detail: 'extract_ok len=12',
            });
        });

        it('fails a miss as element_not_found and names the selector', () => {
            const verdict = evaluateExtractObservation({ found: false, invalid: false, text: '' }, '#no-such-thing');
            expect(verdict).toMatchObject({
                ok: false, reason: 'element_not_found', found: false, verified: true, textLength: -1, text: '',
            });
            expect(verdict.detail).toBe('extract_target_not_found "#no-such-thing"');
        });

        it('fails invalid syntax as invalid_selector so the step fails instead of the run', () => {
            const verdict = evaluateExtractObservation({ found: false, invalid: true, text: '' }, 'div[[[bad');
            expect(verdict).toMatchObject({ ok: false, reason: 'invalid_selector', found: false });
            expect(verdict.detail).toContain('extract_invalid_selector "div[[[bad" could not be parsed');
        });

        it('lets invalid win when a corrupt read claims both', () => {
            const verdict = evaluateExtractObservation({ found: true, invalid: true, text: 'x' }, 'p');
            expect(verdict).toMatchObject({ ok: false, reason: 'invalid_selector' });
        });

        it('keeps the action verdict marked unverified when the read is unreadable', () => {
            for (const bad of [null, undefined, 42, 'text']) {
                const verdict = evaluateExtractObservation(bad as any, '#blurb');
                expect(verdict).toMatchObject({ ok: true, verified: false, textLength: -1, text: '', detail: 'extract_unverified' });
            }
        });

        it('normalizes non-string page text instead of crashing', () => {
            const verdict = evaluateExtractObservation({ found: true, invalid: false, text: 42 as any }, '#n');
            expect(verdict).toMatchObject({ ok: true, text: '42', textLength: 2 });
        });

        it('slices long selectors in structured details', () => {
            const long = '#' + 's'.repeat(200);
            const verdict = evaluateExtractObservation({ found: false, invalid: false, text: '' }, long);
            expect(verdict.detail).toBe('extract_target_not_found ' + JSON.stringify('#' + 's'.repeat(119)));
        });
    });

    describe('elements read', () => {
        it('embeds the named return cap so script and verdict cannot drift', () => {
            expect(ELEMENTS_RETURN_CAP).toBe(100);
            expect(ELEMENTS_READ_SCRIPT).toContain(`slice(0, ${ELEMENTS_RETURN_CAP})`);
            expect(ELEMENTS_READ_SCRIPT).toContain('return { total, elements }');
        });

        it('reports counts for an ordinary read', () => {
            expect(evaluateElementsObservation({ total: 3, returned: 3 })).toEqual({
                elementCount: 3, totalMatched: 3, truncated: false,
            });
        });

        it('says when the cap cut the list, exactly at the boundary', () => {
            expect(evaluateElementsObservation({ total: 100, returned: 100 }).truncated).toBe(false);
            expect(evaluateElementsObservation({ total: 101, returned: 100 })).toMatchObject({
                elementCount: 100, totalMatched: 101, truncated: true,
            });
        });

        it('reports a hidden-filtered shortfall as-is without claiming truncation', () => {
            expect(evaluateElementsObservation({ total: 5, returned: 3 })).toEqual({
                elementCount: 3, totalMatched: 5, truncated: false,
            });
        });

        it('reports an empty page as a valid zero observation', () => {
            expect(evaluateElementsObservation({ total: 0, returned: 0 })).toEqual({
                elementCount: 0, totalMatched: 0, truncated: false,
            });
        });

        it('normalizes garbage reads to zeros instead of inventing counts', () => {
            for (const bad of [null, undefined, {}, { total: -4, returned: NaN }]) {
                expect(evaluateElementsObservation(bad as any)).toEqual({
                    elementCount: 0, totalMatched: 0, truncated: false,
                });
            }
        });
    });

    describe('captureEvidence', () => {
        it('decodes base64 length to bytes across padding shapes', () => {
            expect(captureEvidence('YWI=')).toEqual({ captured: true, captureBytes: 2 });
            expect(captureEvidence('YWJj')).toEqual({ captured: true, captureBytes: 3 });
            expect(captureEvidence('YQ==')).toEqual({ captured: true, captureBytes: 1 });
            expect(captureEvidence('YWI')).toEqual({ captured: true, captureBytes: 2 });
        });

        it('reports an empty capture instead of failing', () => {
            for (const bad of ['', null, undefined, 0]) {
                expect(captureEvidence(bad as any)).toEqual({ captured: false, captureBytes: 0 });
            }
        });
    });
});
