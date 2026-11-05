/**
 * ⛔ A REQUIREMENT FOR TESTS IS JUDGED ON THE RUN OF THEM, NOT ON A CUT SOURCE.
 *
 * The hard exam, 2026-11-05, H13: Joe ran the API's own tests, they passed, a
 * test exercised every record the request named — and the delivery was refused
 * because the acceptance judge, shown a slice of the source, could not tell
 * whether «a full test suite» was full (core/quality/test-suite-requirement.ts).
 *
 * Measured here through Joe's own delivery path: the engine's verifier with a
 * judge that answers what H13's judge answered, and a project whose tests run
 * for real under `node --test`.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { judgeTestSuiteByRun } from '../core/quality/test-suite-requirement';

const H13 = 'Build a project management REST API only, with Node, Express and SQLite: organizations, projects, tasks and comments; JWT authentication with refresh tokens; role-based permissions per organization; pagination, filtering and sorting; OpenAPI documentation; and a full test suite.';

const record = (key: string, tested: boolean | null) => ({ key, ar: key, en: key, item: key, served: true, tested, present: null, evidence: [] });
const ran = (passed: boolean, error = '') => ({ root: '/p', ran: true, passed, runner: 'npm test', ...(error ? { error } : {}) });
const FOUR = ['organizations', 'projects', 'tasks', 'comments'];

describe('H13: «a full test suite» is judged on Joe\'s run of the suite', () => {
    it('met: the tests ran, every one passed, and a test exercises every record he named', () => {
        const v = judgeTestSuiteByRun({ text: 'Has a full test suite' }, { records: FOUR.map(k => record(k, true)), testsRun: ran(true) });
        expect(v?.verdict).toBe('met');
        expect(v?.why).toMatch(/ran the project's own tests \(npm test\) and every one passed/u);
        expect(v?.why).toMatch(/organizations, projects, tasks, comments/u);
    });

    it('unmet: the tests ran and failed — with the runner\'s own words', () => {
        const v = judgeTestSuiteByRun({ text: 'Has a full test suite' }, { records: FOUR.map(k => record(k, true)), testsRun: ran(false, '1 failing: GET /api/tasks') });
        expect(v).toEqual({ verdict: 'unmet', why: expect.stringMatching(/did not pass: 1 failing: GET \/api\/tasks/u) });
    });

    it('unmet: a record no test exercises is named', () => {
        const v = judgeTestSuiteByRun({ text: 'Has a full test suite' }, { records: [record('organizations', true), record('comments', false)], testsRun: ran(true) });
        expect(v).toEqual({ verdict: 'unmet', why: expect.stringMatching(/no test exercises the route of: comments$/u) });
    });

    it('left to the judge when the run measured nothing to judge «full» by', () => {
        expect(judgeTestSuiteByRun({ text: 'Has a full test suite' }, undefined)).toBeNull();
        expect(judgeTestSuiteByRun({ text: 'Has a full test suite' }, { records: [], testsRun: ran(true) })).toBeNull();
        expect(judgeTestSuiteByRun({ text: 'Has a full test suite' }, { records: FOUR.map(k => record(k, true)), testsRun: { root: '/p', ran: false, passed: false, noRunner: true } })).toBeNull();
    });

    it('only a requirement for the project\'s own tests — never an exam app\'s «tests»', () => {
        const run = { records: FOUR.map(k => record(k, true)), testsRun: ran(true) };
        expect(judgeTestSuiteByRun({ text: 'Students take tests and see their marks' }, run)).toBeNull();
        expect(judgeTestSuiteByRun({ text: 'Role-based permissions per organization' }, run)).toBeNull();
        expect(judgeTestSuiteByRun({ text: 'Automated API tests' }, run)?.verdict).toBe('met');
        expect(judgeTestSuiteByRun({ text: 'اختبارات آلية للواجهة البرمجية' }, run)?.verdict).toBe('met');
    });
});

describe('through the engine\'s verifier', () => {
    const roots: string[] = [];
    afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

    it('the request names the suite; the judge could not see it; the run decides', async () => {
        const { judgeRequirements } = require('../core/engine/verify');
        const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-suite-'));
        roots.push(dir);
        fs.writeFileSync(path.join(dir, 'server.js'), `const express = require('express');\nconst app = express();\napp.get('/api/organizations', (req, res) => res.json([]));\n`);
        const asked: string[] = [];
        //  H13's judge: «not provable», the source is cut.
        const ask = async (prompt: string) => {
            asked.push(prompt);
            const ids = Array.from(prompt.matchAll(/\b(R\d+)\b/gu)).map(m => m[1]);
            return JSON.stringify(Array.from(new Set(ids)).map(id => ({ id, verdict: 'unprovable', why: 'the source is visibly cut' })));
        };
        const ctx: any = {
            state: { plan: { requirements: [
                { id: 'R1', key: 'R1', text: 'Has organizations, projects, tasks and comments', quote: 'organizations, projects, tasks and comments', fromRequest: true },
                { id: 'R2', key: 'R2', text: 'Has a full test suite', quote: 'a full test suite', fromRequest: true },
            ] } },
        };
        const coverage = { records: FOUR.map(k => record(k, true)), testsRun: ran(true) };
        const judged = await judgeRequirements(ctx, H13, false, dir, ask, () => undefined, { built: false, liveUrl: '', tests: coverage });
        const byId = Object.fromEntries(judged.summary.requirements.map((r: any) => [r.id, r]));
        expect(byId.R2).toMatchObject({ verdict: 'met', judgedBy: 'tests' });
        expect(byId.R1.verdict).not.toBe('met');
        //  The suite was not handed to the judge at all.
        expect(asked.join('\n')).not.toMatch(/full test suite/u);
    });
});
