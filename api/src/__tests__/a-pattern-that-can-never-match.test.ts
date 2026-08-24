/**
 *  A PATTERN THAT CAN NEVER MATCH, AND NOTHING SAYS SO.
 *
 *  Found while editing an unrelated file. Two regexes in this repository
 *  had been written as «\bai\b» and «\bapps?\b» and were sitting on disk
 *  as a literal BACKSPACE character followed by «ai» and by «apps?». Some
 *  tool along the way had turned the two characters «\» and «b» into the
 *  one control character they name.
 *
 *  Nothing failed. TypeScript compiles a backspace inside a regex without
 *  a word. The suite was green. The pattern simply never matched anything
 *  a human could type, because no request contains a backspace — so every
 *  request mentioning «ai» or «apps» quietly took the wrong branch.
 *
 *  That is the worst shape a defect can take here: not a wrong answer,
 *  but a question that is never asked. Same disease as a criterion that
 *  can never be met, and the owner's rule about those is why this guard
 *  exists — «معيارٌ لا يُحقَّق أبداً ليس صرامةً — هو عطب».
 *
 *  So the guard is not about those two patterns. Control characters have
 *  no business in source, and a property over the whole tree is what
 *  stops the next tool from doing this again in a file nobody is reading.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

function everySourceFile(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist') continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) everySourceFile(full, out);
        else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full);
    }
    return out;
}

//  Tab, newline and carriage return are how text is written. ESC is left
//  out too: a suite about terminal output builds real ANSI sequences on
//  purpose, and no eaten escape can produce one — «\e» is not a
//  JavaScript escape, while «\b», «\f», «\v» and «\0» all are, and those
//  are exactly what this guard is here to catch.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001A\u001C-\u001F\u007F]/;

describe('no source file carries a control character', () => {
    const files = everySourceFile(ROOT);

    it('finds the tree it means to check', () => {
        //  A guard that walks an empty directory passes for the wrong
        //  reason. This count is what makes the result below mean anything.
        expect(files.length).toBeGreaterThan(200);
    });

    it('and none of them contains one', () => {
        const guilty: string[] = [];
        for (const file of files) {
            const text = readFileSync(file, 'utf8');
            const at = text.search(CONTROL);
            if (at < 0) continue;
            const line = text.slice(0, at).split('\n').length;
            const code = text.charCodeAt(at).toString(16).padStart(4, '0');
            guilty.push(`${file.slice(ROOT.length + 1)}:${line} carries U+${code.toUpperCase()}`);
        }
        expect(guilty).toEqual([]);
    });
});

describe('the guard can fail, and on exactly the right character', () => {
    const BACKSPACE = String.fromCharCode(8);
    const BACKSLASH = String.fromCharCode(92);
    const ESC = String.fromCharCode(27);

    it('catches the character that was actually on disk', () => {
        expect(CONTROL.test('/' + BACKSPACE + 'ai' + BACKSPACE + '/')).toBe(true);
    });

    it('and leaves the two characters that were meant', () => {
        expect(CONTROL.test('/' + BACKSLASH + 'bai' + BACKSLASH + 'b/')).toBe(false);
    });

    it('and lets a deliberate ANSI escape through', () => {
        expect(CONTROL.test(ESC + '[31mred' + ESC + '[0m')).toBe(false);
    });

    it('and still catches a NUL, a vertical tab and a form feed', () => {
        for (const code of [0, 11, 12]) {
            expect(CONTROL.test(String.fromCharCode(code))).toBe(true);
        }
    });
});
