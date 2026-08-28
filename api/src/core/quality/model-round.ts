/**
 * WHEN THE KNOWN REPAIRS RUN OUT, ASK THE MODEL — BEHIND FOUR LOCKED DOORS.
 *
 * «اريد اكثر تطورا من هذا..تطور يفوق الخيال»
 *
 * The deterministic repairer knows eight fixes. The loop squeezes them to the
 * last drop and then stops honestly, which is better than lying — but a
 * ceiling of eight is still a ceiling, and it is the reason a build lands on
 * «78/100, nothing left I can write differently» instead of on something
 * impressive.
 *
 * This is the move past it: when a round has nothing deterministic left, a
 * model is asked to write the CSS for the findings that survived. That is a
 * dangerous thing to let into a build, so it is not trusted anywhere — it is
 * CONTAINED, and the containment is the feature:
 *
 *   1. IT MAY ONLY WRITE CSS, AND ONLY AT THE END OF ONE FILE. No JSX, no
 *      JS, no HTML, no new files. A stylesheet appended to cannot change what
 *      the application DOES; the worst case is that the page looks wrong, and
 *      the worst case is measured two doors down.
 *   2. IT IS PARSED BEFORE IT IS BELIEVED. Balanced braces, no `@import`, no
 *      `url(` fetching anything, no `expression(`, no script. A block that
 *      does not survive this is discarded without ever reaching disk.
 *   3. IT IS BUILT. If vite refuses the file, the round is rolled back by the
 *      loop that called it, exactly like any other round.
 *   4. IT IS MEASURED. The score must RISE. A model round that does not raise
 *      the number is rolled back and the loop ends — the same rule every
 *      deterministic round already lives under.
 *
 * So the model is allowed to be wrong. It is not allowed to be believed.
 */

/** What the model is told, and what it must answer with. */
export function cssRepairPrompt(findings: Array<{ id: string; detailEn?: string; detail?: string; evidence?: any[] }>): string {
    const lines: string[] = [];
    for (const f of findings.slice(0, 8)) {
        const what = String(f.detailEn || f.detail || f.id).slice(0, 200);
        lines.push(`- ${f.id}: ${what}`);
        for (const e of (Array.isArray(f.evidence) ? f.evidence : []).slice(0, 6)) {
            const sel = String(e?.sel || '').slice(0, 120);
            if (!sel) continue;
            const size = e?.w && e?.h ? ` (measured ${e.w}x${e.h}px)` : '';
            const ratio = e?.ratio ? ` (measured ${e.ratio}:1, needs ${e.need || 4.5})` : '';
            lines.push(`    offender: ${sel}${size}${ratio}`);
        }
    }
    return [
        'A real browser measured a built web application and these problems SURVIVED every automatic repair:',
        '',
        lines.join('\n'),
        '',
        'Write CSS that fixes them. Rules, all of them hard:',
        '- Answer with CSS ONLY. No explanation, no markdown fence, no HTML, no JavaScript.',
        '- Use the selectors named above where they are given; they are exact.',
        '- No @import, no url(), no @font-face, no expression(), no !important.',
        '- Do not change layout structure — only the properties that fix what is listed.',
        '- At most 40 lines.',
    ].join('\n');
}

/**
 * Is this text SAFE to append to a stylesheet?
 *
 * Not «is it good CSS» — that is the browser's job two doors down. This asks
 * only whether it can do something a stylesheet should never do.
 */
export function safeCss(raw: any): { ok: boolean; css: string; why?: string } {
    let css = String(raw ?? '').trim();
    if (!css) return { ok: false, css: '', why: 'empty' };

    // A model that was told «no markdown fence» sometimes sends one anyway.
    css = css.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();

    if (css.length > 4000) return { ok: false, css: '', why: 'too long' };
    if (/<\/?[a-z]/i.test(css)) return { ok: false, css: '', why: 'contains markup' };
    if (/@import|@charset|expression\s*\(|javascript:|behavior\s*:|-moz-binding/i.test(css)) {
        return { ok: false, css: '', why: 'contains a rule a stylesheet must not carry' };
    }
    // `url(` can fetch. A repair has no reason to.
    if (/url\s*\(/i.test(css)) return { ok: false, css: '', why: 'fetches something' };
    if (/!important/i.test(css)) return { ok: false, css: '', why: 'uses !important' };

    // Balanced, and actually a rule rather than a sentence about one.
    let depth = 0;
    for (const ch of css) {
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth < 0) return { ok: false, css: '', why: 'unbalanced braces' }; }
    }
    if (depth !== 0) return { ok: false, css: '', why: 'unbalanced braces' };
    if (!/\{[^{}]*:[^{}]*\}/.test(css)) return { ok: false, css: '', why: 'no declaration in it' };
    if (css.split('\n').length > 60) return { ok: false, css: '', why: 'too many lines' };

    return { ok: true, css };
}

export interface ModelRoundResult {
    /** The CSS that was appended, or '' when nothing was. */
    css: string;
    /** Why nothing was, when nothing was. */
    why?: string;
}

/**
 * Ask the model for one block of CSS. Never throws; a failure is an empty
 * answer with a reason, which the loop reports as «nothing new to write».
 */
export async function askForCss(
    findings: Array<{ id: string; detailEn?: string; detail?: string; evidence?: any[] }>,
    opts: { timeoutMs?: number } = {},
): Promise<ModelRoundResult> {
    if (!findings.length) return { css: '', why: 'nothing left to describe' };
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { routeToModel } = require('../llm/intelligent-router');
        const answer = await Promise.race([
            routeToModel(
                [{ role: 'user', content: cssRepairPrompt(findings) }],
                undefined, undefined, undefined, undefined, undefined, undefined,
                { internalCall: true },
            ),
            new Promise(r => setTimeout(() => r(''), Math.max(5000, opts.timeoutMs || 45_000))),
        ]);
        const gate = safeCss(answer);
        if (!gate.ok) return { css: '', why: gate.why || 'refused' };
        return { css: gate.css };
    } catch (e: any) {
        return { css: '', why: String(e?.message || e).slice(0, 120) };
    }
}


/* ══════════════════════════════════════════════════════════════════════════
 *  THE SECOND ROAD: A BUTTON THAT DOES NOTHING CANNOT BE FIXED WITH COLOUR.
 *
 *  «وعندما يكتشف هذه الاختبارات أي مشكلة لا يرجعها للنظام ويصلحها ثم يرجع
 *  يختبرها» — his own words, and this is the line they were about.
 *
 *  The containment above is excellent and it says so itself: «A stylesheet
 *  appended to cannot change what the application DOES.» That is exactly why
 *  the loop could never repair the most severe thing the browser can find.
 *  Measured, at the line:
 *
 *      behaviour-audit.ts:912   'dead_controls'      severity CRITICAL
 *      app-audit.ts:775         id: f.code           → reaches findings as `high`
 *      self-repair.ts:56        REPAIRABLE_FINDINGS  → 13 ids, all style/structure
 *      ui-repair.ts:714         REPAIRS_THIS_FILE…   → 10 ids, all style
 *      self-repair.ts:78        worthRepairing = .some(id in either list)
 *
 *  So Joe walked to the button, pressed it, watched nothing happen, called it
 *  critical in his report — and every repairer in the system was a painter.
 *
 *  This road has the SAME four locks, with only the first one changed:
 *
 *    1. IT MAY REWRITE ONE EXISTING COMPONENT FILE, AND NOTHING ELSE. No new
 *       files, no config, no package.json, no index.html. It may not add an
 *       import the project does not already have — an uninstalled package is a
 *       build failure with a confusing message, and confusion is the thing
 *       this whole layer exists to prevent.
 *    2. IT IS PARSED BEFORE IT IS BELIEVED. esbuild compiles it as JSX, it
 *       must still export a default, it may not reach the network or eval, and
 *       it may not quietly shrink the file to a stub that «works» because
 *       there is nothing left to press.
 *    3. IT IS BUILT — vite refuses it and the loop rolls the round back.
 *    4. IT IS MEASURED — the browser presses the button again. The score must
 *       RISE or the round is reverted, exactly like every other round.
 *
 *  So the model is allowed to be wrong about behaviour too. It is still not
 *  allowed to be believed.
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 *  WHAT A PAINTER CANNOT FIX AND AN AUTHOR CAN.
 *
 *  Derived rather than remembered: a finding qualifies when the behaviour
 *  instrument produced it AND no deterministic repairer claims it. Adding a
 *  new behaviour finding therefore reaches this road by itself, and teaching
 *  `ui-repair` a deterministic fix removes it from this road by itself. A
 *  hand-kept third list is the defect this repair exists to close.
 */
export function handlerRepairable(
    findings: Array<{ id: string; severity?: string; detailEn?: string; detail?: string; evidence?: any[] }>,
): Array<{ id: string; severity?: string; detailEn?: string; detail?: string; evidence?: any[] }> {
    let behaviour: ReadonlySet<string> = new Set();
    let deterministic: ReadonlySet<string> = new Set();
    try { behaviour = require('./behaviour-audit').BEHAVIOUR_CODES || new Set(); } catch { /* older build */ }
    try {
        const sr = require('./self-repair');
        const ui = require('./ui-repair');
        deterministic = new Set([
            ...(sr.REPAIRABLE_FINDINGS || []),
            ...(ui.REPAIRS_THIS_FILE_CAN_MAKE || []),
        ]);
    } catch { /* older build */ }
    return (findings || []).filter(f => f && f.id && behaviour.has(f.id) && !deterministic.has(f.id));
}

/**
 *  WHICH FILE HOLDS THE DEAD BUTTON.
 *
 *  The finding now carries its offenders as data, so this is a lookup and not
 *  a reading of prose. The file that mentions the most dead labels wins; a tie
 *  or a miss returns '' and the round says so rather than editing something at
 *  random. Guessing here would rewrite a working component to fix a broken one.
 */
export function fileForBehaviour(
    findings: Array<{ evidence?: any[] }>,
    sources: Record<string, string>,
): { file: string; labels: string[] } {
    const labels = Array.from(new Set(
        (findings || [])
            .flatMap(f => (Array.isArray(f?.evidence) ? f.evidence : []))
            .map((e: any) => String(e?.label || '').trim())
            .filter(l => l.length >= 2),
    ));
    if (!labels.length) return { file: '', labels: [] };
    let best = '';
    let bestHits = 0;
    for (const [file, src] of Object.entries(sources || {})) {
        if (!/\.(jsx|tsx|js|ts)$/.test(file)) continue;
        const text = String(src || '');
        const hits = labels.filter(l => text.includes(l)).length;
        if (hits > bestHits) { bestHits = hits; best = file; }
    }
    return bestHits > 0 ? { file: best, labels } : { file: '', labels };
}

/** What the model is told when a control does nothing, and what it must answer with. */
export function handlerRepairPrompt(
    findings: Array<{ id: string; detailEn?: string; detail?: string; evidence?: any[] }>,
    file: string,
    source: string,
    labels: string[],
): string {
    const lines: string[] = [];
    for (const f of findings.slice(0, 6)) {
        lines.push(`- ${f.id}: ${String(f.detailEn || f.detail || f.id).slice(0, 240)}`);
    }
    return [
        'A real browser opened a built React application, pressed every control, and compared the page before and after each press. These controls did NOTHING:',
        '',
        lines.join('\n'),
        '',
        labels.length ? `The dead controls are labelled: ${labels.slice(0, 8).map(l => `"${l}"`).join(', ')}` : '',
        '',
        `This is the complete current source of ${file}. Return the complete corrected file.`,
        '',
        '--- BEGIN CURRENT SOURCE ---',
        source,
        '--- END CURRENT SOURCE ---',
        '',
        'Rules, all of them hard:',
        '- Answer with the complete file source ONLY. No explanation, no markdown fence.',
        '- Make each dead control actually DO something a visitor can see: change state with useState and render that state. A counter must show a number that changes. A filter must remove rows. A toggle must show a different thing.',
        '- Keep every section, heading, and piece of text that is already there. You are repairing behaviour, not redesigning.',
        '- Keep every className exactly as it is. The stylesheet targets those names, and a class you drop is a piece of the design you delete.',
        '- Import nothing new. React and whatever this file already imports, and nothing else.',
        '- No fetch, no network, no eval, no localStorage, no timers that never stop.',
        '- Keep the default export and its name exactly as it is.',
    ].filter(Boolean).join('\n');
}

/**
 *  Is this text SAFE to write over a component?
 *
 *  Not «is it good» — the browser decides that two doors down by pressing the
 *  button again. This asks only whether it can do something a repaired
 *  component must never do, and whether it still is what it replaced.
 */
export function safeComponent(raw: any, previous: string): { ok: boolean; source: string; why?: string } {
    let src = String(raw ?? '').trim();
    if (!src) return { ok: false, source: '', why: 'empty' };
    src = src.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();

    if (src.length > 24_000) return { ok: false, source: '', why: 'too long' };
    if (!/export\s+default/.test(src)) return { ok: false, source: '', why: 'no default export' };
    if (/\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|navigator\.sendBeacon/.test(src)) {
        return { ok: false, source: '', why: 'reaches the network' };
    }
    if (/\beval\s*\(|new\s+Function\s*\(|\brequire\s*\(|\bimport\s*\(|process\.\w/.test(src)) {
        return { ok: false, source: '', why: 'runs code it was not given' };
    }
    if (/dangerouslySetInnerHTML/.test(src)) return { ok: false, source: '', why: 'injects raw html' };

    /**
     *  AN IMPORT THE PROJECT DOES NOT HAVE IS A BUILD FAILURE WEARING A REPAIR'S
     *  CLOTHES. Relative imports are checked against what the file already had,
     *  so a repair cannot invent a sibling that does not exist.
     */
    const had = new Set((previous.match(/from\s+['"]([^'"]+)['"]/g) || []).map(m => m.replace(/^from\s+['"]|['"]$/g, '')));
    had.add('react');
    for (const m of src.match(/from\s+['"]([^'"]+)['"]/g) || []) {
        const spec = m.replace(/^from\s+['"]|['"]$/g, '');
        if (!had.has(spec)) return { ok: false, source: '', why: `imports something new (${spec.slice(0, 40)})` };
    }

    /**
     *  A STUB PASSES EVERY CHECK ABOVE.
     *
     *  «There are no dead buttons» is trivially true of a file with no buttons
     *  left in it, and that is a repair that measures better while being worse
     *  — the exact trade this whole module was built to refuse. A component
     *  that comes back at a third of its size did not repair anything.
     */
    if (previous.length > 400 && src.length < previous.length * 0.45) {
        return { ok: false, source: '', why: 'came back far smaller than what it replaced' };
    }

    //  And it must actually compile. esbuild is already a dependency and is
    //  what ProjectEditTool uses for exactly this question.
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const esbuild = require('esbuild');
        //  'tsx' parses plain JSX too, so one loader covers .jsx and .tsx.
        esbuild.transformSync(src, { loader: 'tsx' });
    } catch (e: any) {
        return { ok: false, source: '', why: `does not parse (${String(e?.message || e).slice(0, 80)})` };
    }
    /**
     *  A CLASS IT DROPPED IS A PIECE OF THE DESIGN IT DELETED.
     *
     *  ⛔ MEASURED LIVE, on the first real answer this road ever received. The
     *  model wired both dead buttons correctly in 3.7s — and quietly turned
     *  `<span className="count">4</span>` into `<span>Current servings:
     *  {servings}</span>`. The behaviour was repaired and the stylesheet lost
     *  its hook, on the very same round the CSS road may have just spent a
     *  model call fixing that element's contrast.
     *
     *  The brief now says to keep them, and this checks that it did — because
     *  an instruction written into a prompt is not an enforcement, which is a
     *  lesson this repository has paid for more than once. Tokens are compared
     *  rather than whole attributes, so ADDING a class is still allowed.
     */
    const classTokens = (t: string) => new Set(
        (t.match(/className\s*=\s*"([^"]*)"/g) || [])
            .flatMap(m => m.replace(/^className\s*=\s*"|"$/g, '').split(/\s+/))
            .filter(Boolean),
    );
    const hadClasses = classTokens(previous);
    const keptClasses = classTokens(src);
    const lost = [...hadClasses].filter(c => !keptClasses.has(c));
    if (lost.length) {
        return { ok: false, source: '', why: `drops className "${lost[0]}" that the stylesheet targets` };
    }

    return { ok: true, source: src };
}

/**
 *  Ask the model to make the dead controls work. Never throws; a failure is an
 *  empty answer with a reason, which the loop reports as «nothing written».
 */
export async function askForHandler(
    findings: Array<{ id: string; detailEn?: string; detail?: string; evidence?: any[] }>,
    file: string,
    source: string,
    labels: string[],
    opts: { timeoutMs?: number; context?: any } = {},
): Promise<{ source: string; why?: string }> {
    if (!findings.length) return { source: '', why: 'nothing left to describe' };
    if (!file || !source.trim()) return { source: '', why: 'no component names the dead controls' };
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { routeToModel } = require('../llm/intelligent-router');
        const ask = async (prompt: string) => Promise.race([
            routeToModel(
                [{ role: 'user', content: prompt }],
                undefined, undefined, undefined, undefined, undefined, undefined,
                //  ⛔ THE PROVIDER HE CHOSE, not the free mesh. `askForCss`
                //  above still passes `{ internalCall: true }`, which is the
                //  same defect four other calls in the build path had: he picks
                //  a provider, pastes a real key, and the repair round ignores
                //  both. Fixed here; named there rather than changed silently.
                opts.context || { internalCall: true },
            ),
            new Promise(r => setTimeout(() => r(''), Math.max(5000, opts.timeoutMs || 90_000))),
        ]);

        const first = handlerRepairPrompt(findings, file, source, labels);
        const gate = safeComponent(await ask(first), source);
        if (gate.ok) return { source: gate.source };

        /**
         *  ⛔ A LOCK THAT REFUSES EVERY ANSWER IS A ROAD THAT NEVER OPENS.
         *
         *  MEASURED LIVE, twice, three seconds apart. The first real answer
         *  this road ever received wired both dead buttons correctly and
         *  dropped `className="count"`. I added the rule to the brief AND the
         *  lock that checks it — and the next answer dropped the same class
         *  again. **Telling a model a constraint is not the same as getting
         *  it**, which is the lesson this repository keeps paying for: an
         *  instruction is not an enforcement.
         *
         *  Refusing there would have been honest and useless: a behaviour road
         *  that never repairs anything is worse than the defect it replaced,
         *  because it also costs a model call to achieve nothing.
         *
         *  So a NEAR MISS gets exactly one more try, with the failure named.
         *  Not a re-roll — the same request plus the specific thing it got
         *  wrong, which is the difference between asking again and asking
         *  better. A second failure is reported with the reason and the road
         *  closes for that round, so this can never become a loop.
         */
        const nearMiss = /^drops className|^came back far smaller|^imports something new/.test(gate.why || '');
        if (!nearMiss) return { source: '', why: gate.why || 'refused' };

        const again = [
            first,
            '',
            `YOUR PREVIOUS ANSWER WAS REJECTED: it ${gate.why}.`,
            'Fix exactly that and change nothing else about your approach. Return the complete file again.',
        ].join('\n');
        const second = safeComponent(await ask(again), source);
        if (second.ok) return { source: second.source };
        return { source: '', why: `${gate.why}; told and still ${second.why}` };
    } catch (e: any) {
        return { source: '', why: String(e?.message || e).slice(0, 120) };
    }
}
