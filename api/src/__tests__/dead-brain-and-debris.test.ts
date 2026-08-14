/**
 * Fixes reverse-engineered from ONE real Windows session log and the files
 * that build produced. Each test names what actually went wrong on the
 * user's machine:
 *
 * 1. Groq's DAILY quota 429 says "try again in 24m" — cooling it for the
 *    default 60s made every subsequent call re-eat the 429.
 * 2. After a total provider failure, every next optional LLM step re-walked
 *    the whole mesh (~minutes each, the local model's 180s timeout alone) —
 *    the build finished at 12:43 and the run was still churning at 12:48.
 * 3. «&copy; 2023» shipped as «&<bdi>copy</bdi>;» — the bidi isolator wrapped
 *    an HTML entity's NAME as if it were prose.
 * 4. style="background-image: url('... avatar}}" 404'd three times per page
 *    load — marker debris in an inline style that no sweep looked at.
 * 5. Four social icons per footer were invisible: <use href="#facebook"> had
 *    no symbol, <use href="#check"> missed the #i- prefix, and a bare <use>
 *    outside an <svg> renders nothing.
 */
import * as fs from 'fs';
import * as path from 'path';
import { markProviderOk, recentlyHealthyRetryCandidates, retryAfterMsFrom } from '../core/llm/intelligent-router';
import { isolateLatinRuns } from '../core/design/language';
import { stripBrokenStyleImages } from '../core/design/images';
import { normalizeIconRefs, iconSprite } from '../core/design/layouts';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');

describe('retryAfterMsFrom — a rate limit is cooled for ITS window, not a default', () => {
    it('parses Groq\'s minutes-and-seconds form', () => {
        const ms = retryAfterMsFrom('Rate limit reached … Please try again in 24m40.896s. Need more tokens?');
        expect(ms).toBeGreaterThan(24 * 60_000);
        expect(ms).toBeLessThan(25 * 60_000);
    });

    it('parses an hours form and caps at 30 minutes', () => {
        expect(retryAfterMsFrom('try again in 5h55m39.9s')).toBe(30 * 60_000);
    });

    it('parses LLM7\'s "Retry after N seconds" and caps it too', () => {
        expect(retryAfterMsFrom('429 Daily token quota exceeded. Retry after 30045 seconds.')).toBe(30 * 60_000);
        expect(retryAfterMsFrom('Retry after 90 seconds')).toBe(90_000);
    });

    it('an error that names no window gets the default (null)', () => {
        expect(retryAfterMsFrom('ECONNREFUSED')).toBeNull();
        expect(retryAfterMsFrom('')).toBeNull();
    });
});

describe('recently healthy provider recovery — one evidence-based probe, not a blind re-walk', () => {
    it('selects only a provider that answered within the current short window', () => {
        const proven = `proven-${Date.now()}`;
        const mesh = [{ name: proven }, { name: `unknown-${Date.now()}` }];
        markProviderOk(proven);
        expect(recentlyHealthyRetryCandidates(mesh)).toEqual([{ name: proven }]);
    });

    it('keeps the recovery bounded and excludes rate-limited providers', () => {
        const src = read('core/llm/intelligent-router.ts');
        expect(src).toContain('Transient mesh failure: probing recently healthy provider(s) once');
        expect(src).toContain('TRANSIENT_PROVIDER_RETRY_TIMEOUT_MS');
        expect(src).toContain('!isProviderRateLimited(provider.name)');
    });
});

describe('dead-brain latch — no minutes-long re-walks of a mesh that just died', () => {
    const src = read('core/llm/intelligent-router.ts');

    it('a total failure sets the latch, and any success releases it', () => {
        expect(src).toMatch(/lastTotalFailureAt = Date\.now\(\)/);
        expect((src.match(/lastTotalFailureAt = 0/g) || []).length).toBeGreaterThanOrEqual(2);
    });

    it('a latched call answers instantly with the honest failure notice', () => {
        const latchBlock = src.slice(src.indexOf('Dead-brain latch: all providers failed'));
        expect(latchBlock.slice(0, 400)).toContain('PROVIDER_FAILURE_PREFIX');
    });

    it('a local model that just timed out is probed briefly, not for 180 seconds', () => {
        expect(src).toMatch(/localTimedOutAt/);
        expect(src).toMatch(/Math\.min\(timeoutValue, 20_000\)/);
    });
});

describe('HTML entities survive the bidi isolator', () => {
    it('«&copy;» is not prose — seen shipped as «&<bdi>copy</bdi>;»', () => {
        const out = isolateLatinRuns('<p>&copy; 2023 شركة النور. جميع الحقوق محفوظة.</p>');
        expect(out).toContain('&copy; 2023');
        expect(out).not.toContain('<bdi>copy</bdi>');
    });

    it('while a real Latin brand in the same sentence still gets isolated', () => {
        const out = isolateLatinRuns('<p>&copy; 2023 <span>تعمل شركة Nova هنا</span></p>');
        expect(out).toContain('<bdi>Nova</bdi>');
        expect(out).toContain('&copy;');
    });
});

describe('stripBrokenStyleImages — marker debris in inline styles', () => {
    it('removes the exact malformed background the real build shipped', () => {
        const html = `<div class="avatar" style="background-image: url('... avatar}}" alt="أحمد"></div>`;
        const r = stripBrokenStyleImages(html);
        expect(r.removed).toBeGreaterThan(0);
        expect(r.html).not.toContain('avatar}}');
        expect(r.html).not.toContain('background-image');
    });

    it('leaves healthy inline styles byte for byte', () => {
        const html = `<div style="background-image: url('photo.jpg'); color: red"></div>`;
        const r = stripBrokenStyleImages(html);
        expect(r.removed).toBe(0);
        expect(r.html).toBe(html);
    });
});

describe('normalizeIconRefs — every icon reference lands on a symbol that exists', () => {
    it('adds the missing i- prefix for known names', () => {
        const r = normalizeIconRefs('<svg class="icon"><use href="#check"></use></svg>');
        expect(r.html).toContain('href="#i-check"');
        expect(r.fixed).toBe(1);
    });

    it('social names now have symbols in the sprite, and refs are repointed', () => {
        const sprite = iconSprite();
        for (const s of ['i-facebook', 'i-twitter', 'i-linkedin', 'i-instagram']) {
            expect(sprite).toContain(`id="${s}"`);
        }
        const r = normalizeIconRefs('<svg class="icon"><use href="#facebook"></use></svg>');
        expect(r.html).toContain('href="#i-facebook"');
    });

    it('a bare <use> inside a span becomes a real <svg> — outside one it renders nothing', () => {
        const r = normalizeIconRefs('<span class="icon"><use href="#i-pin"></use></span>');
        expect(r.html).toContain('<svg class="icon"><use href="#i-pin"></use></svg>');
    });

    it('page anchors and unknown names are untouched', () => {
        const html = '<a href="#check">القسم</a><svg><use href="#custom-logo"></use></svg>';
        const r = normalizeIconRefs(html);
        expect(r.html).toBe(html);
        expect(r.fixed).toBe(0);
    });
});

describe('/git/status never makes a request wait for git again', () => {
    const src = read('api/routes/git.ts');

    it('serves the cache instantly and refreshes in the background', () => {
        expect(src).toMatch(/_statusRefreshing/);
        // The handler responds from cache BEFORE deciding to refresh.
        const handler = src.slice(src.indexOf("router.get('/status'"));
        const jsonAt = handler.indexOf('res.json(_statusCache.data)');
        const refreshAt = handler.indexOf('refreshGitStatus()');
        expect(jsonAt).toBeGreaterThan(-1);
        expect(refreshAt).toBeGreaterThan(jsonAt);
    });

    it('concurrent polls cannot stack git processes', () => {
        expect(src).toMatch(/if \(_statusRefreshing\) return/);
    });
});
