/**
 * The agent narrating its own work.
 *
 * What this replaces was `broadcastThinkingDetail('🚀 Running: ' + node.task)` —
 * a string written months ago, fired from a fixed line, and shown to the user
 * under the heading "التفكير العصبي". Honest as a progress log, dishonest as a
 * label: nothing was thinking. The user's rule is that the system contains no
 * simulated tool, and a canned sentence presented as reasoning is exactly that.
 *
 * The property that matters most here is the one about FAILURE: when the model
 * does not answer, or answers badly, the result must be silence. A fallback
 * sentence would reintroduce the fake this exists to remove, and every reject
 * path below asserts that it does not.
 */

import {
    narrationPrompt, extractNarration, narrate, narrationEnabled,
} from '../core/agents/narrator';
import { PROVIDER_FAILURE_PREFIX } from '../core/llm/intelligent-router';

const ctx = {
    goal: 'ابني صفحة ويب لشركة استشارات اسمها xelitesolutions',
    done: { task: 'write the services section', ok: true, summary: '3 cards written' },
    next: { task: 'write the pricing section', tool: 'web_page_builder' },
    index: 4,
    total: 10,
    isArabic: true,
};

describe('the instruction given to the model', () => {
    const p = narrationPrompt(ctx);

    it('shows it what actually happened, not just what was attempted', () => {
        // A line that could have been written before the step ran is not
        // narration. The outcome is what makes it one.
        expect(p).toContain('HOW IT WENT: it worked');
        expect(p).toContain('3 cards written');
    });

    it('says plainly when the last step failed, so the line can react to it', () => {
        const failed = narrationPrompt({ ...ctx, done: { task: 'x', ok: false, summary: 'timed out' } });
        expect(failed).toContain('it FAILED');
        expect(failed).toContain('timed out');
        expect(failed).toMatch(/If the last\s+step failed, say what you are doing about that/);
    });

    it('forbids claiming a result that has not happened', () => {
        expect(p).toMatch(/Never claim a result you do not have yet/);
    });

    it('asks for one plain sentence in the page\'s language', () => {
        expect(p).toMatch(/ONE sentence, 4 to 20 words/);
        expect(p).toMatch(/Write in ARABIC/);
        expect(narrationPrompt({ ...ctx, isArabic: false })).toMatch(/Write in ENGLISH/);
    });

    it('knows where it is in the plan', () => {
        expect(p).toContain('STEP 4 OF 10');
    });
});

describe('a usable line is kept', () => {
    it.each([
        'سأكتب قسم الأسعار الآن بعد أن اكتملت بطاقات الخدمات الثلاث.',
        'أنتقل إلى الأسعار لأن قسم الخدمات جاهز.',
    ])('accepts %s', (line) => {
        expect(extractNarration(line, ctx).text).toBe(line);
    });

    it('unwraps a fence, quotes or a "Step 4:" prefix rather than discarding the sentence', () => {
        const want = 'أنتقل الآن إلى كتابة قسم الأسعار.';
        for (const wrapped of ['```\n' + want + '\n```', `«${want}»`, `"${want}"`, `الخطوة ٤: ${want}`, `- ${want}`, `✍️ ${want}`]) {
            expect(extractNarration(wrapped, ctx).text).toBe(want);
        }
    });

    it('keeps the first sentence when the model added one more', () => {
        const got = extractNarration('أكتب قسم الأسعار الآن. سيستغرق ذلك لحظات.', ctx);
        expect(got.text).toBe('أكتب قسم الأسعار الآن.');
    });
});

describe('a bad line becomes SILENCE, never a stand-in sentence', () => {
    it.each([
        ['empty', ''],
        ['empty', '   \n '],
        ['too_short', 'حسنًا'],
        ['provider_failure', PROVIDER_FAILURE_PREFIX + ' لم يستجب أي مزوّد.'],
        ['markup', '<p>أكتب قسم الأسعار الآن بعد اكتمال الخدمات.</p>'],
        ['markup', '## أكتب قسم الأسعار الآن بعد اكتمال الخدمات'],
        ['too_long', 'أ'.repeat(230)],
        ['wrong_language', 'Writing the pricing section now that services is done.'],
        ['multi_sentence', 'أولًا أكتب. ثم أراجع. ثم أنشر النتيجة كاملة.'],
    ])('rejects %s', (reject, raw) => {
        const got = extractNarration(raw, ctx);
        expect(got.text).toBe('');
        expect(got.reject).toBe(reject);
    });

    it('rejects a line that just hands the request back', () => {
        const got = extractNarration(`سأنفذ: ${ctx.goal}`, ctx);
        expect(got.text).toBe('');
        expect(got.reject).toBe('echoed_the_request');
    });

    it('never invents a sentence of its own — the reject path returns exactly ""', () => {
        // The whole point. If this ever gained a fallback, the fake would be back.
        for (const bad of ['', '###', 'x', PROVIDER_FAILURE_PREFIX + ' x']) {
            expect(extractNarration(bad, ctx).text).toHaveLength(0);
        }
    });
});

describe('narrate() never becomes the step\'s problem', () => {
    it('returns the model\'s line when the model answers', async () => {
        const got = await narrate(ctx, async () => 'أنتقل إلى قسم الأسعار بعد اكتمال الخدمات.');
        expect(got.text).toBe('أنتقل إلى قسم الأسعار بعد اكتمال الخدمات.');
    });

    it('gives up silently when the model throws', async () => {
        const got = await narrate(ctx, async () => { throw new Error('429 rate limited'); });
        expect(got.text).toBe('');
        expect(got.reject).toBe('threw');
    });

    it('gives up silently when the model is slow, and does not hang the run', async () => {
        const started = Date.now();
        const got = await narrate(ctx, () => new Promise(res => setTimeout(() => res('late'), 5000)), { timeoutMs: 120 });
        expect(got.text).toBe('');
        expect(got.reject).toBe('timeout');
        expect(Date.now() - started).toBeLessThan(1500);
    });

    it('passes the real prompt to the model, not a summary of it', async () => {
        let seen = '';
        await narrate(ctx, async (p) => { seen = p; return 'أكتب الأسعار الآن.'; });
        expect(seen).toContain('HOW IT WENT: it worked');
        expect(seen).toContain(ctx.goal);
    });
});

describe('it can be switched off, because it costs a call per step', () => {
    const original = process.env.JOE_NARRATION;
    const originalDisabled = process.env.DISABLE_NARRATION;
    afterEach(() => {
        if (original === undefined) delete process.env.JOE_NARRATION; else process.env.JOE_NARRATION = original;
        if (originalDisabled === undefined) delete process.env.DISABLE_NARRATION; else process.env.DISABLE_NARRATION = originalDisabled;
    });

    it('is ON by default — the alternative that was shipping was a fake', () => {
        delete process.env.JOE_NARRATION;
        expect(narrationEnabled()).toBe(true);
    });

    it.each(['0', 'false', 'off', 'OFF'])('is off for JOE_NARRATION=%s', (v) => {
        process.env.JOE_NARRATION = v;
        expect(narrationEnabled()).toBe(false);
    });

    it.each(['1', 'true', 'on', 'ON'])('is off for DISABLE_NARRATION=%s', (v) => {
        delete process.env.JOE_NARRATION;
        process.env.DISABLE_NARRATION = v;
        expect(narrationEnabled()).toBe(false);
    });
});
