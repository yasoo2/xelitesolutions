/**
 * An ambiguous edit is never «already applied».
 *
 * Round 21 review (2232f548): the autonomous file policy asked «is this edit
 * already in place?» before its own ambiguity check, and the answer looked at
 * the first occurrence only. A page with two lists, the first of which already
 * ended with the item, came back as a successful no-change edit — the
 * ambiguity the policy exists to refuse was answered «done». An editor that
 * lands on the first occurrence (file_edit, file_edit_advanced) keeps the
 * first-occurrence reading, because that is where its edit would land.
 * The policy, the helper and the editor are the real code.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { editAlreadyApplied } from '../shared/utils/edit-in-place';
import { validateAutonomousFileOperation } from '../modules/services/AutonomousFilePolicy';
import { FileEditTool } from '../modules/tools/definitions/SystemTools';
import { resolveToolPath } from '../modules/tools/utils';

const FIND = '</ul>';
const REPLACE = '  <li>Services</li>\n</ul>';
// Two lists; the first already ends with the item, the second does not.
const TWO_LISTS = '<ul>\n  <li>Home</li>\n  <li>Services</li>\n</ul>\n<ul>\n  <li>Blog</li>\n</ul>\n';
// Every place the sought text sits is inside a copy of the replacement — but
// there are two copies, and an editor that refuses a text found twice could
// not have made them (round 22: the edit's own result is read by undoing it).
const BOTH_EDITED = '<ul>\n  <li>Home</li>\n  <li>Services</li>\n</ul>\n<ul>\n  <li>Blog</li>\n  <li>Services</li>\n</ul>\n';
const ONE_LIST = '<ul>\n  <li>Home</li>\n  <li>Services</li>\n</ul>\n';

describe('an ambiguous edit is never already applied', () => {
    let root = '';
    beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-ambiguous-edit-')); });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
    const prepare = (body: string) => {
        const target = path.join(root, 'index.html');
        fs.writeFileSync(target, body);
        return validateAutonomousFileOperation('file_edit', { path: target, find: FIND, replace: REPLACE }, root, os.homedir());
    };

    it('the autonomous policy refuses the ambiguous match instead of calling it done', () => {
        expect(() => prepare(TWO_LISTS)).toThrow('ambiguous_edit_match');
    });

    it('it still recognises its own result, and only its own: two edited lists are still ambiguous', () => {
        const once = prepare(ONE_LIST);
        expect(once.autonomousEditAfter).toBe(once.autonomousEditBefore);
        expect(() => prepare(BOTH_EDITED)).toThrow('ambiguous_edit_match');
    });

    it('the helper answers by the editor\'s landing rule', () => {
        expect(editAlreadyApplied(TWO_LISTS, FIND, REPLACE, 'unique')).toBe(false);
        expect(editAlreadyApplied(BOTH_EDITED, FIND, REPLACE, 'unique')).toBe(false);
        expect(editAlreadyApplied(ONE_LIST, FIND, REPLACE, 'unique')).toBe(true);
        // A first-occurrence editor would land inside its own earlier result.
        expect(editAlreadyApplied(TWO_LISTS, FIND, REPLACE)).toBe(true);
    });

    it('a first-occurrence editor does not land the item a second time in the list that has it', async () => {
        const target = resolveToolPath('joe-ambiguous-edit.html');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, TWO_LISTS);
        try {
            const res: any = await new FileEditTool().execute({ filename: target, find: FIND, replace: REPLACE });
            expect(res.ok).toBe(true);
            expect(fs.readFileSync(target, 'utf-8')).toBe(TWO_LISTS);
        } finally { fs.rmSync(target, { force: true }); }
    });
});
