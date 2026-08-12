/**
 * «بعد ان ياخذ النتائج من المتصفح والثيرمال يرجع يحلل ويفكر ومن ثم يكمل …
 *  ومن ثم يرجع يحلل ما بناه ومن ثم يرجع يطور عليه حتى يخرج بنتيجه مبهره»
 *
 * The loop, measured — including the ways it is allowed to STOP, because a
 * loop that cannot stop honestly is the padding he actually objects to.
 *
 * Every case here drives the real `improveUntilItStops` with a real repairer
 * writing real files on disk. Nothing is mocked except the measurement, which
 * is the one thing a test must control to prove the loop reacts to it.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_it_keeps_improving.ts
 */
export { };
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';

import fs from 'fs';
import os from 'os';
import path from 'path';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-improve-'));

/** A project shaped like the one the scaffolder writes: CSS the repairs touch. */
function project(name: string): string {
    const dir = path.join(root, name);
    fs.mkdirSync(path.join(dir, 'src', 'styles'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
        name, private: true, type: 'module', scripts: { build: 'echo built' },
    }, null, 2));
    fs.writeFileSync(path.join(dir, 'src', 'styles', 'app.css'), [
        ':root{--bg:#ffffff;--surface:#ffffff;--text:#8a8a8a;--text-muted:#b4b4b4}',
        '.btn{padding:4px 8px}',
        '.act{padding:2px 6px}',
    ].join('\n'));
    fs.writeFileSync(path.join(dir, 'src', 'App.jsx'),
        'export default function App(){return <form><input type="text" /></form>;}\n');
    return dir;
}

async function main() {
    const { improveUntilItStops, repairRound, improveSummary } = require('../../core/quality/improve-loop');
    const { snapshotProject, restoreVersion } = require('../../core/project/versions');

    const driver = (dir: string, scores: number[], findings: string[][]) => {
        let i = 0;
        const lines: string[] = [];
        return {
            lines,
            opts: {
                say: (l: string) => lines.push(l),
                maxRounds: 4,
                target: 95,
                snapshot: (label: string) => String(snapshotProject(dir, label)?.id || ''),
                rollback: async (id: string) => !!restoreVersion(dir, id)?.ok,
                repair: async (round: number) => (await repairRound(dir, round, { isArabic: false })).changed,
                rebuild: async () => true,
                measure: async () => {
                    const s = scores[Math.min(i, scores.length - 1)];
                    const f = findings[Math.min(i, findings.length - 1)] || [];
                    i++;
                    return { score: s, findingIds: f };
                },
            },
        };
    };

    console.log('\n[1] A system that really improves: the loop keeps going, and every round is DIFFERENT\n');

    const a = project('rising');
    const d1 = driver(a, [86, 93, 96], [
        ['low_contrast', 'small_targets'], ['small_targets'], [],
    ]);
    const r1 = await improveUntilItStops({ score: 78, findingIds: ['low_contrast', 'small_targets', 'form_no_validation'] }, d1.opts);
    for (const l of d1.lines) console.log(`      ${l}`);
    console.log(`      ${improveSummary(r1, false)}`);

    check('it ran more than one round', r1.rounds.length >= 2, `${r1.rounds.length} round(s)`);
    check('every round that ran wrote real files',
        r1.rounds.filter((x: any) => x.verdict === 'improved').every((x: any) => x.changed.length > 0));
    check('the score climbed across rounds', r1.final.score > r1.first.score, `${r1.first.score} → ${r1.final.score}`);
    check('it stopped at the bar, not at the round ceiling',
        r1.stoppedBecause === 'target_reached', r1.stoppedBecause);
    check('and it names the findings that really went away',
        r1.fixed.includes('low_contrast') && r1.fixed.includes('form_no_validation'), r1.fixed.join(', '));

    /**
     * The heart of it: round 2 must not be round 1 again. The tap-target rule
     * escalates 44 → 48 → 56, so the CSS on disk carries BOTH markers after a
     * second paid round — proof the second round did different work.
     */
    const css = fs.readFileSync(path.join(a, 'src', 'styles', 'app.css'), 'utf-8');
    check('round 1 asked for 44px…', /أهداف اللمس \(?4?4?p?x?\)?/.test(css) || css.includes('min-height: 44px'));
    check('…and round 2 asked for MORE, because 44 had been measured to fail',
        css.includes('min-height: 48px'), 'no escalation found in the CSS on disk');
    check('the form field is really required now, not starred',
        /required/.test(fs.readFileSync(path.join(a, 'src', 'App.jsx'), 'utf-8')));

    console.log('\n[2] A round that does not pay is ROLLED BACK, and the loop stops there\n');

    const b = project('flat');
    const before = fs.readFileSync(path.join(b, 'src', 'styles', 'app.css'), 'utf-8');
    const d2 = driver(b, [70], [['low_contrast']]);
    const r2 = await improveUntilItStops({ score: 78, findingIds: ['low_contrast', 'small_targets'] }, d2.opts);
    for (const l of d2.lines) console.log(`      ${l}`);

    check('the round is recorded as gaining nothing',
        r2.rounds[0]?.verdict === 'no_measured_gain', r2.rounds[0]?.verdict);
    check('…and it was rolled back', r2.rounds[0]?.rolledBack === true);
    check('the files on disk are exactly what they were',
        fs.readFileSync(path.join(b, 'src', 'styles', 'app.css'), 'utf-8') === before);
    check('the published verdict is the FIRST number, not the worse one',
        r2.final.score === 78, String(r2.final.score));
    check('and it says so out loud', d2.lines.some(l => /no gain, rolled back, stopping/.test(l)),
        d2.lines.join(' | ').slice(0, 200));

    console.log('\n[3] Nothing left to write is not a failure — and not five more rounds of theatre\n');

    const c = project('done');
    // Repair it once so a second call has nothing different to say.
    await repairRound(c, 1, { isArabic: false });
    await repairRound(c, 2, { isArabic: false });
    await repairRound(c, 3, { isArabic: false });
    const d3 = driver(c, [80], [['low_contrast']]);
    const r3 = await improveUntilItStops({ score: 80, findingIds: ['low_contrast'] }, {
        ...d3.opts,
        // Round 4 is past the escalation table — nothing new to write.
        repair: async (round: number) => (await repairRound(c, round + 3, { isArabic: false })).changed,
    });
    for (const l of d3.lines) console.log(`      ${l}`);
    check('it stops instead of spending a build on identical bytes',
        r3.stoppedBecause === 'no_change_possible', r3.stoppedBecause);
    check('the round is recorded honestly, with no score claimed',
        r3.rounds[0]?.verdict === 'no_change_possible' && r3.rounds[0]?.after === undefined);
    check('and it says why', d3.lines.some(l => /nothing new to write/.test(l)),
        d3.lines.join(' | ').slice(0, 200));

    console.log('\n[4] A round that breaks the build is undone, and the loop stops\n');

    const e = project('breaks');
    const beforeE = fs.readFileSync(path.join(e, 'src', 'styles', 'app.css'), 'utf-8');
    const d4 = driver(e, [99], [[]]);
    const r4 = await improveUntilItStops({ score: 78, findingIds: ['low_contrast'] }, {
        ...d4.opts,
        rebuild: async () => false,
    });
    for (const l of d4.lines) console.log(`      ${l}`);
    check('a failed build ends the loop', r4.stoppedBecause === 'build_failed', r4.stoppedBecause);
    check('…and the round is rolled back', r4.rounds[0]?.rolledBack === true);
    check('the project is byte-for-byte what it was',
        fs.readFileSync(path.join(e, 'src', 'styles', 'app.css'), 'utf-8') === beforeE);
    check('the score published is the one that was really measured',
        r4.final.score === 78, String(r4.final.score));

    console.log('\n[5] Already good enough: no round runs at all\n');

    const f = project('great');
    const d5 = driver(f, [99], [[]]);
    const r5 = await improveUntilItStops({ score: 97, findingIds: [] }, d5.opts);
    check('a build at the bar spends nothing', r5.rounds.length === 0 && r5.stoppedBecause === 'target_reached');
    check('and says the bar was already met', d5.lines.some(l => /at or above the 95 bar/.test(l)),
        d5.lines.join(' | ').slice(0, 160));

    console.log('\n[6] The build really drives it — not a module nobody calls\n');

    const REACT = fs.readFileSync(path.join(__dirname, '..', '..',
        'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
    check('react_project calls the loop', /await improveUntilItStops\(/.test(REACT));
    check('…with a real browser measurement per round', /const a = await auditBuiltApp\(path\.join\(proj, 'dist'\)/.test(REACT));
    check('…a real rebuild per round', /const rb = await runDoctored\('npm', \['run', 'build'\]/.test(REACT));
    check('…a real snapshot and a real restore',
        /snapshotProject\(proj, label\)/.test(REACT) && /restoreVersion\(proj, id\)/.test(REACT));
    check('…and the repaired page is re-packaged before it is measured',
        /if \(packaged\) packageIntoApi\(false\);/.test(REACT));
    check('every round reaches the delivery report', /for \(const r of loop\.rounds\)/.test(REACT));

    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* windows holds files */ }
    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
