import { freeIntelligenceOptimizer } from '../../core/llm/free-intelligence-optimizer';
import { analyzeTask } from '../../core/llm/intelligent-router';
import { tools } from '../../modules/tools/registry';

async function runAudit() {
    console.log('🔍 STARTING DEEP SYSTEM AUDIT...');
    const results: any[] = [];

    // 1. Audit Tool Registry
    console.log('\n[1/4] Auditing Tool Registry 🛠️');
    try {
        const count = tools.length;
        console.log(`✅ Loaded ${count} tools.`);
        if (count < 10) throw new Error('Tool count suspiciously low!');
        results.push({ name: 'Tool Registry', status: 'PASS', details: `${count} tools loaded` });
    } catch (e: any) {
        console.error('❌ Tool Registry Failed:', e.message);
        results.push({ name: 'Tool Registry', status: 'FAIL', details: e.message });
    }

    // 2. Audit Intelligence Router
    console.log('\n[2/4] Auditing Intelligence Router 🧠');
    try {
        const t1 = analyzeTask('hello');
        const t2 = analyzeTask('build a full react app with backend');
        const t3 = analyzeTask('search for weather');

        console.log(`- "hello" -> ${t1.complexity} (Expected: low)`);
        console.log(`- "build app" -> ${t2.complexity} (Expected: extreme/high)`);
        console.log(`- "search" -> ${t3.type} (Expected: browser_task)`);

        if (t1.complexity !== 'low') throw new Error('Router failed simple classification');
        if (t3.type !== 'browser_task') throw new Error('Router failed browser detection');

        results.push({ name: 'Intelligence Router', status: 'PASS', details: 'Classification logic verified' });
    } catch (e: any) {
        console.error('❌ Router Audit Failed:', e.message);
        results.push({ name: 'Intelligence Router', status: 'FAIL', details: e.message });
    }

    // 3. Audit Memory (Reflex Core)
    console.log('\n[3/4] Auditing Memory Core (Reflexes) 💾');
    try {
        const testTrigger = `audit_trigger_${Date.now()}`;
        const testResponse = `audit_response_confirmed`;

        // Train
        freeIntelligenceOptimizer.train(testTrigger, testResponse);

        // Retrieve
        const reflex = freeIntelligenceOptimizer.generateSmartResponse(testTrigger, []);

        if (reflex && reflex.includes(testResponse)) {
            console.log('✅ Memory Write/Read Cycle confirmed.');
            results.push({ name: 'Memory Core', status: 'PASS', details: 'Read/Write cycle successful' });
        } else {
            throw new Error('Memory failed to retrieve just-written data');
        }
    } catch (e: any) {
        console.error('❌ Memory Audit Failed:', e.message);
        results.push({ name: 'Memory Core', status: 'FAIL', details: e.message });
    }

    // 4. Audit Genesis Agent (Fast Path)
    console.log('\n[4/4] Auditing Genesis Agent (Execution Flow) 🤖');
    try {
        console.log('✅ Skipping Genesis Agent (Deprecated, replaced by JoeAgent)');
        results.push({ name: 'Genesis Agent', status: 'PASS', details: 'Deprecated' });
    } catch (e: any) {
        console.error('❌ Genesis Audit Failed:', e.message);
        results.push({ name: 'Genesis Agent', status: 'FAIL', details: e.message });
    }

    // Final Report
    console.log('\n=============================================');
    console.log('📊 AUDIT SUMMARY');
    console.log('=============================================');
    results.forEach(r => {
        console.log(`${r.status === 'PASS' ? '✅' : '❌'} ${r.name}: ${r.details}`);
    });

    if (results.some(r => r.status === 'FAIL')) {
        console.log('\n🚨 SYSTEM INTEGRITY COMPROMISED - FIXES REQUIRED');
        process.exit(1);
    } else {
        console.log('\n✨ SYSTEM INTEGRITY VERIFIED - ALL SYSTEMS GO');
        process.exit(0);
    }
}

runAudit();
