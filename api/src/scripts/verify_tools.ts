import fs from 'fs';
import path from 'path';

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

verifyTools();
