/**
 *  THE WORDS ON THE PAGE CAME FROM A CATALOGUE OF BUSINESS KINDS.
 *
 *  The owner, watching a live build of a coffee roastery he had described in
 *  Arabic: «this page is very poor and completely unacceptable».
 *
 *  He is right, and the file he was looking at says why. Read from the
 *  generated `src/content.js`, verbatim:
 *
 *      heroLede  = 'A real React app with instant performance, a consistent
 *                   design system, ready to ship.'
 *      perks     = ['Fresh every morning', 'Instant booking', 'Parking on site']
 *      cta       = 'Book a table'
 *      menuTitle = 'The menu'
 *
 *  The line under the headline is JOE ADVERTISING HIMSELF. The perks belong to
 *  a restaurant. The button asks a coffee roastery's visitor to book a table.
 *  Only the brand and the tagline were derived from what he actually wrote.
 *
 *  ⛔ AND THIS IS THE SEVENTH LAW ANSWERED HONESTLY. Two layers were inverted
 *  today — the design is composed from his sentence, and the section markup is
 *  authored by the model — and the page still read like every other page,
 *  because the layer a VISITOR actually reads was never touched:
 *
 *      design      seven archetypes    -> composed from the request
 *      structure   24 fixed templates  -> authored per request
 *      COPY        a catalogue by kind -> still a catalogue
 *
 *  So the same inversion, applied to the words: the model writes them from his
 *  request, the catalogue becomes the floor, and anything that cannot be
 *  proven to be about HIS subject is refused by name.
 *
 *  ⛔ THE RISK IS DIFFERENT HERE, AND SHARPER. Bad markup crashes and gets
 *  caught. Bad copy renders beautifully and lies. So the checks below are not
 *  about shape — they are about truth: the text must be in the language he
 *  wrote in, it must not be Joe describing Joe, and it must not be the stock
 *  vocabulary of a business he never mentioned.
 */

/** The fields worth authoring. Structural keys (routes, hrefs) stay derived. */
export const COPY_FIELDS = [
    'tagline', 'heroTitle', 'heroLede', 'cta', 'perks',
    'featuresTitle', 'storyTitle', 'storyBody',
    'stepsTitle', 'ctaBandTitle', 'ctaBandText', 'contactTitle',
] as const;

export interface CopySpec {
    /** His sentence, verbatim. */
    request: string;
    brand: string;
    isArabic: boolean;
    /** The deterministic copy, so the model can see what it is replacing. */
    current: Record<string, any>;
    /** Only these fields may be returned. */
    fields: string[];
}

export interface AuthoredCopy {
    fields: Record<string, any>;
    rejected: Array<{ field: string; reason: string }>;
}

/**
 *  ⛔ THERE IS NO LIST OF FORBIDDEN PHRASES HERE, AND THAT IS THE POINT.
 *
 *  The first version of this file carried two:
 *
 *      ABOUT_THE_TOOL = [/react\s+app/i, /design\s+system/i, …]
 *      SAYS_NOTHING   = [/book a table/i, /our story/i, …]
 *
 *  The owner read it and said: «you fix it so the same prompt does not repeat
 *  the same mistake — that is a template. I want Joe not to make mistakes
 *  whatever the prompt is.»
 *
 *  He is right, and the lists were the defect wearing the fix's clothes. Every
 *  entry was a phrase I had personally watched fail. A roastery that came back
 *  with «Reserve your lane» or a clinic with «Book your court» would have
 *  sailed through both, because a blacklist can only ever hold yesterday's
 *  errors — it is a catalogue, and this whole day has been about deleting
 *  catalogues.
 *
 *  So the judgement is RELATIONAL instead. There is exactly one question, and
 *  it is asked against HIS REQUEST rather than against a memory of past
 *  failures:
 *
 *      «Would this line be equally true of a business he never mentioned?»
 *
 *  That question needs no examples to work. It catches «Book a table» on a
 *  roastery, «A real React app…» on anything, and the sentence neither of us
 *  has seen yet — which is the only kind that matters.
 */

/**
 *  Does this text speak the language he wrote in?
 *
 *  ⛔ Measured, not assumed: the live build produced Arabic headings beside
 *  «Your table is ready tonight» on the same page, so a per-field check is
 *  the only one that would have caught it.
 */
export function speaksHisLanguage(text: string, isArabic: boolean): boolean {
    const ar = (text.match(/[؀-ۿ]/g) || []).length;
    const la = (text.match(/[A-Za-z]/g) || []).length;
    if (ar + la < 3) return true;              //  a number or a symbol is neutral
    return isArabic ? ar > la : la >= ar;
}

/**
 *  Every reason a field is refused, named. Returns '' when it is accepted.
 *
 *  A validator that never refuses is decoration; one that can only refuse is
 *  just as useless. Both mirrors are covered by the guard beside this file.
 */
export function refuseCopy(field: string, value: any, spec: CopySpec): string {
    const texts: string[] = Array.isArray(value)
        ? value.map(v => String(v))
        : [String(value ?? '')];

    if (!texts.length || texts.every(t => !t.trim())) return 'it is empty';

    for (const t of texts) {
        if (t.length > 400) return 'it is far longer than a line of copy';
        if (!speaksHisLanguage(t, spec.isArabic)) {
            return `it is not in the language he wrote in: «${t.slice(0, 60)}»`;
        }
    }
    return '';
}

/**
 *  THE SECOND PASS: «would this line be equally true of a business he never
 *  mentioned?»
 *
 *  ⛔ ASKED BY A READER, NOT BY A LOOKUP. This is what replaced the phrase
 *  lists. It is handed his request and the drafted lines, and it answers with
 *  the FIELD NAMES that fail — so a sentence nobody has seen before is judged
 *  by the same rule as one that has failed a hundred times.
 *
 *  Written adversarially on purpose: a reader asked «is this good?» says yes
 *  to almost anything, and a check that cannot refuse is the defect this file
 *  exists to remove. It is told to assume filler and to look for the reason to
 *  keep a line, not the reason to drop it.
 */
export function verifyPrompt(request: string, drafted: Record<string, any>): string {
    return [
        `Here is what someone asked to have built, verbatim:`,
        request,
        ``,
        `Here are lines of copy written for that website:`,
        ...Object.entries(drafted).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`),
        ``,
        `For EACH line, ask one question and answer it strictly:`,
        `  «Would this line be equally true of some business the request never`,
        `   mentioned — or does it describe a website, an app, or the software`,
        `   used to build it, instead of the business itself?»`,
        ``,
        `Assume a line fails unless it is unmistakably about THIS business.`,
        `A line naming the wrong trade's actions, or praising the website, fails.`,
        ``,
        //  ⛔ The example is deliberately abstract. An earlier version showed a
        //  real failure here — one specific wrong button on one specific kind
        //  of business — and that is a catalogue entry in the one place meant
        //  to be free of them: it teaches the reader which mistake to look for
        //  and quietly excuses every other. The guard beside this file refuses
        //  the file if a known failing phrase reappears in code that runs.
        `REPLY WITH JSON AND NOTHING ELSE — the failing field names and why:`,
        `{"fails":{"<field>":"<why this line is not about this business>"}}`,
        `If every line belongs to this business, reply exactly {"fails":{}}.`,
    ].join('\n');
}

/** Read the verifier's answer. Unreadable means «nothing proven», not «all fine». */
export function parseVerdict(raw: string): Record<string, string> | null {
    const text = String(raw || '');
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    for (const c of [fenced ? fenced[1] : '', text]) {
        const start = c.indexOf('{');
        const end = c.lastIndexOf('}');
        if (start < 0 || end <= start) continue;
        try {
            const parsed = JSON.parse(c.slice(start, end + 1));
            const fails = parsed && (parsed.fails ?? parsed.failures);
            if (fails && typeof fails === 'object' && !Array.isArray(fails)) {
                const out: Record<string, string> = {};
                for (const [k, v] of Object.entries(fails)) out[k] = String(v);
                return out;
            }
            //  An explicit empty object is a real verdict: nothing failed.
            if (fails !== undefined) return {};
        } catch { /* try the next candidate */ }
    }
    return null;
}

export function copyPrompt(spec: CopySpec): string {
    return [
        `You are writing the words that appear on ONE specific website.`,
        ``,
        `THE REQUEST, verbatim — the only authority for what this business is:`,
        spec.request,
        ``,
        `Brand: ${spec.brand}`,
        `Write every field in: ${spec.isArabic ? 'Arabic' : 'English'}. All of it, no mixing.`,
        ``,
        `Fields to write, and what each one is:`,
        `  tagline        one short line under the brand`,
        `  heroTitle      the headline — about THIS business, not about websites`,
        `  heroLede       one or two sentences a visitor reads first`,
        `  cta            the main button, 1–3 words, the action THIS business offers`,
        `  perks          exactly 3 short items that are true of THIS business`,
        `  featuresTitle  heading above those items`,
        `  storyTitle     heading for the story section`,
        `  storyBody      2–4 sentences of the business's own story`,
        `  stepsTitle     heading for the how-it-works section`,
        `  ctaBandTitle   a closing invitation`,
        `  ctaBandText    one line under it`,
        `  contactTitle   heading for the contact section`,
        ``,
        `RULES — a field that breaks any of these is discarded:`,
        `  · Never describe the website, the app, or the technology.`,
        `  · Never use words from a business the request did not mention.`,
        `  · No filler that would fit any company. Every line must be`,
        `    unmistakably about what he described.`,
        ``,
        `REPLY WITH JSON AND NOTHING ELSE:`,
        `{"fields":{"tagline":"…","heroTitle":"…","perks":["…","…","…"]}}`,
    ].join('\n');
}

export function parseCopy(raw: string): Record<string, any> {
    const text = String(raw || '');
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    for (const c of [fenced ? fenced[1] : '', text]) {
        const start = c.indexOf('{');
        const end = c.lastIndexOf('}');
        if (start < 0 || end <= start) continue;
        try {
            const parsed = JSON.parse(c.slice(start, end + 1));
            const f = parsed && (parsed.fields || parsed);
            if (f && typeof f === 'object' && !Array.isArray(f)) return f as Record<string, any>;
        } catch { /* try the next candidate */ }
    }
    return {};
}

/**
 *  Author the copy, and keep only what can be shown to be about his business.
 *  Whatever is refused keeps the deterministic value, so the floor never moves.
 */
export async function authorCopy(
    spec: CopySpec,
    call: (prompt: string) => Promise<string>,
): Promise<AuthoredCopy> {
    const out: AuthoredCopy = { fields: {}, rejected: [] };
    let raw = '';
    try {
        raw = await call(copyPrompt(spec));
    } catch (e: any) {
        out.rejected.push({ field: '*', reason: `the model could not be reached: ${String(e && e.message || e).slice(0, 120)}` });
        return out;
    }

    const drafts = parseCopy(raw);
    if (!Object.keys(drafts).length) {
        out.rejected.push({ field: '*', reason: 'the reply held no usable fields' });
        return out;
    }

    for (const field of spec.fields) {
        if (!(field in drafts)) continue;                //  keep the current value silently
        const value = drafts[field];
        //  `perks` is a list of three; anything else is a line of text.
        if (field === 'perks') {
            if (!Array.isArray(value) || value.length < 2) {
                out.rejected.push({ field, reason: 'it is not a list of items' });
                continue;
            }
        } else if (typeof value !== 'string') {
            out.rejected.push({ field, reason: 'it is not a line of text' });
            continue;
        }
        const why = refuseCopy(field, value, spec);
        if (why) out.rejected.push({ field, reason: why });
        else out.fields[field] = Array.isArray(value) ? value.slice(0, 3).map(v => String(v)) : value;
    }

    /**
     *  ⛔ AND THEN THE RELATIONAL PASS, WHICH IS THE ONE THAT MATTERS.
     *
     *  Everything above is shape: empty, too long, wrong language. None of it
     *  can tell «نحمّص كل صباح» from «احجز طاولتك» — both are Arabic, both are
     *  short, and only one belongs to a roastery. The lists that used to do
     *  that job held phrases I had watched fail, which is a catalogue, which
     *  is the thing this whole day removed.
     *
     *  So the question is asked against HIS REQUEST, and it needs no examples.
     *  If the verifier cannot be reached or answers unreadably, nothing is
     *  dropped — an unavailable reader must never look like a clean verdict,
     *  and the shape checks above still stand.
     */
    const surviving = Object.keys(out.fields);
    if (surviving.length) {
        try {
            const verdict = parseVerdict(await call(verifyPrompt(spec.request, out.fields)));
            if (verdict) {
                for (const [field, reason] of Object.entries(verdict)) {
                    if (!(field in out.fields)) continue;
                    delete out.fields[field];
                    out.rejected.push({ field, reason: `it would fit a business he never mentioned — ${reason}` });
                }
            } else {
                out.rejected.push({ field: '*verify', reason: 'the check could not be read; only the shape checks were applied' });
            }
        } catch (e: any) {
            out.rejected.push({ field: '*verify', reason: `the check could not run: ${String(e && e.message || e).slice(0, 90)}` });
        }
    }
    return out;
}
