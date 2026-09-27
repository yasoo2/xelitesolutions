import {
    ELEMENTS_RETURN_CAP,
    evaluateUiAuditObservation,
} from '../modules/browser/actionVerification';

const FINGERPRINT = {
    url: 'http://127.0.0.1:9/harbor-log',
    title: 'Harbor log',
    elements: 41,
    textLength: 512,
    htmlHash: 'abc123',
};

describe('ui_audit re-scan receipts', () => {
    it('reports the scan summary for a readable page', () => {
        const verdict = evaluateUiAuditObservation({
            fingerprint: FINGERPRINT,
            elements: { total: 7, returned: 7 },
        });
        expect(verdict).toEqual({
            scanned: true,
            domNodes: 41,
            textLength: 512,
            elementCount: 7,
            totalMatched: 7,
            truncated: false,
        });
    });

    it('says the element list was cut on a crowded page', () => {
        const verdict = evaluateUiAuditObservation({
            fingerprint: FINGERPRINT,
            elements: { total: ELEMENTS_RETURN_CAP + 25, returned: ELEMENTS_RETURN_CAP },
        });
        expect(verdict).toMatchObject({
            scanned: true,
            elementCount: ELEMENTS_RETURN_CAP,
            totalMatched: ELEMENTS_RETURN_CAP + 25,
            truncated: true,
        });
    });

    it('treats an empty page as a valid scan, not a failure', () => {
        const verdict = evaluateUiAuditObservation({
            fingerprint: { ...FINGERPRINT, elements: 3, textLength: 0 },
            elements: { total: 0, returned: 0 },
        });
        expect(verdict).toMatchObject({
            scanned: true, domNodes: 3, textLength: 0,
            elementCount: 0, totalMatched: 0, truncated: false,
        });
    });

    it('reports scanned:false with -1 counts when nothing could be read', () => {
        for (const bad of [null, undefined, 42, 'text']) {
            const verdict = evaluateUiAuditObservation(bad as any);
            expect(verdict).toEqual({
                scanned: false,
                domNodes: -1,
                textLength: -1,
                elementCount: 0,
                totalMatched: 0,
                truncated: false,
            });
        }
    });

    it('keeps element counts when only the fingerprint is unreadable', () => {
        const verdict = evaluateUiAuditObservation({
            fingerprint: null,
            elements: { total: 5, returned: 5 },
        });
        expect(verdict).toMatchObject({
            scanned: false, domNodes: -1, textLength: -1,
            elementCount: 5, totalMatched: 5,
        });
    });

    it('keeps the fingerprint scan when only the elements read is unreadable', () => {
        const verdict = evaluateUiAuditObservation({ fingerprint: FINGERPRINT, elements: null });
        expect(verdict).toMatchObject({
            scanned: true, domNodes: 41, textLength: 512,
            elementCount: 0, totalMatched: 0, truncated: false,
        });
    });

    it('rejects a corrupt fingerprint that names no url', () => {
        const verdict = evaluateUiAuditObservation({
            fingerprint: { ...FINGERPRINT, url: 42 } as any,
            elements: { total: 2, returned: 2 },
        });
        expect(verdict).toMatchObject({ scanned: false, domNodes: -1, textLength: -1 });
    });

    it('normalizes fractional, negative and non-numeric counts instead of crashing', () => {
        const verdict = evaluateUiAuditObservation({
            fingerprint: { ...FINGERPRINT, elements: 12.7, textLength: -9 },
            elements: { total: 'many' as any, returned: 2.9 },
        });
        expect(verdict).toMatchObject({
            scanned: true, domNodes: 12, textLength: 0,
            elementCount: 2, totalMatched: 0, truncated: false,
        });
    });
});
