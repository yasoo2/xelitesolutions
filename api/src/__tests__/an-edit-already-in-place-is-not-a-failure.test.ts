/**
 *  AN EDIT THAT IS ALREADY IN PLACE IS NOT A FAILED EDIT.
 *
 *  P001 (eval 2026-10-26, run-1793008690163): the self-fix reran phase 3 and
 *  its styles.css edit — which had succeeded minutes before — ran again:
 *  «Text to replace not found … Looked for: @media (max-width: 768px) {».
 *  The file held the replacement word for word; the phase failed on its own
 *  success. An edit whose replacement contains its search text did worse on a
 *  rerun: it landed twice, silently. Every literal editor asks the same
 *  question first (shared/utils/edit-in-place.ts).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { editAlreadyApplied } from '../shared/utils/edit-in-place';
import { FileEditTool } from '../modules/tools/definitions/SystemTools';
import { AdvancedFileEditTool } from '../modules/tools/definitions/UtilityTools';
import { validateAutonomousFileOperation } from '../modules/services/AutonomousFilePolicy';
import { resolveToolPath } from '../modules/tools/utils';

// The P001 edit, as the plan wrote it.
const FIND = '@media (max-width: 768px) {\n  .nav-links { display: none; }\n  .mobile-menu-btn { display: block; }';
const REPLACE = '@media (max-width: 768px) {\n  .nav-links { display: none; position: absolute; top: 60px; }\n  .mobile-menu-btn { display: block; font-size: 1.5rem; }\n}';
const CSS = `body { margin: 0; }\n${FIND}\n}\n`;
// An append: the replacement contains the text it replaces.
const LIST = '<ul>\n  <li>Home</li>\n</ul>\n';
const APPEND_FIND = '</ul>';
const APPEND_REPLACE = '  <li>Services</li>\n</ul>';

const NAMES = ['joe-edit-in-place.css', 'joe-edit-in-place.html'];
const at = (name: string) => resolveToolPath(name);
const write = (name: string, body: string) => { const p = at(name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, 'utf-8'); return p; };
const clean = () => { for (const n of NAMES) { try { fs.unlinkSync(at(n)); } catch { /* never written */ } } };
beforeEach(clean);
afterAll(clean);

describe('an edit that is already in place', () => {
    it('file_edit run twice (the self-fix rerun) succeeds both times and changes the file once', async () => {
        const p = write('joe-edit-in-place.css', CSS);
        const first: any = await new FileEditTool().execute({ filename: p, find: FIND, replace: REPLACE });
        expect(first.ok).toBe(true);
        const once = fs.readFileSync(p, 'utf-8');
        const second: any = await new FileEditTool().execute({ filename: p, find: FIND, replace: REPLACE });
        expect(second.ok).toBe(true);
        expect(second.output.alreadyApplied).toBe(true);
        expect(fs.readFileSync(p, 'utf-8')).toBe(once);
    });

    it('an append rerun does not land a second copy', async () => {
        const p = write('joe-edit-in-place.html', LIST);
        await new FileEditTool().execute({ filename: p, find: APPEND_FIND, replace: APPEND_REPLACE });
        await new FileEditTool().execute({ filename: p, find: APPEND_FIND, replace: APPEND_REPLACE });
        expect(fs.readFileSync(p, 'utf-8').match(/Services/g)).toHaveLength(1);
    });

    it('the same holds in a CRLF file with an LF edit', async () => {
        const p = write('joe-edit-in-place.css', CSS.replace(/\n/g, '\r\n'));
        await new FileEditTool().execute({ filename: p, find: FIND, replace: REPLACE });
        const second: any = await new FileEditTool().execute({ filename: p, find: FIND, replace: REPLACE });
        expect(second.ok).toBe(true);
        expect(fs.readFileSync(p, 'utf-8')).toBe(`body { margin: 0; }\n${REPLACE}\n}\n`.replace(/\n/g, '\r\n'));
    });

    it('a stale find is still a failure when the file does not hold the replacement', async () => {
        const p = write('joe-edit-in-place.css', 'body { margin: 0; }\n');
        const res: any = await new FileEditTool().execute({ filename: p, find: FIND, replace: REPLACE });
        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/Text to replace not found/);
    });

    it('the advanced editor and the autonomous gateway answer the same way', async () => {
        const p = write('joe-edit-in-place.html', LIST);
        for (let i = 0; i < 2; i++) {
            const res: any = await new AdvancedFileEditTool().execute({ filePath: p, edits: [{ find: APPEND_FIND, replace: APPEND_REPLACE }] });
            expect(res.ok).toBe(true);
        }
        expect(fs.readFileSync(p, 'utf-8').match(/Services/g)).toHaveLength(1);

        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-edit-in-place-'));
        try {
            const target = path.join(root, 'styles.css');
            const applied = `body { margin: 0; }\n${REPLACE}\n}\n`;
            fs.writeFileSync(target, applied);
            const prepared = validateAutonomousFileOperation('file_edit', { path: target, find: FIND, replace: REPLACE }, root, os.homedir());
            expect(prepared.autonomousEditAfter).toBe(applied);
            fs.writeFileSync(target, LIST.replace(APPEND_FIND, APPEND_REPLACE));
            const appended = validateAutonomousFileOperation('file_edit', { path: target, find: APPEND_FIND, replace: APPEND_REPLACE }, root, os.homedir());
            expect(appended.autonomousEditAfter).toBe(appended.autonomousEditBefore);
        } finally { fs.rmSync(root, { recursive: true, force: true }); }
    });

    it('claims nothing it cannot prove: deletions, tokens, a replacement found twice', () => {
        expect(editAlreadyApplied('a\nb\n', 'c', '')).toBe(false);
        expect(editAlreadyApplied('x { }\n}\n', 'color: red;', '}')).toBe(false);
        // a short line that happens to be there once is not this edit's mark
        expect(editAlreadyApplied('a = 1;\nb = 2;\n', 'c = 3;', 'b = 2;')).toBe(false);
        expect(editAlreadyApplied(`${REPLACE}\n${REPLACE}\n`, FIND, REPLACE)).toBe(false);
        // the sought text is still there outside any copy of the replacement: apply it
        expect(editAlreadyApplied(LIST, APPEND_FIND, APPEND_REPLACE)).toBe(false);
        expect(editAlreadyApplied(CSS, FIND, REPLACE)).toBe(false);
    });
});
