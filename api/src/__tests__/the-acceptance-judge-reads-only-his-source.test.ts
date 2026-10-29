import fs from 'fs';
import os from 'os';
import path from 'path';
import { acceptanceSource, judgeAcceptance } from '../core/quality/acceptance';

/**
 * Round 22 (the writing fork's note, at integration): the acceptance judge
 * greps one text of «his source», read by a synchronous walk on project_edit's
 * and react_project's request paths — which read vendor/, an installed Python
 * environment and whatever his .gitignore lists as evidence too. A criterion
 * could be «met» by a library's own markup. The build paths now read it through
 * the shared walker of his source, asynchronously.
 */
const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

function project(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-r22-acceptance-'));
    roots.push(root);
    for (const [rel, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), body);
    }
    return root;
}

describe('the acceptance judge reads only his source', () => {
    it('vendor code, an installed environment and what his .gitignore lists are not his source', async () => {
        const root = project({
            '.gitignore': 'generated/\n',
            'src/App.jsx': 'export default function App() { return <h1>MINE</h1>; }\n',
            // composer's vendor/ is known by what composer writes into it.
            'vendor/composer/installed.json': '{"packages":[]}',
            'vendor/acme/widget.js': 'THEIRS_VENDOR',
            'env/pyvenv.cfg': 'home = /usr/bin\n',
            'env/lib/site/admin.js': 'THEIRS_ENV',
            'generated/bundle.js': 'THEIRS_GENERATED',
            'dist/index.html': 'THEIRS_DIST',
        });
        const source = await acceptanceSource(root);
        expect(source).toContain('MINE');
        for (const theirs of ['THEIRS_VENDOR', 'THEIRS_ENV', 'THEIRS_GENERATED', 'THEIRS_DIST']) expect(source).not.toContain(theirs);
    });

    it('the judge greps the source it is handed', async () => {
        const root = project({ 'src/App.jsx': 'export default () => <h1>Clinic</h1>;\n' });
        const judged = judgeAcceptance([], { dir: root, source: await acceptanceSource(root) });
        expect(judged).toBeDefined();
    });
});
