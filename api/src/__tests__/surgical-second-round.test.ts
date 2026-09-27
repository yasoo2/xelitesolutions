/**
 * SURGICAL SECOND ROUND — a mis-quote is not the end of a repair.
 *
 * Measured failure (live harborlog/sproutbed runs): the model returned 7-11
 * SEARCH/REPLACE blocks for a multi-part repair, most quoted code that was
 * not in the files, every one was refused, and the run ended with zero to
 * one faults fixed — while the model even «fixed» the project's own test
 * suite once. The contract locked here:
 *
 *  1. Verification suites travel to the model as READ-ONLY context; blocks
 *     targeting them are refused (repair the product, not its checks),
 *     unless the request names the suite itself as the edit target.
 *  2. SEARCH-mismatch refusals trigger ONE grounded second round: the model
 *     sees its failed quotes beside the CURRENT file content, round 1's own
 *     edits as follow-up context, plus ranked files round 1 never sent it.
 *     Same block cap, same gates, no third call.
 *  3. A clean round 1 stays single-round — no extra model call.
 */
jest.mock('../core/llm/intelligent-router', () => {
    const actual = jest.requireActual('../core/llm/intelligent-router');
    return { ...actual, routeToModel: jest.fn() };
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import { routeToModel } from '../core/llm/intelligent-router';
import {
    ProjectEditTool,
    composeSecondRoundUserContent,
    isExplicitVerificationTarget,
    isVerificationFile,
    rankFilesForEdit,
} from '../modules/tools/definitions/ProjectEditTool';

const mockedRoute = routeToModel as unknown as jest.Mock;

const SERVER_JS = `const http = require('http');
// nursery policy value served by the greeting handler
const MAX = 45;
const server = http.createServer((req, res) => {
  res.end('greeting carries nursery policy value ' + MAX);
});
module.exports = { server, MAX };
`;

const TEST_JS = `const assert = require('node:assert');
// nursery policy: MAX must be 14 and the overdue section must be visible
const EXPECTED = 14;
`;

const INDEX_HTML = '<!doctype html><html><body><h1>Nursery beds</h1><p>visible overdue section heading goes here</p></body></html>\n';
const APP_JS = "// overdue refresh helper\nconst OVERDUE = 'overdue';\n";

function block(file: string, search: string, replace: string): string {
    return `FILE: ${file}\n<<<<<<< SEARCH\n${search}\n=======\n${replace}\n>>>>>>> REPLACE`;
}

describe('isVerificationFile — suites are recognised by convention, not by fixture names', () => {
    it.each([
        'test.js', 'tests.js', 'test_helper.js', 'server.test.js', 'server.spec.ts',
        '__tests__/app.js', '__test__/x.js', 'tests/e2e/login.js', 'spec/models/user.spec.ts',
        'e2e/checkout.js', 'check.js', 'checks/api.check.js', 'TEST.JS',
    ])('treats %s as verification', (f) => {
        expect(isVerificationFile(f)).toBe(true);
    });
    it.each([
        'server.js', 'content.js', 'src/App.jsx', 'latest.js', 'contest.js', 'attest.js',
        'protest/march.js', 'fastest.py', 'index.html', 'package.json', '',
    ])('treats %s as a product file', (f) => {
        expect(isVerificationFile(f)).toBe(false);
    });
});

describe('isExplicitVerificationTarget — running the checks is not editing them', () => {
    it('stays read-only when the suite is only run, not named', () => {
        expect(isExplicitVerificationTarget('prove it by running the project test suite', 'test.js')).toBe(false);
        expect(isExplicitVerificationTarget('fix server.js and run npm test', 'test.js')).toBe(false);
    });
    it('opens the suite when the request names its file', () => {
        expect(isExplicitVerificationTarget('update test.js to expect the new message', 'test.js')).toBe(true);
        expect(isExplicitVerificationTarget('UPDATE TEST.JS PLEASE', 'test.js')).toBe(true);
    });
});

describe('rankFilesForEdit — deeper ranking stays opt-in', () => {
    const files = [
        { f: 'a.js', body: 'alpha overdue zone' },
        { f: 'b.js', body: 'beta overdue' },
        { f: 'c.js', body: 'gamma zone' },
        { f: 'd.js', body: 'delta overdue zone' },
    ];
    it('defaults to two files, as before', () => {
        const { scored, evidence } = rankFilesForEdit('fix the overdue zone listing', files);
        expect(scored.length).toBe(2);
        expect(evidence).toBe(4);
    });
    it('returns more ranks when asked, best first', () => {
        const { scored, evidence } = rankFilesForEdit('fix the overdue zone listing', files, 6);
        expect(scored.length).toBe(4);
        expect(evidence).toBe(4);
        const scores = scored.map(s => s.score);
        expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    });
});

describe('composeSecondRoundUserContent — failed quotes beside current content', () => {
    it('carries the request, the failed quote, current, edited, uncovered and read-only files', () => {
        const out = composeSecondRoundUserContent({
            request: 'repair the overdue listing',
            refused: [{ file: 'server.js', search: 'const WRONG = 1;', replace: 'const WRONG = 2;' }],
            currentBodies: [{ f: 'server.js', body: 'const RIGHT = 1;\n' }],
            uncovered: [{ f: 'public/app.js', body: 'const APP = 1;\n' }],
            readOnly: [{ f: 'test.js', body: 'const T = 1;\n' }],
            edited: [{ f: 'public/index.html', body: '<h2>done</h2>\n' }],
        });
        expect(out).toContain('repair the overdue listing');
        expect(out).toContain('YOUR FAILED QUOTE for server.js');
        expect(out).toContain('const WRONG = 1;');
        expect(out).toContain('CURRENT CONTENT of FILE: server.js');
        expect(out).toContain('const RIGHT = 1;');
        expect(out).toContain('FILE: public/app.js');
        expect(out).toContain('FILE: test.js (READ-ONLY');
        expect(out).toContain('already edited in round 1');
        expect(out).toContain('<h2>done</h2>');
        expect(out).toContain('OUTPUT: corrected FILE/SEARCH/REPLACE blocks only');
        // The failed quote sits directly above the content it must be re-quoted from.
        expect(out.indexOf('const WRONG = 1;')).toBeLessThan(out.indexOf('CURRENT CONTENT of FILE: server.js'));
        expect(out.indexOf('CURRENT CONTENT of FILE: server.js')).toBeLessThan(out.indexOf('const RIGHT = 1;'));
    });
    it('truncates a wild failed quote instead of pasting it whole', () => {
        const out = composeSecondRoundUserContent({
            request: 'r',
            refused: [{ file: 'a.js', search: `${'x'.repeat(200)}\n`.repeat(40), replace: 'y' }],
            currentBodies: [],
            uncovered: [],
            readOnly: [],
            edited: [],
        });
        expect(out).toContain('…(truncated)');
        expect(out).toContain('no CURRENT CONTENT available');
        expect(out.length).toBeLessThan(3000);
    });
});

describe('the tool: a refused first round earns one grounded second round', () => {
    let tmp: string;
    const sessionId = 'surgical-round2-trip';
    const request = 'In server.js change MAX from 45 to 14 so the greeting carries the nursery policy value, and in public/index.html add a visible overdue section heading.';
    beforeEach(() => {
        mockedRoute.mockReset();
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-surgical-round2-'));
        fs.mkdirSync(path.join(tmp, 'public'), { recursive: true });
        fs.mkdirSync(path.join(tmp, '.engineering-checkpoints'), { recursive: true });
        fs.writeFileSync(path.join(tmp, '.engineering-checkpoints', 'noise.json'), '{"note":"nursery policy MAX greeting carries value visible overdue section heading server change"}');
        fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"round2"}');
        fs.writeFileSync(path.join(tmp, 'server.js'), SERVER_JS);
        fs.writeFileSync(path.join(tmp, 'test.js'), TEST_JS);
        fs.writeFileSync(path.join(tmp, 'public', 'index.html'), INDEX_HTML);
        fs.writeFileSync(path.join(tmp, 'public', 'app.js'), APP_JS);
    });
    afterEach(() => {
        delete (global as any).joeProjects?.[sessionId];
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('refuses the test edit, re-grounds the mis-quote, and covers the unshown file', async () => {
        mockedRoute
            .mockResolvedValueOnce([
                block('server.js', 'const MAXIMUM = 45;', 'const MAXIMUM = 14;'),
                block('test.js', 'const EXPECTED = 14;', 'const EXPECTED = 45;'),
                block('public/index.html', '<p>visible overdue section heading goes here</p>', '<p>visible overdue section heading goes here</p><h2>Overdue</h2>'),
            ].join('\n\n'))
            .mockResolvedValueOnce([
                block('server.js', 'const MAX = 45;', 'const MAX = 14;'),
                block('public/app.js', "const OVERDUE = 'overdue';", "const OVERDUE = 'overdue-checked';"),
            ].join('\n\n'));
        const res: any = await new ProjectEditTool().execute({ request, dir: tmp, skipAudit: true }, { sessionId });
        // Round 1 reached the model with the suite attached read-only.
        expect(mockedRoute).toHaveBeenCalledTimes(2);
        const roundOneUser = String(mockedRoute.mock.calls[0][0][1].content);
        expect(res.logs).toEqual(expect.arrayContaining([expect.stringContaining('model returned 3 edit block(s)')]));
        expect(roundOneUser).toContain('FILE: test.js (READ-ONLY');
        expect(roundOneUser).toContain('FILE: server.js');
        // Machine resume-state never reaches the model, however many words it shares.
        expect(roundOneUser).not.toContain('.engineering-checkpoints');
        // Quotes must be full: one live run died on `id: ...` abbreviations.
        expect(String(mockedRoute.mock.calls[0][0][0].content)).toContain('never abbreviate a line with ...');
        // The exact-quoted test edit is refused anyway: suites are not edit targets.
        expect(res.logs).toEqual(expect.arrayContaining([
            expect.stringContaining('test.js: verification suite is read-only — refused'),
            expect.stringContaining('server.js: SEARCH text not found — refused'),
        ]));
        expect(fs.readFileSync(path.join(tmp, 'test.js'), 'utf-8')).toBe(TEST_JS);
        // The index.html block applied in round 1; round 2 re-grounds the
        // mis-quote, carries the round-1 edit as context, and shows app.js.
        expect(res.logs).toEqual(expect.arrayContaining([
            expect.stringContaining('surgical second round: re-grounding 1 refused block(s) in 1 file(s) + 1 uncovered file(s) + 1 edited file(s)'),
            expect.stringContaining('second round returned 2 edit block(s)'),
        ]));
        const roundTwoUser = String(mockedRoute.mock.calls[1][0][1].content);
        expect(roundTwoUser).toContain('YOUR FAILED QUOTE for server.js');
        expect(roundTwoUser).toContain('const MAXIMUM = 45;');
        expect(roundTwoUser).toContain('CURRENT CONTENT of FILE: server.js');
        expect(roundTwoUser).toContain('const MAX = 45;');
        expect(roundTwoUser).toContain('FILE: public/app.js');
        expect(roundTwoUser).toContain('already edited in round 1');
        expect(roundTwoUser).toContain('<h2>Overdue</h2>');
        expect(roundTwoUser).toContain('FILE: test.js (READ-ONLY');
        // Every edit lands across the two rounds; the suite is still pristine.
        expect(fs.readFileSync(path.join(tmp, 'server.js'), 'utf-8')).toContain('const MAX = 14;');
        expect(fs.readFileSync(path.join(tmp, 'public', 'app.js'), 'utf-8')).toContain("const OVERDUE = 'overdue-checked';");
        expect(fs.readFileSync(path.join(tmp, 'public', 'index.html'), 'utf-8')).toContain('<h2>Overdue</h2>');
        expect(fs.readFileSync(path.join(tmp, 'test.js'), 'utf-8')).toBe(TEST_JS);
        expect(res.output.touched).toEqual(expect.arrayContaining(['server.js', 'public/app.js', 'public/index.html']));
        expect(res.output.touched).not.toContain('test.js');
    });

    it('a CANNOT TELL in round 2 ends the attempt with honest logs, never a third call', async () => {
        mockedRoute
            .mockResolvedValueOnce(block('server.js', 'const MAXIMUM = 45;', 'const MAXIMUM = 14;'))
            .mockResolvedValueOnce('CANNOT TELL: the current content does not show the target');
        const res: any = await new ProjectEditTool().execute({ request, dir: tmp, skipAudit: true }, { sessionId });
        expect(mockedRoute).toHaveBeenCalledTimes(2);
        expect(res.logs).toEqual(expect.arrayContaining([expect.stringContaining('surgical second round declined:')]));
        expect(fs.readFileSync(path.join(tmp, 'server.js'), 'utf-8')).toBe(SERVER_JS);
    });
});

describe('the tool: a clean first round stays single-round', () => {
    let tmp: string;
    const sessionId = 'surgical-round2-clean';
    beforeEach(() => {
        mockedRoute.mockReset();
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-surgical-clean-'));
        fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"clean"}');
        fs.writeFileSync(path.join(tmp, 'server.js'), SERVER_JS);
    });
    afterEach(() => {
        delete (global as any).joeProjects?.[sessionId];
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('applies without any second model call', async () => {
        mockedRoute.mockResolvedValueOnce(block('server.js', 'const MAX = 45;', 'const MAX = 14;'));
        const res: any = await new ProjectEditTool().execute(
            { request: 'In server.js change MAX from 45 to 14.', dir: tmp, skipAudit: true }, { sessionId });
        expect(mockedRoute).toHaveBeenCalledTimes(1);
        expect(res.logs.join('\n')).not.toContain('second round');
        expect(fs.readFileSync(path.join(tmp, 'server.js'), 'utf-8')).toContain('const MAX = 14;');
        expect(res.output.touched).toEqual(['server.js']);
    });
});
