/**
 * WHAT JOE UNDERSTOOD, FOR A THOUSAND SENTENCES.
 *
 * This calls the SAME functions the live pipeline calls — planSite,
 * acceptanceFor, derivedColumns — on Joe's own source. Nothing here simulates
 * Joe; it asks him, one sentence at a time, and writes down the answer.
 *
 * A full live round is three to four minutes: a real npm build, a real browser
 * audit. A thousand of those is fifty hours. But almost every failure found on
 * this project has been a failure of READING — a page dropped, a column
 * invented, a criterion never derived — and reading is measurable in
 * milliseconds. So this finds the classes, and a live round proves each one.
 *
 *     npx ts-node --transpile-only src/tests/corpus/measure-thousand.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { THOUSAND, type Prompt } from './thousand-prompts';
import { planSite, thePagesHeNamed } from '../../core/design/site-plan';
import { acceptanceFor } from '../../core/quality/acceptance';
import { derivedColumns } from '../../core/design/app-blueprints';

const fold = (s: string) => s
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي');

export interface Reading {
    id: string;
    tier: number;
    kind: string;
    text: string;
    pages: string[];
    multiPage: boolean;
    reason: string;
    columns: string[];
    criteria: string[];
    /** Everything that went wrong, named. Empty means it read the sentence. */
    faults: string[];
}

function read(p: Prompt): Reading {
    const faults: string[] = [];
    let pages: string[] = [];
    let multiPage = false;
    let reason = '';
    let columns: string[] = [];
    let criteria: string[] = [];

    try {
        const plan = planSite('landing', p.text, /[؀-ۿ]/.test(p.text));
        pages = plan.pages.map(x => x.file.replace(/\.html$/, ''));
        multiPage = plan.multiPage;
        reason = plan.reason;
    } catch (e: any) { faults.push(`planSite threw: ${e.message}`); }

    try {
        columns = (derivedColumns(p.text) || []).map((c: any) => String(c.label));
    } catch (e: any) { faults.push(`derivedColumns threw: ${e.message}`); }

    try {
        criteria = acceptanceFor(p.text).map(c => c.id);
    } catch (e: any) { faults.push(`acceptanceFor threw: ${e.message}`); }

    //  ---- what he asked for and did not get -----------------------------
    for (const want of p.expect.pages || []) {
        if (!pages.includes(want)) faults.push(`page-missing:${want}`);
    }
    if (typeof p.expect.columns === 'number' && columns.length !== p.expect.columns) {
        faults.push(`columns:${columns.length}-of-${p.expect.columns}`);
    }
    for (const id of p.expect.criteria || []) {
        if (!criteria.includes(id)) faults.push(`criterion-missing:${id}`);
    }
    //  ---- and what he did not ask for and got ---------------------------
    for (const bad of p.expect.forbid || []) {
        if (criteria.includes(bad)) faults.push(`criterion-invented:${bad}`);
    }
    //  ---- a page he named that vanished ---------------------------------
    const named = thePagesHeNamed(fold(p.text));
    for (const nmd of named) {
        if (!pages.includes(nmd.slug)) faults.push(`named-page-dropped:${nmd.slug}`);
    }
    //  ---- a request that produced NOTHING at all ------------------------
    //  A deliberately incomplete request SHOULD derive nothing — the honest
    //  answer to «اعمل لي موقع» is a question, not a guess. Tier 7 is excluded
    //  because measuring it here would call Joe wrong for being right.
    if (!criteria.length && !columns.length && !multiPage && p.tier >= 3 && p.tier !== 7) {
        faults.push('nothing-derived');
    }
    return { id: p.id, tier: p.tier, kind: p.kind, text: p.text, pages, multiPage, reason, columns, criteria, faults };
}

const readings = THOUSAND.map(read);

/* ---------- the report: by tier, then by fault ----------------------------- */
const byTier = new Map<number, { total: number; clean: number }>();
const faultCount = new Map<string, number>();
const faultExample = new Map<string, string>();

for (const r of readings) {
    const t = byTier.get(r.tier) || { total: 0, clean: 0 };
    t.total++;
    if (!r.faults.length) t.clean++;
    byTier.set(r.tier, t);
    for (const f of r.faults) {
        const key = f.split(':')[0];
        faultCount.set(key, (faultCount.get(key) || 0) + 1);
        if (!faultExample.has(key)) faultExample.set(key, `${r.text}   →   ${f}`);
    }
}

const lines: string[] = [];
lines.push('PROMPTS=' + readings.length);
lines.push('');
lines.push('TIER   CLEAN / TOTAL');
for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
    const t = byTier.get(tier)!;
    const pct = Math.round((t.clean / t.total) * 100);
    lines.push(`  ${tier}    ${String(t.clean).padStart(4)} / ${String(t.total).padStart(4)}   ${String(pct).padStart(3)}%`);
}
const clean = readings.filter(r => !r.faults.length).length;
lines.push('');
lines.push(`TOTAL_CLEAN=${clean}`);
lines.push(`TOTAL_WITH_FAULTS=${readings.length - clean}`);
lines.push('');
lines.push('FAULTS, most common first:');
for (const [k, c] of [...faultCount.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${String(c).padStart(4)}  ${k}`);
    lines.push(`        e.g.  ${faultExample.get(k)}`);
}

const report = lines.join('\n');
console.log(report);

const dir = process.env.CORPUS_OUT || path.join(process.cwd(), '..', 'docs', 'corpus');
try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'reading-report.txt'), report, 'utf8');
    fs.writeFileSync(path.join(dir, 'readings.json'), JSON.stringify(readings, null, 1), 'utf8');
    console.log('\nWROTE=' + path.join(dir, 'reading-report.txt'));
} catch (e: any) { console.log('\nWRITE_FAILED=' + e.message); }
