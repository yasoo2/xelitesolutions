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
const CHAT = () => fs.readFileSync(path.join(WEB, 'ChatPanel.tsx'), 'utf-8');
const CSS = () => fs.readFileSync(path.join(WEB, '..', 'styles', 'joe-premium.css'), 'utf-8');

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

/**
 * THE 42 PIXELS — «نفس المشكلة… الحدود متداخلة كما تلاحظ بالصورة».
 *
 * The card itself was already `width: 100%; min-width: 0` inside its parent, and
 * measured 667px inside a 667px parent — which is why the first proof passed
 * while the screenshot still showed an overlap. The overflow was BORN in that
 * parent: a `width: 100%` column sharing the message row with a 30px avatar and
 * a 12px gap, at `min-width: auto`, so it never gave those 42px back and pushed
 * the card past the chat's own border into the Logs panel.
 */
describe('the column the card lives in is the column every reply lives in', () => {
    it('the thinking row uses joe-message-content, not a width:100% column of its own', () => {
        const chat = CHAT();
        const at = chat.indexOf('<NeuralThinkingIndicator');
        expect(at).toBeGreaterThan(0);
        // The wrapper immediately above the indicator.
        const before = chat.slice(Math.max(0, at - 700), at);
        const wrapper = before.slice(before.lastIndexOf('<div '));
        expect(wrapper).toMatch(/className="joe-message-content"/);
        expect(wrapper).not.toMatch(/width: '100%'/);
    });

    it('and that column is allowed to shrink — flex:1 with min-width:0', () => {
        const css = CSS();
        const rule = css.slice(css.indexOf('.joe-message-content {'), css.indexOf('.joe-message-content {') + 200);
        expect(rule).toMatch(/flex: 1;/);
        expect(rule).toMatch(/min-width: 0;/);
    });

    it('the composer copy of the card can shrink too', () => {
        const composer = fs.readFileSync(path.join(WEB, 'CommandComposer.tsx'), 'utf-8');
        const at = composer.indexOf('<NeuralThinkingIndicator');
        const wrapper = composer.slice(Math.max(0, at - 400), at);
        expect(wrapper.slice(wrapper.lastIndexOf('<div '))).toMatch(/minWidth: 0/);
    });
});
