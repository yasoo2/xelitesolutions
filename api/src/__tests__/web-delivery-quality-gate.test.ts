import { assessWebDeliveryQuality } from '../modules/tools/definitions/WebPageBuilderTool';

describe('web delivery quality gate', () => {
    const criticalBehaviour = {
        severity: 'critical',
        ar: 'خطأ JavaScript أثناء الضغط على زر «استكشف المنتجات».',
        en: 'JavaScript error while clicking “Explore products”.',
    } as any;

    it('blocks delivery when the browser reports a critical interaction failure', () => {
        const quality = assessWebDeliveryQuality({
            behaviourFindings: [criticalBehaviour],
            isArabic: true,
        });

        expect(quality.blocked).toBe(true);
        expect(quality.reasons).toContain(criticalBehaviour.ar);
    });

    it('blocks delivery when the required browser audit could not run', () => {
        const quality = assessWebDeliveryQuality({
            auditSkipped: ['Chromium session could not be started'],
            isArabic: false,
        });

        expect(quality.blocked).toBe(true);
        expect(quality.reasons[0]).toMatch(/required automated audit/i);
    });

    it('does not block delivery for a minor visual note alone', () => {
        const quality = assessWebDeliveryQuality({
            visualFindings: [{ severity: 'minor', ar: 'تباعد بسيط', en: 'Minor spacing' } as any],
            isArabic: true,
        });

        expect(quality).toEqual({ blocked: false, reasons: [] });
    });
});
