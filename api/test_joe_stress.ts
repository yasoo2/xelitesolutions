import { JoeAgent } from './src/core/agents/JoeAgent-V2';
import path from 'path';

async function runTest() {
    console.log('--- JOE PRO ALPHA : WAREHOUSE STRESS TEST ---');
    const projectDir = path.join(process.cwd(), 'data', 'projects', 'warehouse-pro');
    const agent = new JoeAgent(projectDir);
    
    const goal = 'قم ببناء نظام متطور لإدارة المخازن (Warehouse Management) بنظام الفول ستاك، مع واجهة مستخدم تعتمد على Glassmorphism ودعم كامل للغة العربية. استخدم أفضل ميزاتك الاحترافية في التوليد الآلي والتعافي الذاتي.';
    
    console.log(`Goal: ${goal}`);
    console.log(`Target: ${projectDir}`);
    
    try {
        const result = await agent.ignite(goal, {
            autoHeal: true,
            maxRetries: 3,
            verbose: true
        });
        
        console.log('--- TEST COMPLETED ---');
        console.log('Success:', result.success);
        if (!result.success) {
            console.log('Final Error:', result.finalError);
        }
    } catch (e: any) {
        console.error('--- TEST FAILED EXCEPTION ---');
        console.error(e.message);
    }
}

runTest();
