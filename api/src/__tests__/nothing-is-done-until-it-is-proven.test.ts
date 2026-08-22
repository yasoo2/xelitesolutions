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
import {
    acceptanceFor,
    judgeAcceptance,
    acceptanceBlock,
    GATE062_ACCEPTANCE_PROMPT,
    GATE062_LIVE_PROMPT,
    titleTextFrom,
} from '../core/quality/acceptance';

const REACT = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');

const BRIEF = 'أنشئ لوحة حجوزات عربية RTL لورشة تصوير. المطلوب: لوحة مؤشرات، ستة حجوزات، بحث،'
    + ' مرشح حالة، إضافة حجز، حالات فراغ، تصدير محلي، README عربي، بناء إنتاج، ومعاينة عبر المتصفح.';
const SHAPE_BRIEF = 'Build an app with a counter, button, title, and status message.';

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
        expect(ids).not.toContain('production_build');
    });

    it('distinguishes building an app from explicitly building for production', () => {
        expect(acceptanceFor('build me a simple calculator app').map(c => c.id))
            .not.toContain('production_build');
        expect(acceptanceFor('ابنِ لي نسخة إنتاج من الموقع').map(c => c.id))
            .toContain('production_build');
    });

    it('nothing is invented: a criterion he never mentioned is never judged', () => {
        expect(acceptanceFor('ابنِ صفحة هبوط بسيطة').map(c => c.id)).not.toContain('search');
    });

    it('reads exactly the four general UI shapes named by the request', () => {
        expect(acceptanceFor(SHAPE_BRIEF).map(c => c.id).sort()).toEqual([
            'button', 'counter', 'status_message', 'title',
        ].sort());
    });

    it('freezes the Gate062 acceptance input separately from the live input', () => {
        expect(acceptanceFor(GATE062_ACCEPTANCE_PROMPT).map(c => c.id).sort()).toEqual([
            'button', 'counter', 'status_message', 'title',
        ].sort());
        expect(acceptanceFor(GATE062_LIVE_PROMPT).map(c => c.id).sort()).toEqual([
            'button', 'counter', 'preview', 'status_message', 'title',
        ].sort());
    });

    it('does not invent a record-add criterion from Create alone', () => {
        expect(acceptanceFor('Create a polished product landing page').map(c => c.id))
            .not.toContain('add_row');
        expect(acceptanceFor('Create a new customer record').map(c => c.id))
            .toContain('add_row');
        expect(acceptanceFor('ابن لي موقع لمطعمي فيه قائمة الطعام والأسعار').map(c => c.id))
            .not.toContain('list');
    });
});

describe('a criterion is met by EVIDENCE, or it is not met', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-accept-'));

    beforeAll(() => {
        fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'src', 'App.jsx'),
            `import { useState } from 'react';
            export default function App(){
              const [count, setCount] = useState(6);
              const [statusMessage, setStatusMessage] = useState('جاهز');
              function save(event){ event.preventDefault(); setStatusMessage('تم الحفظ'); }
              return <div dir="rtl">
                <h1>لوحة الحجوزات</h1>
                <span data-count={count}>{count}</span>
                <p role="status" aria-live="polite">{statusMessage}</p>
                <input type="search" />
                <select><option>الحالة</option></select>
                <form onSubmit={save}><button type="submit" onClick={() => { setCount(count + 1); setStatusMessage('تم الحفظ'); }}>إضافة</button></form>
                <a download="rows.csv" href={URL.createObjectURL(blob)}>تصدير</a>
                <p>لا توجد حجوزات بعد</p>
              </div>;
            }`);
    });

    it('a feature really present in the source is met, and says where from', () => {
        const a = judgeAcceptance(acceptanceFor(BRIEF), { dir: tmp, built: false }, true);
        const by = (id: string) => a.criteria.find(c => c.id === id)!;
        for (const id of ['search', 'filter', 'add_row', 'export', 'empty_state', 'rtl']) {
            expect(by(id).verdict).toBe('met');
        }
        expect(a.met).toBe(7);
        expect(a.unmet).toBe(4);
        expect(a.accepted).toBe(false);
    });

    it('does not accept a generic XELITE landing page as the five-part Gate062 run', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-xelite-gate062-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), `
          export default function App(){
            return <main>
              <h1>Gate062 — TypeScript + Vite</h1>
              <p>Build beautiful apps.</p>
              <button>Get started</button>
            </main>;
          }
        `);
        const a = judgeAcceptance(acceptanceFor(GATE062_LIVE_PROMPT), { dir }, true);
        expect(a.met).toBe(0);
        expect(a.unmet).toBe(5);
        expect(a.accepted).toBe(false);
        expect(a.criteria.every(c => c.verdict === 'unmet')).toBe(true);
    });

    it('counts each named UI shape independently from the generated source', () => {
        const a = judgeAcceptance(acceptanceFor(SHAPE_BRIEF), { dir: tmp }, true);
        const by = (id: string) => a.criteria.find(c => c.id === id)!;
        for (const id of ['counter', 'button', 'title', 'status_message']) {
            expect(by(id).verdict).toBe('met');
            expect(by(id).why).toContain('مصدر المشروع');
        }
        expect(a.met).toBe(4);
        expect(a.unmet).toBe(0);
    });

    it('extracts only a safe requested title and proves the exact heading', () => {
        const english = acceptanceFor('Create one polished page titled Gate 062 with a heading, a short status message, and a button.');
        const arabic = acceptanceFor('ابنِ صفحة بعنوان متجر الأمل فيها قائمة المنتجات');
        expect(titleTextFrom(GATE062_ACCEPTANCE_PROMPT)).toBe('Gate 062');
        expect(english.find(c => c.id === 'title')!.expectedText).toBe('Gate 062');
        expect(arabic.find(c => c.id === 'title')!.expectedText).toBe('متجر الأمل');

        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-title-positive-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), '<h1>Gate 062</h1>');
        const title = judgeAcceptance(english.filter(c => c.id === 'title'), { dir }, true).criteria[0];
        expect(title.verdict).toBe('met');
        expect(title.why).toContain('Gate 062');
    });

    it('does not prove action-bound shapes from generic markup alone', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-negative-shapes-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), `
          const count = 6;
          export default function App(){ return <>
            <span data-count={count}>{count}</span>
            <button>Open</button>
            <p>Ready</p>
            <h1>Other title</h1>
          </>; }
        `);
        const request = 'Build a page with a counter, button, title, and status message.';
        const a = judgeAcceptance(acceptanceFor(request), { dir }, true);
        const by = (id: string) => a.criteria.find(c => c.id === id)!;
        expect(by('counter').verdict).toBe('unmet');
        expect(by('button').verdict).toBe('unmet');
        expect(by('status_message').verdict).toBe('unmet');
        expect(by('title').verdict).toBe('met');
    });

    it('rejects unrelated state from counter and status evidence', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-unrelated-state-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), `
          import { useState } from 'react';
          export default function App(){
            const [name, setName] = useState('Ada');
            return <>
              <span data-count={name}>{name}</span>
              <p role="status" aria-live="polite">{name}</p>
              <button onClick={() => setName('Grace')}>Rename</button>
            </>;
          }
        `);
        const request = 'Build a page with a counter and status message.';
        const a = judgeAcceptance(acceptanceFor(request), { dir }, true);
        expect(a.criteria.find(c => c.id === 'counter')!.verdict).toBe('unmet');
        expect(a.criteria.find(c => c.id === 'status_message')!.verdict).toBe('unmet');
    });

    it('rejects state that is rendered but never updated by an action', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-never-updated-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), `
          import { useState } from 'react';
          export default function App(){
            const [count, setCount] = useState(6);
            const [statusMessage, setStatusMessage] = useState('Ready');
            return <>
              <span data-count={count}>{count}</span>
              <p role="status" aria-live="polite">{statusMessage}</p>
              <button>Open</button>
            </>;
          }
        `);
        const request = 'Build a page with a counter and status message.';
        const a = judgeAcceptance(acceptanceFor(request), { dir }, true);
        expect(a.criteria.find(c => c.id === 'counter')!.verdict).toBe('unmet');
        expect(a.criteria.find(c => c.id === 'status_message')!.verdict).toBe('unmet');
    });

    it('does not accept a requested title when the generated heading differs', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-title-negative-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), '<h1>Other title</h1>');
        const criteria = acceptanceFor('Create one polished page titled Gate 062 with a heading.');
        const title = judgeAcceptance(criteria.filter(c => c.id === 'title'), { dir }, true).criteria[0];
        expect(title.verdict).toBe('unmet');
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
    it('an incomplete run declares the judge boundary and names every known gap', () => {
        const a = judgeAcceptance(acceptanceFor(BRIEF), { dir: '/nope', built: false }, true);
        const block = acceptanceBlock(a, true);
        expect(block).toContain('حكم القبول الجزئي');
        expect(block).toContain('أثبتُّ 0 مما أعرف كيف أثبته');
        expect(block).toContain('ولم أفحص بقية نص طلبك');
        expect(block).not.toContain('0 من 11');
        expect(block).toContain('❌');
        expect(block).toContain('README');
    });

    it('the rejected English branch also discloses the judge boundary', () => {
        const a = judgeAcceptance(
            acceptanceFor('Create a page with a counter, title, and production build.'),
            { dir: '/nope', built: false },
            false,
        );
        const block = acceptanceBlock(a, false);
        expect(block).toContain('Partial acceptance');
        expect(block).toContain('I proved 0 things I know how to prove');
        expect(block).toContain('I did not inspect the rest of your request');
        expect(block).not.toContain('0 of 3 proven');
    });

    it('a complete catalogue subset declares its boundary instead of claiming the whole request', () => {
        const prompt03 = 'اصنع صفحة فيها قائمة بأسماء ثلاث مدن، وعنوان في أعلاها.';
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-partial-ar-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), '<h1>صفحة المدن</h1>');
        const block = acceptanceBlock(
            judgeAcceptance(acceptanceFor(prompt03), { dir, built: true }, true),
            true,
        );
        expect(block).toContain('حكم القبول الجزئي');
        expect(block).toContain('أثبتُّ 1 مما أعرف كيف أثبته');
        expect(block).toContain('ولم أفحص بقية نص طلبك');
        expect(block).not.toContain('كل ما طلبتَه');
        expect(block).not.toContain('كل ما طلبته');
        expect(block).not.toContain('مُثبَت بدليل.');
    });

    it('the English catalogue subset also declares its boundary', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-partial-en-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), '<h1>City list</h1>');
        const block = acceptanceBlock(
            judgeAcceptance(acceptanceFor('Create a page with a title and a list of three cities.'), { dir }, false),
            false,
        );
        expect(block).toContain('Partial acceptance');
        expect(block).toContain('I did not inspect the rest of your request');
        expect(block).not.toContain('every one of the');
    });

    it('a complete run says so plainly without restoring the old whole-request claim', () => {
        const only = acceptanceFor('ابنِ الموقع ثم ابنِ نسخة إنتاج');
        const block = acceptanceBlock(judgeAcceptance(only, { dir: '/x', built: true }, true), true);
        expect(block).toContain('✅');
        expect(block).not.toContain('❌');
        expect(block).not.toContain('كل ما طلبتَه');
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
