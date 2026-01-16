
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { GenesisAgent } from '../agents/GenesisAgent';
// Mock/Minimal Implementation if GenesisAgent isn't fully decoupled or if we want a lighter test.
// But we want to test the REAL agent.

dotenv.config({ path: path.join(__dirname, '../../.env') });

const TEST_DIR = path.join(__dirname, '../../test_factory_output');

async function main() {
  console.log('🏭 Testing Factory Capability (Genesis Agent)...');

  // 1. Setup
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR);
  const testFile = path.join(TEST_DIR, 'hello.txt');
  if (fs.existsSync(testFile)) fs.unlinkSync(testFile);

  // 2. Mock Session/IO
  // The GenesisAgent usually needs a session context. We might need to mock it.
  // Or we can use the `tools/definitions/GenesisTool.ts` logic if it exposes enough.
  // Let's verify if `GenesisAgent` is importable.

  // Actually, looking at previous file list, `GenesisAgent` is in `../agents/GenesisAgent`.
  // Let's assume it exists. If not, I'll fail and check.

  console.log('   target: ' + testFile);

  try {
    // Constructor takes no args, reads env automatically
    const agent = new GenesisAgent();

    console.log('   🤖 Asking Agent to ORCHESTRATE a plan...');

    // GenesisAgent.orchestrate returns { plan, steps } but doesn't execute them self?
    // Let's check the output steps.
    const goal = `Create a text file at "${testFile}" with the content: "Factory Online"`;
    const result = await agent.orchestrate(goal);

    console.log('\n   📜 Generated Plan Length:', result.plan.length);
    console.log('   🛠️  Generated Steps:', result.steps.length);

    if (result.steps.length > 0) {
      console.log('   Step 1:', JSON.stringify(result.steps[0]));

      // Check if it planned to write the file
      const writeStep = result.steps.find(s => s.tool === 'file_write' || (s.tool === 'shell_execute' && s.args.command.includes('echo')));

      if (writeStep) {
        console.log('   ✅ Factory Verification Passed: AI successfully planned the file creation.');
        console.log('   (Note: GenesisAgent.orchestrate only plans. Execution is handled by TaskLoop/Runner. This confirms the BRAIN is working.)');
        process.exit(0);
      } else {
        console.warn('   ⚠️  AI planned steps but maybe not the right tool?');
        console.log(JSON.stringify(result.steps, null, 2));
        process.exit(1);
      }
    } else {
      console.error('   ❌ Factory Verification Failed: No steps generated.');
      process.exit(1);
    }

  } catch (e: any) {
    console.error('   ❌ Agent Exception:', e);
    // Fallback: If GenesisAgent isn't easily unit-testable due to deps, allow manual check or check `tools` integration.
    // But we really want to know if the LLM can drive the tools.
    process.exit(1);
  }
}

main();
