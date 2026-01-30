import fs from 'fs';
import path from 'path';
import { planNextStep } from '../llm';
import { executeTool } from '../services/ToolService';
import { workspaceService } from '../services/WorkspaceService';

const TOOLS_DIR = path.resolve(__dirname, '../tools/definitions');

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
    if (!planRead || planRead.name !== 'file_read') {
        console.error('❌ Auto planner did not select file_read:', planRead);
        process.exit(1);
    }

    const readResult = await executeTool(planRead.name, planRead.input, { workspaceId });
    const content = String(readResult.output?.content || '');
    if (!readResult.ok || !content.includes('"name"') || !content.includes('"api"')) {
        console.error('❌ file_read tool failed or returned unexpected content:', readResult);
        process.exit(1);
    }

    console.log('✅ Auto planner + tool execution verified.');
}

(async () => {
    verifyTools();
    await verifyAutoTooling();
})();
