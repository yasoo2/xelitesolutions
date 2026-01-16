
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { GenesisAgent } from '../agents/GenesisAgent';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const OUTPUT_DIR = path.join(__dirname, '../../test_build_output');
const APP_FILE = path.join(OUTPUT_DIR, 'calculator.html');

async function main() {
    console.log('🚀 Starting End-to-End Build Verification...');
    console.log('   Goal: Build a modern Calculator App (Single HTML File)');

    // 1. Setup Environment
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    try {
        // 2. Summon Agent
        const agent = new GenesisAgent();
        console.log('   🧠 Genesis Agent initialized.');

        // 3. Orchestrate Plan
        const goal = `Create a fully functional, modern, beautiful Calculator app in a single HTML file at "${APP_FILE}". Use TailwindCSS via CDN for styling. It should look premium.`;
        console.log('   🤔 Planning...');

        const result = await agent.orchestrate(goal);
        console.log(`   📝 Plan generated with ${result.steps.length} steps.`);

        // 4. Execute Steps (Simulating the Runner)
        console.log('   ⚙️  Executing steps...');

        for (const step of result.steps) {
            console.log(`      ▶️  Executing: ${step.tool} - ${step.name}`);

            if (step.tool === 'file_write') {
                const filePath = step.args.path;
                const content = step.args.content;

                // Ensure dir exists
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

                fs.writeFileSync(filePath, content);
                console.log(`         ✅ Wrote file: ${path.basename(filePath)} (${content.length} bytes)`);
            }
            else if (step.tool === 'shell_execute') {
                console.log(`         ℹ️  Skipping shell execution for safety in this test: ${step.args.command}`);
            }
            else if (step.tool === 'scaffold_project') {
                console.log('         ℹ️  Skipping scaffold (using file_write for single file test).');
            }
            else {
                console.warn(`         ⚠️  Unknown tool: ${step.tool}`);
            }
        }

        // 5. Verification
        if (fs.existsSync(APP_FILE)) {
            console.log('\n   ✅ SUCCESS: Calculator app created successfully!');
            console.log(`   📍 Location: ${APP_FILE}`);
            process.exit(0);
        } else {
            console.error('\n   ❌ FAILURE: Target file was not created.');
            process.exit(1);
        }

    } catch (e: any) {
        console.error('\n   ❌ CRITICAL ERROR:', e);
        process.exit(1);
    }
}

main();
