/**
 *  THE JUDGE READS THE README IT IS ASKED ABOUT.
 *
 *  C12 of the Codex exam, 2026-11-06: «rename timeout to timeout_seconds in the
 *  whole project: the code, the tests and the README». The model did all of
 *  it; every hidden test passed. Joe's acceptance judge was shown the code
 *  only and ruled «R1 unprovable: README.md itself is not shown», and Joe
 *  refused his own correct delivery for 22 minutes.
 *
 *  The judge now reads the project's documentation and configuration as well
 *  as its code — small files only, and never a lockfile.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { judgeSource } from '../core/engine/verify';

let root = '';
beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-judge-readme-'));
    const w = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
    w('uploader/config.py', 'TIMEOUT_SECONDS = 30\n');
    w('README.md', '# uploader\n\n| `timeout_seconds` | seconds to wait | 30 |\n');
    w('uploader.example.json', '{ "url": "https://a.example", "timeout_seconds": 10 }\n');
    w('pyproject.toml', '[project]\nname = "uploader"\nversion = "1.1.0"\n');
    w('package-lock.json', '{ "lockfileVersion": 3, "packages": {} }\n');
    w('data/archive.json', JSON.stringify({ rows: Array.from({ length: 4000 }, (_, i) => ({ id: i, note: 'timeout_seconds' })) }));
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

test('the README, a config example and pyproject are shown with the code', async () => {
    const { text } = await judgeSource(root);
    expect(text).toContain('uploader/config.py');
    expect(text).toMatch(/README\.md ====\n# uploader/u);
    expect(text).toContain('`timeout_seconds` | seconds to wait');
    expect(text).toContain('uploader.example.json');
    expect(text).toContain('pyproject.toml');
});

test('never a lockfile, and never a big data file', async () => {
    const { text, leftOut } = await judgeSource(root);
    expect(text).not.toContain('package-lock.json');
    expect(text).not.toContain('data/archive.json');
    expect(leftOut).toEqual([]);
});

/* ───────────── a README proves a README, not a feature ───────────── */

import { judgeSourceOf, verifyNamed } from '../core/quality/named-requirements';

const SOURCE = judgeSourceOf([
    { path: 'uploader/config.py', text: 'def load_config(data):\n    seconds = data.get("timeout_seconds", data.get("timeout", 30))\n    return Config(timeout_seconds=float(seconds))\n' },
    { path: 'README.md', text: '# uploader\n\n| `timeout_seconds` | seconds to wait for the archive to answer | 30 |\n\nUploads are retried with exponential backoff and resumed after a dropped connection.\n' },
]);

/** A judge that answers «met» for every requirement, with the line it is given. */
const judgeQuoting = (lines: Record<string, string>) => async (prompt: string) => {
    const ids = Array.from(prompt.matchAll(/\[(R\d+)\]/gu)).map(m => m[1]);
    return JSON.stringify({ verdicts: ids.map(id => ({ id, verdict: 'met', evidence: lines[id], why: 'shown' })) });
};

test('a README line proves the README requirement, and never a feature only the README claims', async () => {
    const reqs = [
        { id: 'R1', text: 'the README documents timeout_seconds', quote: 'README' },
        { id: 'R2', text: 'uploads resume after a dropped connection', quote: 'resume after a dropped connection' },
        { id: 'R3', text: 'the setting is read as timeout_seconds', quote: 'timeout_seconds' },
    ] as any;
    const verdicts = await verifyNamed(reqs, SOURCE, false, judgeQuoting({
        R1: '| `timeout_seconds` | seconds to wait for the archive to answer | 30 |',
        R2: 'Uploads are retried with exponential backoff and resumed after a dropped connection.',
        R3: 'seconds = data.get("timeout_seconds", data.get("timeout", 30))',
    }));
    const by = Object.fromEntries(verdicts.map(v => [v.id, v.verdict]));
    expect(by).toEqual({ R1: 'met', R2: 'unprovable', R3: 'met' });
    expect(verdicts.find(v => v.id === 'R2')?.why).toMatch(/documentation/u);
});
