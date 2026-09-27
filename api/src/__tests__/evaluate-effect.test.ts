import {
    EVALUATE_RESULT_PREVIEW_MAX,
    summarizeEvaluateResult,
} from '../modules/browser/actionVerification';

describe('evaluate result summary', () => {
    it('names primitive types and passes short strings through', () => {
        expect(summarizeEvaluateResult('harbor')).toEqual({
            resultType: 'string',
            resultLength: 6,
            resultPreview: 'harbor',
        });
        expect(summarizeEvaluateResult(42)).toEqual({
            resultType: 'number',
            resultLength: 2,
            resultPreview: '42',
        });
        expect(summarizeEvaluateResult(false)).toEqual({
            resultType: 'boolean',
            resultLength: 5,
            resultPreview: 'false',
        });
        expect(summarizeEvaluateResult(undefined)).toEqual({
            resultType: 'undefined',
            resultLength: 9,
            resultPreview: 'undefined',
        });
        expect(summarizeEvaluateResult(null)).toEqual({
            resultType: 'null',
            resultLength: 4,
            resultPreview: 'null',
        });
    });

    it('distinguishes arrays from objects and JSON-shapes them', () => {
        expect(summarizeEvaluateResult([1, 'x'])).toEqual({
            resultType: 'array',
            resultLength: 7,
            resultPreview: '[1,"x"]',
        });
        expect(summarizeEvaluateResult({ moored: 3 })).toEqual({
            resultType: 'object',
            resultLength: 12,
            resultPreview: '{"moored":3}',
        });
    });

    it('shapes bigint, function and symbol without throwing', () => {
        const big = summarizeEvaluateResult(10n);
        expect(big.resultType).toBe('bigint');
        expect(big.resultPreview).toBe('10');
        const fn = summarizeEvaluateResult(() => 1);
        expect(fn.resultType).toBe('function');
        expect(fn.resultLength).toBeGreaterThan(0);
        const sym = summarizeEvaluateResult(Symbol('pier'));
        expect(sym.resultType).toBe('symbol');
        expect(sym.resultPreview).toBe('Symbol(pier)');
    });

    it('measures huge values but cuts the preview at the cap', () => {
        const huge = 'w'.repeat(EVALUATE_RESULT_PREVIEW_MAX + 500);
        const s = summarizeEvaluateResult(huge);
        expect(s.resultType).toBe('string');
        expect(s.resultLength).toBe(EVALUATE_RESULT_PREVIEW_MAX + 500);
        expect(s.resultPreview).toBe('w'.repeat(EVALUATE_RESULT_PREVIEW_MAX));
    });

    it('degrades circular structures to a marker instead of throwing', () => {
        const loop: any = { name: 'loop' };
        loop.self = loop;
        const s = summarizeEvaluateResult(loop);
        expect(s.resultType).toBe('object');
        expect(s.resultPreview).toContain('[circular]');
        const arr: any[] = [1];
        arr.push(arr);
        expect(summarizeEvaluateResult(arr).resultPreview).toContain('[circular]');
    });

    it('never throws on hostile values', () => {
        const evil = Object.create(null);
        Object.defineProperty(evil, 'x', {
            get() {
                throw new Error('boom');
            },
            enumerable: true,
        });
        expect(() => summarizeEvaluateResult(evil)).not.toThrow();
        expect(() => summarizeEvaluateResult(Object.create(null))).not.toThrow();
    });
});
