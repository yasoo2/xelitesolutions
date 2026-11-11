/**
 * ⛔ «العلامات» ARE MARKS AS WELL AS GRADES.
 *
 * The hard exam, 2026-11-04, the re-run of H02: «… علامات وشهادات … واختبارات
 * آلية للخادم». The dictionary keys «العلامات» `grades`. The school called the
 * students' marks `marks` (/api/marks, tested) and its grade levels `grades`
 * (/api/grades, untested), and the record was refused as «grades — العلامات
 * (untested)». A record answers to the English names a build gives the same
 * word — never to a name another of his records owns.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectServerEvidence, identifiersFor, judgeRequestCoverage, requestedRecords } from '../core/quality/request-coverage';

const H02 = 'ابني نظام إدارة مدرسة متكامل: طلاب ومعلمون وصفوف، جدول حصص بلا تعارض، حضور يومي، علامات وشهادات قابلة للطباعة، بوابة لولي الأمر يرى أبناءه فقط، تقارير للإدارة، واختبارات آلية للخادم.';
const dirs: string[] = [];
afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

describe('«العلامات» served and tested as marks', () => {
    it('the record answers to marks', () => {
        const records = requestedRecords(H02, { backendRequested: true });
        const grades = records.entities.find(r => r.key === 'grades')!;
        expect(identifiersFor(grades, [], records.entities)).toEqual(expect.arrayContaining(['grades', 'marks']));
    });

    it('a school whose marks are /api/marks, tested there, is not refused for «grades (untested)»', async () => {
        const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-marks-'));
        dirs.push(dir);
        fs.mkdirSync(path.join(dir, 'server'));
        fs.mkdirSync(path.join(dir, 'test'));
        fs.writeFileSync(path.join(dir, 'server', 'app.js'), `const express = require('express');\nconst app = express();\napp.get('/api/grades', (req, res) => res.json(levels));\napp.get('/api/marks', (req, res) => res.json(marks));\napp.post('/api/marks', (req, res) => res.status(201).json(add(req.body)));\n`);
        fs.writeFileSync(path.join(dir, 'test', 'api.test.js'), `test('marks', async () => { const r = await call('POST', '/api/marks', { body: { score: 45 } }); expect(r.status).toBe(201); });\n`);
        const records = requestedRecords(H02, { backendRequested: true });
        const evidence = await collectServerEvidence([dir], records.entities);
        const report = judgeRequestCoverage({ records, evidence, backendRequested: true, testsRun: { root: dir, ran: true, passed: true } });
        const grades = report.records.find(r => r.key === 'grades')!;
        expect({ served: grades.served, tested: grades.tested }).toEqual({ served: true, tested: true });
    });

    it('«grades» and «marks» listed apart stay apart', () => {
        const records = requestedRecords('Build a school API with a database: students, grades, marks.', { backendRequested: true });
        const grades = records.entities.find(r => r.key === 'grades');
        if (grades) expect(identifiersFor(grades, [], records.entities)).not.toContain('marks');
    });
});
