/**
 * «نجاح البناء لا يساوي نجاح الوكيل».
 *
 * A wide brief asked for a booking board with a dashboard, six rows, search, a
 * status filter, an add form, empty states, a local export, a README, a
 * production build and a preview. What came back was a working project, a
 * message listing files, and `success: true` — with no build, no README, and
 * no mention that seven of the nine things asked for had never been shown.
 *
 * Nothing in that run was a lie. Every individual claim was true. The failure
 * was that nobody asked the question the user actually cares about: of the
 * things I was TOLD to deliver, which can I show?
 *
 * The judge asks it. It reads his own brief into criteria, hunts evidence for
 * each in what really exists — files on disk, the build flag, a live server,
 * the browser audit, the generated source — and publishes the ledger. Measured
 * on a real build while writing this: 8 of 11, with README, preview and
 * browser check named as unmet; then 9 of 9 once the README was written where
 * both build paths could reach it.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { acceptanceFor, judgeAcceptance, acceptanceBlock } from '../core/quality/acceptance';

const REACT = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');

const BRIEF = 'أنشئ لوحة حجوزات عربية RTL لورشة تصوير. المطلوب: لوحة مؤشرات، ستة حجوزات، بحث،'
    + ' مرشح حالة، إضافة حجز، حالات فراغ، تصدير محلي، README عربي، بناء إنتاج، ومعاينة عبر المتصفح.';

describe('the criteria come from HIS brief, never from a fixed checklist', () => {
    it('a wide brief yields every thing it asked for', () => {
        const ids = acceptanceFor(BRIEF).map(c => c.id).sort();
        expect(ids).toEqual([
            'add_row', 'browser_check', 'dashboard', 'empty_state', 'export',
            'filter', 'preview', 'production_build', 'readme', 'rtl', 'search',
        ].sort());
    });

    it('and a plain request asks for almost nothing — so almost nothing is judged', () => {
        const ids = acceptanceFor('ابنِ لي موقع لمطعم إيطالي اسمه لا بيلا').map(c => c.id);
        expect(ids).not.toContain('export');
        expect(ids).not.toContain('readme');
        expect(ids).not.toContain('browser_check');
    });

    it('nothing is invented: a criterion he never mentioned is never judged', () => {
        expect(acceptanceFor('ابنِ صفحة هبوط بسيطة').map(c => c.id)).not.toContain('search');
    });
});

describe('a criterion is met by EVIDENCE, or it is not met', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-accept-'));

    beforeAll(() => {
        fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'src', 'App.jsx'),
            `export default function App(){ return <div dir="rtl">
              <input type="search" />
              <select><option>الحالة</option></select>
              <form onSubmit={save}><button>إضافة</button></form>
              <a download="rows.csv" href={URL.createObjectURL(blob)}>تصدير</a>
              <p>لا توجد حجوزات بعد</p>
            </div>; }`);
    });

    it('a feature really present in the source is met, and says where from', () => {
        const a = judgeAcceptance(acceptanceFor(BRIEF), { dir: tmp, built: false }, true);
        const by = (id: string) => a.criteria.find(c => c.id === id)!;
        for (const id of ['search', 'filter', 'add_row', 'export', 'empty_state', 'rtl']) {
            expect(by(id).verdict).toBe('met');
        }
    });

    it('a build that did not happen is unmet — the flag comes from a real process', () => {
        const a = judgeAcceptance(acceptanceFor(BRIEF), { dir: tmp, built: false }, true);
        expect(a.criteria.find(c => c.id === 'production_build')!.verdict).toBe('unmet');
        expect(judgeAcceptance(acceptanceFor(BRIEF), { dir: tmp, built: true }, true)
            .criteria.find(c => c.id === 'production_build')!.verdict).toBe('met');
    });

    it('a preview is met only by a url that was verified alive', () => {
        const without = judgeAcceptance(acceptanceFor(BRIEF), { dir: tmp }, true);
        expect(without.criteria.find(c => c.id === 'preview')!.verdict).toBe('unmet');
        const withUrl = judgeAcceptance(acceptanceFor(BRIEF), { dir: tmp, liveUrl: 'http://127.0.0.1:4300/' }, true);
        expect(withUrl.criteria.find(c => c.id === 'preview')!.verdict).toBe('met');
        expect(withUrl.criteria.find(c => c.id === 'preview')!.why).toContain('4300');
    });

    /**
     * A skipped browser audit is the case that started all this: the run read
     * as a success while Chromium had never started.
     */
    it('a browser check that was SKIPPED is unmet, and says why', () => {
        const a = judgeAcceptance(acceptanceFor(BRIEF),
            { dir: tmp, audit: { skipped: 'playwright not installed' } }, true);
        const c = a.criteria.find(x => x.id === 'browser_check')!;
        expect(c.verdict).toBe('unmet');
        expect(c.why).toContain('playwright not installed');
    });

    it('a missing README is unmet, and a present one is met', () => {
        expect(judgeAcceptance(acceptanceFor(BRIEF), { dir: tmp }, true)
            .criteria.find(c => c.id === 'readme')!.verdict).toBe('unmet');
        fs.writeFileSync(path.join(tmp, 'README.md'), '# x');
        expect(judgeAcceptance(acceptanceFor(BRIEF), { dir: tmp }, true)
            .criteria.find(c => c.id === 'readme')!.verdict).toBe('met');
    });

    it('with no source to read, a feature is UNPROVABLE — never quietly met', () => {
        const a = judgeAcceptance(acceptanceFor(BRIEF), { dir: '/nowhere-at-all' }, true);
        expect(a.criteria.find(c => c.id === 'search')!.verdict).toBe('unprovable');
        expect(a.accepted).toBe(false);
    });

    it('accepted is false while a single criterion is unmet', () => {
        const a = judgeAcceptance(acceptanceFor(BRIEF), { dir: tmp, built: true }, true);
        expect(a.unmet).toBeGreaterThan(0);
        expect(a.accepted).toBe(false);
    });
});

describe('the ledger is published, in his language', () => {
    it('an incomplete run leads with the count and names every gap', () => {
        const a = judgeAcceptance(acceptanceFor(BRIEF), { dir: '/nope', built: false }, true);
        const block = acceptanceBlock(a, true);
        expect(block).toContain('حكم القبول');
        expect(block).toContain('❌');
        expect(block).toContain('README');
    });

    it('a complete run says so plainly', () => {
        const only = acceptanceFor('ابنِ الموقع ثم ابنِ نسخة إنتاج');
        const block = acceptanceBlock(judgeAcceptance(only, { dir: '/x', built: true }, true), true);
        expect(block).toContain('✅');
        expect(block).not.toContain('❌');
    });

    it('nothing asked for means nothing claimed', () => {
        expect(acceptanceBlock(judgeAcceptance([], {}, true), true)).toBe('');
    });
});

describe('THE WIRING: the build is judged before it is delivered', () => {
    it('the judge runs on the real evidence of THIS build', () => {
        expect(REACT).toMatch(/const acceptance = judgeAcceptance\(acceptanceFor\(request\), \{/);
        expect(REACT).toMatch(/liveUrl: liveServer \? liveServer\.url : '',/);
        expect(REACT).toMatch(/audit: audit \|\| null,/);
    });

    it('the ledger reaches the message in both languages, and the caller', () => {
        expect((REACT.match(/\$\{qaBlock\}\$\{shellBlock\}\$\{acceptBlock\}/g) || []).length).toBe(2);
        expect(REACT).toMatch(/output: \{ message, acceptance,/);
    });

    /**
     * An application build replaces the whole file set with its own, so a
     * README added to the section-path map is silently dropped for exactly the
     * requests most likely to ask for one. Measured: the first attempt went in
     * above and the ledger still said «لم أكتب README» on a booking board.
     */
    it('the README is written where BOTH build paths can reach it', () => {
        const at = REACT.indexOf("if (asksFor(request).readme) {");
        expect(at).toBeGreaterThan(-1);
        expect(at).toBeGreaterThan(REACT.indexOf('if (appBp) {'));
        expect(at).toBeLessThan(REACT.indexOf('for (const [rel, body] of Object.entries(files))'));
    });
});
