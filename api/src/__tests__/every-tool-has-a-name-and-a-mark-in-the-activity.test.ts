/**
 * Every tool the agent engine offers its model, and every run the final checks
 * make, has a name for people (Arabic and English) and a kind with its own mark
 * in the Activity strip. «يجب ان يكون حقيقي ومربوط بشكل صحيح مع كل الادوات»
 * (2026-11-06). The tool list is read from the engine's own definitions, so a
 * tool added later without a name or a mark fails here.
 */
import fs from 'fs';
import path from 'path';
import { toolKind, toolLabel, tickInterval, TICK_LINE_MS } from '../../../web/src/lib/activity-feed';

const engine = path.join(__dirname, '..', 'core', 'engine');
const read = (file: string) => fs.readFileSync(file, 'utf8');

function engineTools(): string[] {
    const names = new Set<string>();
    const files = [
        ...fs.readdirSync(path.join(engine, 'tools')).filter(f => f.endsWith('.ts')).map(f => path.join(engine, 'tools', f)),
        path.join(engine, 'plan.ts'),
        path.join(engine, 'finish.ts'),
    ];
    for (const file of files) for (const m of read(file).matchAll(/^\s*name:\s*'([a-z_]+)'/gmu)) names.add(m[1]);
    //  The final checks run Joe's own tools in the run; they arrive as steps too.
    for (const m of read(path.join(engine, 'verify.ts')).matchAll(/runTool\('([a-z_]+)'/gu)) names.add(m[1]);
    return [...names].sort();
}

describe('every tool has a name and a mark in the Activity', () => {
    const tools = engineTools();

    it('reads the engine\'s whole toolbox', () => {
        for (const expected of ['file_read', 'file_write', 'shell_run', 'web_read', 'browser_open', 'plan_update', 'task_finish', 'quality_run', 'project_run']) {
            expect(tools).toContain(expected);
        }
    });

    it.each(engineTools())('%s has a name in Arabic and English, and a kind of its own', tool => {
        expect(toolLabel(tool, 'ar')).toBeTruthy();
        expect(toolLabel(tool, 'en')).toBeTruthy();
        expect(toolKind(tool)).not.toBe('other');
        expect(toolKind(`engine_${tool}`)).toBe(toolKind(tool));
    });

    it('the strip draws a mark for every kind', () => {
        const panel = read(path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'RunActivityPanel.tsx'));
        const map = panel.slice(panel.indexOf('const KIND_ICON'), panel.indexOf('};', panel.indexOf('const KIND_ICON')));
        const kinds = new Set(tools.map(toolKind));
        for (const kind of [...kinds, 'other']) expect(map).toMatch(new RegExp(`\\b${kind}: [A-Z]\\w+`));
    });

    it('a line types in quickly whatever its length', () => {
        expect(tickInterval(20) * 20).toBeLessThanOrEqual(TICK_LINE_MS);
        expect(tickInterval(160) * 160).toBeLessThanOrEqual(TICK_LINE_MS + 160 * 8);
        expect(tickInterval(5)).toBeGreaterThan(0);
    });
});
