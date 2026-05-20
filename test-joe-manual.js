/**
 * اختبار يدوي شامل لجو - التحسينات v2.0
 */

const testCases = [
    {
        name: "Test 1: Simple Todo App",
        prompt: "ابني تطبيق todo list بسيط باستخدام React و TypeScript مع TailwindCSS",
        expectedBehavior: [
            "يستخدم project_planner",
            "يقسم إلى 4-5 مراحل",
            "ينفذ كل مرحلة بالكامل",
            "لا placeholders"
        ]
    },
    {
        name: "Test 2: Library Management System",
        prompt: `ابني نظام إدارة مكتبة كامل مع:
- Backend: Express + MongoDB
- Frontend: React + TailwindCSS
- المميزات: تسجيل دخول، إضافة كتب، استعارة، إرجاع
- استخدم TypeScript في كل شيء`,
        expectedBehavior: [
            "يستخدم Smart Context Manager",
            "يتخذ قرارات تلقائية (MongoDB, TailwindCSS)",
            "يقسم إلى 6-8 مراحل",
            "Realtime Validation للكود"
        ]
    },
    {
        name: "Test 3: E-commerce Platform (Complex)",
        prompt: `ابني منصة تجارة إلكترونية متكاملة مع:
- نظام مستخدمين (عميل، بائع، أدمن)
- إدارة منتجات مع صور
- سلة تسوق وعملية دفع Stripe
- لوحة تحكم للبائعين
- نظام تقييمات ومراجعات
- إشعارات real-time مع Socket.io
- Backend: Express + MongoDB + TypeScript
- Frontend: React + TailwindCSS + TypeScript`,
        expectedBehavior: [
            "يستخدم Mixtral (32K context)",
            "يقسم إلى 10-15 مرحلة",
            "Progress Persistence بعد كل مرحلة",
            "Intelligent Retry عند الأخطاء",
            "Multi-Model Fallback إذا فشل موديل"
        ]
    }
];

async function runTest(testCase) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🧪 ${testCase.name}`);
    console.log(`${'='.repeat(80)}\n`);
    console.log(`📝 Prompt: ${testCase.prompt}\n`);
    console.log(`✅ Expected Behavior:`);
    testCase.expectedBehavior.forEach(b => console.log(`   - ${b}`));
    console.log(`\n⏳ Sending request to Joe...\n`);

    const startTime = Date.now();

    try {
        const response = await fetch('http://localhost:3000/api/runs/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: testCase.prompt,
                sessionId: `test-${Date.now()}`,
                provider: 'auto',
                model: 'auto'
            })
        });

        const data = await response.json();
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(`\n✅ Response received in ${duration}s`);
        console.log(`\n📊 Response Summary:`);
        console.log(`   - Status: ${response.status}`);
        console.log(`   - OK: ${data.ok}`);
        
        if (data.plan) {
            console.log(`   - Plan Created: Yes`);
            console.log(`   - Total Phases: ${data.plan.totalPhases || 'N/A'}`);
            console.log(`   - Project Name: ${data.plan.projectName || 'N/A'}`);
        }

        if (data.result) {
            console.log(`   - Execution Result: ${data.result.ok ? 'Success' : 'Failed'}`);
            if (data.result.logs) {
                console.log(`   - Logs: ${data.result.logs.length} entries`);
            }
        }

        console.log(`\n📝 Full Response:`);
        console.log(JSON.stringify(data, null, 2).slice(0, 1000) + '...');

        return {
            testName: testCase.name,
            success: data.ok,
            duration,
            data
        };

    } catch (error) {
        console.error(`\n❌ Test Failed:`, error.message);
        return {
            testName: testCase.name,
            success: false,
            error: error.message
        };
    }
}

async function runAllTests() {
    console.log('\n🚀 Starting Joe v2.0 Manual Testing Suite...\n');
    
    const results = [];

    for (const testCase of testCases) {
        const result = await runTest(testCase);
        results.push(result);
        
        // انتظر 5 ثواني بين الاختبارات
        if (testCases.indexOf(testCase) < testCases.length - 1) {
            console.log('\n⏳ Waiting 5 seconds before next test...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    // تقرير نهائي
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 FINAL TEST REPORT`);
    console.log(`${'='.repeat(80)}\n`);

    results.forEach(result => {
        const status = result.success ? '✅ PASSED' : '❌ FAILED';
        console.log(`${status} - ${result.testName} (${result.duration || 'N/A'}s)`);
        if (result.error) {
            console.log(`   Error: ${result.error}`);
        }
    });

    const passedCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    const passRate = ((passedCount / totalCount) * 100).toFixed(1);

    console.log(`\n📈 Summary: ${passedCount}/${totalCount} tests passed (${passRate}%)\n`);

    if (passRate === '100.0') {
        console.log('🎉 All tests passed! Joe v2.0 is working perfectly!\n');
    } else {
        console.log('⚠️ Some tests failed. Review the logs above for details.\n');
    }
}

// Run tests
runAllTests().catch(console.error);
