import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectServerEvidence } from '../core/quality/request-coverage';

/**
 * Round 21 (writing fork's hand-back): the delivery gate's walk of the
 * delivered tree was synchronous, kept a skip list of its own, and stopped
 * without a word past 4 000 files or 8 levels. A server file after them was no
 * evidence — its routes unharvested, its records open to «not served» on a
 * server that served them — and every delivery check held the event loop of a
 * server other people were using. Now every source file is read, skipped by
 * kind only, and asynchronously.
 */
jest.setTimeout(180_000);

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

function project(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-whole-tree-'));
    roots.push(root);
    for (const [rel, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), body);
    }
    return root;
}
const ROUTE = (resource: string) => `const app = require('express')();\napp.get('/api/${resource}', (req, res) => res.json([]));\napp.listen(3000);\n`;
const routesOf = async (root: string) => (await collectServerEvidence([root], [])).routes.map(r => r.path);

describe('the delivery gate reads the whole delivered tree', () => {
    it('a server file after 4 000 source files is still evidence, and the event loop turns while it is read', async () => {
        const many: Record<string, string> = {};
        for (let i = 0; i < 4100; i++) many[`src/components/c${String(i).padStart(4, '0')}.js`] = `export const c${i} = ${i};\n`;
        // Deeper than the components, so it is met after all 4 100 of them whatever order the walk takes.
        const root = project({ ...many, 'zz-server/api/routes/server.js': ROUTE('bookings') });
        let ticks = 0;
        const timer = setInterval(() => { ticks++; }, 1);
        try {
            expect(await routesOf(root)).toContain('/api/bookings');
        } finally {
            clearInterval(timer);
        }
        expect(ticks).toBeGreaterThan(0);
    });

    it('a server file ten folders deep is still evidence', async () => {
        const root = project({ 'a/b/c/d/e/f/g/h/i/j/server.js': ROUTE('patients') });
        expect(await routesOf(root)).toEqual(['/api/patients']);
    });

    it('what is skipped is skipped by kind: machine state, build output, dot-folders', async () => {
        const root = project({
            'server.js': ROUTE('books'),
            '.joe-versions/3/server.js': ROUTE('old_books'),
            'node_modules/some-lib/server.js': ROUTE('lib_books'),
            '.npm-cache/x/server.js': ROUTE('cache_books'),
            'dist/server.js': ROUTE('built_books'),
            '.hidden/server.js': ROUTE('hidden_books'),
        });
        expect(await routesOf(root)).toEqual(['/api/books']);
    });
});
