/**
 * A RECORD OUTSIDE EVERY LIST IS STILL DELIVERED — AND STILL MEASURED.
 *
 * Round 21 review of 7c4273e6: the English key of a record he named came
 * from a dictionary grown from one eval suite's own nouns. The nouns of the
 * next request were not in it: «المستأجرين», «العقود», «الامتحانات»,
 * «الإجازات» were still keyed `mstajryns`, `aqwds`, `amthanats` — and a word
 * the dictionary DID know stood in for a phrase it did not: «عقود الإيجار»
 * (lease contracts) was keyed `rents`, so the delivery gate demanded /api/rents
 * of a server that served its contracts, and called them «not served».
 *
 * No model reads the request at the point keys are made (namedEntities,
 * inferModel and the gate's requestedRecords are synchronous and offline), so
 * the reading is built to be right without one: a noun outside every list gets
 * one honest, stable key — the same for every spelling of it, the same in the
 * builder and in the gate — its label stays his word, and a build that names
 * it in English is matched on his word or reported «not measured», never
 * «not built». Every noun below is absent from every list in the codebase.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { curatedNounKey, namedEntities } from '../core/design/named-entities';
import { englishFor, inferModel, keyForPhrase } from '../core/design/entity-inference';
import { englishSubject } from '../core/design/subject-translation';
import { collectServerEvidence, coverageError, coverageUnverified, judgeRequestCoverage, requestedRecords } from '../core/quality/request-coverage';

const UNLISTED = ['المستأجرين', 'العقود', 'الامتحانات', 'الإجازات'];
const RENTALS = 'أنشئ واجهة برمجية REST لمكتب عقارات فيها نقاط وصول لـالمستأجرين والعقود والمدفوعات، مع التحقق من المدخلات.';
const SCHOOL = 'أنشئ واجهة برمجية REST لمدرسة فيها نقاط وصول لـالطلاب والامتحانات والإجازات.';
const LEASES = 'أنشئ واجهة برمجية REST لمكتب عقارات فيها نقاط وصول لـعقود الإيجار والمستأجرين والمدفوعات.';

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });
function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-unlisted-'));
    roots.push(dir);
    for (const [rel, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), body);
    }
    return dir;
}
const judged = (request: string, files: Record<string, string>) => {
    const records = requestedRecords(request, { backendRequested: true });
    const report = judgeRequestCoverage({ records, evidence: collectServerEvidence([tree(files)], records.entities), backendRequested: true });
    return { records, report };
};
const server = (paths: string[]) => "const app = require('express')();\n"
    + paths.map(p => `app.get('${p}', (req, res) => res.json([]));\n`).join('');

describe('a noun no list knows', () => {
    it('is on no list in the codebase — the premise of every case below', () => {
        for (const word of UNLISTED) {
            expect([word, curatedNounKey(word), englishFor(word), englishSubject(word).translated]).toEqual([word, '', null, false]);
        }
    });

    it('gets one ascii key per word, whatever spelling he typed it in', () => {
        for (const word of UNLISTED) expect(keyForPhrase(word)).toMatch(/^[a-z][a-z0-9_]*s$/);
        expect(keyForPhrase('الإجازات')).toBe(keyForPhrase('الاجازات'));
        expect(keyForPhrase('الإجازة')).toBe(keyForPhrase('الاجازه'));
        expect(keyForPhrase('المستأجرين')).toBe(keyForPhrase('المستاجرين'));
    });

    it('keeps his word as its label — a transliteration is never presented as English', () => {
        const read = namedEntities(SCHOOL);
        expect(read.map(e => e.ar)).toEqual(['الطلاب', 'الامتحانات', 'الإجازات']);
        expect(read.find(e => e.ar === 'الإجازات')?.en).toBe('الإجازات');
        expect(read.find(e => e.ar === 'الطلاب')?.en).toBe('students');
    });

    it('is keyed alike by the builder\'s readers and by the delivery gate', () => {
        for (const request of [RENTALS, SCHOOL]) {
            const gate = requestedRecords(request, { backendRequested: true });
            expect(gate.unread).toEqual([]);
            const built = namedEntities(request).map(e => e.key).sort();
            expect(gate.entities.map(e => e.key).sort()).toEqual(built);
            expect(inferModel(request).entities.map(e => e.key).sort()).toEqual(built);
        }
    });
});

describe('and the gate measures it on what was built', () => {
    it('a server keyed the way Joe keys them serves every record', () => {
        const keys = namedEntities(RENTALS).map(e => e.key);
        const { report } = judged(RENTALS, { 'server.js': server(keys.map(k => `/api/${k}`)) });
        expect(report.checked).toBe(3);
        expect(report.missing).toEqual([]);
        expect(report.unverified).toEqual([]);
        expect(report.records.every(r => r.served === true)).toBe(true);
    });

    it('a server that names them in English beside his word is matched on his word', () => {
        const { report } = judged(RENTALS, {
            'server.js': server(['/api/tenants', '/api/contracts', '/api/payments']),
            'resources.js': "module.exports = [\n  { key: 'tenants', label: 'المستأجرين' },\n  { key: 'contracts', label: 'العقود' },\n];\n",
        });
        expect(report.missing).toEqual([]);
        expect(report.unverified).toEqual([]);
        expect(report.records.map(r => [r.ar, r.served])).toEqual([['المستأجرين', true], ['العقود', true], ['المدفوعات', true]]);
    });

    it('a server whose English no one wrote beside his word is «not measured», never «not served»', () => {
        const { report } = judged(RENTALS, { 'server.js': server(['/api/tenants', '/api/contracts', '/api/payments']) });
        expect(report.missing).toEqual([]);
        const byAr = new Map(report.records.map(r => [r.ar, r.served]));
        expect(byAr.get('المستأجرين')).toBeNull();
        expect(byAr.get('العقود')).toBeNull();
        expect(byAr.get('المدفوعات')).toBe(true);
        expect(coverageUnverified(report).join(' ')).toMatch(/المستأجرين \(serving not measured\)/);
    });

    it('…while a record the server really lacks is still «not served» — the gate is not weakened', () => {
        const keys = namedEntities(RENTALS).map(e => e.key);
        const { report } = judged(RENTALS, { 'server.js': server(keys.filter(k => k !== 'payments').map(k => `/api/${k}`)) });
        expect(report.missing.map(r => r.key)).toEqual(['payments']);
        expect(coverageError(report)).toMatch(/^requested_entities_not_delivered: payments — المدفوعات \(not served\)/);
    });
});

describe('a word it knew does not stand in for a phrase it did not', () => {
    it('«عقود الإيجار» is not keyed after the rent, so a server of leases is never «not served»', () => {
        const key = keyForPhrase('عقود الإيجار');
        expect(key).not.toBe('rents');
        expect(englishFor('عقود الإيجار')).toBeNull();
        const { records, report } = judged(LEASES, { 'server.js': server(['/api/leases', '/api/tenants', '/api/payments']) });
        expect(records.entities.map(e => e.key)).toContain(key);
        expect(report.missing).toEqual([]);
        expect(report.records.find(r => r.key === key)?.served).toBeNull();
    });

    it('a word that only holds the records is not the record: «جدول الرواتب» is payroll, «إدارة الحاويات» containers', () => {
        expect(keyForPhrase('جدول الرواتب')).toBe('payrolls');
        expect(keyForPhrase('إدارة الحاويات')).toBe('containers');
        // and every word of the record known, in English order
        expect(keyForPhrase('حاويات الشحن')).toBe('containers');
    });

    it('a clause is not the name of a record, so it is never spelled out as one', () => {
        expect(keyForPhrase('ثيم اخضر جميل للنظام')).toBe('');
        // …while a two-word name no list knows is still his table
        expect(keyForPhrase('عقود الإيجار')).toMatch(/^[a-z][a-z0-9_]*s$/);
    });
});
