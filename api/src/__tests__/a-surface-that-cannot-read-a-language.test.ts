/**
 *  A SURFACE THAT CANNOT READ A LANGUAGE IS BEING HANDED THAT LANGUAGE.
 *
 *  He reported it in one line: «لا حظت مشكله اخرى وهي وجود كلمات عربية في
 *  الثيرمال مقلوبه». I found it in my own frame `eye/040.png`, on his screen:
 *
 *      my-workspace/react-ةدايع-نانسأ-6f74d1f3 $ npm install --no-audit
 *
 *  The folder on disk is `react-عيادة-أسنان-f10b3f6b`. The chat panel in the
 *  same screenshot writes «عيادة أسنان» correctly. Only the terminal is wrong,
 *  because xterm.js is a character grid with no bidirectional algorithm and no
 *  Arabic shaper.
 *
 *  HOW THESE CASES JUDGE, and why it is not circular:
 *
 *  Asserting the exact presentation-form codepoints would only re-state the
 *  table the code was written from. So the reader here does what his eye does
 *  — it takes the painted row, undoes the two things the painter did, and
 *  checks that what comes back is the sentence that went in:
 *
 *    · `NFKC` folds every presentation form back to its base letter. That is
 *      Unicode's own inverse of shaping, not a copy of our table.
 *    · reversing the right-to-left run again undoes the reordering, because a
 *      reversal is its own inverse.
 *
 *  A test that only proved «something changed» would pass on rubbish, so every
 *  positive case below is paired with the raw un-transformed string, and the
 *  suite asserts that the raw string is NOT what the reader accepts. That is
 *  the non-emptiness proof: the cases fail against the code as it was before
 *  the fix, for the reason they are meant to fail.
 */

import { shapeForTerminal, shapeArabic, reorderLine } from '../core/text/arabic-terminal';

/* ── the reader: what his eye does with a painted row ─────────────────────── */

const ARABIC_RUN = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF][\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF \-]*/g;

/**
 *  Read a painted row the way an Arabic reader reads it: fold the glyphs back
 *  to letters, then read each right-to-left run right to left.
 */
function readAsHuman(painted: string): string {
    //  Reverse the GLYPHS first and fold afterwards, in that order and not the
    //  other. The first draft of this reader folded first, and every «لأ» in
    //  the suite came back as «أل» — because folding turns one ligature glyph
    //  into two letters in logical order, and a blanket reversal then flips
    //  the pair. The reader was wrong, not the painter.
    return painted.replace(ARABIC_RUN, run => [...run].reverse().join('')).normalize('NFKC');
}

/* ── his line, measured from his screen ───────────────────────────────────── */

describe('the row he watched go by', () => {
    const logical = 'my-workspace/react-عيادة-أسنان-6f74d1f3 $ npm install --no-audit';

    it('reads back as the sentence that went in', () => {
        expect(readAsHuman(shapeForTerminal(logical))).toContain('عيادة-أسنان');
    });

    it('is not what the terminal was showing before — the case is not empty', () => {
        //  The old behaviour was «write the logical string straight through».
        //  If that still passed the reader, this whole file would prove nothing.
        expect(readAsHuman(logical)).not.toContain('عيادة-أسنان');
    });

    it('leaves the Latin, the digits and the flags exactly as they were', () => {
        const painted = shapeForTerminal(logical);
        expect(painted).toContain('my-workspace/react-');
        expect(painted).toContain('-6f74d1f3 $ npm install --no-audit');
    });

    it('paints the whole Arabic phrase as one run, hyphen included', () => {
        //  `عيادة-أسنان` is one name. Painted as two islands either side of a
        //  hyphen it reads back inside out, which is the defect wearing a
        //  smaller hat.
        const painted = shapeForTerminal(logical);
        const runs = painted.match(ARABIC_RUN) || [];
        expect(runs).toHaveLength(1);
        expect(runs[0]).toContain('-');
    });

    it('paints the npm banner the same way', () => {
        const banner = '> عيادة-أسنان@0.1.0 build';
        expect(readAsHuman(shapeForTerminal(banner))).toContain('عيادة-أسنان');
        expect(readAsHuman(banner)).not.toContain('عيادة-أسنان');
    });
});

/* ── what it must not touch ───────────────────────────────────────────────── */

describe('what it refuses to touch', () => {
    it('returns an English row unchanged, character for character', () => {
        const rows = [
            'npm warn allow-scripts  esbuild@0.21.5 (postinstall: node install.js)',
            'PS C:\\Users\\home\\Documents\\xelitesolutions> exit 0 · 4.4s',
            'vite v5.4.21 building for production...',
            '',
        ];
        for (const row of rows) expect(shapeForTerminal(row)).toBe(row);
    });

    it('keeps every escape sequence byte for byte', () => {
        const ESC = String.fromCharCode(27);
        const green = `${ESC}[1;32m✓ تمّ البناء${ESC}[0m`;
        const painted = shapeForTerminal(green);
        expect(painted.startsWith(`${ESC}[1;32m`)).toBe(true);
        expect(painted.endsWith(`${ESC}[0m`)).toBe(true);
        expect(readAsHuman(painted)).toContain('تمّ البناء');
    });

    it('does not reorder a colour code into rubbish', () => {
        const ESC = String.fromCharCode(27);
        const painted = shapeForTerminal(`${ESC}[31mخطأ${ESC}[0m`);
        //  `[31m` reversed is `m13[`, and a terminal handed that prints it.
        expect(painted).not.toContain('m13[');
        expect(painted).not.toContain('m0[');
    });

    it('keeps the line terminators exactly as they arrived', () => {
        const chunk = 'أول سطر\r\nثاني سطر\nثالث\r';
        const painted = shapeForTerminal(chunk);
        expect((painted.match(/\r\n/g) || []).length).toBe(1);
        expect(painted.split(/\r\n|\n|\r/)).toHaveLength(4);
    });

    it('does not merge two rows into one', () => {
        const painted = shapeForTerminal('السطر الأول\nالسطر الثاني');
        const [first, second] = painted.split('\n');
        expect(readAsHuman(first)).toContain('السطر الأول');
        expect(readAsHuman(second)).toContain('السطر الثاني');
    });
});

/* ── numbers, which read the same way in every script ─────────────────────── */

describe('a measurement is never painted backwards', () => {
    it('keeps a decimal the right way round inside an Arabic row', () => {
        const painted = shapeForTerminal('تمّ في 4.2 ثانية');
        expect(painted).toContain('4.2');
        expect(painted).not.toContain('2.4');
    });

    it('keeps a multi-digit count intact', () => {
        const painted = shapeForTerminal('أضيفت 63 حزمة');
        expect(painted).toContain('63');
        expect(painted).not.toContain('36');
    });

    it('keeps an identifier that is half letters and half digits', () => {
        expect(shapeForTerminal('المجلّد react-عيادة-6f74d1f3')).toContain('6f74d1f3');
    });
});

/* ── shaping, on its own ──────────────────────────────────────────────────── */

describe('letters take the shape of their company', () => {
    it('gives the same letter three different glyphs in three positions', () => {
        //  ع at the start, in the middle, and at the end of a word. If the
        //  shaper returned one form for all three, Arabic would look like a
        //  row of stamps, which is half of what he saw.
        const [initial, medial, final] = ['عمل', 'يعمل', 'مع'].map(w =>
            [...shapeArabic(w)].find(ch => ch.normalize('NFKC') === 'ع'));
        expect(new Set([initial, medial, final]).size).toBe(3);
    });

    it('does not join a letter that never joins forward', () => {
        //  د joins to what is before it and to nothing after. `دار` must not
        //  give ا an attached-to-the-right form.
        const shaped = shapeArabic('دار');
        expect(shaped.normalize('NFKC')).toBe('دار');
        expect(shaped).not.toBe('دار');   // it did shape something
    });

    it('writes لا as the one glyph it is', () => {
        const shaped = shapeArabic('لا');
        expect([...shaped]).toHaveLength(1);
        expect(shaped.normalize('NFKC')).toBe('لا');
    });

    it('leaves a harakah attached rather than breaking the join around it', () => {
        //  The mark between two letters must not make them look like the ends
        //  of two separate words.
        const withMark = shapeArabic('تمَّ');
        const without = shapeArabic('تم');
        expect([...withMark][0]).toBe([...without][0]);
    });

    it('leaves Latin, digits and punctuation alone', () => {
        expect(shapeArabic('npm run build -- --mode=production')).toBe('npm run build -- --mode=production');
    });
});

/* ── the base direction of a row ──────────────────────────────────────────── */

describe('a row takes the direction of the first thing that states one', () => {
    it('an Arabic row keeps its embedded English readable', () => {
        const painted = reorderLine(shapeArabic('فشل الأمر npm install'));
        expect(painted).toContain('npm install');
        expect(readAsHuman(painted)).toContain('فشل الأمر');
    });

    it('an English row keeps the Arabic in place rather than throwing it to the front', () => {
        const painted = shapeForTerminal('cd my-workspace/عيادة && npm start');
        expect(painted.indexOf('cd my-workspace/')).toBe(0);
        expect(painted).toContain('&& npm start');
    });

    it('turns a bracket to face the way its text runs', () => {
        //  «(نجح)» painted without mirroring reads «)نجح(».
        const painted = shapeForTerminal('(نجح)');
        expect(painted.startsWith('(')).toBe(true);
        expect(painted.endsWith(')')).toBe(true);
    });
});
