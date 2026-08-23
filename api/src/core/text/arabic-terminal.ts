/**
 *  ARABIC, FOR A SURFACE THAT CANNOT READ IT.
 *
 *  He reported it in one line: «لا حظت مشكله اخرى وهي وجود كلمات عربية في
 *  الثيرمال مقلوبه». Measured in frame `eye/040.png`, from his own screen:
 *
 *      my-workspace/react-ةدايع-نانسأ-6f74d1f3 $ npm install --no-audit
 *        > ةدايع-نانسأ@0.1.0 build
 *
 *  The directory on disk is `react-عيادة-أسنان-f10b3f6b` — codepoints in
 *  logical order, correct. The chat panel in the same screenshot writes
 *  «عيادة أسنان» correctly. Only the terminal is wrong, and it is wrong twice
 *  over: the letters are in reverse reading order, and they are unjoined.
 *
 *  THE CLASS, not the instance:
 *
 *      A surface that cannot render a language is being handed that language.
 *
 *  xterm.js is a character grid. It has no bidirectional algorithm and no
 *  Arabic shaper — it paints codepoints left to right in the order it
 *  receives them, and that is the whole of its contract. Nothing upstream is
 *  broken; the text is simply arriving unprepared for the surface that must
 *  draw it. So the preparation happens at the write boundary, and nowhere
 *  else:
 *
 *    · not in the shell, whose output is correct;
 *    · not in the API stream, which is also read into the panel's copy and
 *      download buffer — that buffer must keep the ORIGINAL logical text,
 *      because a saved log is read by machines and searched by people;
 *    · only in the last inch, where text stops being data and becomes pixels.
 *
 *  This is deliberately a level-1 bidi — reorder runs, do not resolve
 *  embeddings — which is what every terminal reshaper does, because a
 *  terminal has rows and no paragraph. It is not the full Unicode algorithm
 *  and does not claim to be.
 */

/* ── which characters are strongly right-to-left ──────────────────────────── */

/**
 *  Arabic letters, Arabic-Indic digits, Arabic punctuation, and the
 *  presentation forms this file itself produces — so a chunk that has already
 *  been prepared is still recognised as right-to-left rather than treated as
 *  neutral rubble.
 */
export function isRtl(ch: string): boolean {
    const c = ch.codePointAt(0) || 0;
    return (c >= 0x0590 && c <= 0x05ff)   // Hebrew
        || (c >= 0x0600 && c <= 0x06ff)   // Arabic
        || (c >= 0x0750 && c <= 0x077f)   // Arabic Supplement
        || (c >= 0x08a0 && c <= 0x08ff)   // Arabic Extended-A
        || (c >= 0xfb50 && c <= 0xfdff)   // Presentation Forms-A
        || (c >= 0xfe70 && c <= 0xfeff);  // Presentation Forms-B
}

/** A Latin letter — anything that states a left-to-right direction. */
function isStrongLtr(ch: string): boolean {
    const c = ch.codePointAt(0) || 0;
    return (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)
        || (c >= 0xc0 && c <= 0x24f);
}

function isDigit(ch: string): boolean {
    const c = ch.codePointAt(0) || 0;
    return c >= 0x30 && c <= 0x39;
}

/** Harakat and other marks: they hang on the previous letter and never join. */
function isTransparent(ch: string): boolean {
    const c = ch.codePointAt(0) || 0;
    return (c >= 0x064b && c <= 0x065f) || c === 0x0670
        || (c >= 0x06d6 && c <= 0x06dc) || (c >= 0x06df && c <= 0x06e8)
        || (c >= 0x06ea && c <= 0x06ed);
}

/* ── shaping: isolated · final · initial · medial ─────────────────────────── */

/**
 *  Every Arabic letter with its four contextual forms. A letter that cannot
 *  join to the one after it — ا د ذ ر ز و ة and the hamza carriers — has only
 *  two, and the pair is repeated so the lookup needs no special case.
 */
const FORMS: Record<string, [string, string, string, string]> = {
    'ء': ['ﺀ', 'ﺀ', 'ﺀ', 'ﺀ'],
    'آ': ['ﺁ', 'ﺂ', 'ﺁ', 'ﺂ'],
    'أ': ['ﺃ', 'ﺄ', 'ﺃ', 'ﺄ'],
    'ؤ': ['ﺅ', 'ﺆ', 'ﺅ', 'ﺆ'],
    'إ': ['ﺇ', 'ﺈ', 'ﺇ', 'ﺈ'],
    'ئ': ['ﺉ', 'ﺊ', 'ﺋ', 'ﺌ'],
    'ا': ['ﺍ', 'ﺎ', 'ﺍ', 'ﺎ'],
    'ب': ['ﺏ', 'ﺐ', 'ﺑ', 'ﺒ'],
    'ة': ['ﺓ', 'ﺔ', 'ﺓ', 'ﺔ'],
    'ت': ['ﺕ', 'ﺖ', 'ﺗ', 'ﺘ'],
    'ث': ['ﺙ', 'ﺚ', 'ﺛ', 'ﺜ'],
    'ج': ['ﺝ', 'ﺞ', 'ﺟ', 'ﺠ'],
    'ح': ['ﺡ', 'ﺢ', 'ﺣ', 'ﺤ'],
    'خ': ['ﺥ', 'ﺦ', 'ﺧ', 'ﺨ'],
    'د': ['ﺩ', 'ﺪ', 'ﺩ', 'ﺪ'],
    'ذ': ['ﺫ', 'ﺬ', 'ﺫ', 'ﺬ'],
    'ر': ['ﺭ', 'ﺮ', 'ﺭ', 'ﺮ'],
    'ز': ['ﺯ', 'ﺰ', 'ﺯ', 'ﺰ'],
    'س': ['ﺱ', 'ﺲ', 'ﺳ', 'ﺴ'],
    'ش': ['ﺵ', 'ﺶ', 'ﺷ', 'ﺸ'],
    'ص': ['ﺹ', 'ﺺ', 'ﺻ', 'ﺼ'],
    'ض': ['ﺽ', 'ﺾ', 'ﺿ', 'ﻀ'],
    'ط': ['ﻁ', 'ﻂ', 'ﻃ', 'ﻄ'],
    'ظ': ['ﻅ', 'ﻆ', 'ﻇ', 'ﻈ'],
    'ع': ['ﻉ', 'ﻊ', 'ﻋ', 'ﻌ'],
    'غ': ['ﻍ', 'ﻎ', 'ﻏ', 'ﻐ'],
    'ـ': ['ـ', 'ـ', 'ـ', 'ـ'],
    'ف': ['ﻑ', 'ﻒ', 'ﻓ', 'ﻔ'],
    'ق': ['ﻕ', 'ﻖ', 'ﻗ', 'ﻘ'],
    'ك': ['ﻙ', 'ﻚ', 'ﻛ', 'ﻜ'],
    'ل': ['ﻝ', 'ﻞ', 'ﻟ', 'ﻠ'],
    'م': ['ﻡ', 'ﻢ', 'ﻣ', 'ﻤ'],
    'ن': ['ﻥ', 'ﻦ', 'ﻧ', 'ﻨ'],
    'ه': ['ﻩ', 'ﻪ', 'ﻫ', 'ﻬ'],
    'و': ['ﻭ', 'ﻮ', 'ﻭ', 'ﻮ'],
    'ى': ['ﻯ', 'ﻰ', 'ﻯ', 'ﻰ'],
    'ي': ['ﻱ', 'ﻲ', 'ﻳ', 'ﻴ'],
};

/** Letters that join to the letter AFTER them. The rest only join backwards. */
const JOINS_FORWARD = new Set([
    'ئ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ',
    'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع',
    'غ', 'ـ', 'ف', 'ق', 'ك', 'ل', 'م',
    'ن', 'ه', 'ي',
]);

/** لام followed by ألف is one glyph, not two. */
const LAM_ALEF: Record<string, [string, string]> = {
    'آ': ['ﻵ', 'ﻶ'],
    'أ': ['ﻷ', 'ﻸ'],
    'إ': ['ﻹ', 'ﻺ'],
    'ا': ['ﻻ', 'ﻼ'],
};

/**
 *  Rewrite Arabic letters into the shape they take in their own company.
 *
 *  It reads its neighbours in LOGICAL order — which is precisely why it must
 *  run before any reordering and never after. Shape then reverse; reverse
 *  then shape gives every letter the wrong two neighbours.
 */
export function shapeArabic(text: string): string {
    const src = [...String(text || '')];
    const out: string[] = [];

    /** The nearest neighbour that is not a mark, in either direction. */
    const neighbour = (from: number, step: number): string | null => {
        for (let k = from + step; k >= 0 && k < src.length; k += step) {
            if (!isTransparent(src[k])) return src[k];
        }
        return null;
    };

    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        const forms = FORMS[ch];
        if (!forms) { out.push(ch); continue; }

        const prev = neighbour(i, -1);
        const next = neighbour(i, +1);
        const joinedBefore = !!prev && JOINS_FORWARD.has(prev);
        const joinedAfter = !!next && !!FORMS[next];

        //  لا — one glyph. The ألف is consumed here and not emitted again,
        //  and any mark standing between the two letters is carried across.
        if (ch === 'ل' && next && LAM_ALEF[next]) {
            const [iso, fin] = LAM_ALEF[next];
            out.push(joinedBefore ? fin : iso);
            for (let k = i + 1; k < src.length; k++) {
                if (src[k] === next) { i = k; break; }
                out.push(src[k]);
            }
            continue;
        }

        const canJoinForward = JOINS_FORWARD.has(ch) && joinedAfter;
        out.push(
            joinedBefore && canJoinForward ? forms[3]
                : joinedBefore ? forms[1]
                    : canJoinForward ? forms[2]
                        : forms[0],
        );
    }
    return out.join('');
}

/* ── reordering: one row, one base direction ──────────────────────────────── */

/**
 *  Brackets face the other way when the text around them does. Without this,
 *  «(نجح)» is painted as «)نجح(».
 */
const MIRRORED: Record<string, string> = {
    '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{',
    '<': '>', '>': '<', '«': '»', '»': '«',
};

/**
 *  A right-to-left run is painted last-character-first — except for numbers,
 *  which read the same way in every script and must survive intact. `4.2s`
 *  reversed is `s2.4`, and a measurement printed backwards is worse than one
 *  not printed at all.
 */
function reverseKeepingNumbers(text: string): string {
    const chars = [...text];
    const out: string[] = [];
    for (let i = chars.length - 1; i >= 0;) {
        if (isDigit(chars[i])) {
            let j = i;
            while (j >= 0 && isDigit(chars[j])) j--;
            out.push(chars.slice(j + 1, i + 1).join(''));
            i = j;
            continue;
        }
        out.push(MIRRORED[chars[i]] || chars[i]);
        i--;
    }
    return out.join('');
}

/**
 *  Put a single row into the order a left-to-right grid must paint it.
 *
 *  Level 1 only: right-to-left runs are reversed, and a neutral caught
 *  BETWEEN two right-to-left runs belongs to them — which is the whole reason
 *  `عيادة-أسنان` is painted as one Arabic phrase and not as two islands
 *  either side of a hyphen. A neutral with a different direction on each side
 *  falls to the row's base direction, which is the standard resolution and
 *  keeps `react-` attached to the Latin it came from.
 */
export function reorderLine(line: string): string {
    const src = [...line];
    if (!src.some(isRtl)) return line;

    //  Base direction: the first character that states one.
    let baseRtl = false;
    for (const ch of src) {
        if (isRtl(ch)) { baseRtl = true; break; }
        if (isStrongLtr(ch)) break;
    }

    const dir: Array<'r' | 'l' | 'n'> = src.map(ch =>
        isRtl(ch) ? 'r' : (isStrongLtr(ch) || isDigit(ch)) ? 'l' : 'n');

    for (let i = 0; i < dir.length; i++) {
        if (dir[i] !== 'n') continue;
        let j = i;
        while (j < dir.length && dir[j] === 'n') j++;
        const before = i > 0 ? dir[i - 1] : (baseRtl ? 'r' : 'l');
        const after = j < dir.length ? dir[j] : (baseRtl ? 'r' : 'l');
        const take = before === after ? before : (baseRtl ? 'r' : 'l');
        for (let k = i; k < j; k++) dir[k] = take;
        i = j - 1;
    }

    const runs: Array<{ rtl: boolean; text: string }> = [];
    for (let i = 0; i < src.length;) {
        const rtl = dir[i] === 'r';
        let j = i;
        while (j < src.length && (dir[j] === 'r') === rtl) j++;
        runs.push({ rtl, text: src.slice(i, j).join('') });
        i = j;
    }

    const painted = runs.map(r => (r.rtl ? reverseKeepingNumbers(r.text) : r.text));
    return (baseRtl ? painted.reverse() : painted).join('');
}

/* ── the write boundary ───────────────────────────────────────────────────── */

//  CSI sequences, OSC strings, and the two-character escapes.
//  eslint-disable-next-line no-control-regex
const ANSI = /(\u001b\\[[0-9;?]*[ -/]*[@-~]|\u001b\\][^\u0007\u001b]*(?:\u0007|\u001b\\\\)|\u001b[@-Z\\\\-_])/;

/**
 *  Prepare a chunk of terminal output for a grid that paints left to right.
 *
 *  Three things it deliberately does NOT do, each of which would be a defect
 *  of its own:
 *
 *   1. It does not touch a chunk with no right-to-left character in it. Nearly
 *      all terminal traffic is English, and a transform that runs on English
 *      is a transform that can break English.
 *   2. It does not touch escape sequences. Colour, cursor moves and titles are
 *      instructions to the terminal, not text for a reader, and reordering one
 *      turns a colour into rubbish on the screen.
 *   3. It does not alter what anyone else reads. The panel builds its copy and
 *      download buffer from the ORIGINAL data, so a saved log stays in logical
 *      order and stays searchable.
 */
export function shapeForTerminal(chunk: string): string {
    const text = String(chunk == null ? '' : chunk);
    if (!text || ![...text].some(isRtl)) return text;

    //  Splitting on the capture group keeps the escape sequences in place;
    //  the odd indices are the sequences themselves and pass through whole.
    return text.split(ANSI).map((part, i) => {
        if (i % 2 === 1) return part;
        if (![...part].some(isRtl)) return part;
        //  Row by row. A terminal has rows, not paragraphs, and the line
        //  terminators must survive exactly as they arrived.
        return part.split(/(\r\n|\n|\r)/)
            .map((seg, k) => (k % 2 === 1 ? seg : reorderLine(shapeArabic(seg))))
            .join('');
    }).join('');
}
