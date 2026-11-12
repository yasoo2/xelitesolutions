/**
 * «ممكن تنشر الموقع؟» IS AN ORDER. «كيف أنشر الموقع؟» IS A QUESTION.
 *
 * The deploy decision asked one coarse reader «is this a question?» — a first
 * word (can, is, هل…) or a trailing "?" — and knew the order to publish in one
 * form only, the imperative «انشر». Measured on readDeployIntent before this:
 *
 *     Can you deploy the site?          → no deploy   ("can" opens it)
 *     Could you publish it now?         → no deploy   (the "?", and «it» named no site)
 *     هل يمكن نشر الموقع الآن؟           → no deploy   («هل»; «نشر» is not «انشر»)
 *     ممكن تنشر الموقع؟                  → no deploy   («تنشر» is not «انشر»)
 *     تقدر ترفع الموقع على النت؟         → no deploy   («رفع» was never a publish)
 *     ازاي انشر الموقع؟                  → DEPLOY      («ازاي» was not on the list)
 *     ممكن تشرح لي كيف أنشر الموقع؟      → DEPLOY      («كيف» does not open it)
 *     ممكن ما تنشره؟                     → no veto     («ما» was not a denial)
 *     Can you not deploy it yet?         → no veto
 *
 * The politest way to ask for a publish published nothing, two ways of asking
 * HOW published his project, and the dialects' denial denied nothing.
 *
 * What tells an order from a question is the request frame, read over the
 * words (readHowPublishIsAsked): a frame that hands Joe the publish verb and
 * names what to publish is the order; an interrogative before the publish word
 * is a question about publishing wherever it stands. Every neighbour that must
 * keep its reading is pinned beside the ones that changed.
 */
jest.mock('../core/llm/intelligent-router', () => ({
    routeToModel: jest.fn(async () => { throw new Error('no model in this test'); }),
    verifyProviderDirect: jest.fn(),
    isProviderFailure: () => false,
}));
// eslint-disable-next-line import/first
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
// eslint-disable-next-line import/first
import * as normalizer from '../core/orchestrator/promptNormalizer';

const read = (text: string) => PlanningEngine.readDeployIntent(text);

describe('a polite question that asks for the publish, publishes', () => {
    it.each([
        //  The five the owner's round measured.
        'ممكن تنشر الموقع؟',
        'تقدر ترفع الموقع على النت؟',
        'هل يمكن نشر الموقع الآن؟',
        'Can you deploy the site?',
        'Could you publish it now?',
        //  Modern Standard Arabic.
        'هل يمكنك نشر الموقع؟',
        'هل تستطيع نشر الموقع؟',
        'هل تستطيع أن تنشر الموقع؟',
        'بإمكانك نشر الموقع؟',
        'ممكن نشر الموقع؟',
        //  Egyptian.
        'ينفع تنشر الموقع دلوقتي؟',
        'ممكن تنشرلي الموقع؟',
        'لو سمحت ممكن تنشر الموقع؟',
        //  Levantine.
        'فيك تنشر الموقع؟',
        'بتقدر تنشر الموقع هلق؟',
        'ممكن تنشر لي الموقع لو سمحت؟',
        //  Gulf.
        'تقدر تنشر الموقع الحين؟',
        'يا جو ممكن تنشر المتجر؟',
        //  The object as a pronoun or a possessive, another site word, a place.
        'ممكن تنشره؟',
        'ممكن تنشر موقعي؟',
        'ممكن تستضيف الموقع؟',
        'ممكن ترفع الموقع على الانترنت',
        'ممكن تنشر الموقع على GitHub Pages؟',
        'ممكن تنشر الموقع وتعطيني الرابط؟',
        'تمام، ممكن تنشر الموقع؟',
        //  English.
        'Would you deploy the app please?',
        'Can you please publish the website?',
        'Will you deploy my project?',
        'can u deploy the site',
        'Could you host the site on GitHub Pages?',
        'Could you publish my portfolio?',
        'Can you go live with the site?',
        'Is it possible to deploy the site now?',
        'The tests pass. Can you deploy the site now?',
        'Can you deploy the site and send me the link?',
    ])('%s → deploy, no veto', text => {
        expect(read(text)).toMatchObject({ deploy: true, veto: '' });
    });

    it.each([
        'عايزك تنشر الموقع',
        'ابغاك تنشر الموقع',
        'بدي ياك تنشر الموقع',
        "I'd like you to deploy the site",
    ])('%s: a wish addressed to Joe hands him the same verb', text => {
        expect(read(text)).toMatchObject({ deploy: true, veto: '' });
    });
});

describe('a question ABOUT publishing publishes nothing', () => {
    it.each([
        //  The six the owner's round named.
        'كيف أنشر الموقع؟',
        'هل تم نشر الموقع؟',
        'وين انتشر الموقع؟',
        'How do I deploy this?',
        'Is the site deployed?',
        'What does deploying cost?',
        //  An interrogative before the publish word, in every dialect — two of
        //  these deployed his project before.
        'ازاي انشر الموقع؟',
        'شلون انشر الموقع؟',
        'كيف بدي انشر الموقع؟',
        'ازاي اختبر وانشر الموقع؟',
        'كيف ممكن تنشر الموقع؟',
        'متى ينشر الموقع؟',
        'ليه ما انتشر الموقع؟',
        'هل الموقع منشور؟',
        'هل نشرت الموقع؟',
        'كم يكلف نشر الموقع؟',
        'ايش يعني نشر الموقع؟',
        //  The frame governs another verb: he asks to be told, not to be served.
        'ممكن تشرح لي كيف أنشر الموقع؟',
        'تقدر تقولي كيف انشر الموقع؟',
        'ممكن اعرف هل الموقع منشور؟',
        'Can you explain how to deploy the site?',
        'Can you tell me how deployment works?',
        'Could you check whether the site is deployed?',
        //  Nobody is asked, or it is himself he asks about.
        'Can I deploy this to Vercel?',
        'Can we deploy later?',
        'Can the site be deployed for free?',
        'هل ممكن أنشر الموقع بنفسي؟',
        'Should I deploy now or wait?',
        'هل انشر الموقع ولا استنى؟',
        //  A frame that names nothing to publish asks what Joe can do.
        'Can you deploy to AWS?',
        'Do you deploy to Netlify?',
        'هل تنشر على فيرسل؟',
        //  A choice or a condition is asked, not a publish.
        'Can you publish the site or is it too early?',
        'هل يمكن نشر الموقع مجانا؟',
        'تقدر تنشر الموقع مجانا؟',
        'Is it possible to deploy a site without a domain?',
        //  Other questions.
        'Did you deploy the site?',
        'Has the site been deployed?',
        'Where is the site deployed?',
        'Why did the deploy fail?',
        'How can you deploy the site?',
        'What is deploying?',
        'قلي اذا ممكن تنشر الموقع',
        'مش ممكن تنشر الموقع كده',
        'وش رايك ننشر الموقع؟',
    ])('%s → no deploy, and no veto either', text => {
        expect(read(text)).toMatchObject({ deploy: false, veto: '' });
    });
});

describe('a denial stays a denial, however it is put', () => {
    it.each([
        'لا تنشر الموقع',
        'لا تنشره',
        'لا تنشره؟',
        'ممكن ما تنشره؟',
        'ممكن ما تنشر الموقع؟',
        'ممكن لا تنشر الموقع؟',
        'ممكن ما ترفع الموقع؟',
        'ما تنشر الموقع',
        'بلاش تنشر الموقع',
        'بلاش نشر دلوقتي',
        'ما تنشرش الموقع',
        'ممكن متنشرش الموقع؟',
        'متنشروش',
        'ابن الموقع وما تنشره',
        'ممكن تبني الموقع وما تنشره؟',
        'Can you not deploy it yet?',
        'Could you not publish the site?',
        "Can you please don't deploy it",
    ])('%s → denied', text => {
        expect(read(text)).toMatchObject({ deploy: false, veto: 'denied', deniesExternalPublish: true });
    });

    it.each([
        //  «ما» after a word it belongs to is "after / before you publish", not a denial.
        'بعد ما تنشر الموقع ابعتلي الرابط',
        'قبل ما تنشر الموقع اعمل نسخة احتياطية',
        //  A part or a time denied beside an order: the order stands, in dialect too.
        'انشر الموقع، ما تنشر المسودات',
        'ما تنشر الموقع قبل الاختبار، انشره بعدين',
    ])('%s is not a denial of the publish', text => {
        expect(read(text).veto).toBe('');
    });

    it('a denied part or time still deploys beside its order', () => {
        expect(read('انشر الموقع، ما تنشر المسودات')).toMatchObject({ deploy: true, veto: '' });
        expect(read('ما تنشر الموقع قبل الاختبار، انشره بعدين')).toMatchObject({ deploy: true, veto: '' });
    });

    it.each([
        'Can you hold off deploying?',
        'Could you avoid deploying the site?',
    ])('%s deploys nothing', text => {
        expect(read(text).deploy).toBe(false);
    });
});

describe('every neighbour keeps its reading', () => {
    it.each([
        'انشر الموقع',
        'انشر موقع',
        'انشر المشروع الآن',
        'انشر الموقع وأخبرني بالرابط',
        'استضف الموقع',
        'بدي انشر الموقع',
        'عايز انشر الموقع',
        'Deploy the site',
        'Publish the website',
        'Deploy my blog',
        //  An interrogative inside an order ends at the conjunction.
        'شوف وين المشكلة وانشر الموقع',
        'Check what is wrong and deploy the site',
    ])('%s still deploys', text => {
        expect(read(text)).toMatchObject({ deploy: true, veto: '' });
    });

    it.each([
        ['ممكن تنشر الموقع؟', 'انشر الموقع'],
        ['تقدر ترفع الموقع على النت؟', 'ارفع الموقع على النت'],
        ['Could you publish it now?', 'Publish it now'],
        ['ممكن تنشره؟', 'انشره'],
        ['Can you upload the site to the web?', 'upload the site to the web'],
    ])('%s reads as its plain order does: %s', (polite, plain) => {
        expect(read(polite)).toMatchObject({ deploy: true, veto: '' });
        expect(read(plain)).toMatchObject({ deploy: true, veto: '' });
    });

    it.each([
        //  «رفع» is a publish only for the site itself, onto the internet.
        'ارفع الموقع',
        'ارفع الموقع على جيت هاب',
        'ارفع الصور على الموقع',
        'ارفع حجم الخط في الموقع',
        "don't upload the site online",
        //  A pronoun with an antecedent, or with a place, is not the open project.
        'write a report and publish it',
        'اكتب ملخصاً وانشره',
        'Publish it on my blog',
        'انشره على تويتر',
        'Could you publish it on Twitter?',
    ])('%s is not read as a site deploy here', text => {
        expect(read(text).deploy).toBe(false);
    });

    it.each([
        'ممكن تنشر مقال عن القهوة؟',
        'Can you publish an article about coffee?',
        'ممكن تكتب مقال وتنشره؟',
        'Can you publish a blog post?',
        'انشر مقالاً عن القهوة',
        'اكتب مقالاً ثم انشره',
        'write an article and publish it',
    ])('%s publishes content, politely or not: no site deploy', text => {
        expect(read(text)).toMatchObject({ deploy: false, veto: 'content' });
    });

    it.each([
        'Can you build a site and deploy it?',
        'اعمل لي متجر وانشره',
    ])('%s is a build, which owns its own publishing', text => {
        expect(read(text)).toMatchObject({ deploy: false, hasBuildVerb: true });
    });

    it('…and a polite build is not a polite publish: the frame hands over «تبني», not «تنشر»', () => {
        expect(read('ممكن تبني موقع وتنشره؟')).toMatchObject({ deploy: false, veto: '' });
    });

    it('«انشره» cut out of a longer request names no site of its own', () => {
        //  The chain reader asks each step whether it names its own site when the
        //  whole request publishes content: «اكتب مقالاً ثم انشره» must not deploy.
        expect(read('انشره')).toMatchObject({ deploy: true, targetIsPronoun: true });
        expect(read('ممكن تنشره؟')).toMatchObject({ deploy: true, targetIsPronoun: true });
        expect(read('انشر الموقع')).toMatchObject({ deploy: true, targetIsPronoun: false });
        expect(read('اختبر الموقع ثم انشره')).toMatchObject({ deploy: true, targetIsPronoun: false });
    });

    it('the run and stop paths still get the coarse question they ask for', () => {
        expect(read('Can you deploy the site?').isQuestion).toBe(true);
        expect(read('انشر الموقع').isQuestion).toBe(false);
    });
});

describe('the reader runs on every request: linear on a long message', () => {
    /*
     * readDeployIntent also calls normalizeIntentText, which lives in another
     * file and grows faster than the text on some of these inputs (measured:
     * 3 s at 20 KB on «كيف انشر و…»; reported with this change). It is held
     * constant here, as the neighbouring publish test holds it, so the clock
     * reads what this change adds: the walk of readHowPublishIsAsked and the
     * denial rewrites. Measured alone on a loaded laptop: 5–180 ms at 20 KB.
     * The clock is this process's CPU time, not the wall: the suite runs on a
     * machine saturated by other work, where the wall reads its neighbours.
     */
    const rep = (unit: string, n: number) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
    let spy: jest.SpyInstance;
    beforeAll(() => {
        spy = jest.spyOn(normalizer, 'normalizeIntentText').mockImplementation((s: string) => String(s || '').toLowerCase());
    });
    afterAll(() => spy.mockRestore());

    it.each([
        'ممكن تنشر الموقع؟ ',
        'can you deploy the site ',
        'and can you deploy the site ',
        'please, ',
        'ok, ',
        'وانشره ',
        'ما ',
        'ما \t  ',
        'متنشرش ',
        'كيف انشر و',
        'can you \n',
        'i would like you to ',
        'هل يمكن نشر ',
        'publish it now ',
    ])('%j repeated to 20 KB', unit => {
        const clock = (n: number) => {
            const text = rep(unit, n);
            const t0 = process.cpuUsage();
            PlanningEngine.readDeployIntent(text);
            const spent = process.cpuUsage(t0);
            return (spent.user + spent.system) / 1000;
        };
        clock(2000); // warm
        //  Linear work stays in tens of milliseconds of CPU.
        expect(clock(20000)).toBeLessThan(1000);
    });
});
