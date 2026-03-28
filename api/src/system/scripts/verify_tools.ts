import fs from 'fs';
import path from 'path';
import { planNextStep } from '../../core/llm';
import { routeToModel } from '../../core/llm/intelligent-router';
import { executeTool } from '../../modules/services/ToolService';
import { workspaceService } from '../../modules/services/WorkspaceService';

const TOOLS_DIR = path.resolve(__dirname, '../tools/definitions');

async function maybeStartMockLocalLlm() {
    const enabled = String(process.env.LOCAL_LLM_MOCK || '').trim() === '1';
    const hasBaseUrl = String(process.env.LOCAL_LLM_BASE_URL || '').trim().length > 0;
    if (!enabled || hasBaseUrl) return { close: async () => { } };

    const http = await import('http');

    const server = http.createServer((req, res) => {
        try {
            const method = String(req.method || '').toUpperCase();
            const url = String(req.url || '');
            if (method === 'POST' && url === '/v1/chat/completions') {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({
                    id: 'mock-local',
                    object: 'chat.completion',
                    created: Date.now(),
                    model: 'mock-local',
                    choices: [{ index: 0, message: { role: 'assistant', content: 'local provider OK' }, finish_reason: 'stop' }]
                }));
                return;
            }
            res.writeHead(404, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'not_found' }));
        } catch {
            try { res.writeHead(500); res.end(''); } catch { }
        }
    });

    await new Promise<void>((resolve, reject) => {
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    process.env.LOCAL_LLM_BASE_URL = `http://127.0.0.1:${port}/v1`;

    return {
        close: async () => {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    };
}

function verifyTools() {
    console.log('🔍 Starting Tool Logic Verification...');
    if (!fs.existsSync(TOOLS_DIR)) {
        console.error('❌ Tools directory not found!');
        process.exit(1);
    }

    const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.ts'));
    let errors = 0;

    files.forEach(file => {
        const content = fs.readFileSync(path.join(TOOLS_DIR, file), 'utf-8');

        // 1. Check for BaseTool inheritance or implementation
        if (!content.includes('extends BaseTool') && !content.includes('implements Tool')) {
            console.warn(`⚠️ ${file}: Does not extend BaseTool (might be inconsistent)`);
        }

        // 2. Check for missing properties
        if (!content.includes('name =')) console.error(`❌ ${file}: Missing 'name' property`);
        if (!content.includes('description =')) console.error(`❌ ${file}: Missing 'description' property`);
        if (!content.includes('inputSchema =')) console.error(`❌ ${file}: Missing 'inputSchema' property`);

        // 3. Check for implicit any in execute
        if (content.includes('execute(input)') || content.includes('execute: async (input)')) {
            // warning, but not error if tsc catches it.
        }

        // 4. Check for hardcoded secrets
        if (content.match(/['"][a-zA-Z0-9]{20,}['"]/)) {
            // Simple heuristic for hardcoded keys
            // console.warn(`⚠️ ${file}: Possible hardcoded secret found`);
        }
    });

    console.log(`✅ Verified ${files.length} tools.`);
}

async function verifyAutoTooling() {
    console.log('🤖 Verifying Auto planner tool selection...');

    const workspaceId = 'verify_tools';
    await workspaceService.setActiveRoot(process.cwd(), workspaceId);

    const planLs = await planNextStep([{ role: 'user', content: 'ls' }], { provider: 'auto' });
    if (!planLs || planLs.name !== 'ls') {
        console.error('❌ Auto planner did not select ls:', planLs);
        process.exit(1);
    }

    const lsResult = await executeTool(planLs.name, planLs.input, { workspaceId });
    if (!lsResult.ok || !Array.isArray(lsResult.output?.entries)) {
        console.error('❌ ls tool failed:', lsResult);
        process.exit(1);
    }

    const planRead = await planNextStep([{ role: 'user', content: 'read file package.json' }], { provider: 'auto' });
    if (!planRead || planRead.name !== 'read_file') {
        console.error('❌ Auto planner did not select read_file:', planRead);
        process.exit(1);
    }

    const readResult = await executeTool(planRead.name, planRead.input, { workspaceId });
    const content = String(readResult.output?.content || '');
    if (!readResult.ok || !content.includes('"name"') || !content.includes('"api"')) {
        console.error('❌ read_file tool failed or returned unexpected content:', readResult);
        process.exit(1);
    }

    console.log('✅ Auto planner + tool execution verified.');
}

async function verifyWebsiteRouting() {
    console.log('🌐 Verifying website build routing...');

    const planWeb = await planNextStep(
        [{ role: 'user', content: 'Build a website for a coffee shop with menu, gallery, and contact form.' }],
        { provider: 'auto' }
    );

    const ok =
        !!planWeb &&
        (planWeb.name === 'website_full_pipeline' || planWeb.name === 'genesis_build');

    if (!ok) {
        console.error('❌ Website build request routed incorrectly:', planWeb);
        process.exit(1);
    }

    console.log(`✅ Website build routed to: ${planWeb?.name}`);
}

async function verifyLocalAutoProvider() {
    const baseUrl = String(process.env.LOCAL_LLM_BASE_URL || '').trim();
    if (!baseUrl) {
        console.log('ℹ️  Skipping local provider check (LOCAL_LLM_BASE_URL not set).');
        return;
    }

    console.log('🏠 Verifying local provider for Auto...');

    const prevStrict = process.env.LOCAL_LLM_STRICT;
    process.env.LOCAL_LLM_STRICT = '1';
    const prevGroqKey = process.env.GROQ_API_KEY;
    const prevOpenRouterKey = process.env.OPENROUTER_API_KEY;
    delete (process.env as any).GROQ_API_KEY;
    delete (process.env as any).OPENROUTER_API_KEY;

    try {
        const text = await routeToModel([
            { role: 'system', content: 'Reply with a single short sentence.' },
            { role: 'user', content: 'Say: local provider OK' }
        ]);
        const out = String(text || '').trim();
        if (!out || out.includes('LOCAL_LLM_FAILED')) {
            console.error('❌ Local provider did not respond correctly:', out);
            process.exit(1);
        }
        console.log('✅ Local provider responded.');
    } finally {
        if (prevStrict === undefined) delete (process.env as any).LOCAL_LLM_STRICT;
        else process.env.LOCAL_LLM_STRICT = prevStrict;
        if (prevGroqKey === undefined) delete (process.env as any).GROQ_API_KEY;
        else process.env.GROQ_API_KEY = prevGroqKey;
        if (prevOpenRouterKey === undefined) delete (process.env as any).OPENROUTER_API_KEY;
        else process.env.OPENROUTER_API_KEY = prevOpenRouterKey;
    }
}

async function verifyNewQualityTools() {
    console.log('🧪 Verifying new quality/security/CI tools...');

    const workspaceId = 'verify_tools';

    const secrets = await executeTool('secrets_scan_repo', { path: '.', maxFindings: 20 }, { workspaceId });
    if (!secrets.ok) {
        console.error('❌ secrets_scan_repo reported findings:', secrets.output);
        process.exit(1);
    }
    console.log('✅ secrets_scan_repo: no findings.');

    const dep = await executeTool('dependency_audit', { path: '.', packageManager: 'npm' }, { workspaceId });
    const depReport = String(dep.output?.report || '');
    if (!depReport) {
        console.error('❌ dependency_audit returned empty report:', dep);
        process.exit(1);
    }
    console.log(`✅ dependency_audit: ok=${dep.ok} reportChars=${depReport.length}`);

    const q = await executeTool('quality_run', { path: '.', tasks: ['lint', 'typecheck', 'build'] }, { workspaceId });
    if (!q.ok) {
        console.error('❌ quality_run failed:', q.output);
        process.exit(1);
    }
    console.log('✅ quality_run passed.');

    const tmpDir = path.join(process.cwd(), '.tmp-ci');
    try {
        const ci = await executeTool('ci_generate_pipeline', { path: '.tmp-ci', kind: 'node' }, { workspaceId });
        if (!ci.ok) {
            console.error('❌ ci_generate_pipeline failed:', ci);
            process.exit(1);
        }
        const wf = String(ci.output?.workflowPath || '');
        if (!wf) {
            console.error('❌ ci_generate_pipeline returned no workflowPath:', ci);
            process.exit(1);
        }
        if (!fs.existsSync(wf)) {
            console.error('❌ ci_generate_pipeline workflowPath missing on disk:', wf);
            process.exit(1);
        }
        console.log(`✅ ci_generate_pipeline: ${ci.output?.skipped ? 'skipped' : 'created'} (${wf})`);
    } finally {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

(async () => {
    const mock = await maybeStartMockLocalLlm();
    try {
        verifyTools();
        await verifyAutoTooling();
        await verifyWebsiteRouting();
        await verifyLocalAutoProvider();
        await verifyNewQualityTools();
    } finally {
        await mock.close();
    }
})();
