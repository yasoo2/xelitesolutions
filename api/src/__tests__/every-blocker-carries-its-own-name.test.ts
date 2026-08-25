/**
 * A DELIVERY THAT REFUSES ITSELF MUST SAY WHAT IT FOUND.
 *
 * Measured live on this machine. The request was «اعمل لي صفحة هبوط وصفحة
 * تواصل لشركة تنظيف»; the project was scaffolded, vite built it, dist/ holds
 * an index.html — and the owner's entire reply was one line:
 *
 *     ⚠️ توقّفت عند الخطوة «Building» — react_delivery_quality_gate_failed
 *
 * He is not a programmer. That names nothing he can act on, and Joe knew
 * exactly which findings had survived: they were sitting in `blockers`.
 *
 * The cause was structural, not a slip. `deliveryBlocked` is a disjunction of
 * conditions, and the ternary that turns it into a cause named all of them but
 * one. The missing one — `blockers`, the surviving HIGH-severity audit
 * findings, the condition that fires most often — had no branch, so it landed
 * on the generic tail. A cause list one shorter than its condition list will
 * always report the missing condition under a borrowed name.
 *
 * So this guard reads the source and holds the SHAPE: every term that can
 * block a delivery must also appear in the chain that names causes. It is
 * deliberately structural — a test that only checked today's one string would
 * pass again the next time a condition is added and left unnamed, which is
 * exactly how this one arrived.
 */

import * as fs from 'fs';
import * as path from 'path';

const SOURCE = path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts');
const src = fs.readFileSync(SOURCE, 'utf8');
const lines = src.split(/\r?\n/);

const bare = (t: string) => t.trim().replace(/\.length\s*>\s*0$/, '').replace(/\.length$/, '').trim();

/** The disjuncts of one `const X = a || b;` line, or [] if there is no such line. */
function disjunctsOf(name: string): string[] {
    const line = lines.find(l => l.includes(`const ${name} =`));
    if (!line || !line.includes('||')) return [];
    return line
        .slice(line.indexOf('=') + 1)
        .replace(/;\s*$/, '')
        .split('||')
        .map(bare)
        .filter(Boolean);
}

/**
 * Every condition that can refuse a delivery, flattened one level.
 *
 * One disjunct is itself a disjunction — `qualityDeliveryBlocked` is
 * `blockers || visualAuditUnavailable` — and the cause chain names its two
 * halves rather than the name that groups them. Flattening is not a
 * convenience here: an unnamed condition can hide one level down just as
 * easily, which is precisely where this one was hiding.
 */
function blockingTerms(): string[] {
    const top = disjunctsOf('deliveryBlocked');
    const flat: string[] = [];
    for (const t of top) {
        const inner = disjunctsOf(t);
        for (const x of (inner.length ? inner : [t])) if (!flat.includes(x)) flat.push(x);
    }
    return flat;
}

/** The ternary chain that turns a refusal into a cause the owner can read. */
function causeChain(): string {
    const at = src.indexOf('error: deliveryBlocked');
    return at < 0 ? '' : src.slice(at, at + 3000);
}

describe('every condition that can block a delivery also names itself', () => {
    it('finds the terms and the chain at all', () => {
        expect(blockingTerms().length).toBeGreaterThanOrEqual(5);
        expect(causeChain()).toContain('acceptance_criteria_unmet');
    });

    it.each(blockingTerms().map(t => [t]))('«%s» appears in the cause chain', (term) => {
        expect(causeChain()).toContain(term);
    });

    it('the tail says that nothing named it, rather than inventing a reason', () => {
        //  A tail called «quality gate failed» describes a mechanism and
        //  implies a finding. If it is ever reached, the honest report is
        //  that a blocker fired and no branch above could say which.
        expect(causeChain()).toContain('delivery_blocked_without_a_named_cause');
        //  Checked as a RETURNED VALUE: the old name also appears in the prose
        //  at the top of this file, quoting what the owner actually saw. A
        //  guard that forbade the characters would forbid describing the
        //  defect it guards.
        expect(causeChain()).not.toContain(`: 'react_delivery_quality_gate_failed'`);
    });

    it('surviving high-severity findings are named, not counted', () => {
        const chain = causeChain();
        expect(chain).toContain('high_severity_findings_survived');
        //  Naming them means reading BOTH halves out of each finding: what it
        //  is called, and what it found. A count would give him a number and
        //  not a thing to fix; an id alone gives him a label.
        //
        //  Asserted as the PROPERTY and not the spelling — the first version of
        //  this line demanded the characters `blockers.map(` and went red the
        //  moment a `.slice(0, 3)` was placed between them, which is the same
        //  mistake this whole file exists to catch.
        expect(chain).toMatch(/blockers[^;]*\.map\(/);
        expect(chain).toMatch(/f\.id/);
        expect(chain).toMatch(/f\.detail/);
    });
});
