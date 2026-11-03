/**
 * ⛔ A TASTE IS SEEN, NOT READ.
 *
 * Measured 2026-11-02 on a real Claude build, an Arabic counter page: the
 * page worked and looked clean, and Joe refused to deliver it. R4 «التصميم
 * أنيق» had gone to the judge that reads the SOURCE, which can only answer
 * «unprovable» for a taste, and an unprovable requirement blocks the
 * delivery. Every request that asks for an elegant, modern or beautiful page
 * was undeliverable by construction, and the model was told to "give a
 * measurable criterion" for a word the owner wrote on purpose.
 *
 * A requirement about how the page LOOKS is judged where it can be: on a
 * screenshot of the page the visible Browser QA opened, by the run's own
 * model, when that model can see. It is unmet only when the judge names a
 * defect anyone can see on the screenshot (text unreadable on its background,
 * parts overlapping or cut off, a raw unstyled page); a preference is not a
 * defect. A model that cannot see leaves it unjudged by eye and says so, and
 * that does not block: the Browser QA's own design checks (contrast, overlap,
 * overflow, tap targets) still measure the page and still block.
 */
import { promises as fsp } from 'fs';
import { parseVerdicts, type NamedRequirement } from './named-requirements';

/** One question about one picture, asked of the run's own model. */
export type Look = (prompt: string, image: { mime: string; data: string }) => Promise<string>;

export type AppearanceVerdict = 'met' | 'unmet' | 'unprovable';

export interface JudgedAppearance extends NamedRequirement {
    verdict: AppearanceVerdict;
    why: string;
}

const strip = (s: string) => String(s || '')
    .toLowerCase()
    .replace(/[ً-ْـ]/gu, '')
    .replace(/[أإآ]/gu, 'ا')
    .replace(/ة/gu, 'ه')
    .replace(/ى/gu, 'ي');

const words = (list: string) => new Set(list.split(/\s+/u).filter(Boolean).map(strip));

/** Words that say how something looks, and nothing it does. */
const TASTE = words(`
    elegant elegance elegantly beautiful beautifully beauty pretty attractive stylish sleek polished modern
    contemporary professional professionally luxurious luxury premium classy chic gorgeous stunning catching
    appealing nice lovely clean minimal minimalist minimalistic refined sophisticated cute cozy cosy calm calming
    soothing warm vibrant fresh aesthetic aesthetically pleasing pleasant visually striking impressive amazing
    awesome cool fancy slick smooth harmonious tasteful inviting welcoming soft cheerful playful bold simple neat
    tidy sharp classic gentle relaxing
    انيق انيقه اناقه جميل جميله جمال جذاب جذابه عصري عصريه حديث حديثه احترافي احترافيه راقي راقيه راق فخم فخمه
    فاخر فاخره مميز مميزه رائع رائعه لطيف لطيفه بسيط بسيطه نظيف نظيفه هادئ هادئه هاديء هاديه مريح مريحه ناعم ناعمه
    مبهر مبهره ملفت ملفته لافت لافته زاهي زاهيه دافئ دافئه متناسق متناسقه حلو حلوه شيك كيوت مرتب مرتبه جذابيه
    مبهج مبهجه منسق منسقه ساحر ساحره خلاب خلابه
`);

/** What the taste is about: the page, its design, its colours. */
const LOOK = words(`
    design designed designs look looks looking style styled styling styles theme themed appearance aesthetics
    visual visuals layout ui interface colour colours color colors colored coloured palette typography font fonts
    feel vibe page pages website site web landing app application homepage screen overall eye eyes it
    تصميم تصاميم شكل مظهر واجهه واجهات الوان لون خط خطوط صفحه صفحات موقع طابع ستايل عين العين منظر هيئه تنسيق ثيم
    نمط تطبيق شاشه عام عامه اجمالي عرض
`);

/** Words that carry no content of their own. */
const FILLER = words(`
    a an the and or with of its it's has have having should be is are must very really that to in on for as but
    also too so more most all quite truly extremely highly super make made give gives keep
    و او ذو ذات مع ان يكون تكون جدا كثير للغايه في من على له لها يبدو تبدو بدو ايضا اجعل اجعله اجعلها يجعل
`);

/** Arabic attaches و ب ل ف and the article to the word; a word is tried with each taken off. */
const PREFIXES = ['وبال', 'وال', 'بال', 'لل', 'فال', 'ال', 'و', 'ب', 'ل', 'ف'];

function known(token: string, set: Set<string>): boolean {
    const forms = [token];
    //  The adverbial ending, «أنيقاً» is «أنيق»; and the pronoun, «شكله» is «شكل».
    if (/[؀-ۿ]/u.test(token) && token.length > 3) {
        for (const end of ['ها', 'ه', 'ا']) if (token.endsWith(end)) forms.push(token.slice(0, -end.length));
    }
    for (const f of [...forms]) for (const p of PREFIXES) if (f.startsWith(p) && f.length - p.length >= 2) forms.push(f.slice(p.length));
    return forms.some(f => set.has(f));
}

/**
 * True when the requirement says only how the page LOOKS: at least one word
 * of taste, and every other word is about the page's look or carries no
 * content. «التصميم أنيق», «an elegant, modern design» and «calm colours»
 * are; «a modern booking form», «clean code» and «a dark mode toggle» are
 * not — they name something the source can be judged on.
 */
export function isAppearanceRequirement(text: string): boolean {
    const tokens = strip(text).split(/[^\p{L}\p{N}']+/u).filter(Boolean);
    if (!tokens.length) return false;
    let taste = false;
    for (const t of tokens) {
        if (known(t, TASTE)) { taste = true; continue; }
        if (known(t, LOOK) || known(t, FILLER)) continue;
        return false;
    }
    return taste;
}

export function appearancePrompt(reqs: NamedRequirement[], isArabic: boolean): string {
    return [
        `This is a screenshot of a page that was just built, as a visitor sees it in the browser.`,
        ``,
        `Each requirement below is about how the page LOOKS. Decide, from the screenshot, whether the page looks that way.`,
        ...reqs.map((r, i) => `  ${i + 1}. [${r.id}] ${r.text}   (he wrote: «${r.quote}»)`),
        ``,
        `Rules:`,
        `  · "met" when a reasonable visitor would agree the page looks that way.`,
        `  · "unmet" ONLY for a defect you can name and point to on this screenshot: text that cannot be read on`,
        `    its background, parts that overlap or are cut off, a page left as raw unstyled HTML, an empty or`,
        `    broken page. A preference is not a defect: never answer "unmet" because you would have chosen other`,
        `    colours or another layout.`,
        `  · Write "why" in ${isArabic ? 'Arabic' : 'English'}, one short sentence naming what you see.`,
        ``,
        `REPLY WITH JSON AND NOTHING ELSE:`,
        `{"verdicts":[{"id":"…","verdict":"met|unmet","why":"…"}]}`,
    ].join('\n');
}

const say = (isArabic: boolean, ar: string, en: string) => (isArabic ? ar : en);

/**
 * Every appearance requirement, judged on the screenshot by `look`. Without a
 * screenshot or a model that sees, each one is «unprovable» with the reason:
 * never «met» (nobody looked) and never «unmet» (nothing was seen wrong).
 */
export async function judgeAppearance(
    reqs: NamedRequirement[],
    shot: { path: string } | undefined,
    isArabic: boolean,
    look: Look | undefined,
    notLooked?: string,
): Promise<JudgedAppearance[]> {
    const unjudged = (why: string) => reqs.map(r => ({ ...r, verdict: 'unprovable' as AppearanceVerdict, why }));
    if (!reqs.length) return [];
    if (!shot?.path) {
        return unjudged(notLooked || say(isArabic, 'لم تُلتقط صورة للصفحة، فلم يُحكم على شكلها بالنظر', 'no screenshot of the page was taken, so its look was not judged by eye'));
    }
    if (!look) {
        return unjudged(say(isArabic,
            'النموذج المختار لا يرى الصور، فلم يُحكم على الشكل بالنظر؛ فحوص التصميم في المتصفح هي التي قاست الصفحة',
            'the chosen model cannot see images, so the look was not judged by eye; the Browser QA\'s design checks measured the page'));
    }
    let data: string;
    try { data = (await fsp.readFile(shot.path)).toString('base64'); }
    catch (e: any) {
        return unjudged(say(isArabic, `تعذّرت قراءة صورة الصفحة: ${String(e?.message || e).slice(0, 160)}`, `the screenshot could not be read: ${String(e?.message || e).slice(0, 160)}`));
    }
    const mime = /\.png$/iu.test(shot.path) ? 'image/png' : 'image/jpeg';
    let raw: string;
    try { raw = await look(appearancePrompt(reqs, isArabic), { mime, data }); }
    catch (e: any) {
        return unjudged(say(isArabic, `لم يُجب النموذج عن صورة الصفحة: ${String(e?.message || e).slice(0, 160)}`, `the model did not answer about the screenshot: ${String(e?.message || e).slice(0, 160)}`));
    }
    const verdicts = parseVerdicts(raw);
    return reqs.map((r, i) => {
        const v = verdicts.find(x => x.id === r.id) || (reqs.length === 1 && verdicts.length === 1 ? verdicts[0] : verdicts.length === reqs.length ? verdicts[i] : undefined);
        const verdict = String(v?.verdict || '').trim().toLowerCase();
        const why = String(v?.why || '').trim().slice(0, 400);
        if (verdict === 'met' || verdict === 'unmet') {
            return { ...r, verdict, why: why || say(isArabic, verdict === 'met' ? 'الصفحة تبدو كذلك' : 'في الصفحة عيب ظاهر', verdict === 'met' ? 'the page looks that way' : 'the page shows a visible defect') };
        }
        return { ...r, verdict: 'unprovable' as AppearanceVerdict, why: say(isArabic, 'لم يُقرأ حكم النموذج على صورة الصفحة', 'the model\'s answer about the screenshot could not be read') };
    });
}
