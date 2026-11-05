/**
 * ⛔ A DELIVERY SAYS, IN HIS LANGUAGE, HOW IT WAS PROVEN AND HOW TO RUN IT.
 *
 * Read on 2026-11-05: a verified delivery ended with «✅ تحقّقت فحوص جو من
 * التسليم (live، acceptance، browser)» — ids an Arabic reader cannot read —
 * the `how_to_run` the model gave task_finish was dropped, the run's time and
 * cost stayed in `.joe/result.json`, and nothing in the project said how it
 * was proven. The checks are now named in the interface's language, the reply
 * carries how to run it with the run's time and cost, and a verified project
 * holds JOE-DELIVERY.md, which names only the checks that measured and passed.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { deliveryOutput } from '../core/engine/verify';
import { CERTIFICATE_FILE, clearDeliveryProof, deliveryCertificate, deliveryProof, deliveryProofPaths, durationText, instrumentName, writeDeliveryCertificate } from '../core/engine/certificate';

const measurement = (instrument: string, ok: boolean) => ({ instrument, ok, target: '' });
const verifiedReport = (): any => ({
    passed: true, checks: [], unproven: [], at: 0,
    delivery: {
        projectRoot: '/w/p', primary: 'live', required: ['acceptance'],
        measurements: [measurement('live', true), measurement('acceptance', true), measurement('browser', true)],
        verdict: { verified: true, partial: false, failures: [], unmeasured: [], coverageFailed: false, unread: [], unverified: [], firstError: '' },
        executionStatus: 'completed', verificationStatus: 'passed', deliveryStatus: 'delivered', liveUrl: 'http://127.0.0.1:4300/',
        notMeasured: {}, acceptance: { requirements: [], requestUnread: false, whyNotRead: '' }, stoppedServers: [], log: [],
    },
});
const delivered = (extra: Record<string, unknown> = {}): any => ({
    status: 'delivered', summary: 'بنيتُ الصفحة.', verification: verifiedReport(), filesChanged: [], served: [], steps: 5, model: 'claude-haiku-5-5', ...extra,
});

const root = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-cert-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the checks are named in his language', () => {
    it('names every instrument in Arabic and in English, and keeps an unknown id as it is', () => {
        expect(instrumentName('live', 'ar')).toBe('التشغيل الحي');
        expect(instrumentName('acceptance', 'ar')).toBe('حكم مستقل');
        expect(instrumentName('browser', 'en')).toBe('browser test');
        expect(instrumentName('telepathy', 'ar')).toBe('telepathy');
        for (const id of ['live', 'quality', 'scope', 'coverage', 'tests', 'browser', 'spec', 'program', 'service', 'source', 'build', 'acceptance']) {
            expect(instrumentName(id, 'ar')).toMatch(/[ء-ي]/u);
        }
    });

    it('says the verdict with readable names, how to run it, and what the run took', () => {
        const out = deliveryOutput({
            result: delivered({ howToRun: 'npm install\nnpm start', durationMs: 4 * 60_000 + 10_000, costUsd: 0.0314 }),
            projectRoot: '/w/p', request: 'ابنِ صفحة فيها عدّاد',
        });
        expect(out.ok).toBe(true);
        expect(out.output.summary).toContain('✅ تحقّقت فحوص جو من التسليم (التشغيل الحي، حكم مستقل، التجربة في المتصفح) — المعاينة الحية: http://127.0.0.1:4300/');
        expect(out.output.summary).not.toMatch(/\(live/);
        expect(out.output.summary).toContain('▶️ طريقة التشغيل:\nnpm install\nnpm start');
        expect(out.output.summary).toContain('⏱️ استغرق 4 دقائق وكلّف $0.031');
    });

    it('says nothing it did not measure: no run instructions, no time and no cost when the run had none', () => {
        const out = deliveryOutput({ result: delivered(), projectRoot: '/w/p', request: 'ابنِ صفحة فيها عدّاد' });
        expect(out.output.summary).toBe('بنيتُ الصفحة.\n\n✅ تحقّقت فحوص جو من التسليم (التشغيل الحي، حكم مستقل، التجربة في المتصفح) — المعاينة الحية: http://127.0.0.1:4300/');
        expect(durationText(undefined, 'ar')).toBe('');
        expect(durationText(30_000, 'ar')).toBe('30 ثانية');
    });

    it('a refused delivery is still said the way it was', () => {
        const report = verifiedReport();
        report.passed = false;
        report.delivery.verdict = { ...report.delivery.verdict, verified: false, firstError: 'the source does not parse' };
        const out = deliveryOutput({ result: delivered({ status: 'failed', verification: report, howToRun: 'npm start' }), projectRoot: '/w/p', request: 'ابنِ صفحة فيها عدّاد' });
        expect(out.ok).toBe(false);
        expect(out.output.summary).toMatch(/^⚠️ لم يُسلَّم المشروع/);
        expect(out.output.summary).not.toContain('طريقة التشغيل');
    });
});

describe('a verified project holds its delivery certificate', () => {
    const input = {
        request: 'ابنِ صفحة فيها عدّاد يزيد عند الضغط', summary: 'بنيتُ الصفحة.', language: 'ar',
        passed: ['live', 'browser', 'acceptance'], unproven: ['R3 حفظ العدد بعد التحديث: not measured'],
        howToRun: 'npx serve .', liveUrl: 'http://127.0.0.1:4300/', durationMs: 6 * 60_000, costUsd: 0.042, model: 'claude-haiku-5-5', at: Date.UTC(2026, 10, 5, 6, 0),
    };

    it('says the request, what was built, each passed check in words, what is not proven, how to run it, and how to undo', () => {
        const text = deliveryCertificate(input);
        expect(text).toContain('<div dir="rtl">');
        expect(text).toContain('# شهادة تسليم من جو');
        expect(text).toContain('> ابنِ صفحة فيها عدّاد يزيد عند الضغط');
        expect(text).toContain('- ✅ **التشغيل الحي**: شُغّل المشروع فعلاً وأجاب على عنوانه الحي.');
        expect(text).toContain('- ✅ **التجربة في المتصفح**');
        expect(text).not.toContain('**الاختبارات**');
        expect(text).toContain('## ما لم يثبت بعد');
        expect(text).toContain('- ⚠️ R3 حفظ العدد بعد التحديث: not measured');
        expect(text).toContain('```\nnpx serve .\n```');
        expect(text).toContain('- المدة: 6 دقائق');
        expect(text).toContain('- التكلفة: $0.042');
        expect(text).toContain('«تراجع»');
    });

    it('is written in English for an English interface', () => {
        const text = deliveryCertificate({ ...input, language: 'en', request: 'Build a counter page' });
        expect(text).toContain('# Joe delivery certificate');
        expect(text).toContain('- ✅ **live run**: The project was started for real');
        expect(text).not.toContain('dir="rtl"');
    });

    it('shows the pictures this run\'s browser check took, and none a run before it left', () => {
        const dir = path.join(root, 'with-proof');
        const kept = deliveryProofPaths(path.join(dir, '.joe'));
        fs.mkdirSync(path.dirname(kept.desktop), { recursive: true });
        fs.writeFileSync(kept.desktop, 'jpg');
        fs.writeFileSync(kept.phone, 'jpg');
        expect(deliveryProof(dir)).toEqual({ desktop: '.joe/delivery/desktop.jpg', phone: '.joe/delivery/phone.jpg' });
        const text = deliveryCertificate({ ...input, screenshots: deliveryProof(dir) });
        expect(text).toContain('## كما رآه جو في المتصفح');
        expect(text).toContain('![على الحاسوب](.joe/delivery/desktop.jpg)');
        expect(text).toContain('![على الجوال](.joe/delivery/phone.jpg)');
        fs.writeFileSync(path.join(dir, CERTIFICATE_FILE), 'old');
        clearDeliveryProof(dir);
        expect(deliveryProof(dir)).toEqual({});
        // A run that starts changing the project takes the old certificate away with the old pictures.
        expect(fs.existsSync(path.join(dir, CERTIFICATE_FILE))).toBe(false);
        expect(deliveryCertificate({ ...input, screenshots: {} })).not.toContain('كما رآه جو');
    });

    it('lands in the project folder', () => {
        const file = writeDeliveryCertificate(root, input);
        expect(file).toBe(path.join(root, CERTIFICATE_FILE));
        expect(fs.readFileSync(file!, 'utf8')).toContain('شهادة تسليم من جو');
        expect(writeDeliveryCertificate(path.join(root, 'missing', 'deep'), input)).toBeNull();
    });
});
