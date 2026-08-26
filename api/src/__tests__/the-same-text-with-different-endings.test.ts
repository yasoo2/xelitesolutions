/**
 *  THE SAME TEXT WITH DIFFERENT LINE ENDINGS IS STILL THE SAME TEXT.
 *
 *  Live round on his machine. He asked for two things in one sentence — a
 *  salary table and a second page showing the total — and the build stopped:
 *
 *      Thought and executed · 65 steps · 40s
 *      Failed phase: Build total salary page
 *      Error: Text to replace not found
 *      Self-fix tool failed: could not match 1 replacement(s).
 *
 *  Then the files Joe had just written, counted:
 *
 *      src/App.jsx            CRLF 53 / 53 lines
 *      src/data/employees.js  CRLF 13 / 13 lines
 *      src/main.jsx           CRLF  1 /  1 lines
 *
 *  Every generated file is CRLF; a model writing a `find` block writes LF.
 *  So the literal match was false for EVERY multi-line edit on this machine —
 *  not sometimes, always — and the repair that followed was just as blind.
 */
import fs from 'fs';
import path from 'path';
import { FileEditTool } from '../modules/tools/definitions/SystemTools';
import { resolveToolPath } from '../modules/tools/utils';

//  The tool sandboxes every path it is given, so a probe file has to live
//  where the tool would put it. Asking the tool itself where that is beats
//  guessing, and it is deleted in the same run that reads it.
const NAMES = ['joe-endings-crlf.jsx', 'joe-endings-lf.js'];
const at = (name: string) => resolveToolPath(name);
const write = (name: string, body: string) => { const p = at(name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, 'utf-8'); return p; };
const clean = () => { for (const n of NAMES) { try { fs.unlinkSync(at(n)); } catch { /* never written */ } } };

beforeEach(clean);
afterAll(clean);

const CRLF = ['export default function App() {', '  return <div>hello</div>;', '}'].join('\r\n');
const LF_FIND = ['export default function App() {', '  return <div>hello</div>;'].join('\n');
const tool = () => new FileEditTool();
describe('file_edit matches across line endings', () => {
    it('an LF find matches a CRLF file', async () => {
        const p = write('joe-endings-crlf.jsx', CRLF);
        const res = await tool().execute({ filename: p, find: LF_FIND, replace: LF_FIND + '\n  // added' });
        expect(res.ok).toBe(true);
        expect(fs.readFileSync(p, 'utf-8')).toContain('// added');
    });

    it('…and the file keeps its own endings afterwards', async () => {
        //  A file left with two kinds of ending breaks the NEXT literal edit,
        //  which is how one failure becomes a run of them.
        const p = write('joe-endings-crlf.jsx', CRLF);
        await tool().execute({ filename: p, find: LF_FIND, replace: LF_FIND + '\n  // added' });
        const after = fs.readFileSync(p, 'utf-8');
        expect((after.match(/(?<!\r)\n/g) || []).length).toBe(0);
        expect((after.match(/\r\n/g) || []).length).toBeGreaterThan(0);
    });

    it('a CRLF find still matches an LF file', async () => {
        const p = write('joe-endings-lf.js', 'const a = 1;\nconst b = 2;\n');
        const res = await tool().execute({ filename: p, find: 'const a = 1;\r\nconst b = 2;', replace: 'const a = 9;\r\nconst b = 2;' });
        expect(res.ok).toBe(true);
        expect(fs.readFileSync(p, 'utf-8')).toContain('const a = 9;');
    });

    it('text that really is absent is still refused', async () => {
        //  The negative. Tolerating line endings must not tolerate a miss.
        const p = write('joe-endings-crlf.jsx', CRLF);
        const res = await tool().execute({ filename: p, find: 'export default function Other()', replace: 'x' });
        expect(res.ok).toBe(false);
    });

    it('…and the refusal names the file and what it looked for', async () => {
        //  «Text to replace not found» told the repair loop exactly as much as
        //  it told the user: nothing.
        const p = write('joe-endings-crlf.jsx', CRLF);
        const res = await tool().execute({ filename: p, find: 'export default function Other() {', replace: 'x' });
        expect(String(res.error)).toContain('joe-endings-crlf.jsx');
        expect(String(res.error)).toContain('export default function Other()');
    });
});
