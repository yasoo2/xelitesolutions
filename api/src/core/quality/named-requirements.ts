/**
 *  HE NAMED FIVE THINGS AND JOE KEPT ONE.
 *
 *  From Joe's own log, on a real run, on the owner's machine:
 *
 *      I don't know this app type and have no ready engine — I'll build a
 *      generic structure. From your request I understood: an interactive button.
 *
 *  His request:
 *
 *      Build a responsive website for a neighborhood bicycle repair studio
 *      called Spoke & Stem. Include a service list with prices, opening hours,
 *      location, phone CTA, and a booking form.
 *
 *  Five named behaviours: a service list with prices, opening hours, a
 *  location, a phone CTA, a booking form. Joe kept ONE, and the weakest.
 *
 *  ⛔ THE CLASS IS THE FOURTH LAW AT ITS MOST LITERAL — the request is the
 *  authority and four fifths of it was discarded before anything was chosen.
 *  Every defect closed this session has been a version of this; this is the
 *  version that happens FIRST, so everything downstream was faithful to a
 *  request that had already been thrown away.
 *
 *  And it explains a green nobody should have trusted. The ledger reported
 *  «all 1/1 requested criteria were proven» — true, and meaningless, because
 *  the denominator was one. **A ledger can never be more complete than the
 *  reading it is handed.**
 *
 *  ⛔ WHY THIS IS NOT A BIGGER CATALOGUE. `acceptanceCriteriaFor` matches a
 *  fixed table of known features, so anything outside the table is invisible —
 *  and «I don't know this app type» is that table speaking. Adding rows would
 *  push the failure one prompt further out and make it louder. The reader here
 *  asks a different question entirely: **what did HE name?** — and every answer
 *  must be quoted from his own sentence, so it is checkable against his words
 *  rather than against a memory of past prompts.
 */

export interface NamedRequirement {
    /** Stable id derived from the quote, so the same request yields the same ids. */
    id: string;
    /** The behaviour, in his language, short enough to show him. */
    text: string;
    /** ⛔ The exact span of HIS sentence this came from. */
    quote: string;
}

export interface ExtractionResult {
    requirements: NamedRequirement[];
    rejected: Array<{ text: string; reason: string }>;
    /**
     *  How many readings actually answered. Published rather than hidden: a
     *  system that smooths away its own variance is claiming more than it
     *  measured, which is the habit this file was written to end.
     */
    passes?: number;
}

/** Words that are Joe's own paperwork or the act of asking, never a feature. */
const NOT_A_FEATURE = /^(?:build|make|create|website|site|app|page|responsive|design|اعمل|ابن|موقع|صفحة|تطبيق|تصميم)$/i;

/**
 *  ⛔ THE THING HE IS ASKING FOR IS NOT A THING IT MUST HAVE.
 *
 *  Measured on the owner's own machine, from his own prompts, after the
 *  reader shipped:
 *
 *      read from your request: 2 named — build an online jewelry store · complete
 *      read from your request: 2 named — متجر مجوهرات فاخر · سله مشتريات
 *
 *  «build an online jewelry store» is the request. «متجر مجوهرات فاخر» is
 *  its subject. Neither is a behaviour the build can be judged against, and
 *  both are unfalsifiable: a shop that exists satisfies «build a shop» no
 *  matter how badly it does everything he actually asked for. So the
 *  denominator fills with criteria that are met by definition, which is the
 *  same disease as a denominator of one wearing a larger number.
 *
 *  `groundedIn` could not catch it: it reads the QUOTE, and the model quoted
 *  a long true span of his sentence while writing scaffolding as the TEXT.
 *  **The check has to stand where the text is, because the text is what he
 *  reads and what the ledger counts.**
 */
//  ⛔ `\b` READS ASCII, SO IT NEVER SAW THE ARABIC VERB.
//  This shipped ending in `)\b/i` and let «اعمل متجر مجوهرات فاخر» straight
//  through: JavaScript defines a word boundary on `\w` — ASCII letters,
//  digits, underscore — so between «ل» and a space there is no transition to
//  find. English matched and Arabic did not. It is this repository’s oldest
//  defect in a new place: a pattern that reads letters instead of words.
//  The guard caught it only because it was written from HIS logs, in both
//  languages. A lookahead asks the question directly.
const OPENS_WITH_THE_ASKING = /^(?:please\s+)?(?:build|make|create|develop|design|generate|write|اعمل|ابن|انشئ|أنشئ|صمم|اصنع|اكتب|بدي|اريد|أريد)(?=\s|$)/iu;

/**
 *  ⛔ AN INSTRUCTION TO JOE IS NOT A REQUIREMENT OF THE PROJECT.
 *
 *  Seen on the owner's own screen, in his own Logs panel, from a prompt he
 *  wrote himself:
 *
 *      ?? Actually use the browser — I did not inspect it
 *      ?? OPEN — ?? NAVIGATE — ?? CLICK — ?? TYPE — ?? SUBMIT — ?? OBSERVE
 *      ?? FIND PROBLEM — ?? FIX — ?? RELOAD — ?? TEST AGAIN — ?? VERIFY
 *      ?? Number of browser actions performed — ?? Pages tested — ?? Forms tested
 *
 *      Error: delivery_acceptance_unmapped:req-j47i,req-k0k7,req-el2o, …14 ids
 *
 *  His prompt carried a procedural preamble telling JOE how to work — «actually
 *  use the browser», «OPEN → NAVIGATE → CLICK», «report the number of browser
 *  actions performed» — and every line of it became a project requirement.
 *  Twenty-odd criteria, none of them a thing the built site can HAVE, and
 *  fourteen ids flooding the delivery layer.
 *
 *  ⛔ THE DISTINCTION IS CLEAN AND I HAD NOT ENCODED IT: a requirement is
 *  something the ARTEFACT has; «CLICK» is something JOE does. The existing
 *  filter refuses the subject of the request — `build a website`, «متجر
 *  مجوهرات فاخر» — and had nothing to say about an instruction addressed to the
 *  builder itself.
 *
 *  And note where it was found. Every prompt tested all night, mine and the
 *  gate's, was a clean five-clause build request. **The owner writes real
 *  prompts with real preambles, and the defect exists only there.** No unit
 *  guard could have produced its shape — watching him use it did.
 */
const IS_AN_INSTRUCTION_TO_JOE = new RegExp(
    '^(?:'
    //  Bare imperatives that address the builder, not the build.
    + 'open|navigate|click|tap|press|type|submit|observe|inspect|verify|test|retest|reload|refresh'
    + '|fix|repair|report|check|confirm|ensure|make\\s+sure|do\\s+not|don\'t|avoid|skip|start\\s+by'
    + '|actually\\s+\\w+|find\\s+problem|test\\s+again'
    //  A tally of what Joe did, which is a report about the run.
    + '|number\\s+of\\s+\\w+|pages\\s+tested|forms\\s+tested|buttons\\s+tested'
    + '|errors\\s+(?:discovered|fixed|found)|final\\s+verification'
    + '|\\u0627\\u0641\\u062a\\u062d|\\u0627\\u0636\\u063a\\u0637|\\u0627\\u0643\\u062a\\u0628|\\u062a\\u062d\\u0642\\u0642|\\u0627\\u062e\\u062a\\u0628\\u0631|\\u0623\\u0639\\u062f|\\u0644\\u0627\\s+\\u062a'
    + ')(?=\\s|$|[:،,.])', 'iu');

/**
 *  A requirement must be a thing the build can FAIL to deliver. This refuses
 *  the three shapes that cannot: the act of asking, an instruction to Joe
 *  about how to work, and a bare fragment with no content word of its own.
 */
export function isJudgeable(text: string): boolean {
    const t = String(text || '').trim();
    if (t.length < 3) return false;
    if (OPENS_WITH_THE_ASKING.test(t)) return false;
    if (IS_AN_INSTRUCTION_TO_JOE.test(t)) return false;
    const words = t.split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2 && !NOT_A_FEATURE.test(w));
    return words.length > 0;
}

const slug = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'req-' + ((h >>> 0) % 1e6).toString(36);
};

/**
 *  ⛔ EVERY REQUIREMENT MUST BE FOUND IN HIS SENTENCE, OR IT IS INVENTED.
 *
 *  A model asked «what did he ask for» will happily add what a site like this
 *  usually has. That is the catalogue again, wearing a model's voice. So each
 *  quote is checked back against the request, and one that is not there is
 *  refused BY NAME rather than quietly dropped.
 */
export function groundedIn(quote: string, request: string): boolean {
    const norm = (s: string) => String(s || '')
        .toLowerCase()
        .replace(/[ً-ْـ]/g, '')
        .replace(/[أإآ]/g, 'ا')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
    const q = norm(quote);
    if (!q) return false;
    const r = norm(request);
    /**
     *  ⛔ THE ACT OF ASKING IS FILTERED FIRST, BEFORE THE LITERAL MATCH.
     *
     *  «responsive website» is quoted from his sentence word for word, so a
     *  literal `includes` answers yes — and it is still not a thing to build.
     *  Ordering the checks the other way let the request's own scaffolding in
     *  through the front door: the denominator fills with criteria nothing can
     *  ever prove, which is this file's own failure arriving from the far side.
     *  So the content words are taken FIRST, and a quote that has none is not
     *  his requirement however exactly it is quoted.
     */
    const words = q.split(' ').filter(w => w.length > 2 && !NOT_A_FEATURE.test(w));
    if (!words.length) return false;
    if (r.includes(q)) return true;
    //  A quote may be lightly reordered by the reader. Every content word of it
    //  must still be his, or it is not his requirement.
    return words.every(w => r.includes(w));
}

export function extractionPrompt(request: string, isArabic: boolean): string {
    return [
        `Read this request and list every distinct thing the person asked the site or app to HAVE or to DO.`,
        ``,
        `THE REQUEST, verbatim:`,
        request,
        ``,
        `Rules:`,
        `  · One entry per named behaviour or piece of content. Split lists:`,
        `    «a service list with prices, opening hours, location, phone CTA, and`,
        `    a booking form» is FIVE entries, not one.`,
        `  · Every entry must carry the exact words from his sentence it came`,
        `    from. If you cannot quote it, do not list it.`,
        `  · Do NOT add what a site like this usually has. Only what he wrote.`,
        `  · Do not list the act of asking — «build a website» is not a feature.`,
        `  · Do NOT list the project itself or what it is about. «build an`,
        `    online jewelry store» and «a luxury jewelry shop» are the thing`,
        `    being asked for, not things it must do. Every entry must be`,
        `    something the finished site could FAIL to have.`,
        `  · Write «text» in ${isArabic ? 'Arabic' : 'English'}.`,
        ``,
        `REPLY WITH JSON AND NOTHING ELSE:`,
        `{"requirements":[{"text":"…","quote":"…"}]}`,
    ].join('\n');
}

export function parseRequirements(raw: string): Array<{ text: string; quote: string }> {
    const text = String(raw || '');
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    for (const c of [fenced ? fenced[1] : '', text]) {
        const start = c.indexOf('{');
        const end = c.lastIndexOf('}');
        if (start < 0 || end <= start) continue;
        try {
            const parsed = JSON.parse(c.slice(start, end + 1));
            const list = parsed && (parsed.requirements || parsed.features);
            if (Array.isArray(list)) {
                return list
                    .filter(r => r && typeof r === 'object')
                    .map(r => ({ text: String(r.text ?? ''), quote: String(r.quote ?? '') }))
                    .filter(r => r.text.trim());
            }
        } catch { /* try the next candidate */ }
    }
    return [];
}

/**
 *  Read what he named. Anything that cannot be found in his own sentence is
 *  refused by name — an invented requirement is worse than a missing one,
 *  because Joe would then build, and fail, something he was never asked for.
 */
/**
 *  ⛔ ONE CALL TO THIS BRAIN IS NOT A MEASUREMENT.
 *
 *  Measured twice on the owner's machine, same sentence, same build path,
 *  hours apart:
 *
 *      read from your request: 5 named — a service list with prices · opening
 *        hours · location · phone CTA · a booking form
 *      read from your request: 1 named — a service list with prices
 *
 *  And it was NOT the filter. Every rejection this reader makes is printed by
 *  name; the second run printed exactly one, the same one as the first. Four
 *  swallowed requirements would have printed four refusals. **The model simply
 *  never returned them** — confirmed by `git diff` showing `extractionPrompt`,
 *  `isJudgeable`, `groundedIn` and `parseRequirements` byte-identical between
 *  the two builds.
 *
 *  So the reader is not weak, it is UNSTABLE: the same question answered
 *  differently on consecutive asks. A single call to a nondeterministic source
 *  is a sample, and this whole file exists because a ledger can be no better
 *  than the reading it is handed.
 *
 *  ⛔ AND THE REPAIR MUST NOT RELAX A SINGLE GUARD. Every candidate from
 *  every pass still has to be judgeable and still has to be quoted from HIS
 *  sentence — asking twice widens what is seen, never what is admitted. Five
 *  and one union to five because the four extra ones were always his words;
 *  nothing invented can enter through a second door that could not enter
 *  through the first.
 *
 *  Two passes, not five: the cost is a model call and the return falls off
 *  quickly. The count is published so the instability is visible rather than
 *  smoothed away — a system that hides its own variance is back to claiming
 *  more than it measured.
 */
const EXTRACTION_PASSES = 2;

export async function namedRequirements(
    request: string,
    isArabic: boolean,
    call: (prompt: string) => Promise<string>,
): Promise<ExtractionResult> {
    const out: ExtractionResult = { requirements: [], rejected: [] };
    const req = String(request || '').trim();
    if (!req) return out;

    const passes: string[] = [];
    let lastError = '';
    for (let i = 0; i < EXTRACTION_PASSES; i++) {
        try { passes.push(await call(extractionPrompt(req, isArabic))); }
        catch (e: any) { lastError = String(e && e.message || e); }
    }
    if (!passes.length) {
        out.rejected.push({ text: '*', reason: `the model could not be reached: ${lastError.slice(0, 120)}` });
        return out;
    }
    //  The union, in first-seen order. A requirement one pass missed and
    //  another caught is still his — it passes the same two checks below.
    const candidates: Array<{ text: string; quote: string }> = [];
    const candidateSeen = new Set<string>();
    for (const raw of passes) {
        for (const r of parseRequirements(raw)) {
            const key = `${r.text.trim().toLowerCase()}|${r.quote.trim().toLowerCase()}`;
            if (candidateSeen.has(key)) continue;
            candidateSeen.add(key);
            candidates.push(r);
        }
    }
    out.passes = passes.length;

    const seen = new Set<string>();
    for (const r of candidates) {
        //  ⛔ Judged where the TEXT is, not only where the quote is. A model
        //  asked «what did he name» answers with the project itself unless it
        //  is stopped, and «build an online jewelry store» is met by any shop
        //  that exists — a criterion nothing can fail is not a criterion.
        if (!isJudgeable(r.text)) {
            //  Two different refusals, because they are two different mistakes
            //  and he should be told which one his sentence produced.
            out.rejected.push({
                text: r.text,
                reason: IS_AN_INSTRUCTION_TO_JOE.test(r.text.trim())
                    ? 'it is an instruction to me, not something the project must do'
                    : 'it is the thing you asked for, not something it must do',
            });
            continue;
        }
        if (!groundedIn(r.quote, req)) {
            out.rejected.push({ text: r.text, reason: `it is not in his sentence: «${r.quote.slice(0, 60)}»` });
            continue;
        }
        const id = slug(r.quote.trim().toLowerCase());
        if (seen.has(id)) continue;
        seen.add(id);
        out.requirements.push({ id, text: r.text.trim(), quote: r.quote.trim() });
    }
    return out;
}

/* ---------------------------------------------------------------------------
 *  AND THEN: IS EACH ONE REALLY THERE?
 *
 *  Reading what he named is half the repair. The other half is that the
 *  ledger's denominator is now a list nothing in the catalogue can check —
 *  «a booking form» has no marker regex, and it must not be given one, because
 *  the moment it has one we are back to a table of known features under a new
 *  name.
 *
 *  ⛔ SO THE SAME MODEL THAT READ HIS SENTENCE READS THE BUILT SOURCE, and the
 *  verdict it returns is bound the way the requirement was: a `met` must carry
 *  a line that is ACTUALLY IN THE SOURCE. A verdict whose evidence cannot be
 *  found is not a pass with a weak reason — it is downgraded to `unprovable`
 *  and says so. Joe does not award itself the mark, which is the disease this
 *  whole repository has been treating.
 *
 *  And when the model cannot be reached, every line reads `unprovable` — never
 *  `met` (a dead brain that certifies everything) and never `unmet` (a dead
 *  brain that condemns a build it never opened).
 * ------------------------------------------------------------------------- */

export type NamedVerdict = 'met' | 'unmet' | 'unprovable';

export interface JudgedNamed extends NamedRequirement {
    verdict: NamedVerdict;
    /** In his language — and for a `met`, the source line that carries the proof. */
    why: string;
}

/** Whitespace is not evidence; a quote is the same quote however it was wrapped. */
const flat = (s: string) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 *  ⛔ THE EVIDENCE MUST BE IN THE SOURCE, NOT MERELY PLAUSIBLE.
 *
 *  Short strings are refused outright: `div`, `form`, `{}` appear in every
 *  build ever made, so accepting one as proof would be the `filter` defect
 *  again — a token present in every file standing in for a claim.
 */
export function foundInSource(evidence: string, source: string): boolean {
    const e = flat(evidence);
    if (e.length < 12) return false;
    return flat(source).includes(e);
}

/**
 *  ⛔ SIXTY-EIGHT THOUSAND CHARACTERS IN ONE PROMPT.
 *
 *  Measured on a live run, with every repair of the day in the bundle:
 *
 *      read from your request: 5 named — a service list with prices · opening
 *        hours · location · phone CTA · a booking form
 *      the judge could not rule on any of the 5 named — the model returned no
 *        verdict for this item
 *      acceptance denominator: 1 (known-features list — your request was not read)
 *
 *  The reading was perfect and the judging returned nothing, because the prompt
 *  carried the WHOLE built source — `chars=67815` — plus five requirements, and
 *  asked for JSON. `readProjectSource` caps at 600KB, and nothing capped it
 *  again on the way into a model. Any brain short of an enormous one chokes,
 *  returns something unparseable, and every requirement comes back
 *  `unprovable`.
 *
 *  ⛔ AND IT IS MY DESIGN ERROR, of a shape this repository has a name for: an
 *  unbounded input handed to a bounded reader. The catalogue proved features by
 *  pattern and needed no context at all; I replaced it with something that
 *  needs context and never asked how much context there was.
 *
 *  So: ONE requirement per call, over a bounded slice, and the slice says it is
 *  a slice. A judge shown part of a file must be able to answer «I could not
 *  tell» honestly rather than be tricked into guessing.
 */
/**
 *  ⛔ AND 18_000 WAS CHOSEN FOR A SOURCE THREE TIMES THIS SIZE.
 *
 *  It was the right number when the judge was handed the whole project
 *  directory — 99321 characters on the build the owner measured. Now it is
 *  handed `src` with `codeOnly`, which is 33862 on that same build, and a
 *  window of 18000 still cuts it in half for no reason at all.
 *
 *  A cut is not free: it is the difference between «I could not tell» and a
 *  verdict, and the owner watched it block a delivery over three controls he
 *  had just clicked with his own hands.
 *
 *  40000 covers an ordinary Joe project whole — about ten thousand tokens,
 *  which every model in the mesh and the local 7B all carry comfortably, and
 *  the requirements are now judged in ONE call rather than five, so the source
 *  is paid for once. Everything above it still slices, and the slice still
 *  says it is a slice; what changed is that a normal build no longer meets a
 *  knife it did not need.
 */
export const MAX_SOURCE_CHARS = 40_000;

/** The whole source when it fits; otherwise a head and a tail, marked as cut. */
/**
 *  ⛔ A JUDGE SHOWN 27% OF A PROJECT SAID FIVE THINGS WERE ABSENT. ALL FIVE
 *  WERE PRESENT.
 *
 *  Measured on `react-spoke-stem-c66ce8a2`, by grepping the built source rather
 *  than believing the ledger:
 *
 *      full source    = 67522 chars
 *      bounded source = 17936 chars   (27%)
 *      all five requirements                -> present in the source
 *      the judge, shown the bounded slice   -> 0/5, four of them "MISSING"
 *
 *  «The source does not contain any CTA specifically for phone numbers» — while
 *  `<a href={'tel:' + content.contact.phone}>` sat in the part that was cut.
 *
 *  A head-and-tail slice is blind by construction: it keeps the same 27% no
 *  matter what is being asked. So the slice is chosen FOR the question — the
 *  windows of the source where this requirement's own words appear. A question
 *  about a booking form is asked over the parts that mention booking or forms.
 */
const SLICE_WINDOW = 1_400;

/** The content words of a requirement — what to look for in the source. */
function requirementWords(r: NamedRequirement): string[] {
    return (String(r.text || '') + ' ' + String(r.quote || ''))
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(w => w.length > 3 && !/^(?:with|that|this|from|your|have|show|page|site|the|and|for)$/.test(w));
}

/**
 *  Did the source actually contain any of this requirement's own words? When it
 *  did not, no honest verdict of «absent» is available — only «I could not tell
 *  from what I was shown». This is the fact `verifyNamed` enforces with.
 */
export function sliceCoversRequirement(r: NamedRequirement, source: string): boolean {
    const src = String(source || '').toLowerCase();
    return requirementWords(r).some(w => src.includes(w));
}

/** The windows of the source where this requirement's words actually appear. */
export function sliceFor(r: NamedRequirement, source: string, max = MAX_SOURCE_CHARS): string {
    const src = String(source || '');
    if (src.length <= max) return src;
    const low = src.toLowerCase();
    const spans: Array<[number, number]> = [];
    for (const w of requirementWords(r)) {
        let i = low.indexOf(w);
        while (i >= 0 && spans.length < 40) {
            spans.push([Math.max(0, i - SLICE_WINDOW), Math.min(src.length, i + SLICE_WINDOW)]);
            i = low.indexOf(w, i + w.length);
        }
    }
    //  Nothing of his words anywhere: fall back to the old slice rather than
    //  send an empty prompt. The enforcement downstream is what makes this safe.
    if (!spans.length) return boundedSource(src, max);
    spans.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const sp of spans) {
        const last = merged[merged.length - 1];
        if (last && sp[0] <= last[1]) last[1] = Math.max(last[1], sp[1]);
        else merged.push([sp[0], sp[1]]);
    }
    let out = '';
    for (const [a, b] of merged) {
        if (out.length >= max) break;
        out += (out ? '\n\n… …\n\n' : '') + src.slice(a, Math.min(b, a + (max - out.length)));
    }
    return out;
}


export function boundedSource(source: string, max = MAX_SOURCE_CHARS): string {
    const src = String(source || '');
    if (src.length <= max) return src;
    const half = Math.floor((max - 120) / 2);
    return src.slice(0, half)
        + '\n\n\u2026 [' + String(src.length - half * 2) + ' characters of this project are not shown] …\n\n'
        + src.slice(-half);
}

export function verificationPrompt(reqs: NamedRequirement[], source: string, isArabic: boolean): string {
    return [
        `Here is the source of a project that was just built.`,
        ``,
        `SOURCE:`,
        boundedSource(source),
        ``,
        `For each requirement below, decide whether the source really delivers it.`,
        ...reqs.map((r, i) => `  ${i + 1}. [${r.id}] ${r.text}   (he wrote: «${r.quote}»)`),
        ``,
        `Rules:`,
        `  · "met" ONLY if you can copy a line OUT OF THE SOURCE ABOVE that`,
        `    delivers it. Put that line, character for character, in "evidence".`,
        `  · "unmet" if the source does not deliver it.`,
        `  · "unprovable" if you cannot tell from what you were shown. The`,
        `    source above may be CUT — if the part you need is missing, say`,
        `    "unprovable" rather than guessing.`,
        `  · Do not guess a line. A line you cannot find is "unprovable".`,
        `  · Write "why" in ${isArabic ? 'Arabic' : 'English'}, one short sentence.`,
        ``,
        `REPLY WITH JSON AND NOTHING ELSE:`,
        `{"verdicts":[{"id":"…","verdict":"met|unmet|unprovable","evidence":"…","why":"…"}]}`,
    ].join('\n');
}

/**
 *  ⛔ THE MODEL ANSWERED. THIS COULD NOT READ IT.
 *
 *  Measured by hand against a project Joe had really built, printing the raw
 *  bytes instead of assuming them:
 *
 *      prompt chars = 18730 · answered in 2238ms · raw length 157
 *
 *      { "req-a": { "met": false, "evidence": "",
 *                   "why": "The source does not contain any form elements…" } }
 *
 *      --- parsed verdicts ---  []
 *
 *  A correct, useful verdict in two seconds — and Joe then told the owner «the
 *  model returned no verdict for this item», which was **false**.
 *
 *  The brief asks for `{"verdicts":[{id, verdict, …}]}`. The model returned a
 *  dictionary keyed by the id, with a boolean `met` instead of a string
 *  `verdict`. That is a perfectly reasonable shape — arguably the natural one
 *  when the question is about a single requirement — and this function admitted
 *  exactly one shape and nothing else.
 *
 *  ⛔ THE CLASS, for the seventh time in one day: a reader that accepts one
 *  form, a producer that emits another reasonable form, and nothing forcing
 *  them to agree. The same defect as the second writer who never got the rule —
 *  here the two parties are the brief and the model.
 *
 *  And it cost two wrong diagnoses before it was measured. The source was
 *  bounded from 88k to 18k and five requirements were split into five calls;
 *  **neither was the cause**. Both were real improvements, and neither cured
 *  what it was credited with.
 *
 *  So: read what models actually produce. Widening the READER admits no claim
 *  the guards would have rejected — a `met` still has to carry evidence that
 *  `verifyNamed` can find in the source, or it is downgraded exactly as before.
 *  This is about hearing the answer, never about believing it.
 */
const asVerdict = (v: any, fallbackId: string) => {
    //  `verdict: "met"` and `met: true` are the same statement. A boolean is
    //  what a model reaches for when the question is yes-or-no, and refusing
    //  to understand it is not strictness, it is deafness.
    const spoken = String(v?.verdict ?? '').trim().toLowerCase();
    const verdict = spoken || (typeof v?.met === 'boolean' ? (v.met ? 'met' : 'unmet') : '');
    return {
        id: String(v?.id ?? fallbackId ?? ''),
        verdict,
        evidence: String(v?.evidence ?? v?.proof ?? v?.line ?? ''),
        why: String(v?.why ?? v?.reason ?? v?.explanation ?? ''),
    };
};

export function parseVerdicts(raw: string): Array<{ id: string; verdict: string; evidence: string; why: string }> {
    const text = String(raw || '');
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    for (const c of [fenced ? fenced[1] : '', text]) {
        const start = c.indexOf('{');
        const end = c.lastIndexOf('}');
        if (start < 0 || end <= start) continue;
        let parsed: any;
        try { parsed = JSON.parse(c.slice(start, end + 1)); } catch { continue; }
        if (!parsed || typeof parsed !== 'object') continue;

        //  1. the shape the brief asks for
        const list = Array.isArray(parsed.verdicts) ? parsed.verdicts
            : Array.isArray(parsed.results) ? parsed.results
                : null;
        if (list) {
            const out = list.filter((v: any) => v && typeof v === 'object').map((v: any) => asVerdict(v, ''));
            if (out.length) return out;
        }

        //  2. one verdict, unwrapped — the natural answer to a single question
        if ('verdict' in parsed || 'met' in parsed) return [asVerdict(parsed, '')];

        //  3. a dictionary keyed by the requirement id — what was actually
        //     measured coming back from the keyless mesh
        const entries = Object.entries(parsed)
            .filter(([, v]) => v && typeof v === 'object' && ('verdict' in (v as any) || 'met' in (v as any)));
        if (entries.length) return entries.map(([k, v]) => asVerdict(v, k));
    }
    return [];
}

/**
 *  ⛔ THREE DIFFERENT CAUSES MUST NOT SHARE ONE SENTENCE.
 *
 *  This was a single string — «I did not inspect it — I could not read the
 *  source» — returned for a blank source, for a model that returned no verdict
 *  on an item, and for a model that returned a verdict with no reason. Only the
 *  first is about the source.
 *
 *  Measured live on `c9f0506b`: every criterion came back with that sentence,
 *  and the diagnosis that followed reasonably read the project source as
 *  unextractable — when the likelier truth on a keyless mesh is that the model
 *  never ruled on those items at all. **A report that misidentifies its own
 *  cause sends the next hour in the wrong direction**, and this file spends its
 *  whole length insisting that a verdict name what actually happened.
 */
const NO_SOURCE = (isArabic: boolean) => isArabic
    ? 'لم أفحصه — لم أستطع قراءة مصدر المشروع'
    : 'I did not inspect it — I could not read the project source';

const NO_VERDICT = (isArabic: boolean) => isArabic
    ? 'لم أفحصه — لم يُصدر النموذج حكماً على هذا البند'
    : 'I did not inspect it — the model returned no verdict for this item';

const CANNOT_TELL = (isArabic: boolean) => isArabic
    ? 'لم أستطع الجزم من المصدر الذي قرأته'
    : 'I could not tell from the source I read';

/**
 *  ⛔ DID THE JUDGE JUDGE AT ALL?
 *
 *  Not «did anything pass» — «was a single verdict actually reached». One real
 *  `unmet` means the source was read and something was missing, which must
 *  block. Everything `unprovable` means nobody looked, which must not.
 */
export function nothingWasJudged(judged: JudgedNamed[]): boolean {
    return judged.length > 0 && judged.every(j => j.verdict === 'unprovable');
}

export async function verifyNamed(
    reqs: NamedRequirement[],
    source: string,
    isArabic: boolean,
    call: (prompt: string) => Promise<string>,
): Promise<JudgedNamed[]> {
    const src = String(source || '');
    const blank = (why: string): JudgedNamed[] =>
        reqs.map(r => ({ ...r, verdict: 'unprovable' as NamedVerdict, why }));
    if (!reqs.length) return [];
    if (!src.trim()) return blank(NO_SOURCE(isArabic));

    /**
     *  ⛔ ONE AT A TIME. Five requirements and a whole project in one prompt is
     *  a single point of failure for the entire ledger: one malformed answer
     *  and every line reads `unprovable`, which is exactly what was measured.
     *  Asked separately, a brain that can answer three of five DOES, and the
     *  two it cannot are honestly marked instead of taking the other three
     *  down with them.
     */
    const full = src;
    const shownFor = new Map<string, string>();
    for (const r of reqs) shownFor.set(r.id, sliceFor(r, src));

    /**
     *  ⛔ ONE CALL FIRST, BECAUSE THE COMMENT ABOVE WAS RIGHT AND WAS MEASURED
     *  UNDER A CONSTRAINT THAT NO LONGER HOLDS.
     *
     *  Asking separately IS more robust, and that reasoning stands. What it
     *  assumed is that a call is available. Measured on the owner's machine,
     *  against the free mesh he actually runs on:
     *
     *      READ:   5 named                                (2 calls)
     *      [LLM7] rate-limited (429). Cooling down 59s
     *      Pollinations Chat Failed: 402 … 429
     *      VERIFY: 5 verdicts in 33553ms   blind=true
     *        [unprovable] a hero with the dish name — the model returned no verdict
     *        [unprovable] an ingredients list      — the model returned no verdict
     *        … all five
     *
     *  **Five separate calls on a mesh that allows two.** So the isolation
     *  bought nothing and cost everything: the ledger fell back to the
     *  known-features list, and what he saw was «your request was not read» —
     *  about a request that had been read perfectly, five out of five, in
     *  under two seconds.
     *
     *  So: one call for all of them, and the per-requirement road kept for
     *  EXACTLY the ones that call did not answer. In the common case that is
     *  one call instead of five; in the worst case it is what it always was,
     *  plus one. Nothing about the isolation is given up — a batch that comes
     *  back malformed simply answers nobody, and every requirement takes the
     *  old road.
     *
     *  Cross-attribution stays impossible: only a verdict whose id names a
     *  requirement in THIS batch is accepted, which is the same rule the
     *  single-requirement path enforces below.
     */
    const fromBatch = new Map<string, { id: string; verdict: string; evidence: string; why: string }>();
    let batchError = '';
    if (reqs.length > 1) {
        try {
            const raw = await call(verificationPrompt(reqs, src, isArabic));
            for (const v of parseVerdicts(raw)) {
                if (v.id && reqs.some(r => r.id === v.id)) fromBatch.set(v.id, v);
            }
        } catch (e: any) {
            batchError = String(e && e.message || e);
        }
    }

    const stillUnanswered = reqs.filter(r => !fromBatch.has(r.id));
    const answers = await Promise.all(stillUnanswered.map(async r => {
        try { return { id: r.id, raw: await call(verificationPrompt([r], src, isArabic)) }; }
        catch (e: any) { return { id: r.id, raw: '', error: String(e && e.message || e) }; }
    }));
    /**
     *  A brain that cannot be reached certifies nothing and condemns nothing.
     *  «Not one call got through» is a different fact from «it answered and
     *  could not tell», and only the first is about the provider — so it is
     *  reported as the provider's, with the provider's own words.
     */
    if (!fromBatch.size && !answers.some(a => !a.error)) {
        //  `batchError` first: it is the earliest thing that failed and so the
        //  closest to the cause. Falling back to the per-requirement error
        //  keeps the old message when batching was skipped for a single item.
        const why = String(batchError || answers[0]?.error || 'unknown').slice(0, 80);
        return blank(isArabic
            ? `لم أفحصه — تعذّر الوصول إلى النموذج: ${why}`
            : `I did not inspect it — the model could not be reached: ${why}`);
    }

    const byId = new Map<string, { id: string; verdict: string; evidence: string; why: string }>();
    //  What the one call answered. Everything below it — the evidence check,
    //  the cut-detection, the id matching — applies identically, because a
    //  verdict is judged by what it CLAIMS, never by which call carried it.
    for (const [id, v] of fromBatch) byId.set(id, { ...v, id });
    for (const a of answers) {
        const parsed = parseVerdicts(a.raw);
        /**
         *  ⛔ A VERDICT LABELLED WITH A DIFFERENT ID IS NOT AN ANSWER TO THIS
         *  QUESTION.
         *
         *  Each call asks about ONE requirement, so the natural reading is «the
         *  answer belongs to what I asked». It does not, always: a model can
         *  echo an id from the brief, or answer about a neighbour. Accepting it
         *  anyway means one requirement's verdict is silently reported as
         *  another's — the ledger stays full and starts lying about WHICH thing
         *  was proven, which is worse than an empty line.
         *
         *  So: the one that names this requirement, or the single unlabelled
         *  one, or nothing.
         */
        const named = parsed.find(v => v.id === a.id);
        const lone = parsed.length === 1 && !parsed[0].id ? parsed[0] : undefined;
        const answer = named || lone;
        if (answer) byId.set(a.id, { ...answer, id: a.id });
    }
    return reqs.map(r => {
        const src = shownFor.get(r.id) || full;
        const v = byId.get(r.id);
        if (!v) return { ...r, verdict: 'unprovable' as NamedVerdict, why: NO_VERDICT(isArabic) };
        const why = v.why.trim().slice(0, 200);
        if (v.verdict === 'met') {
            //  ⛔ The one branch where a lie is expensive — so it is the one
            //  branch checked against the source instead of believed.
            if (!foundInSource(v.evidence, src)) {
                return {
                    ...r,
                    verdict: 'unprovable' as NamedVerdict,
                    why: isArabic
                        ? 'قال إنّه موجود ولم أجد شاهده في المصدر — فلم أحتسبه'
                        : 'it was reported present and its evidence is not in the source — so I did not count it',
                };
            }
            return {
                ...r,
                verdict: 'met' as NamedVerdict,
                why: why || (isArabic ? 'موجود في المصدر' : 'present in the source'),
            };
        }
        if (v.verdict === 'unmet') {
            /**
             *  ⛔ AN ABSENCE NOBODY COULD SEE IS NOT AN ABSENCE.
             *
             *  Measured on `react-spoke-stem-c66ce8a2`: five requirements, ALL
             *  FIVE present in a 67522-character source, all five judged
             *  against 17936 characters of it — and four came back «MISSING»
             *  with confident, specific reasons. «The source does not contain
             *  any CTA specifically for phone numbers», while
             *  `<a href={'tel:' + content.contact.phone}>` sat in the part that
             *  had been cut away.
             *
             *  ⛔ AND THE BRIEF ALREADY SAID NOT TO. It says «the source above
             *  may be CUT — if the part you need is missing, say unprovable
             *  rather than guessing». The model did not obey. **An instruction
             *  is not an enforcement** — this file spent a whole day proving
             *  that a claim must be checked rather than trusted, and then
             *  leaned on a sentence in a prompt to hold the line.
             *
             *  A false NEGATIVE is worse than a false positive here: it sends
             *  whoever reads it hunting a builder defect that does not exist.
             *  It sent me, and I published `0/5` about a build that had all
             *  five before I checked it myself.
             *
             *  So it is enforced in code. If none of this requirement's own
             *  words appear anywhere in what the judge was actually shown,
             *  «not found» is not a finding — it is the cut talking.
             */
            if (src.length < full.length && !sliceCoversRequirement(r, src)) {
                return {
                    ...r,
                    verdict: 'unprovable' as NamedVerdict,
                    why: isArabic
                        ? 'قال إنّه غير موجود، ولم يصله الجزء الذي يخصّه من المصدر — فلم أحتسب النفي'
                        : 'it was reported absent, and the part of the source that concerns it was never shown — so I did not count the absence',
                };
            }
            return {
                ...r,
                verdict: 'unmet' as NamedVerdict,
                why: why || (isArabic ? 'لم أجده في المصدر' : 'not found in the source'),
            };
        }
        return { ...r, verdict: 'unprovable' as NamedVerdict, why: why || CANNOT_TELL(isArabic) };
    });
}
