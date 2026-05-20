import { ProgressiveGeneratorTool } from './api/src/modules/tools/definitions/ProgressiveGeneratorTool';

async function run() {
    const tool = new ProgressiveGeneratorTool();

    console.log('--- Initializing Small Project ---');
    const initRes = await tool.execute({
        action: 'init',
        config: {
            name: 'TestEcommerceAI',
            type: 'web',
            framework: 'react',
            scale: 'small', // small scale = 5 components
            features: ['Cart', 'Checkout']
        },
        baseDir: __dirname + '/test-dist'
    });

    console.log('INIT RESULT:\\n', JSON.stringify(initRes, null, 2));

    if (initRes.ok && initRes.output?.nextBatch) {
        console.log(`\\n--- Generating First Batch: ${initRes.output.nextBatch} ---`);
        const batchRes = await tool.execute({
            action: 'generate_batch',
            projectId: initRes.output.projectId,
            batchId: initRes.output.nextBatch,
            baseDir: __dirname + '/test-dist'
        });
        console.log('\\nBATCH RESULT:\\n', JSON.stringify(batchRes, null, 2));
    }
}

run().catch(console.error);
