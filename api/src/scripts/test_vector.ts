
import { VectorMemory } from '../memory/VectorMemory';

async function main() {
    console.log('Testing VectorMemory import...');
    try {
        const mem = new VectorMemory();
        await mem.init();
        console.log('VectorMemory initialized successfully.');
    } catch (e) {
        console.error('VectorMemory failed:', e);
    }
}
main();
