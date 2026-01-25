
import { AutoTrainerTool } from '../tools/definitions/AutoTrainerTool';

async function train() {
    console.log('🚀 Starting Autonomous Training Sequence...');

    const trainer = new AutoTrainerTool();
    const result = await trainer.execute({
        domain: 'all',
        intensity: 'medium' // 500+ reflexes
    });

    console.log('✅ Training Complete!');
    console.log(JSON.stringify(result, null, 2));
}

train().catch(console.error);
