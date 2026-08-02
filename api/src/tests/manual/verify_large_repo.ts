/**
 * LIVE PROOF — a huge repo does not freeze Joe on a weak machine.
 *
 * Builds a synthetic project with a directory of 3000 files and a deep tree,
 * then exercises the real route handlers' bounds:
 *   - the tree endpoint caps one directory's fan-out (no 3000-node render);
 *   - search opens at most a bounded number of files even for a rare query;
 *   - connect clones SHALLOW (asserted from source — no network here).
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_large_repo.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.MOCK_DB = process.env.MOCK_DB || 'true';
process.env.PERSISTENCE_MODE = process.env.PERSISTENCE_MODE || 'JSON';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

async function main() {
    const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), `big-${Date.now()}-`));
    process.env.EXTERNAL_PROJECTS_DIR = projectsDir;

    const { workspaceService } = await import('../../modules/services/WorkspaceService');
    const root = workspaceService.getActiveRoot(); // my-workspace default

    // A directory with 3000 files (the fan-out that froze the panel).
    const bigDir = path.join(root, 'assets');
    fs.mkdirSync(bigDir, { recursive: true });
    for (let i = 0; i < 3000; i++) fs.writeFileSync(path.join(bigDir, `file_${i}.txt`), `content ${i}\n`);
    // A deep tree of many small files for the search budget test.
    for (let d = 0; d < 60; d++) {
        const sub = path.join(root, 'src', `mod${d}`);
        fs.mkdirSync(sub, { recursive: true });
        for (let f = 0; f < 100; f++) fs.writeFileSync(path.join(sub, `f${f}.js`), `export const v${f} = ${f};\n`);
    }

    // Hit the REAL route handlers via a tiny express app with a REAL signed JWT.
    const express = (await import('express')).default;
    const projectRouter = (await import('../../api/routes/project')).default;
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ sub: 'proof-user', role: 'admin' }, process.env.JWT_SECRET || 'x');
    const app = express();
    app.use('/project', projectRouter);
    const server = app.listen(0);
    const port = (server.address() as any).port;

    const http = await import('http');
    const getJson = (p: string): Promise<any> => new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}${p}`, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
            let b = ''; res.on('data', (c) => b += c); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
        }).on('error', reject);
    });

    // 1) Tree of the huge directory is capped.
    const t0 = Date.now();
    const treeRes = await getJson(`/project/tree?path=${encodeURIComponent(bigDir)}`);
    const treeMs = Date.now() - t0;
    const capped = Array.isArray(treeRes.tree) && treeRes.tree.length <= 800 && treeRes.truncated === true && treeRes.hiddenCount > 0;

    // 2) A RARE query does not walk the whole repo — bounded file budget.
    const s0 = Date.now();
    const searchRes = await getJson(`/project/search?q=${encodeURIComponent('zzz_never_matches_anything_qwerty')}`);
    const searchMs = Date.now() - s0;
    // 6000+ files exist; the budget is 4000. A bounded scan returns fast and
    // flags partial. (Results empty because the query matches nothing.)
    const searchBounded = Array.isArray(searchRes.results) && searchRes.results.length === 0 && searchRes.partial === true;

    server.close();

    // 3) Connect clones shallow (asserted from source).
    const ghSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'routes', 'github.ts'), 'utf-8');
    const shallow = /'--depth', '1', '--single-branch'/.test(ghSrc);

    const checks: Array<[string, boolean]> = [
        [`tree of a 3000-file dir is capped to <=800 with a hidden count (took ${treeMs}ms)`, capped],
        ['the capped tree responded fast (<1500ms)', treeMs < 1500],
        [`a rare search is bounded by a file budget and flagged partial (took ${searchMs}ms)`, searchBounded],
        ['the bounded search returned fast (<4000ms), not a full-repo walk', searchMs < 4000],
        ['connecting a repo clones SHALLOW (--depth 1 --single-branch)', shallow],
    ];

    let failed = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; }
    try { fs.rmSync(projectsDir, { recursive: true, force: true }); } catch { /* cleanup */ }
    console.log(failed === 0
        ? '\nPROOF COMPLETE: huge trees and rare searches stay bounded; huge repos clone light.'
        : `\n${failed} CHECK(S) FAILED — tree=${JSON.stringify(treeRes).slice(0, 200)} search=${JSON.stringify(searchRes).slice(0, 200)}`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
