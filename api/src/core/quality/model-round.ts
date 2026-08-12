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
