import { projectionMatchesFrame, viewportStampOrFallback } from '../../../web/src/lib/browserFrameProjection';
import { watchedHighlightBoxes } from '../core/quality/audit-eyes';

describe('browser QA overlays stay attached to their source viewport', () => {
    it('accepts coordinates from the frame that produced them', () => {
        expect(projectionMatchesFrame(1280, 900, {
            viewportWidth: 1280,
            viewportHeight: 900,
        })).toBe(true);
    });

    it('rejects desktop coordinates after the browser switches to mobile', () => {
        expect(projectionMatchesFrame(390, 844, {
            viewportWidth: 1280,
            viewportHeight: 900,
        })).toBe(false);
    });

    it('rejects unstamped coordinates instead of guessing their viewport', () => {
        expect(projectionMatchesFrame(1280, 900, {})).toBe(false);
    });

    it('keeps legacy unstamped events compatible by using the current frame once', () => {
        const legacyStamp = viewportStampOrFallback({}, 1280, 900);
        expect(legacyStamp).toEqual({ viewportWidth: 1280, viewportHeight: 900 });
        expect(projectionMatchesFrame(1280, 900, legacyStamp)).toBe(true);
        expect(projectionMatchesFrame(390, 844, legacyStamp)).toBe(false);
    });

    it('shows one current target without discarding the full finding list', () => {
        const findings = [
            { x: 10, y: 20, width: 100, height: 40, label: 'first' },
            { x: 30, y: 50, width: 80, height: 30, label: 'second' },
        ];
        expect(watchedHighlightBoxes(findings)).toEqual([findings[0]]);
        expect(findings).toHaveLength(2);
    });
});
