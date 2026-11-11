/**
 *  AN EDIT IS A WRITE.
 *
 *  file_write and ai_write_file refuse a package.json that is not JSON, or one
 *  that lists what `npm install` cannot fetch (a-manifest-lists-only-what-npm-
 *  can-install). file_edit wrote whatever the replacement produced: a one-line
 *  edit adding "node:sqlite" to dependencies landed the exact manifest the
 *  write path refuses, and the install died on it later. It also handed his
 *  replacement text to String.replace as a pattern, so `$'` or `$&` in it
 *  (`price + '$'`) expanded into other parts of the file.
 */
import fs from 'fs';
import path from 'path';
import { FileEditTool } from '../modules/tools/definitions/SystemTools';
import { prepareArtifactContent } from '../modules/tools/artifact-validation';
import { resolveToolPath } from '../modules/tools/utils';

const DIR = 'joe-edit-write-contract';
const at = (name: string) => resolveToolPath(path.join(DIR, name));
const write = (name: string, body: string) => { const p = at(name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, 'utf-8'); return p; };
afterAll(() => { try { fs.rmSync(resolveToolPath(DIR), { recursive: true, force: true }); } catch { /* never written */ } });

const MANIFEST = JSON.stringify({ name: 'clinic', version: '1.0.0', dependencies: { express: '^4.18.2' } }, null, 2);

describe('file_edit keeps the destination contract file_write keeps', () => {
    it('refuses an edit that adds a Node built-in to the dependencies, and leaves the file as it was', async () => {
        const p = write('a/package.json', MANIFEST);
        const res: any = await new FileEditTool().execute({ filename: p, find: '"express": "^4.18.2"', replace: '"express": "^4.18.2",\n    "node:sqlite": "^1.0.0"' });
        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/^manifest_dependency_uninstallable: .*node:sqlite is a Node built-in/);
        expect(res.error).toContain('unchanged');
        expect(fs.readFileSync(p, 'utf-8')).toBe(MANIFEST);
    });

    it('refuses an edit that leaves package.json unparseable', async () => {
        const p = write('b/package.json', MANIFEST);
        const res: any = await new FileEditTool().execute({ filename: p, find: '"version": "1.0.0",', replace: '"version": "1.0.0"' });
        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/is not valid JSON/);
        expect(fs.readFileSync(p, 'utf-8')).toBe(MANIFEST);
    });

    it('still lets edits repair a manifest that was already broken, one defect at a time', async () => {
        // Two defects: a missing comma and a trailing one. The first edit
        // fixes one and leaves the file still unparseable; that is progress,
        // not a violation the edit introduced.
        const broken = MANIFEST.replace('"version": "1.0.0",', '"version": "1.0.0"').replace('"^4.18.2"', '"^4.18.2",');
        const p = write('c/package.json', broken);
        const first: any = await new FileEditTool().execute({ filename: p, find: '"version": "1.0.0"', replace: '"version": "1.0.1",' });
        expect(first.ok).toBe(true);
        expect(() => JSON.parse(fs.readFileSync(p, 'utf-8'))).toThrow();
        const second: any = await new FileEditTool().execute({ filename: p, find: '"^4.18.2",', replace: '"^4.18.2"' });
        expect(second.ok).toBe(true);
        expect(JSON.parse(fs.readFileSync(p, 'utf-8')).version).toBe('1.0.1');
    });

    it('accepts an ordinary manifest edit', async () => {
        const p = write('d/package.json', MANIFEST);
        const res: any = await new FileEditTool().execute({ filename: p, find: '"express": "^4.18.2"', replace: '"express": "^4.18.2",\n    "better-sqlite3": "^11.0.0"' });
        expect(res.ok).toBe(true);
        expect(JSON.parse(fs.readFileSync(p, 'utf-8')).dependencies['better-sqlite3']).toBe('^11.0.0');
    });

    it('lets a README gain a code block: in a document a fence is content', async () => {
        const readme = '# Clinic\n\n## Run\n\n```bash\nnpm start\n```\n';
        expect(prepareArtifactContent('clinic/README.md', readme)).toEqual({ content: readme.trim() });
        const p = write('f/README.md', '# Clinic\n\n## Run\n');
        const res: any = await new FileEditTool().execute({ filename: p, find: '## Run\n', replace: '## Run\n\n```bash\nnpm start\n```\n' });
        expect(res.ok).toBe(true);
        expect(fs.readFileSync(p, 'utf-8')).toContain('```bash\nnpm start\n```');
        // A source file is still held to it: a fence there is the chat wrapper.
        expect(prepareArtifactContent('clinic/server.js', "```js\nconst x = 1;\n").error).toMatch(/incomplete Markdown fence/);
    });

    it('writes his replacement literally, `$&`, `$\'` and `$$` included', async () => {
        const p = write('e/price.js', "const label = 'price';\nmodule.exports = label;\n");
        const replace = "const label = 'price ' + '$' + \"$&\" + '$$';";
        const res: any = await new FileEditTool().execute({ filename: p, find: "const label = 'price';", replace });
        expect(res.ok).toBe(true);
        expect(fs.readFileSync(p, 'utf-8')).toBe(`${replace}\nmodule.exports = label;\n`);
    });
});
