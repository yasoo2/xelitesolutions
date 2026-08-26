/**
 * A COMMENT THAT ENDS THE STRING IT IS EXPLAINING.
 *
 * Five builds died on this in one session, the fifth ONE LINE BELOW a comment
 * warning about the fourth:
 *
 *     error TS1005: ';' expected.
 *
 * The shape is always identical. A template literal holds generated CSS or
 * JSX; a comment is written inside it to explain a line; the comment quotes an
 * identifier the way prose quotes code — with backticks — and the first
 * backtick TERMINATES the template literal. Everything after it is parsed as
 * TypeScript, and the error surfaces dozens of lines away from the cause.
 *
 * It is worth a guard rather than more care because care is exactly what
 * failed: the fifth one was written by someone who had just finished writing
 * «this comment carries no backtick, because it lives INSIDE the template
 * literal it documents». Knowing the rule is not the same as being unable to
 * break it, and only the second one is worth anything.
 *
 * THE CLASS: A CHARACTER THAT MEANS ONE THING IN THE OUTER LAYER AND ANOTHER
 * IN THE INNER ONE. Its siblings are already in this repository — `join('\n')`
 * losing an escape and putting a real newline inside a quoted string, and a
 * raw U+0002 written into source by a shield built to be invisible.
 *
 * This reads the SHIPPED source files, so it cannot be satisfied by being
 * careful in the file the author happened to be looking at.
 */

import fs from 'fs';
import path from 'path';

/** The generators that build code out of template literals. */
const FILES = [
    'core/design/design-system.ts',
    'core/design/theme.ts',
    'modules/tools/definitions/react-app-templates.ts',
];

/**
 * Walk the file counting unescaped backticks. Inside a template literal, a
 * `/* … *\/` or `//` sequence is NOT a comment — it is text — so any backtick
 * appearing between an opening backtick and its close is what this looks for.
 * Reported as the LINE, because the compiler reports somewhere else entirely.
 */
function commentBackticksInsideTemplates(src: string): Array<{ line: number; text: string }> {
    const out: Array<{ line: number; text: string }> = [];
    let inTemplate = false;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        //  A line that only continues a template and looks like prose: it
        //  starts with a comment marker while a template is open.
        const looksLikeComment = /^\s*(\*|\/\*|\/\/)/.test(line);
        //  An ESCAPED backtick is safe and common in this codebase -- prose
        //  about code, written correctly. Flagging it would make the guard cry
        //  wolf, and a guard that cries wolf is a guard somebody deletes.
        const hasBare = /(^|[^\\])`/.test(line);
        if (inTemplate && looksLikeComment && hasBare) {
            out.push({ line: i + 1, text: line.trim().slice(0, 90) });
        }
        //  Toggle on every unescaped backtick on the line.
        for (let c = 0; c < line.length; c++) {
            if (line[c] !== '`') continue;
            if (c > 0 && line[c - 1] === '\\') continue;
            inTemplate = !inTemplate;
        }
    }
    return out;
}

describe('a comment inside a template literal never carries a backtick', () => {
    it('POSITIVE — no shipped generator has one', () => {
        const found: string[] = [];
        for (const rel of FILES) {
            const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');
            for (const hit of commentBackticksInsideTemplates(src)) {
                found.push(`${rel}:${hit.line}  ${hit.text}`);
            }
        }
        //  Named with file and line, because «somewhere a backtick» is not
        //  something anyone can act on and this list is exactly the repair.
        expect(found).toEqual([]);
    });

    it('NEGATIVE — the detector actually fires on the shape that broke the build', () => {
        //  Non-emptiness: a checker that never fires is indistinguishable from
        //  a clean tree, and that is the defect this whole file is about.
        const broken = [
            'const css = `:root{',
            '  /*  the `p.surface` constant is fitted against white  */',
            '  --card:#fff;',
            '}`;',
        ].join('\n');
        expect(commentBackticksInsideTemplates(broken).length).toBe(1);
        expect(commentBackticksInsideTemplates(broken)[0].line).toBe(2);
    });

    it('NEGATIVE — a backtick in an ordinary comment OUTSIDE a template is fine', () => {
        //  Prose about code is normal and must stay allowed; only prose that
        //  has been swallowed by a string is the defect.
        const ok = [
            '/**  `paletteCss` writes the tokens.  */',
            'export function paletteCss() { return 1; }',
        ].join('\n');
        expect(commentBackticksInsideTemplates(ok)).toEqual([]);
    });
});
