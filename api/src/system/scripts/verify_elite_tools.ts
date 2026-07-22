
import {
    DependencyGraphTool,
    BusinessLogicTool,
    ChaosTestingTool,
    ComplianceValidatorTool,
    CostEstimatorTool,
    AmbiguityResolverTool
} from '../../modules/tools/definitions/EliteTools';

async function verify() {
    console.log('🧪 Verifying Elite Tools Suite...\n');

    // 1. Dependency Graph
    try {
        console.log('[1/6] Testing DependencyGraphTool...');
        const graphTool = new DependencyGraphTool();
        const res = await graphTool.execute({ path: './src' });
        console.log('Result:', JSON.stringify(res.output).slice(0, 100) + '...');
    } catch (e: any) { console.error('FAILED:', e.message); }

    // 2. Business Logic
    try {
        console.log('\n[2/6] Testing BusinessLogicTool...');
        const logicTool = new BusinessLogicTool();
        const res = await logicTool.execute({ requirements: 'Users must be 18+. If premium, give 10% discount.' });
        console.log('Result:', JSON.stringify(res.output).slice(0, 100) + '...');
    } catch (e: any) { console.error('FAILED:', e.message); }

    // 3. Chaos Test
    try {
        console.log('\n[3/6] Testing ChaosTestingTool...');
        const chaosTool = new ChaosTestingTool();
        const res = await chaosTool.execute({ architecture: 'Node.js API + MongoDB + Redis Cache' });
        console.log('Result:', JSON.stringify(res.output).slice(0, 100) + '...');
    } catch (e: any) { console.error('FAILED:', e.message); }

    // 4. Compliance
    try {
        console.log('\n[4/6] Testing ComplianceValidatorTool...');
        const compTool = new ComplianceValidatorTool();
        const res = await compTool.execute({ content: 'storing user passwords in plain text', standard: 'GDPR' });
        console.log('Result:', JSON.stringify(res.output).slice(0, 100) + '...');
    } catch (e: any) { console.error('FAILED:', e.message); }

    // 5. Cost
    try {
        console.log('\n[5/6] Testing CostEstimatorTool...');
        const costTool = new CostEstimatorTool();
        const res = await costTool.execute({ resources: ['EC2 t3.medium', 'RDS db.t3.micro'], traffic: 'Low' });
        console.log('Result:', JSON.stringify(res.output).slice(0, 100) + '...');
    } catch (e: any) { console.error('FAILED:', e.message); }

    // 6. Ambiguity
    try {
        console.log('\n[6/6] Testing AmbiguityResolverTool...');
        const ambTool = new AmbiguityResolverTool();
        const res = await ambTool.execute({ text: 'Make the app better.' });
        console.log('Result:', JSON.stringify(res.output).slice(0, 100) + '...');
    } catch (e: any) { console.error('FAILED:', e.message); }

    console.log('\n✅ Verification Complete.');
}

verify();
