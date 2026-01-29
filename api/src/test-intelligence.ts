// Test Free Intelligence Optimizer
import { generateSmartResponse, freeIntelligenceOptimizer } from './llm/free-intelligence-optimizer';
import { analyzeTask, routeToModel } from './llm/intelligent-router';
import { performance } from 'perf_hooks';

console.log('=== Testing Free Intelligence Optimizer ===\n');

// Test 1: Identity question in Arabic
console.log('Test 1: من أنت؟');
const test1 = generateSmartResponse('من أنت؟', []);
console.log('Response:', test1);
console.log('---\n');

// Test 2: Identity question in English
console.log('Test 2: who are you?');
const test2 = generateSmartResponse('who are you?', []);
console.log('Response:', test2);
console.log('---\n');

// Test 3: Capabilities in Arabic
console.log('Test 3: ماذا تستطيع أن تفعل؟');
const test3 = generateSmartResponse('ماذا تستطيع أن تفعل؟', []);
console.log('Response:', test3);
console.log('---\n');

// Test 4: Greeting in Arabic
console.log('Test 4: مرحبا');
const test4 = generateSmartResponse('مرحبا', []);
console.log('Response:', test4);
console.log('---\n');

// Test 5: Random question (should return null)
console.log('Test 5: اشرح لي الفيزياء الكمية');
const test5 = generateSmartResponse('اشرح لي الفيزياء الكمية', []);
console.log('Response:', test5);
console.log('Expected: null (should use AI model)');
console.log('---\n');

// Test 6: Optimizer
console.log('Test 6: Testing optimizer');
(async () => {
    const opt1 = await freeIntelligenceOptimizer.optimizeRequest('اكتب كود React', []);
    console.log('Code request optimization:', opt1);

    const opt2 = await freeIntelligenceOptimizer.optimizeRequest('من أنت؟', []);
    console.log('Simple question optimization:', opt2);

    const stats = freeIntelligenceOptimizer.getReflexCount();
    console.log('Optimizer stats:', stats);

    console.log('\n=== اختبار السرعة والذكاء (Routing + Cache) ===\n');

    const analysisCases = [
        'من هو رئيس فرنسا الحالي؟',
        'اكتب لي دالة TypeScript تجمع أرقام مصفوفة',
        'اشرح كيف يعمل JWT ولماذا نستخدمه',
        'مرحباً، كيف حالك؟',
        'حلّل هذه البيانات: 1,2,3,100,5 وأعطني المتوسط والوسيط'
    ];

    for (const text of analysisCases) {
        const analysis = analyzeTask(text);
        console.log('تحليل الطلب:', { text, ...analysis });
    }

    const loops = 20000;
    const t0 = performance.now();
    for (let i = 0; i < loops; i++) {
        analyzeTask(analysisCases[i % analysisCases.length]);
    }
    const t1 = performance.now();
    const avgAnalyzeMs = (t1 - t0) / loops;
    console.log(`\nمتوسط زمن analyzeTask: ${avgAnalyzeMs.toFixed(4)}ms لكل طلب (عدد=${loops})\n`);

    const llmCases = [
        {
            name: 'سؤال عربي بسيط',
            messages: [
                { role: 'system', content: 'أجب بإيجاز شديد.' },
                { role: 'user', content: 'اعطني 3 نقاط عن فوائد النوم الجيد' }
            ]
        },
        {
            name: 'كود TypeScript قصير',
            messages: [
                { role: 'system', content: 'أجب بكود فقط.' },
                { role: 'user', content: 'اكتب دالة TypeScript اسمها clamp(x,min,max)' }
            ]
        }
    ];

    for (const c of llmCases) {
        console.log(`\n--- حالة: ${c.name} ---`);
        try {
            const s1 = performance.now();
            const r1 = await routeToModel(c.messages);
            const e1 = performance.now();

            const s2 = performance.now();
            const r2 = await routeToModel(c.messages);
            const e2 = performance.now();

            const ms1 = e1 - s1;
            const ms2 = e2 - s2;
            const preview = (t: string) => (t || '').replace(/\s+/g, ' ').slice(0, 140);

            console.log(`الزمن (أول طلب): ${ms1.toFixed(0)}ms | الطول: ${r1.length} | معاينة: ${preview(r1)}`);
            console.log(`الزمن (نفس الطلب مرة ثانية - Cache): ${ms2.toFixed(0)}ms | الطول: ${r2.length} | معاينة: ${preview(r2)}`);
        } catch (e: any) {
            console.log('فشل الاختبار:', e?.message || e);
        }
    }
})();
