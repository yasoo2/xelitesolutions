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
//  ⛔ `` READS ASCII, SO IT NEVER SAW THE ARABIC VERB.
//  This shipped ending in `)/i` and let «اعمل متجر مجوهرات فاخر» straight
//  through: JavaScript defines a word boundary on `\w` — ASCII letters,
//  digits, underscore — so between «ل» and a space there is no transition to
//  find. English matched and Arabic did not. It is this repository’s oldest
//  defect in a new place: a pattern that reads letters instead of words.
//  The guard caught it only because it was written from HIS logs, in both
//  languages. A lookahead asks the question directly.
const OPENS_WITH_THE_ASKING = /^(?:please\s+)?(?:build|make|create|develop|design|generate|write|اعمل|ابن|انشئ|أنشئ|صمم|اصنع|اكتب|بدي|اريد|أريد)(?=\s|$)/iu;

/**
 *  A requirement must be a thing the build can FAIL to deliver. This refuses
 *  the two shapes that cannot fail: the act of asking, and a bare fragment
 *  with no content word of its own.
 */
export function isJudgeable(text: string): boolean {
    const t = String(text || '').trim();
    if (t.length < 3) return false;
    if (OPENS_WITH_THE_ASKING.test(t)) return false;
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
export async function namedRequirements(
    request: string,
    isArabic: boolean,
    call: (prompt: string) => Promise<string>,
): Promise<ExtractionResult> {
    const out: ExtractionResult = { requirements: [], rejected: [] };
    const req = String(request || '').trim();
    if (!req) return out;

    let raw = '';
    try {
        raw = await call(extractionPrompt(req, isArabic));
    } catch (e: any) {
        out.rejected.push({ text: '*', reason: `the model could not be reached: ${String(e && e.message || e).slice(0, 120)}` });
        return out;
    }

    const seen = new Set<string>();
    for (const r of parseRequirements(raw)) {
        //  ⛔ Judged where the TEXT is, not only where the quote is. A model
        //  asked «what did he name» answers with the project itself unless it
        //  is stopped, and «build an online jewelry store» is met by any shop
        //  that exists — a criterion nothing can fail is not a criterion.
        if (!isJudgeable(r.text)) {
            out.rejected.push({ text: r.text, reason: 'it is the thing you asked for, not something it must do' });
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

export function verificationPrompt(reqs: NamedRequirement[], source: string, isArabic: boolean): string {
    return [
        `Here is the source of a project that was just built.`,
        ``,
        `SOURCE:`,
        source,
        ``,
        `For each requirement below, decide whether the source really delivers it.`,
        ...reqs.map((r, i) => `  ${i + 1}. [${r.id}] ${r.text}   (he wrote: «${r.quote}»)`),
        ``,
        `Rules:`,
        `  · "met" ONLY if you can copy a line OUT OF THE SOURCE ABOVE that`,
        `    delivers it. Put that line, character for character, in "evidence".`,
        `  · "unmet" if the source does not deliver it.`,
        `  · "unprovable" if you cannot tell from what you were shown.`,
        `  · Do not guess a line. A line you cannot find is "unprovable".`,
        `  · Write "why" in ${isArabic ? 'Arabic' : 'English'}, one short sentence.`,
        ``,
        `REPLY WITH JSON AND NOTHING ELSE:`,
        `{"verdicts":[{"id":"…","verdict":"met|unmet|unprovable","evidence":"…","why":"…"}]}`,
    ].join('\n');
}

export function parseVerdicts(raw: string): Array<{ id: string; verdict: string; evidence: string; why: string }> {
    const text = String(raw || '');
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    for (const c of [fenced ? fenced[1] : '', text]) {
        const start = c.indexOf('{');
        const end = c.lastIndexOf('}');
        if (start < 0 || end <= start) continue;
        try {
            const parsed = JSON.parse(c.slice(start, end + 1));
            if (Array.isArray(parsed?.verdicts)) {
                return parsed.verdicts
                    .filter((v: any) => v && typeof v === 'object')
                    .map((v: any) => ({
                        id: String(v.id ?? ''),
                        verdict: String(v.verdict ?? ''),
                        evidence: String(v.evidence ?? ''),
                        why: String(v.why ?? ''),
                    }));
            }
        } catch { /* try the next candidate */ }
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

    let raw = '';
    try {
        raw = await call(verificationPrompt(reqs, src, isArabic));
    } catch (e: any) {
        //  A brain that cannot be reached certifies nothing and condemns
        //  nothing. Anything else here is a verdict about a build nobody read.
        return blank(isArabic
            ? `لم أفحصه — تعذّر الوصول إلى النموذج: ${String(e && e.message || e).slice(0, 80)}`
            : `I did not inspect it — the model could not be reached: ${String(e && e.message || e).slice(0, 80)}`);
    }

    const byId = new Map(parseVerdicts(raw).map(v => [v.id, v]));
    return reqs.map(r => {
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
            return {
                ...r,
                verdict: 'unmet' as NamedVerdict,
                why: why || (isArabic ? 'لم أجده في المصدر' : 'not found in the source'),
            };
        }
        return { ...r, verdict: 'unprovable' as NamedVerdict, why: why || CANNOT_TELL(isArabic) };
    });
}
