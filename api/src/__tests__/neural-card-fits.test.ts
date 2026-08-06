/**
 * «القائمة مغلقة… وحجمها غير ملائم لدردشة جو… ومتداخلة مع الحدود»
 *
 * Three faults in one screenshot of the live card: it showed «3 steps ▾» and
 * stayed shut, it was sized for a page rather than a chat, and it crossed its
 * container's border on both sides.
 */
import fs from 'fs';
import path from 'path';

const WEB = path.join(__dirname, '..', '..', '..', 'web', 'src', 'components');
const CARD = () => fs.readFileSync(path.join(WEB, 'NeuralThinkingIndicator.tsx'), 'utf-8');
const VIEW = () => fs.readFileSync(path.join(WEB, 'NeuralTraceView.tsx'), 'utf-8');

describe('the card opens instead of hiding what it has', () => {
    it('one step is enough — it no longer waits for four', () => {
        const src = CARD();
        expect(src).toMatch(/const TIMELINE_THRESHOLD = 1;/);
        expect(src).not.toMatch(/const TIMELINE_THRESHOLD = 4;/);
    });

    it('and he can still fold it away himself', () => {
        const src = CARD();
        // null = follow the threshold; true/false = his decision, which wins.
        expect(src).toMatch(/expanded === null \? steps\.length >= TIMELINE_THRESHOLD : expanded/);
        expect(src).toMatch(/onClick=\{\(\) => setExpanded\(!showTimeline\)\}/);
    });
});

describe('and it fits the chat it lives in', () => {
    it('the padding cannot push it past its container', () => {
        const src = CARD();
        // The rule contains comments with braces, so cut at its real end —
        // the `.neural-card.bubble` line that follows it.
        const at = src.indexOf('.neural-card {');
        const rule = src.slice(at, src.indexOf('.neural-card.bubble', at));
        expect(rule).toMatch(/box-sizing: border-box;/);
        expect(rule).toMatch(/width: 100%;/);
        expect(rule).toMatch(/max-width: 100%;/);
        expect(rule).toMatch(/min-width: 0;/);
    });

    it('the shadow no longer bleeds across the border', () => {
        const src = CARD();
        const blur = Number((src.match(/box-shadow: 0 \d+px (\d+)px/) || [])[1]);
        expect(blur).toBeGreaterThan(0);
        expect(blur).toBeLessThanOrEqual(14);   // was 22
    });

    it('a long goal line shrinks rather than stretching the card', () => {
        const src = CARD();
        expect(src.slice(src.indexOf('.neural-head {'), src.indexOf('.neural-head {') + 120)).toMatch(/min-width: 0/);
        const line = src.slice(src.indexOf('.nc-line {'), src.indexOf('.nc-line {') + 200);
        expect(line).toMatch(/min-width: 0/);
        expect(line).toMatch(/text-overflow: ellipsis/);
        expect(line).toMatch(/white-space: nowrap/);
    });

    it('and the log is chat-sized, not page-sized', () => {
        expect(CARD()).toMatch(/max-height: min\(34vh, 300px\)/);
    });

    it('the timeline inside it is bounded too', () => {
        const view = VIEW();
        const tl = view.slice(view.indexOf('.jt-timeline {'), view.indexOf('.jt-timeline {') + 140);
        expect(tl).toMatch(/min-width: 0/);
        expect(tl).toMatch(/max-width: 100%/);
        expect(view).toMatch(/\.jt-group \{ position: relative; padding-inline-start: 20px; min-width: 0; \}/);
    });

    it('and a long step wraps instead of widening it', () => {
        const view = VIEW();
        expect(view).toMatch(/\.jt-text \{ flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; \}/);
    });
});
