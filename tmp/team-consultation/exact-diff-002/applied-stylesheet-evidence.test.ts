import fs from 'fs';
import os from 'os';
import path from 'path';
import { readAppliedProjectStylesheets } from '../core/quality/presentation-context';

describe('applied stylesheet provenance', () => {
    const roots: string[] = [];
    const project = (files: Record<string, string>) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-style-evidence-'));
        roots.push(root);
        for (const [relative, source] of Object.entries(files)) {
            const target = path.join(root, relative);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, source);
        }
        return root;
    };
    afterAll(() => {
        for (const root of roots) {
            // Only remove newly created, identified test fixtures.
            if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('joe-style-evidence-')) throw new Error('unexpected fixture root');
            fs.rmSync(root, { recursive: true });
        }
    });
    it('follows actual module imports, CSS imports and deduplicates cycles', () => {
        const root = project({
            'index.html': '<script src="/src/main.jsx" type="module"></script>',
            'src/main.jsx': 'import App from "./App"; import "./base.css";',
            'src/App.jsx': 'import "./view.css"; export default function App(){return <button>1</button>}',
            'src/base.css': '.shell{padding:12px}',
            'src/view.css': '@import "base.css";.key{min-height:44px}',
            'src/orphan.css': '.not-loaded{color:red}',
        });
        const styles = readAppliedProjectStylesheets(root);
        expect(styles).toHaveLength(2);
        expect(styles.join('')).toContain('.key{min-height:44px}');
        expect(styles.join('')).not.toContain('not-loaded');
    });
    it('never credits JavaScript strings, comments, type-only imports or unrelated entry files', () => {
        const root = project({
            'index.html': '<!-- <script type="module" src="/src/unused.jsx"></script> --><script type="module" src="/src/main.tsx"></script>',
            'src/main.tsx': 'import type { Style } from "./unused"; import { type Other } from "./unused"; export { type Again } from "./unused"; const unusedCss=".key{min-height:44px}"; // import "./bad.css";',
            'src/unused.ts': 'import "./bad.css";',
            'src/unused.jsx': 'import "./bad.css";',
            'src/bad.css': '.key{min-height:44px}',
        });
        expect(readAppliedProjectStylesheets(root)).toEqual([]);
    });
    it('rejects lexical escape and junction escape from the project root', () => {
        const outside = project({ 'outside.css': '.outside-secret{color:red}' });
        const root = project({
            'index.html': '<script type="module" src="/src/main.jsx"></script>',
            'src/main.jsx': `import "../../${path.basename(outside)}/outside.css"; import "./linked/outside.css";`,
        });
        fs.symlinkSync(outside, path.join(root, 'src/linked'), process.platform === 'win32' ? 'junction' : 'dir');
        expect(readAppliedProjectStylesheets(root)).toEqual([]);
    });
    it('fails closed on an oversized imported source instead of issuing partial provenance', () => {
        const root = project({
            'index.html': '<script type="module" src="/src/main.jsx"></script>',
            'src/main.jsx': 'import "./small.css"; import "./large.css";',
            'src/small.css': '.key{padding:12px}',
            'src/large.css': ' '.repeat(200001),
        });
        expect(readAppliedProjectStylesheets(root)).toEqual([]);
    });
});
