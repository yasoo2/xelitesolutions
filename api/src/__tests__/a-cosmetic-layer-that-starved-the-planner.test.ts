/**
 * A COSMETIC LAYER SPENT THE RESOURCE THE PLANNER DEPENDS ON.
 *
 * Measured on the owner's machine, minutes after the interface author shipped.
 * Letting the model write each section took a build from about two model calls
 * to fourteen. On his free tier that emptied the quota, and the very next
 * build — the same Arabic sentence that had built a site an hour earlier —
 * came back:
 *
 *     [IntelligentRouter] ⏭️  Deferring (cooldown): Groq (Free)
 *     [IntelligentRouter] 🔄 Attempting provider: LLM7 (Keyless)...
 *     POST /api/agent  →  {"success":false,"data":"File not found"}
 *
 * Twice in a row, reproducibly. The planner, running on a keyless fallback,
 * read «اعمل لي موقع لمحمصة قهوة» as an instruction to READ A FILE. The page
 * did not merely come out worse — the build never happened at all.
 *
 * ⛔ THE CLASS: a feature that consumes a rationed resource with nothing
 * accounting for it, where the starvation surfaces somewhere else entirely
 * and wears a completely different face from its cause. Authoring the
 * interface is worth a lot. It is worth nothing if it starves the planner
 * that decides there is an interface to author.
 *
 * Two defences, and this file pins both: a hard ceiling on calls per build,
 * and a stand-down when the good providers are already rationing.
 */

import fs from 'fs';
import path from 'path';
import { authorComponents, type AuthoringSpec } from '../core/design/authored-ui';
import { composeDesign } from '../core/design/composer';

const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'),
    'utf-8',
);

const KEYS = ['brand', 'heroTitle', 'heroLede', 'cta'];
const GOOD = (name: string) => `import React from 'react';

export default function ${name}({ content }) {
  return (
    <section className="wrap">
      <h2>{content.heroTitle}</h2>
      <p className="lede">{content.heroLede}</p>
      <a className="btn" href="#next">{content.cta}</a>
    </section>
  );
}
`;

const spec = (over: Partial<AuthoringSpec> = {}): AuthoringSpec => ({
    request: 'اعمل لي موقع لمحمصة قهوة مختصة اسمها وَقّاد',
    brand: 'وَقّاد',
    isArabic: true,
    components: ['Hero'],
    contentKeys: KEYS,
    genome: composeDesign('اعمل لي موقع لمحمصة قهوة مختصة اسمها وَقّاد'),
    tokens: ['--brand', '--measure'],
    ...over,
});

const TWELVE = ['Navbar', 'Hero', 'Menu', 'Gallery', 'Story', 'Steps',
    'Team', 'Testimonials', 'Cta', 'Location', 'Contact', 'Footer'];

describe('the interface author cannot spend the whole quota', () => {
    it('⛔ POSITIVE — twelve sections cost SIX calls, not twelve', async () => {
        let calls = 0;
        await authorComponents(spec({ components: TWELVE }), async (prompt: string) => {
            calls++;
            const name = (prompt.match(/Author ONE React component: (\w+)/) || [])[1] || 'X';
            return JSON.stringify({ files: { [name]: GOOD(name) } });
        });
        expect(calls).toBe(6);
    });

    it('POSITIVE — and the sections a visitor meets first are the ones spent on', async () => {
        //  Order is the priority. Navbar and Hero must never be the ones cut.
        const asked: string[] = [];
        await authorComponents(spec({ components: TWELVE }), async (prompt: string) => {
            const name = (prompt.match(/Author ONE React component: (\w+)/) || [])[1] || 'X';
            asked.push(name);
            return JSON.stringify({ files: { [name]: GOOD(name) } });
        });
        expect(asked).toEqual(TWELVE.slice(0, 6));
    });

    it('POSITIVE — what the budget cut is REFUSED BY NAME, never silently dropped', async () => {
        //  A section that quietly keeps its template is how «it looks the same
        //  again» becomes unexplainable.
        const r = await authorComponents(spec({ components: TWELVE }), async (prompt: string) => {
            const name = (prompt.match(/Author ONE React component: (\w+)/) || [])[1] || 'X';
            return JSON.stringify({ files: { [name]: GOOD(name) } });
        });
        expect(Object.keys(r.files)).toEqual(TWELVE.slice(0, 6));
        expect(r.rejected.map(x => x.name)).toEqual(TWELVE.slice(6));
        expect(r.rejected[0].reasons.join(' ')).toContain('authoring budget');
    });

    it('NEGATIVE — a build under the ceiling is not truncated', async () => {
        //  A ceiling that also cuts small builds would be a cap pretending to
        //  be a budget.
        let calls = 0;
        const three = ['Hero', 'Story', 'Contact'];
        const r = await authorComponents(spec({ components: three }), async (prompt: string) => {
            calls++;
            const name = (prompt.match(/Author ONE React component: (\w+)/) || [])[1] || 'X';
            return JSON.stringify({ files: { [name]: GOOD(name) } });
        });
        expect(calls).toBe(3);
        expect(Object.keys(r.files)).toEqual(three);
        expect(r.rejected).toEqual([]);
    });

    it('NEGATIVE — the ceiling can be raised, so it is a budget and not a cage', async () => {
        let calls = 0;
        await authorComponents(spec({ components: TWELVE, maxCalls: 12 }), async (prompt: string) => {
            calls++;
            const name = (prompt.match(/Author ONE React component: (\w+)/) || [])[1] || 'X';
            return JSON.stringify({ files: { [name]: GOOD(name) } });
        });
        expect(calls).toBe(12);
    });
});

describe('and it stands down entirely when the providers are rationing', () => {
    it('POSITIVE — the generator asks whether the providers are cooling down', () => {
        expect(SRC).toContain('isProviderCoolingDown');
        expect(SRC).toMatch(/providersAreRationing/);
    });

    it('POSITIVE — the COPY author stands down for the same reason', () => {
        //  Both authors spend the same fuel; guarding one and not the other is
        //  the «one layer, two generators» class that produced most of this
        //  session's defects.
        expect(SRC).toMatch(/copyProvidersRationing/);
        expect(SRC).toMatch(/!input\?\.skipAuthoredCopy && !copyProvidersRationing/);
    });

    it('NEGATIVE — standing down is ANNOUNCED, not silent', () => {
        //  A page that quietly reverts to templates is indistinguishable from
        //  a page where the authoring failed, and the owner cannot judge
        //  either one.
        expect(SRC).toMatch(/interface authoring stood down/);
    });

    it('NEGATIVE — and a failure to read provider health does not block the build', () => {
        //  Treating «I could not ask» as «they are rationing» would disable
        //  authoring for ever the first time that module moves.
        const block = SRC.slice(SRC.indexOf('const providersAreRationing'), SRC.indexOf('const providersAreRationing') + 500);
        expect(block).toContain('catch { return false; }');
    });
});
