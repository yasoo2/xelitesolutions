/**
 * An «insert after» edit that already landed is recognised, though its own
 * replacement repeats the text it looks for.
 *
 * Round 21 second review (W4): find `</li>`, replace `</li>\n  <li>Contact</li>`.
 * Once it landed, the file holds `</li>` twice — the second is the
 * replacement's own — and the rule looked for the sought text at the first
 * offset of the replacement only. The autonomous policy's rerun of an edit that
 * was already in place was refused as `ambiguous_edit_match`; an import
 * inserted after `from 'react';` the same way. The policy and the helper are
 * the real code; nothing is substituted.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { editAlreadyApplied } from '../shared/utils/edit-in-place';
import { validateAutonomousFileOperation } from '../modules/services/AutonomousFilePolicy';

const LI_FIND = '</li>';
const LI_REPLACE = '</li>\n  <li>Contact</li>';
const LI_BEFORE = '<ul>\n  <li>Home</li>\n</ul>\n';
const LI_AFTER = '<ul>\n  <li>Home</li>\n  <li>Contact</li>\n</ul>\n';

const IMPORT_FIND = "from 'react';";
const IMPORT_REPLACE = "from 'react';\nimport { useState } from 'react';";
const IMPORT_BEFORE = "import React from 'react';\n\nexport default function App() { return <main />; }\n";
const IMPORT_AFTER = "import React from 'react';\nimport { useState } from 'react';\n\nexport default function App() { return <main />; }\n";

describe('an edit that landed is recognised wherever its text repeats', () => {
    let root = '';
    beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-r22-writing-landed-')); });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
    const prepare = (name: string, body: string, find: string, replace: string) => {
        const target = path.join(root, name);
        fs.writeFileSync(target, body);
        return validateAutonomousFileOperation('file_edit', { path: target, find, replace }, root, os.homedir());
    };

    it('POSITIVE — the policy reruns an «insert after» edit that landed as no change, not as ambiguity', () => {
        const li = prepare('index.html', LI_AFTER, LI_FIND, LI_REPLACE);
        expect(li.autonomousEditAfter).toBe(LI_AFTER);
        expect(li.autonomousEditBefore).toBe(LI_AFTER);
        const imports = prepare('App.jsx', IMPORT_AFTER, IMPORT_FIND, IMPORT_REPLACE);
        expect(imports.autonomousEditAfter).toBe(IMPORT_AFTER);
    });

    it('POSITIVE — the helper reads every offset, for both landing rules', () => {
        for (const landing of ['unique', 'first'] as const) {
            expect(editAlreadyApplied(LI_AFTER, LI_FIND, LI_REPLACE, landing)).toBe(true);
            expect(editAlreadyApplied(IMPORT_AFTER, IMPORT_FIND, IMPORT_REPLACE, landing)).toBe(true);
        }
    });

    it('NEGATIVE — before it landed, the edit is made once', () => {
        expect(editAlreadyApplied(LI_BEFORE, LI_FIND, LI_REPLACE, 'unique')).toBe(false);
        expect(prepare('index.html', LI_BEFORE, LI_FIND, LI_REPLACE).autonomousEditAfter).toBe(LI_AFTER);
        expect(prepare('App.jsx', IMPORT_BEFORE, IMPORT_FIND, IMPORT_REPLACE).autonomousEditAfter).toBe(IMPORT_AFTER);
    });

    it('NEGATIVE — a sought text outside the landed copy is still the ambiguity the policy refuses', () => {
        const twoLists = `${LI_AFTER}<ul>\n  <li>Blog</li>\n</ul>\n`;
        expect(editAlreadyApplied(twoLists, LI_FIND, LI_REPLACE, 'unique')).toBe(false);
        expect(() => prepare('index.html', twoLists, LI_FIND, LI_REPLACE)).toThrow('ambiguous_edit_match');
        // A first-occurrence editor would land inside the copy it already made.
        expect(editAlreadyApplied(twoLists, LI_FIND, LI_REPLACE, 'first')).toBe(true);
    });
});
