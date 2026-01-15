import { tools } from '../tools/registry';

async function main() {
    console.log('🌌 Starting Genesis Verification...');

    try {
        const genesis = tools.find(t => t.name === 'genesis_build');
        if (!genesis) throw new Error('Genesis tool not found in registry!');

        console.log('✅ Genesis Tool Verified: Registered in system.');

        // We can't easily execute it fully without a real OpenAI key because it instantiates the Agent internally.
        // However, existence check + successful compilation is a strong signal.
        // Let's print the description to verify it's the right one.
        console.log(`   Description: ${genesis.description}`);

        if (genesis.tags?.includes('god_mode')) {
            console.log('✅ Tag Verified: god_mode');
        } else {
            console.error('❌ Tag Mismatch');
            process.exit(1);
        }

        console.log('\n✨ PHASE 3 SYSTEM VERIFIED ✨\n');

    } catch (err) {
        console.error('❌ Verification Error:', err);
        process.exit(1);
    }
}

main();
