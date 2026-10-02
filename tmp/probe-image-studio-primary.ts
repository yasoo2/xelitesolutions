/**
 * IMAGE-STUDIO-PRIMARY-DATA-001 review probe (Muse, independent).
 * Builds the REAL nursery project via api_project (same call the
 * verify_pictures_are_fetched fixture uses) and inspects WHERE the
 * `plants` table and its image column actually land: db.js (primary)
 * vs entities.js (secondary). No browser, no network, no image fetch.
 * Run: JWT_SECRET=x npx tsx tmp/probe-image-studio-primary.ts
 */
export {};
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.OFFLINE_MODE = 'true';
process.env.AUTO_APPROVE_ALL = '1';

const HIS_WORDS = 'ابنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات مع صور نباتات وثيم اخضر جميل للنظام';

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-isp-'));
    process.env.JOE_CHAT_STORE_DIR = path.join(root, 'store');
    fs.mkdirSync(process.env.JOE_CHAT_STORE_DIR, { recursive: true });
    const sessionId = `isp-${Date.now()}`;
    const { executeTool } = await import('../api/src/modules/services/ToolService');
    const { executionFirewall } = await import('../api/src/orchestration/AgentExecutionFirewall');
    const built: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('api_project', { request: HIS_WORDS, root },
            { sessionId, userId: 'u1', workspaceId: `session-${sessionId}`, language: 'ar' }));
    const out: any = { builtOk: built?.ok === true, buildError: String(built?.error || '').slice(0, 200) };
    const dir = String((global as any).joeProjects?.[sessionId]?.dir || '');
    const entry = (global as any).joeProjects?.[sessionId] || {};
    out.dir = dir;
    out.entryKeys = Object.keys(entry);
    out.entryResource = entry.resource || null;
    out.entryModelKeys = Array.isArray(entry.model) ? entry.model.map((m: any) => m.key) : null;
    if (dir) {
        const files = fs.readdirSync(dir);
        out.files = files;
        out.hasDbJs = files.includes('db.js');
        out.hasEntitiesJs = files.includes('entities.js');
        if (out.hasDbJs) {
            const db = fs.readFileSync(path.join(dir, 'db.js'), 'utf-8');
            const m = db.match(/const COLS = (\[.*?\]);/s);
            out.dbCols = m ? m[1].slice(0, 600) : 'COLS_NOT_FOUND';
            out.dbHasImageCol = /"key":"image"|key:\s*['"]image['"]/.test(m ? m[1] : '');
            out.dbTableMatch = (db.match(/CREATE TABLE IF NOT EXISTS (\w+)/) || [])[1] || null;
        }
        if (out.hasEntitiesJs) {
            const en = fs.readFileSync(path.join(dir, 'entities.js'), 'utf-8');
            out.entitiesTableKeys = [...en.matchAll(/tables\.(\w+)\s*=/g)].map(x => x[1]).slice(0, 10);
            out.entitiesHasPlants = /plants/.test(en);
            out.entitiesHasImageField = /['"]image['"]/.test(en);
        }
    }
    const outFile = path.join('tmp', 'probe-image-studio-primary.result.json');
    fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
}

main().catch(e => { console.error('PROBE_ERROR', e); process.exit(2); });
