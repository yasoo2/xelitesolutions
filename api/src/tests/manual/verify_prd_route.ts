export {};
/**
 * WIRE PROOF — the PRD route, end to end through the REAL block builder
 * and the REAL planner:
 *
 *   docx PRD + «نفذ وطبق»            → project_pipeline
 *   photographed PRD (OCR) + «نفذ»   → project_pipeline
 *   «حلل هذا الـPRD» (no implement)   → central_answer (a chat, correctly)
 *   design-reference image + «ابنِ»    → NOT the pipeline (page builder path)
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_prd_route.ts
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const { formatAttachmentsBlock } = await import('../../shared/attachments');
    const { PlanningEngine } = await import('../../core/orchestrator/PlanningEngine');
    const plan = async (goal: string) => {
        const p = await Promise.race([
            PlanningEngine.generatePlan({ intent: { goal, complexity: 'high', riskLevel: 'medium', rawIntent: {} } as any }).then(x => x.steps[0]?.tool).catch(() => 'llm-fallthrough'),
            new Promise<string>(r => { const t = setTimeout(() => r('llm-fallthrough'), 2000); (t as any).unref?.(); }),
        ]);
        return p;
    };

    const PRD_TEXT = [
        'وثيقة متطلبات المنتج — متجر إكسلايت',
        '1) صفحة رئيسية بعرض المنتجات', '2) سلة مشتريات تعمل بالكامل', '3) لوحة إدارة للمخزون',
        'Acceptance: checkout completes end-to-end; admin can add a product.',
    ].join('\n');

    console.log('\n[1] PRD ملف docx + «نفذ وطبق»');
    const docBlock = formatAttachmentsBlock([{
        name: 'PRD-متجر.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 88_000, content: PRD_TEXT, path: 'C:/uploads/PRD-متجر.docx',
    }]);
    check('routes to project_pipeline', await plan(`نفذ هذا الـPRD وطبق كل ما فيه\n\n${docBlock}`) === 'project_pipeline');

    console.log('\n[2] PRD مصوّر (صورة + OCR حقيقي التنسيق) + «نفذ»');
    const photoBlock = formatAttachmentsBlock([{
        name: 'prd-page1.png', mimeType: 'image/png', size: 210_000,
        content: 'صفحة مستند مطبوع بعنوان متطلبات', path: 'C:/uploads/prd-page1.png',
        visionDescribed: true, ocrText: 'المتطلبات:\nتسجيل دخول\nتقارير شهرية',
    } as any]);
    check('the OCR label produced by the real block is what the route detects',
        photoBlock.includes('OCR — the EXACT text read inside the image'));
    check('routes to project_pipeline', await plan(`نفذ متطلبات هذا الـPRD المصور\n\n${photoBlock}`) === 'project_pipeline');

    console.log('\n[3] «حلل هذا الـPRD» — تحليل لا تنفيذ');
    check('stays a direct answer', await plan(`حلل هذا الـPRD وأعطني رأيك\n\n${docBlock}`) === 'central_answer');

    console.log('\n[4] صورة مرجع تصميم + «ابنِ» — ليست PRD');
    const refBlock = formatAttachmentsBlock([{
        name: 'ref.png', mimeType: 'image/png', size: 90_000,
        content: 'صفحة هبوط داكنة بشعار ذهبي', path: 'C:/uploads/ref.png', visionDescribed: true,
    } as any]);
    const t4 = await plan(`ابنِ لي صفحة مثل هذه الصورة\n\n${refBlock}`);
    check('is NOT hijacked into the full pipeline', t4 !== 'project_pipeline', String(t4));

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
