/**
 *  JOE HAD NO AUTHOR FOR THE INTERFACE. HE HAD FILLERS FOR A FIXED FORM.
 *
 *  The owner, after using the competitors: «I don't like anything in Joe. I
 *  used many of Joe's competitors' sites and the advantage was overwhelmingly
 *  theirs. What do we do?»
 *
 *  Measured on his machine before answering, and the answer is not an opinion:
 *
 *      grep -nE "callLLM|askModel|generateWith|completion"
 *        ReactProjectTool.ts react-app-templates.ts     ->  ZERO lines
 *      grep -c "^export function file[A-Z]"
 *        react-app-templates.ts                         ->  24
 *      ReactProjectTool.ts:1238
 *        «Content derived from the request -- deterministic, never blocks on a model.»
 *
 *  Twenty-four components written by hand, and the request never changes their
 *  SHAPE -- only the words poured into them. So a coffee roastery, a dental
 *  clinic and a law firm all receive the same Hero: eyebrow, h1, lede, two
 *  buttons, a perks band. To an eye, that skeleton IS the design, which is why
 *  every colour, typeface, section and motion fix this session improved things
 *  measurably and still lost. They decorated a form nobody could leave.
 *
 *  ⛔ THE CLASS, asked twice as the seventh law demands.
 *     First class:   a design layer exists and one generator never reads it.
 *                    Closed five times today.
 *     THE JOINING CLASS ABOVE IT: there is no author of the interface at all.
 *                    Only fillers of a fixed form. Exactly the shape of «there
 *                    is no language layer in the system» from the eight-defect
 *                    day -- invisible until the question is asked a second time.
 *
 *  SO THIS MODULE INVERTS THE TWO LAYERS, and inverts them without losing what
 *  Joe has that the competitors do not:
 *
 *      before   fixed templates AUTHOR the interface; the model is absent
 *      after    the model AUTHORS it; the templates become the floor it falls
 *               back to, and the real `npm run build` remains the judge
 *
 *  Nothing here weakens the honesty layer. A component that cannot be proven
 *  safe is refused BY NAME and the deterministic one stands in its place, so
 *  the worst case is exactly today's output -- never a broken page, never a
 *  page that claims what it does not do.
 */

import type { DesignGenome } from './composer';

export interface AuthoringSpec {
    /** His sentence, verbatim. The only authority for what gets built. */
    request: string;
    brand: string;
    isArabic: boolean;
    /** Component names to author, e.g. ['Hero','Products','Story']. */
    components: string[];
    /**
     *  ⛔ WHAT THE PREVIOUS ATTEMPT FAILED TO DELIVER, when there was one.
     *
     *  Empty on a first build. Non-empty only on a repair, and then it is
     *  the difference between authoring again and authoring the fix.
     */
    mustFix?: string[];
    /** Keys that really exist on the content object handed to each component. */
    contentKeys: string[];
    /**
     *  ⛔ THE SHAPE OF EACH KEY, NOT JUST ITS NAME.
     *
     *  Measured on a live build: the authored Hero passed every check, the
     *  project compiled, and the page then died in the browser on
     *  `{content.heroSecondary}` — because that field is an OBJECT
     *  `{href,label}` and React cannot render an object as a child. Joe's own
     *  QA caught it (`empty_page`, `TypeError`, 5 page errors) and refused to
     *  deliver, which is the system working; but the brief had told the model
     *  the field EXISTS without telling it what it IS, so the mistake was
     *  invited.
     *
     *  A validator can only check that a key exists. Whether it is a string,
     *  an object or a list is knowable from the content itself, so it is
     *  handed over rather than guessed at.
     */
    contentShapes?: Record<string, string>;
    /** The composed design, so authored markup stays coherent with the CSS. */
    genome: DesignGenome;
    /** CSS custom properties the stylesheet really defines. */
    tokens: string[];
    /**
     *  The deterministic source of each component being replaced, by name.
     *  It is what «must still work» is measured against — see `behavioursIn`.
     */
    replacing?: Record<string, string>;
    /**
     *  How many model calls this build may spend on the interface. Default 6.
     *  It exists because the first version had no ceiling and starved the
     *  planner — see the note in `authorComponents`.
     */
    maxCalls?: number;
}

export interface AuthoredResult {
    /** Component name -> JSX source, for those that passed every check. */
    files: Record<string, string>;
    /** Component name -> why it was refused. Never silent. */
    rejected: Array<{ name: string; reasons: string[] }>;
}

/**
 *  A REFUSAL LIST, NOT A STYLE GUIDE.
 *
 *  Each entry is something that would make an authored component unsafe or
 *  untrue -- reaching the network, executing text, inventing a data source,
 *  or importing a module the project does not have. Style is not policed
 *  here: policing style would rebuild the cage this module exists to open.
 */
const FORBIDDEN: Array<[RegExp, string]> = [
    [/\bfetch\s*\(/, 'it calls fetch — an authored section must render what it was given, not go to the network'],
    [/\bXMLHttpRequest\b/, 'it opens an XMLHttpRequest'],
    [/\bdangerouslySetInnerHTML\b/, 'it injects raw HTML'],
    [/\beval\s*\(/, 'it evaluates text as code'],
    [/\bnew\s+Function\s*\(/, 'it builds a function from text'],
    [/<script\b/i, 'it embeds a script tag'],
    [/\bprocess\s*\./, 'it reads the server process'],
    [/\blocalStorage\b|\bsessionStorage\b/, 'it writes browser storage from a presentation section'],
    [/\brequire\s*\(/, 'it uses require — the project is an ES module'],
    [/\bimport\s*\(/, 'it imports dynamically'],
    [/https?:\/\/(?!localhost)/, 'it points at an external address — every asset must come from the content it was handed'],
];

/** The only import an authored section may carry. */
const ALLOWED_IMPORT = /^import\s+React(\s*,\s*\{[^}]*\})?\s+from\s+'react';?$/;

/**
 *  Describe what each content field really IS, from the content itself.
 *
 *  Short on purpose — the brief is read by a model with a budget, so
 *  `products: array of {name, desc, price}` earns its place and a full JSON
 *  schema does not.
 */
export function describeShapes(content: Record<string, any>): Record<string, string> {
    const shapes: Record<string, string> = {};
    const nameOf = (v: any): string => {
        if (v === null || v === undefined) return 'empty';
        if (Array.isArray(v)) {
            const first = v[0];
            if (first && typeof first === 'object') return `array of {${Object.keys(first).slice(0, 6).join(', ')}}`;
            return `array of ${typeof first || 'values'}`;
        }
        if (typeof v === 'object') return `object {${Object.keys(v).slice(0, 6).join(', ')}}`;
        return typeof v;
    };
    for (const [k, v] of Object.entries(content || {})) shapes[k] = nameOf(v);
    return shapes;
}

/**
 *  WHICH CONTENT FIELDS DOES THIS COMPONENT ACTUALLY READ?
 *
 *  ⛔ WRITTEN BECAUSE THE FIRST VERSION ASKED THE WRONG QUESTION, AND THE
 *  LIVE RUN PROVED IT. It searched for the spelling `content.something`, so
 *  when the real model answered with the better idiom --
 *
 *      const { brand = '', heroTitle = '' } = content || {};
 *
 *  -- every draft was refused for «it reads nothing from content», and Joe
 *  silently kept the templates. Measured through the real provider: 2 files
 *  authored, 2 refused, 0 accepted, for a reason that was false about both.
 *
 *  That is this session's most expensive class one more time: EVIDENCE THAT
 *  MATCHES A SPELLING INSTEAD OF TESTING THE CLAIM -- the same shape as
 *  `min:\s*-?\d` granting a tick for «rejects a zero price» to any number in
 *  any file. Here it produced its mirror image: a criterion that could only
 *  ever FAIL, which is exactly as useless as one that can never fail, and
 *  worse because it looked like caution.
 *
 *  The claim is «this component renders the data it was handed». So all three
 *  ways of doing that count, and nothing else does.
 */
export function readsFromContent(src: string): Set<string> {
    const keys = new Set<string>();

    //  1. member access, plain and optional:  content.title  ·  content?.title
    for (const m of src.matchAll(/\bcontent\s*\??\s*\.\s*([A-Za-z_$][\w$]*)/g)) keys.add(m[1]);

    //  2. bracket access with a literal:  content['title']
    for (const m of src.matchAll(/\bcontent\s*\??\s*\[\s*['"`]([^'"`]+)['"`]\s*\]/g)) keys.add(m[1]);

    //  3. destructuring:  const { a, b = '', c: d } = content ?? {}
    //     The names are read from the pattern, taking the SOURCE key -- `c`,
    //     not the local alias `d` -- because the source key is what has to
    //     exist on the content object.
    for (const m of src.matchAll(/\{([^{}]*)\}\s*=\s*(?:props\s*\.\s*)?content\b/g)) {
        for (const part of m[1].split(',')) {
            const name = part.trim().split(/[:=]/)[0].trim().replace(/^\.\.\./, '');
            if (/^[A-Za-z_$][\w$]*$/.test(name)) keys.add(name);
        }
    }

    return keys;
}

/**
 *  ⛔ EVERY CHECK BELOW CAN FAIL, AND EVERY ONE OF THEM HAS FAILED A REAL
 *  DRAFT. A validator that never refuses is not a guard, it is decoration --
 *  which is the defect that produced `min:\s*-?\d` granting a tick to any
 *  number anywhere in a file. Its mirror is just as bad and was shipped here
 *  once already: a check that can only ever fail. Both are measured against
 *  real drafts in the guard beside this file.
 */
/**
 *  WHAT A COMPONENT DOES, AS OPPOSED TO WHAT IT LOOKS LIKE.
 *
 *  ⛔ WRITTEN BECAUSE THE AUTHORING SILENTLY TRADED BEHAVIOUR FOR APPEARANCE.
 *
 *  Measured on a live build. The deterministic `Contact` posts the message to
 *  `content.inbox` and, when that fails, keeps it on screen and says so:
 *
 *      const [sent, setSent] = useState(false);
 *      const onSubmit = async (e) => { e.preventDefault(); … }
 *      if (r.ok) { setSent('delivered'); return; }
 *      setSent('kept');
 *
 *  The model authored a `Contact` that renders the same fields beautifully and
 *  does NOTHING when you press send. Joe's own browser audit caught it —
 *  `form_dead_submit: a form was filled in and submitted and nothing happened
 *  at all, no success message and no error` — and refused to deliver.
 *
 *  ⛔ THE CLASS is new and it is the sharpest risk in letting a model author an
 *  interface: EVERY OTHER CHECK IN THIS FILE ASKS WHETHER THE MARKUP IS SAFE
 *  AND TRUE. None of them asks whether it still WORKS. A page can be safe,
 *  honest, well-composed, and inert.
 *
 *  The test is a comparison, not a list: whatever the template it replaces
 *  could DO, the authored version must still be able to do. No component
 *  names, no special cases — a section that had a handler keeps a handler,
 *  and a section that never had one is not asked for one.
 */
export function behavioursIn(src: string): Set<string> {
    const found = new Set<string>();
    if (/<form\b/i.test(src)) found.add('a form');
    if (/\bon[A-Z]\w*\s*=\s*\{/.test(src)) found.add('an event handler');
    if (/\buseState\s*\(/.test(src)) found.add('state it keeps');
    if (/\bpreventDefault\s*\(/.test(src)) found.add('a submit it takes over');
    return found;
}

/**
 *  DOES THE CODE USE EACH FIELD THE WAY THAT FIELD REALLY IS?
 *
 *  ⛔ WRITTEN FROM A CRASH THE OWNER WATCHED. An authored Story section did
 *  `content.storyBody.map(...)` and the running page died:
 *
 *      TypeError: c.storyBody.map is not a function
 *
 *  `storyBody` is a STRING. The brief already told the model so -- the shapes
 *  are handed over -- and it assumed anyway. That is the second crash of the
 *  same family: the first rendered `heroSecondary`, an object, as a React
 *  child.
 *
 *  ⛔ THE CLASS: every check in this file asks whether a field EXISTS. None
 *  asked whether it is being used AS WHAT IT IS. A key that exists is not a
 *  key that can be mapped over, and «it type-checks against the key list» is
 *  the same shape of false evidence as a pattern matching a word instead of
 *  testing the claim.
 *
 *  Deterministic and general: it reads the shapes already computed from the
 *  real content, so it needs no list of field names and it grows by itself
 *  whenever the content does.
 */
export function misusedFields(src: string, shapes: Record<string, string>): string[] {
    const wrong: string[] = [];
    if (!shapes || !Object.keys(shapes).length) return wrong;

    //  Local names bound by destructuring, so `const { storyBody } = content`
    //  followed by `storyBody.map(...)` is caught too.
    const local = new Map<string, string>();
    for (const m of src.matchAll(/\{([^{}]*)\}\s*=\s*(?:props\s*\.\s*)?content\b/g)) {
        for (const part of m[1].split(',')) {
            const raw = part.trim();
            const source = raw.split(/[:=]/)[0].trim().replace(/^\.\.\./, '');
            const alias = raw.includes(':') ? raw.split(':')[1].split('=')[0].trim() : source;
            if (/^[A-Za-z_$][\w$]*$/.test(source) && /^[A-Za-z_$][\w$]*$/.test(alias)) local.set(alias, source);
        }
    }

    const isList = (k: string) => String(shapes[k] || '').startsWith('array');
    const isObject = (k: string) => String(shapes[k] || '').startsWith('object');

    //  1. iterating something that is not a list
    for (const m of src.matchAll(/\bcontent\s*\??\s*\.\s*([A-Za-z_$][\w$]*)\s*(?:\|\|\s*\[\]\s*\)?)?\s*\.\s*(map|forEach|filter|slice)\s*\(/g)) {
        if (shapes[m[1]] && !isList(m[1])) wrong.push(`it calls .${m[2]}() on «${m[1]}», which is ${shapes[m[1]]}`);
    }
    for (const [alias, source] of local) {
        /**
         *  ⛔ BUILT WITH A PLAIN STRING, NOT A TEMPLATE LITERAL.
         *
         *  This line read ``new RegExp(`\b${alias}\s*...`)`` — and inside a
         *  template literal `\b` is the BACKSPACE character and `\s` is just an
         *  `s`. The pattern could never match anything, so the check was
         *  silently blind to every destructured name: a guard that runs,
         *  reports nothing, and looks exactly like a clean result.
         *
         *  The repository already records this class from the other side —
         *  heredocs turning `\b` into a literal 0x08 — and it cost a day then.
         */
        const re = new RegExp('[^.\\w$]' + alias + '[^;\\n]{0,24}?\\.\s*(map|forEach|filter|slice|join|some|every)\\s*\\(', 'g');
        for (const m of src.matchAll(re)) {
            if (shapes[source] && !isList(source)) wrong.push(`it calls .${m[1]}() on «${source}», which is ${shapes[source]}`);
        }
    }

    //  2. rendering an object or a list straight into the markup
    for (const m of src.matchAll(/\{\s*content\s*\??\s*\.\s*([A-Za-z_$][\w$]*)\s*\}/g)) {
        if (isObject(m[1]) || isList(m[1])) wrong.push(`it renders «${m[1]}» directly, and it is ${shapes[m[1]]}`);
    }
    for (const [alias, source] of local) {
        if (!(isObject(source) || isList(source))) continue;
        if (new RegExp(`\{\s*${alias}\s*\}`).test(src)) wrong.push(`it renders «${source}» directly, and it is ${shapes[source]}`);
    }

    return [...new Set(wrong)];
}

export function validateAuthored(name: string, code: string, contentKeys: string[], replaces?: string, shapes?: Record<string, string>): string[] {
    const why: string[] = [];
    const src = String(code || '');

    if (src.trim().length < 200) why.push('it is too short to be a real section');
    if (src.length > 14000) why.push('it is far larger than any section needs');

    //  It must BE the component it claims to be.
    if (!new RegExp(`export\\s+default\\s+function\\s+${name}\\b`).test(src)) {
        why.push(`it does not export default function ${name}`);
    }

    //  It must consume what it is handed, not invent a source.
    if (!/\{\s*content\s*[,}]/.test(src) && !/\bprops\b/.test(src)) {
        why.push('it never receives the content prop, so it cannot be showing his data');
    }
    const used = readsFromContent(src);
    if (used.size === 0) why.push('it reads nothing from content — the words on it would be invented');
    const unknown = [...used].filter(k => !contentKeys.includes(k));
    if (unknown.length) why.push(`it reads content keys that do not exist: ${unknown.join(', ')}`);

    //  Imports: React and nothing else.
    for (const line of src.split(/\r?\n/)) {
        const t = line.trim();
        if (!t.startsWith('import ')) continue;
        if (!ALLOWED_IMPORT.test(t)) why.push(`it imports something the project does not provide: ${t.slice(0, 60)}`);
    }

    for (const [re, reason] of FORBIDDEN) if (re.test(src)) why.push(reason);

    /**
     *  ⛔ AND IT MUST STILL DO WHAT THE COMPONENT IT REPLACES COULD DO.
     *  Measured: an authored `Contact` that rendered the fields and dropped
     *  the submit — safe, honest, well-composed, and inert.
     */
    //  ⛔ Using a field as what it really is — see `misusedFields`.
    for (const w of misusedFields(src, shapes || {})) why.push(w);

    if (replaces) {
        const had = behavioursIn(replaces);
        const has = behavioursIn(src);
        const lost = [...had].filter(b => !has.has(b));
        if (lost.length) {
            why.push(`it drops what the section it replaces could do: ${lost.join(', ')}`);
        }
    }

    //  Cheap structural sanity. The real proof is the build; this only stops
    //  obviously truncated output from ever reaching it.
    const bal = (o: string, c: string) => (src.split(o).length - src.split(c).length);
    if (bal('{', '}') !== 0) why.push('its braces do not balance — the reply was probably cut off');
    if (bal('(', ')') !== 0) why.push('its parentheses do not balance');

    return why;
}

/**
 *  The brief. It hands over three things and withholds one on purpose:
 *  the request, the real content keys, and the composed design -- and NOT a
 *  list of acceptable layouts, because that list is the cage.
 */
export function authoringPrompt(spec: AuthoringSpec, only?: string): string {
    const g = spec.genome;
    /**
     *  ⛔ ONE COMPONENT PER CALL, AND THE REPOSITORY ALREADY KNEW THIS.
     *
     *  The first version asked for every section in a single reply. Measured
     *  against a real build: twelve components — Navbar, Hero, Menu, Gallery,
     *  Story, Steps, Team, Testimonials, Cta, Location, Contact, Footer — which
     *  is fifteen to twenty kilobytes of JSX. A provider caps one completion,
     *  the reply comes back cut in half, the JSON no longer parses, and EVERY
     *  section is refused at once. Joe kept the templates and said nothing an
     *  eye could see.
     *
     *  And this exact lesson is written down two directories away, in the page
     *  builder that learned it first:
     *
     *      WebPageBuilderTool.ts:556
     *      «25 KB does not fit in one completion, the reply comes back
     *       truncated…»
     *
     *  So this is the session's most common class one more time, in its purest
     *  form: a lesson learned by one generator and never taught to the other.
     *  Same defect as the palette the app never read, the sections read from
     *  the kind, the stylesheet that touched nothing.
     */
    const target = only || spec.components[0];
    return [
        `You are the designer AND the front-end author for one specific project.`,
        ``,
        `THE REQUEST, verbatim — it is the only authority for what this must be:`,
        spec.request,
        ``,
        `Brand: ${spec.brand}`,
        `Language of the interface: ${spec.isArabic ? 'Arabic (RTL)' : 'English (LTR)'}`,
        ``,
        ...(spec.mustFix && spec.mustFix.length ? [
            `A PREVIOUS ATTEMPT AT THIS PROJECT FAILED THESE, and they are why you`,
            `are being asked again. Deliver them in the source, visibly:`,
            ...spec.mustFix.map(c => `  · ${c}`),
            `Everything else that already worked must keep working.`,
            ``,
        ] : []),
        `Author ONE React component: ${target}`,
        `It sits on a page whose other sections are: ${spec.components.filter(c => c !== target).join(', ') || '(none)'} —`,
        `so it must be coherent with them without repeating what they do.`,
        ``,
        `HARD CONTRACT — a file that breaks any of these is discarded:`,
        `  1. The only import allowed is: import React from 'react';`,
        `  2. Each file: export default function <Name>({ content }) { … }`,
        `  3. Read data ONLY from these content fields — nothing else exists,`,
        `     and each one is written with the SHAPE it really has:`,
        `     ${spec.contentShapes
            ? spec.contentKeys.map(k => `${k}: ${spec.contentShapes![k] || 'unknown'}`).join('\n     ')
            : spec.contentKeys.join(', ')}`,
        `     Never render an object or an array directly as a child —`,
        `     read its fields, or map over it.`,
        `  4. No fetch, no storage, no dangerouslySetInnerHTML, no script tags,`,
        `     no external URLs. Images come from content only.`,
        `  5. Guard every array and optional field, e.g.`,
        `     {(content.products || []).map(p => …)}`,
        ...(behavioursIn(String(spec.replacing?.[target] || '')).size
            ? [
                `  6. THIS SECTION MUST KEEP WORKING. The version you are`,
                `     replacing has ${[...behavioursIn(String(spec.replacing![target]))].join(', ')}.`,
                `     Re-implement that behaviour, do not merely draw the`,
                `     controls. Here is the version you are replacing:`,
                '```jsx',
                String(spec.replacing![target]).slice(0, 3000),
                '```',
            ]
            : []),
        ``,
        `THE DESIGN THIS PROJECT WAS COMPOSED WITH — stay coherent with it:`,
        //  ⛔ `g.split` is a RATIO, but the word «split» was also the name of a
        //  layout in the seven-archetype table this module exists to replace.
        //  Printed by that name it reads as an instruction to build a split
        //  hero — a cage rebuilt in prose, in the one sentence meant to open
        //  it. Caught by the guard beside this file, which refuses the brief
        //  if it names any shape from that table.
        `  rhythm ${g.rhythm}px · measure ${g.measure}ch · column ratio ${g.split} · align ${g.align}`,
        `  radius ${g.radius}px · rule ${g.weight}px · ${g.elevation} · ${g.accent} · ${g.density} · ${g.texture}`,
        `  CSS variables you may use: ${spec.tokens.join(', ')}`,
        `  Existing classes you may reuse: wrap, panel, product, products, eyebrow, btn, lede`,
        ``,
        `WHAT MAKES THIS WORTH DOING:`,
        `  Design the structure of each section FOR THIS SUBJECT. A roastery's`,
        `  hero is not a clinic's hero and not a law firm's hero — different`,
        `  elements, different arrangement, different emphasis. Do not produce a`,
        `  generic eyebrow + headline + lede + two buttons unless this specific`,
        `  request genuinely calls for exactly that.`,
        `  Use semantic HTML, real headings, and inline style={{…}} with the CSS`,
        `  variables above where a bespoke arrangement needs it.`,
        ``,
        `REPLY WITH JSON AND NOTHING ELSE:`,
        `{"files":{"${target}":"import React from 'react';\\n…"}}`,
    ].join('\n');
}

/**
 *  Read the reply. A model that wraps JSON in prose or a fence is not a
 *  failure -- refusing it would be refusing the common case.
 */
export function parseAuthored(raw: string): Record<string, string> {
    const text = String(raw || '');
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidates = [fenced ? fenced[1] : '', text];
    for (const c of candidates) {
        const start = c.indexOf('{');
        const end = c.lastIndexOf('}');
        if (start < 0 || end <= start) continue;
        try {
            const parsed = JSON.parse(c.slice(start, end + 1));
            const files = parsed && parsed.files;
            if (files && typeof files === 'object') {
                const out: Record<string, string> = {};
                for (const [k, v] of Object.entries(files)) if (typeof v === 'string') out[k] = v;
                return out;
            }
        } catch { /* try the next candidate */ }
    }
    return {};
}

/**
 *  Author, then refuse whatever cannot be proven safe.
 *
 *  Returns only what passed. The caller keeps its deterministic file for
 *  every name that did not, so the floor never moves.
 */
export async function authorComponents(
    spec: AuthoringSpec,
    call: (prompt: string) => Promise<string>,
): Promise<AuthoredResult> {
    const result: AuthoredResult = { files: {}, rejected: [] };
    if (!spec.components.length) return result;

    /**
     *  ⛔ AND IT HAS A BUDGET, BECAUSE IT SPENDS THE PLANNER'S FUEL.
     *
     *  Measured on the owner's machine, minutes after this shipped. One call
     *  per component took a build from ~2 model calls to ~14. On his free
     *  tier that exhausted the quota, and his very next build produced this:
     *
     *      [IntelligentRouter] ⏭️  Deferring (cooldown): Groq (Free)
     *      [IntelligentRouter] 🔄 Attempting provider: LLM7 (Keyless)...
     *      → the planner read «build me a website» as «read a file»
     *      → {"success":false,"data":"File not found"}
     *
     *  Twice in a row, reproducibly. The page did not merely look worse — the
     *  build never happened, and the failure wore a completely different
     *  face from its cause.
     *
     *  ⛔ THE CLASS: A COSMETIC LAYER SPENDING THE RESOURCE AN ESSENTIAL ONE
     *  DEPENDS ON, with nothing accounting for it. Authoring the interface is
     *  worth a great deal; it is worth nothing at all if it starves the
     *  planner that decides there is an interface to author.
     *
     *  So: a hard ceiling on calls per build, the sections a visitor meets
     *  first spent on first, and the rest keeping their templates — which is
     *  exactly what the floor is for.
     */
    const LANES = 4;
    const MAX_CALLS = Math.max(1, Number(spec.maxCalls ?? 6));
    if (spec.components.length > MAX_CALLS) {
        for (const name of spec.components.slice(MAX_CALLS)) {
            result.rejected.push({ name, reasons: [`not authored — the build's authoring budget is ${MAX_CALLS} sections`] });
        }
        spec = { ...spec, components: spec.components.slice(0, MAX_CALLS) };
    }
    const authorOne = async (name: string): Promise<{ name: string; code?: string; reasons?: string[] }> => {
        let raw = '';
        try {
            raw = await call(authoringPrompt(spec, name));
        } catch (e: any) {
            return { name, reasons: [`the model could not be reached: ${String(e && e.message || e).slice(0, 120)}`] };
        }
        const drafts = parseAuthored(raw);
        //  A single-file reply may come back keyed by name, or as the only
        //  entry under another key — take the one that is really there rather
        //  than refusing a good file over its label.
        const code = drafts[name] || (Object.keys(drafts).length === 1 ? Object.values(drafts)[0] : '');
        if (typeof code !== 'string' || !code.trim()) return { name, reasons: ['the reply held no usable file'] };
        const why = validateAuthored(name, code, spec.contentKeys, spec.replacing?.[name], spec.contentShapes);
        return why.length ? { name, reasons: why } : { name, code: code.trim() + '\n' };
    };

    const queue = [...spec.components];
    while (queue.length) {
        const batch = queue.splice(0, LANES);
        for (const r of await Promise.all(batch.map(authorOne))) {
            if (r.code) result.files[r.name] = r.code;
            else result.rejected.push({ name: r.name, reasons: r.reasons || ['it was not authored'] });
        }
    }
    return result;
}
