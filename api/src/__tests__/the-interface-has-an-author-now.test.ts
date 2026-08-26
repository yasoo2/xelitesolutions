/**
 * THE INTERFACE HAD NO AUTHOR — ONLY FILLERS OF A FIXED FORM.
 *
 * Measured on the owner's machine before a line was written:
 *
 *     grep -nE "callLLM|askModel|generateWith|completion"
 *       ReactProjectTool.ts react-app-templates.ts    ->  ZERO lines
 *     grep -c "^export function file[A-Z]"
 *       react-app-templates.ts                        ->  24
 *
 * So every project Joe has ever built received the same Hero — eyebrow, h1,
 * lede, two buttons, perks band — with different words poured in. That is why
 * the colour, typeface, section, motion and composition fixes all measured
 * true and still lost to the competitors: they decorated a form nobody could
 * leave.
 *
 * The repair lets the model AUTHOR the sections and keeps the deterministic
 * templates as the floor. Which means the whole risk of this change sits in
 * one place: the validator. If it waves an unsafe or untruthful component
 * through, Joe ships something worse than repetitive — he ships something that
 * lies or breaks.
 *
 * ⛔ SO THE POINT OF THIS FILE IS THE NEGATIVES. A validator that never
 * refuses is decoration, and this repository has already paid for that once:
 * `/min:\s*-?\d/` granted a tick for «rejects a zero price» to any number
 * anywhere in a file, including a schema that accepted zero. Every refusal
 * below is therefore asserted BY NAME, and the last test proves a refused
 * component cannot reach the page.
 */

import {
    validateAuthored,
    readsFromContent,
    parseAuthored,
    authorComponents,
    authoringPrompt,
    type AuthoringSpec,
} from '../core/design/authored-ui';
import { composeDesign } from '../core/design/composer';

const KEYS = ['brand', 'heroTitle', 'heroLede', 'cta', 'products', 'storyTitle', 'storyBody'];

/** A component a careful author would actually write. */
const GOOD = `import React from 'react';

export default function Hero({ content }) {
  return (
    <header className="wrap" style={{ paddingBlock: 'var(--section-space)' }}>
      <p className="eyebrow">{content.brand}</p>
      <h1 style={{ maxWidth: 'var(--measure)' }}>{content.heroTitle}</h1>
      <p className="lede">{content.heroLede}</p>
      <a className="btn" href="#products">{content.cta}</a>
    </header>
  );
}
`;

const spec = (over: Partial<AuthoringSpec> = {}): AuthoringSpec => ({
    request: 'اعمل لي موقع لمحمصة قهوة مختصة اسمها إمبرلاين',
    brand: 'إمبرلاين',
    isArabic: true,
    components: ['Hero'],
    contentKeys: KEYS,
    genome: composeDesign('اعمل لي موقع لمحمصة قهوة مختصة اسمها إمبرلاين'),
    tokens: ['--brand', '--measure', '--section-space'],
    ...over,
});

describe('an authored section is accepted only when it can be proven safe', () => {
    it('POSITIVE — a well-formed component passes with nothing held against it', () => {
        expect(validateAuthored('Hero', GOOD, KEYS)).toEqual([]);
    });

    it('POSITIVE — and it may be shaped however the subject calls for', () => {
        //  The whole point of the change: structure is NOT policed. A section
        //  with no eyebrow, no button and a table instead of a grid must pass,
        //  or the cage is simply rebuilt inside the validator.
        const unusual = `import React from 'react';

export default function Products({ content }) {
  return (
    <section>
      <table>
        <caption>{content.brand}</caption>
        <tbody>
          {(content.products || []).map((p) => (<tr key={p.name}><td>{p.name}</td></tr>))}
        </tbody>
      </table>
    </section>
  );
}
`;
        expect(validateAuthored('Products', unusual, KEYS)).toEqual([]);
    });

    //  ── every refusal, named ────────────────────────────────────────────
    const refuses = (label: string, code: string, fragment: string) => {
        it(`NEGATIVE — ${label}`, () => {
            const why = validateAuthored('Hero', code, KEYS);
            expect({ label, refused: why.length > 0, named: why.some(r => r.includes(fragment)) })
                .toEqual({ label, refused: true, named: true });
        });
    };

    refuses('it goes to the network', GOOD.replace('<h1', '{fetch("/x")}<h1'), 'fetch');
    refuses('it points at an external address', GOOD.replace('#products', 'https://cdn.example.com/a.png'), 'external address');
    refuses('it injects raw HTML', GOOD.replace('className="lede"', 'dangerouslySetInnerHTML={{__html: content.heroLede}}'), 'raw HTML');
    refuses('it embeds a script', GOOD.replace('<h1', '<script src="x"></script><h1'), 'script tag');
    refuses('it imports a package the project does not have',
        GOOD.replace("import React from 'react';", "import React from 'react';\nimport { motion } from 'framer-motion';"), 'does not provide');
    refuses('it invents a content key', GOOD.replace('content.heroTitle', 'content.totallyMadeUpField'), 'do not exist');
    refuses('it is not the component it claims to be', GOOD.replace('function Hero', 'function Banner'), 'export default function Hero');
    refuses('it never receives the content prop', GOOD.replace('{ content }', ''), 'content prop');
    refuses('it was cut off mid-reply', GOOD.slice(0, GOOD.length - 30), 'braces do not balance');
    refuses('it is too short to be a section', "import React from 'react';\nexport default function Hero({ content }) { return <p>{content.brand}</p>; }", 'too short');

    /**
     *  ⛔ THE SHAPE THE REAL MODEL ACTUALLY RETURNED, AND THE FIRST VALIDATOR
     *  REFUSED. Measured through the live provider before this test existed:
     *  2 files authored, 2 refused, 0 accepted, every refusal reading «it
     *  reads nothing from content» — about components that read six fields.
     *
     *  The check had matched the SPELLING `content.x` instead of testing the
     *  claim «it renders the data it was handed». That is the mirror of a
     *  criterion that can never fail: one that can only ever fail. So the
     *  three real ways of reading content are each pinned here, and the
     *  refusal is pinned beside them so the check keeps its teeth.
     */
    it('POSITIVE — destructuring counts as reading content (the live model does this)', () => {
        const destructured = `import React from 'react';

export default function Hero({ content }) {
  const { brand = '', heroTitle = '', heroLede = '', cta = '' } = content || {};
  return (
    <section className="panel wrap">
      <p className="eyebrow">{brand}</p>
      <h1>{heroTitle}</h1>
      <p className="lede">{heroLede}</p>
      <a className="btn" href="#products">{cta}</a>
    </section>
  );
}
`;
        expect(validateAuthored('Hero', destructured, KEYS)).toEqual([]);
        expect([...readsFromContent(destructured)].sort()).toEqual(['brand', 'cta', 'heroLede', 'heroTitle']);
    });

    it('POSITIVE — optional chaining and bracket access count too', () => {
        expect([...readsFromContent(`content?.heroTitle`)]).toEqual(['heroTitle']);
        expect([...readsFromContent(`content['storyBody']`)]).toEqual(['storyBody']);
        expect([...readsFromContent(`const { storyTitle: t } = props.content;`)]).toEqual(['storyTitle']);
    });

    it('NEGATIVE — and a destructured key that does not exist is still caught', () => {
        //  Widening what counts as «reading» must not widen what counts as
        //  «true». An invented field is invented in either idiom.
        const bad = `import React from 'react';

export default function Hero({ content }) {
  const { brand = '', inventedField = '' } = content || {};
  return (<section className="panel wrap"><h1>{brand}</h1><p className="lede">{inventedField}</p><a className="btn" href="#x">go</a></section>);
}
`;
        expect(validateAuthored('Hero', bad, KEYS).join(' ')).toContain('inventedField');
    });

    it('NEGATIVE — a component that reads nothing at all is refused', () => {
        const hollow = `import React from 'react';

export default function Hero({ content }) {
  return (<header className="wrap"><h1>Welcome to our website</h1><p>We do great work every single day for you.</p><a className="btn" href="#x">Contact</a></header>);
}
`;
        expect(validateAuthored('Hero', hollow, KEYS).some(r => r.includes('reads nothing from content'))).toBe(true);
    });
});

describe('the reply is read the way models really answer', () => {
    it('POSITIVE — bare JSON', () => {
        expect(parseAuthored('{"files":{"Hero":"x"}}')).toEqual({ Hero: 'x' });
    });

    it('POSITIVE — fenced JSON', () => {
        expect(parseAuthored('sure:\n```json\n{"files":{"Hero":"x"}}\n```\n')).toEqual({ Hero: 'x' });
    });

    it('POSITIVE — JSON with prose around it', () => {
        expect(parseAuthored('Here you go: {"files":{"Hero":"x"}} — enjoy')).toEqual({ Hero: 'x' });
    });

    it('NEGATIVE — noise yields nothing, not a guess', () => {
        expect(parseAuthored('I cannot do that right now.')).toEqual({});
        expect(parseAuthored('')).toEqual({});
        expect(parseAuthored('{"files": "not an object"}')).toEqual({});
    });
});

describe('the floor never moves — a refusal keeps the deterministic component', () => {
    it('POSITIVE — a clean draft is returned for use', async () => {
        const r = await authorComponents(spec(), async () => JSON.stringify({ files: { Hero: GOOD } }));
        expect(Object.keys(r.files)).toEqual(['Hero']);
        expect(r.rejected).toEqual([]);
    });

    it('NEGATIVE — an unsafe draft is refused BY NAME and never returned', async () => {
        const bad = GOOD.replace('#products', 'https://cdn.example.com/a.png');
        const r = await authorComponents(spec(), async () => JSON.stringify({ files: { Hero: bad } }));
        //  This is the assertion the whole change rests on: the caller keeps
        //  its own Hero, so the worst case is exactly today's page.
        expect(r.files).toEqual({});
        expect(r.rejected.map(x => x.name)).toEqual(['Hero']);
        expect(r.rejected[0].reasons.join(' ')).toContain('external address');
    });

    it('NEGATIVE — a provider that is down is reported as such, not as a design', async () => {
        const r = await authorComponents(spec(), async () => { throw new Error('all providers unavailable'); });
        expect(r.files).toEqual({});
        expect(r.rejected[0].reasons.join(' ')).toContain('could not be reached');
    });

    it('NEGATIVE — a reply missing a component leaves that one alone', async () => {
        const r = await authorComponents(
            spec({ components: ['Hero', 'Products'] }),
            async () => JSON.stringify({ files: { Hero: GOOD } }),
        );
        expect(Object.keys(r.files)).toEqual(['Hero']);
        expect(r.rejected.map(x => x.name)).toEqual(['Products']);
    });
});

/**
 *  ⛔ TWELVE SECTIONS IN ONE COMPLETION IS A TRUNCATED REPLY, AND THIS
 *  REPOSITORY ALREADY PAID FOR THAT LESSON ONCE.
 *
 *  Measured on a real build: the request produced Navbar, Hero, Menu, Gallery,
 *  Story, Steps, Team, Testimonials, Cta, Location, Contact, Footer — twelve
 *  files, fifteen to twenty KB of JSX. Asked for in one reply, the completion
 *  is capped, the JSON arrives cut in half, nothing parses, and every section
 *  is refused together. Joe kept his templates and the page looked exactly as
 *  it always had, with no visible reason why.
 *
 *  And the lesson was already written down in the sibling generator:
 *
 *      WebPageBuilderTool.ts:556
 *      «25 KB does not fit in one completion, the reply comes back truncated…»
 *
 *  Same class as every other one this session: learned by one generator,
 *  never taught to the other.
 */
describe('one component per call — the reply must never be big enough to truncate', () => {
    it('POSITIVE — twelve components mean twelve calls, not one', async () => {
        const asked: string[] = [];
        const twelve = ['Navbar', 'Hero', 'Menu', 'Gallery', 'Story', 'Steps',
            'Team', 'Testimonials', 'Cta', 'Location', 'Contact', 'Footer'];
        await authorComponents(spec({ components: twelve }), async (prompt: string) => {
            const m = prompt.match(/Author ONE React component: (\w+)/);
            asked.push(m ? m[1] : '?');
            return JSON.stringify({ files: { [m![1]]: GOOD.replace('function Hero', `function ${m![1]}`) } });
        });
        expect(asked).toEqual(twelve);
    });

    it('POSITIVE — each brief names exactly one component to author', () => {
        const p = authoringPrompt(spec({ components: ['Hero', 'Products', 'Story'] }), 'Products');
        expect((p.match(/Author ONE React component:/g) || []).length).toBe(1);
        expect(p).toContain('Author ONE React component: Products');
        //  and it still knows its neighbours, so the page stays coherent
        expect(p).toContain('Hero');
        expect(p).toContain('Story');
    });

    it('NEGATIVE — one section failing does not take the others down with it', async () => {
        //  The old shape refused all twelve when the single reply broke. This
        //  is the property that replaced it, and it is the reason the change
        //  is safe at all.
        const r = await authorComponents(
            spec({ components: ['Hero', 'Products', 'Story'] }),
            async (prompt: string) => {
                const name = (prompt.match(/Author ONE React component: (\w+)/) || [])[1];
                if (name === 'Products') return 'the model rambled and produced nothing';
                return JSON.stringify({ files: { [name!]: GOOD.replace('function Hero', `function ${name}`) } });
            },
        );
        expect(Object.keys(r.files).sort()).toEqual(['Hero', 'Story']);
        expect(r.rejected.map(x => x.name)).toEqual(['Products']);
    });

    it('NEGATIVE — a reply keyed by the wrong name is still used when it is the only file', async () => {
        //  Refusing a good component over its label would be judging the
        //  spelling instead of the claim — the defect this file exists to stop.
        const r = await authorComponents(
            spec({ components: ['Hero'] }),
            async () => JSON.stringify({ files: { 'src/components/Hero.jsx': GOOD } }),
        );
        expect(Object.keys(r.files)).toEqual(['Hero']);
    });
});

describe('the brief hands over his request, not a catalogue', () => {
    const p = authoringPrompt(spec());

    it('POSITIVE — his sentence is in it, verbatim', () => {
        expect(p).toContain('اعمل لي موقع لمحمصة قهوة مختصة اسمها إمبرلاين');
    });

    it('POSITIVE — and the real content keys, so nothing is invented', () => {
        for (const k of KEYS) expect(p).toContain(k);
    });

    it('POSITIVE — and the composed design, so the markup matches the stylesheet', () => {
        expect(p).toContain(`measure ${spec().genome.measure}ch`);
    });

    it('NEGATIVE — it does NOT hand over a list of layouts to choose from', () => {
        //  «You are putting Joe inside limits and imprisoning him.» A brief
        //  that names the permitted shapes is the seven-archetype table again,
        //  written in prose. The words below are the ones that table used.
        for (const cage of ['split', 'bento', 'editorial', 'showcase', 'overlap', 'archetype', 'choose one of']) {
            expect({ cage, present: p.toLowerCase().includes(cage) }).toEqual({ cage, present: false });
        }
    });
});
