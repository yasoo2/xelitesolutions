/**
 * IMAGE-STUDIO-PRIMARY-DATA-001 review probe part 2 (Muse, independent).
 * Runs the REAL image_studio tool against the REAL nursery project built
 * by probe part 1, with the session entry injected in the exact shape
 * ApiProjectTool.writeJoeProject persists (dir/resource/model).
 * Expects: primary `plants` (+ its image column) invisible to the tool.
 */
export {};
import fs from 'fs';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.OFFLINE_MODE = 'true';
process.env.AUTO_APPROVE_ALL = '1';

async function main() {
    const dir = 'D:\\Joe\\muse-worktree\\tmp\\sbx-tmp\\joe-isp-532sKx\\api-مشروع-النظام';
    if (!fs.existsSync(path.join(dir, 'db.js'))) { console.error('PART1_DIR_MISSING'); process.exit(2); }
    const sessionId = `isp2-${Date.now()}`;
    (global as any).joeProjects = (global as any).joeProjects || {};
    (global as any).joeProjects[sessionId] = {
        dir, type: 'api', brand: 'x', resource: 'plants', port: 4100, updatedAt: Date.now(),
        lastRequest: 'nursery', appKind: 'shop',
        model: [{ key: 'plants' }, { key: 'suppliers' }],
    };
    const { executeTool } = await import('../api/src/modules/services/ToolService');
    const { executionFirewall } = await import('../api/src/orchestration/AgentExecutionFirewall');
    const ctx = { sessionId, userId: 'u1', workspaceId: `session-${sessionId}`, language: 'en' };
    const noFilter: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('image_studio', { context: 'plant nursery' }, ctx));
    const plantsOnly: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('image_studio', { table: 'plants', context: 'plant nursery' }, ctx));
    const out = {
        noFilter: { ok: noFilter?.ok, error: String(noFilter?.error || '').slice(0, 200), output: noFilter?.output || null },
        plantsOnly: { ok: plantsOnly?.ok, error: String(plantsOnly?.error || '').slice(0, 200), output: plantsOnly?.output || null },
    };
    fs.writeFileSync('tmp/probe-image-studio-primary.part2.json', JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
}

main().catch(e => { console.error('PROBE_ERROR', e); process.exit(2); });
