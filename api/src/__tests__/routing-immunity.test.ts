/**
 * Fast-path immunity: the whole CLASS of the deploy-hijack bug.
 *
 * Two failure modes this locks out:
 *   1. Injected coaching text (STANDING INSTRUCTIONS / ENGINEERING DISCIPLINE,
 *      which the runtime appends and which contains build/deploy/launch/server)
 *      must NOT change where a request routes.
 *   2. Ambiguous verbs must not collide across intents — "انشر مقالاً" (publish
 *      content) is not deploy; "كيف أشغّل المشروع" (a question) is not run;
 *      "شغّل المتصفح" (browser) is not project_run.
 */
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const DISCIPLINE =
    '\n\n[STANDING USER INSTRUCTIONS — always apply to HOW you work]:\nuse the terminal.' +
    '\n\n[ENGINEERING DISCIPLINE — apply when you build launch/update/deploy scripts or long-running services]:' +
    '\n1. Dependency freshness ... never skip installing ... server ...' +
    '\n2. Crash-loop guard ... restart ... deploy ...' +
    '\n3. Failure taxonomy ... launch ... publish ...';

const plan = (goal: string) =>
    PlanningEngine.generatePlan({ intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } as any });

// The deterministic fast-paths run BEFORE any LLM. So a plan that resolves fast
// took a fast-path; one that doesn't (a content/question request with no
// provider in the test) fell through to the semantic router — which by
// definition means NO deterministic fast-path claimed it. Race a short timer so
// the fall-through cases don't hang the suite.
const FALLTHROUGH = 'llm-fallthrough';
const tool = async (goal: string): Promise<string> => {
    const raced = await Promise.race([
        plan(goal).then(p => p.steps[0].tool).catch(() => FALLTHROUGH),
        new Promise<string>(r => { const t = setTimeout(() => r(FALLTHROUGH), 1500); (t as any).unref?.(); }),
    ]);
    return raced;
};

describe('injected coaching text never changes routing', () => {
    const cases: Array<[string, string]> = [
        // An admin dashboard is an APPLICATION — screens and state, not one
        // document. It used to come back as a static page, which is the
        // «شرائح عليها صور وكتابات» the user objected to. What this file
        // protects is IMMUNITY: the same request must route identically with
        // and without the injected coaching block.
        ['Build an admin dashboard for an online store', 'react_project'],
        ['ابنِ لي نظام إدارة متكامل بباك اند وقاعدة بيانات', 'project_pipeline'],
        ['اصنع لي صفحة هبوط لمطعم', 'web_page_builder'],
        ['شغّل المشروع', 'project_run'],
        ['أوقف المشروع', 'project_stop'],
        ['انشر المشروع على GitHub Pages', 'deploy_pages'],
    ];
    for (const [g, expected] of cases) {
        it(`«${g}» routes the same with and without the injected block`, async () => {
            expect(await tool(g)).toBe(expected);
            // Identical routing once the coaching block is appended.
            expect(await tool(g + DISCIPLINE)).toBe(expected);
        });
    }
});

describe('ambiguous verbs do not collide across intents', () => {
    it('"انشر مقالاً عن القهوة" (publish CONTENT) is NOT deploy', async () => {
        expect(await tool('انشر مقالاً عن القهوة')).not.toBe('deploy_pages');
    });
    it('"publish a blog post about coffee" is NOT deploy', async () => {
        expect(await tool('publish a blog post about coffee')).not.toBe('deploy_pages');
    });
    it('"انشر المشروع" (deploy the SITE) IS deploy', async () => {
        expect(await tool('انشر المشروع')).toBe('deploy_pages');
    });
    it('"publish my website" IS deploy', async () => {
        expect(await tool('publish my website')).toBe('deploy_pages');
    });
    it('"كيف أشغّل المشروع؟" (a QUESTION) is NOT project_run', async () => {
        expect(await tool('كيف أشغّل المشروع؟')).not.toBe('project_run');
    });
    it('"how do I run the project" (a question) is NOT project_run', async () => {
        expect(await tool('how do I run the project')).not.toBe('project_run');
    });
    it('"ابحث عن كيفية تشغيل المشروع" (SEARCH) is NOT project_run', async () => {
        expect(await tool('ابحث عن كيفية تشغيل المشروع')).not.toBe('project_run');
    });
    it('"ابنِ وشغّل المشروع" (BUILD wins) is not project_run', async () => {
        expect(await tool('ابنِ وشغّل المشروع')).not.toBe('project_run');
    });
    it('"شغّل المشروع الآن" (plain run) IS project_run', async () => {
        expect(await tool('شغّل المشروع الآن')).toBe('project_run');
    });
});

/**
 * THE ATTACHMENT HIJACK — the exact goal from the user's «لقد فشل» log.
 *
 * «حلل هذه الصوره» plus the runtime's injected blocks was planned as
 * «browse then write is.txt»: the browser+file compound fast-path read the
 * ENGLISH WORDS INSIDE the injected blocks («file», «disk», «Write EVERY
 * word») as the user's own request. The attachment guard now runs at the
 * very top of generatePlan, before every keyword fast-path, and detection
 * strips the [ATTACHED FILES …] block like the other injected blocks.
 */
describe('attachment questions survive every keyword fast-path', () => {
    // Reconstructed from the field log: the honest no-vision block plus the
    // language contract — full of exactly the words the fast-paths react to.
    const FIELD_GOAL =
        'حلل هذه الصوره' +
        '\n\n[ATTACHED FILES — the user attached 1 file(s) to this message. Read them; the message refers to them.]' +
        '\n--- (1) لقطة شاشة 2026-07-31 013631.png — image/png, 1.1 MB' +
        '\n(binary image file — no text content, and NO vision analysis was available for this run: ' +
        'you have NOT seen this file. Do NOT invent or guess its contents, dimensions, dates or any metadata — ' +
        'the filename is a name, not data. Tell the user plainly that image analysis is unavailable right now. ' +
        'The raw file is on disk at: C:/Users/home/uploads/screen.png)' +
        '\n\n[RESPONSE LANGUAGE — NON-NEGOTIABLE]: The user\'s language is Arabic (العربية). Write EVERY word of your reply in it.';

    it('the field goal routes to central_answer — never to browse-then-write', async () => {
        expect(await tool(FIELD_GOAL)).toBe('central_answer');
    });

    it('a described image question routes the same way', async () => {
        const g = 'ما رأيك بهذا التصميم؟' +
            '\n\n[ATTACHED FILES — the user attached 1 file(s) to this message. Read them; the message refers to them.]' +
            '\n--- (1) shot.png — image/png, 90 KB' +
            '\n(the image was ANALYZED by a vision model — this is what it shows:)\nصفحة هبوط داكنة بشعار ذهبي' +
            '\n(raw file on disk at: /up/shot.png)';
        expect(await tool(g)).toBe('central_answer');
    });

    it('a BUILD request with an attachment still builds (the guard yields to build verbs)', async () => {
        const g = 'ابنِ لي صفحة مثل هذه الصورة' +
            '\n\n[ATTACHED FILES — the user attached 1 file(s) to this message. Read them; the message refers to them.]' +
            '\n--- (1) ref.png — image/png, 90 KB\n(the image was ANALYZED by a vision model — this is what it shows:)\nصفحة هبوط';
        expect(await tool(g)).not.toBe('central_answer');
    });

    it('the guard sits ABOVE every keyword fast-path in the source', () => {
        const fs = require('fs');
        const path = require('path');
        const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'orchestrator', 'PlanningEngine.ts'), 'utf-8');
        const guard = src.indexOf('ATTACHMENTS ARE THE SUBJECT');
        expect(guard).toBeGreaterThan(0);
        expect(guard).toBeLessThan(src.indexOf('[RUN / STOP FAST-PATH]'));
        expect(guard).toBeLessThan(src.indexOf('BROWSER + FILE COMPOUND FAST-PATH'));
        // …and intent detection strips the attachment block like the others.
        expect(src).toMatch(/STANDING USER INSTRUCTIONS\|ENGINEERING DISCIPLINE\|ATTACHED FILES\|RESPONSE LANGUAGE/);
    });
});

/**
 * THE FOLLOW-UP THAT LOST ITS FILE — from the next field log: «قمم بتحليل
 * هذه الصوره» arrived with NO attachment block (the composer sends fileIds
 * only with the uploading message) and the generic DAG planned exiftool +
 * grep + write-file + a browser node, ending in a raw ENOENT reply. An
 * image-analysis request is a DIRECT ANSWER in every case — with the file
 * (described or honestly undescribed) or without it.
 */
describe('image-analysis requests never become a tool circus', () => {
    it('«قم بتحليل هذه الصوره» with no attachment → central_answer', async () => {
        expect(await tool('قم بتحليل هذه الصوره')).toBe('central_answer');
    });
    it('the exact field goal (typo and all) routes the same', async () => {
        expect(await tool('قمم بتحليل هذه الصوره' +
            '\n\n[RESPONSE LANGUAGE — NON-NEGOTIABLE]: The user\'s language is Arabic (العربية). Write EVERY word of your reply in it.'))
            .toBe('central_answer');
    });
    it('"analyze this screenshot for me" routes the same in English', async () => {
        expect(await tool('analyze this screenshot for me')).toBe('central_answer');
    });
    it('«ابنِ لي صفحة مثل هذه الصورة» (BUILD wins) is NOT hijacked to chat', async () => {
        expect(await tool('ابنِ لي صفحة مثل هذه الصورة')).not.toBe('central_answer');
    });
});

/**
 * THE PRD ROUTE — the user's declared end-goal: «بالمستقبل رح اعطي جو
 * بي ار دي واقول له حللها وقم بتطبيقها». Before this route existed,
 * نفّذ/طبّق were not even build verbs, so an attached requirements doc
 * plus «نفّذه» produced a CHAT about the requirements.
 */
describe('an attached requirements document + a build verb → the engineering pipeline', () => {
    const DOC_BLOCK =
        '\n\n[ATTACHED FILES — the user attached 1 file(s) to this message. Read them; the message refers to them.]' +
        '\n--- (1) PRD-متجر.docx — application/vnd.openxmlformats-officedocument.wordprocessingml.document, 88 KB' +
        '\nالمتطلبات: صفحة رئيسية، سلة مشتريات، لوحة إدارة\nAcceptance: checkout works end to end';
    const PHOTO_PRD_BLOCK =
        '\n\n[ATTACHED FILES — the user attached 1 file(s) to this message. Read them; the message refers to them.]' +
        '\n--- (1) prd-page1.png — image/png, 210 KB' +
        '\n(the image was ANALYZED by a vision model — this is what it shows:)\nصفحة مستند مطبوع' +
        '\n(OCR — the EXACT text read inside the image, verbatim; quote from THIS when the user asks what the image says:)\nالمتطلبات: تسجيل دخول، تقارير شهرية';

    it('«نفذ هذا الـPRD وطبق كل ما فيه» + doc → project_pipeline', async () => {
        expect(await tool('نفذ هذا الـPRD وطبق كل ما فيه' + DOC_BLOCK)).toBe('project_pipeline');
    });
    it('"implement this requirements document" routes the same in English', async () => {
        expect(await tool('implement this requirements document fully' + DOC_BLOCK)).toBe('project_pipeline');
    });
    it('a PHOTOGRAPHED PRD (image + OCR text) with نفذ reaches the pipeline too', async () => {
        expect(await tool('نفذ متطلبات هذا الـPRD المصور' + PHOTO_PRD_BLOCK)).toBe('project_pipeline');
    });
    it('«حلل هذا الـPRD» (analysis, not implementation) stays a direct answer', async () => {
        expect(await tool('حلل هذا الـPRD وأعطني رأيك' + DOC_BLOCK)).toBe('central_answer');
    });
    it('«ابنِ لي صفحة مثل هذه الصورة» (a design reference, not a PRD) is NOT the pipeline', async () => {
        const g = 'ابنِ لي صفحة مثل هذه الصورة' +
            '\n\n[ATTACHED FILES — the user attached 1 file(s) to this message. Read them; the message refers to them.]' +
            '\n--- (1) ref.png — image/png, 90 KB\n(the image was ANALYZED by a vision model — this is what it shows:)\nصفحة هبوط داكنة';
        expect(await tool(g)).not.toBe('project_pipeline');
    });
});

/**
 * DESIGN VERBS ARE BUILD VERBS — from the field log that motivated batch 26:
 * «اريد تصميم مختلف لهذه الصوره» arrived WITH the analyzed screenshot of the
 * XELITE site and got a CHAT reply («أنا على استعداد لإعادة تصميم الصورة…»)
 * instead of a build, because صمّم/تصميم were not in WANTS_BUILD_RE. The very
 * next message «هل يمكنك تصميم صفحة مشابهه لها» then had to carry the whole
 * request again. A design request over an attachment is a BUILD; an OPINION
 * about a design stays a chat.
 */
describe('design requests over an attachment build — opinions still chat', () => {
    const IMG_BLOCK =
        '\n\n[ATTACHED FILES — the user attached 1 file(s) to this message. Read them; the message refers to them.]' +
        '\n--- (1) لقطة شاشة.png — image/png, 1.1 MB' +
        '\n(the image was ANALYZED by a vision model — this is what it shows:)\nموقع XELITE بخلفية بنفسجية وشعار ذهبي';

    it('«اريد تصميم مختلف لهذه الصوره» (the field message) is NOT hijacked to chat', async () => {
        expect(await tool('اريد تصميم مختلف لهذه الصوره' + IMG_BLOCK)).not.toBe('central_answer');
    });
    it('«هل يمكنك تصميم صفحة مشابهه لها» is NOT hijacked to chat', async () => {
        expect(await tool('هل يمكنك تصميم صفحة مشابهه لها' + IMG_BLOCK)).not.toBe('central_answer');
    });
    it('«أعد تصميم هذه الصفحة» is NOT hijacked to chat', async () => {
        expect(await tool('أعد تصميم هذه الصفحة' + IMG_BLOCK)).not.toBe('central_answer');
    });
    it('"design a similar page" is NOT hijacked to chat in English', async () => {
        expect(await tool('design a similar page to this' + IMG_BLOCK)).not.toBe('central_answer');
    });
    it('«ما رأيك بهذا التصميم؟» (an OPINION about the design) stays a direct answer', async () => {
        expect(await tool('ما رأيك بهذا التصميم؟' + IMG_BLOCK)).toBe('central_answer');
    });
    it('«صف لي هذا التصميم» (describe, not build) stays a direct answer', async () => {
        expect(await tool('صف لي هذا التصميم' + IMG_BLOCK)).toBe('central_answer');
    });
});
