/**
 * A NOUN IS NOT A COMMAND.
 *
 * Measured live on the owner's machine. He wrote a two-hundred-character
 * brief for a dental clinic — five columns, a search, a total — and Joe
 * built nothing. The whole visible reply was:
 *
 *     «🔗 لم يتم ربط حساب Google بعد.»
 *
 * because the word «مواعيد» appeared in it. «مواعيد» there was the noun of
 * WHAT HE RECORDS, not an instruction to open a calendar, and Joe sent him
 * to a door his own order had frozen shut.
 *
 * The contract names this exact class of defect — «فخّ العربية»: a word
 * carrying two meanings, matched on the bare noun, producing a false
 * verdict — and prescribes the cure: «اشترط سياقاً».
 *
 * So this file pins the property, not the sentence:
 *   · a request that DESCRIBES SOMETHING TO BUILD never routes to Google,
 *     whatever nouns it happens to contain;
 *   · a Google route needs the account to be HIS («تقويمي», «من جوجل») or
 *     an imperative to open/show it — never a bare noun;
 *   · and the everyday words for a built artefact — «جدول», «قائمة»,
 *     `table`, `list` — count as things one asks to be built, because he
 *     asks for a table far more often than he asks for a «منصّة».
 *
 * Every criterion below carries BOTH cases: one that proves it and one
 * that denies it. A criterion that can never fail is not strictness — it
 * is a defect.
 */

import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { IntentParser } from '../core/intelligence/IntentParser';

const looksLikeBuild = (text: string): boolean =>
    (PlanningEngine as unknown as { looksLikeBuild(t: string): boolean }).looksLikeBuild(text);

/**
 * The three conditions the planner now requires before it hands a request
 * to the Google-account tool, transcribed from PlanningEngine so that a
 * change there which loosens them fails here loudly.
 */
const CAL_NOUN = /(تقويم|مواعيد|أجندة|اجندة|calendar|events?|اجتماعات)/i;
const GOOGLE_OWNED = /(تقويمي|بريدي|ايميلي|إيميلي|درايفي|حسابي|من\s*(?:جوجل|قوقل|google)|في\s*(?:جوجل|قوقل|google)|my\s+(?:calendar|inbox|drive|mail)|\bgoogle\b)/iu;
const GOOGLE_IMPERATIVE = /(افتح|اعرض|أعرض|هات|جيب|شوف|check|open|show|list|read)/iu;

const routesToGoogle = (text: string): boolean =>
    CAL_NOUN.test(text)
    && !looksLikeBuild(text)
    && (GOOGLE_OWNED.test(text) || GOOGLE_IMPERATIVE.test(text));

describe('a calendar noun inside a build brief is not a calendar command', () => {
    // POSITIVE — the exact live request that was hijacked.
    it('the clinic brief builds and does not open Google', () => {
        const brief = 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع. وبدي أبحث عن المريض باسمه أو تلفونه، وبدي أعرف كم قبضت الإجمالي.';
        expect(looksLikeBuild(brief)).toBe(true);
        expect(routesToGoogle(brief)).toBe(false);
    });

    // POSITIVE — the same trap in other trades, so the cure is not one sentence.
    it.each([
        ['قاعة أفراح', 'عندي قاعة أفراح، بدي جدول للحجوزات فيه اسم العريس وتاريخ المناسبة والمبلغ'],
        ['كوافير', 'بدي صفحة أسجل فيها مواعيد الزبونات: الاسم والتلفون ووقت الموعد'],
        ['English clinic', 'I run a clinic. I want a table to record appointments: patient name, phone, appointment time and amount paid'],
    ])('%s builds instead of opening Google', (_label, brief) => {
        expect(looksLikeBuild(brief)).toBe(true);
        expect(routesToGoogle(brief)).toBe(false);
    });

    // NEGATIVE — the guard must not have killed the feature it guards.
    it.each([
        ['تقويمه هو', 'افتح تقويمي واعرض مواعيد اليوم'],
        ['من جوجل', 'اعرض مواعيدي من جوجل'],
        ['English', 'show my calendar events for today'],
    ])('%s still reaches Google', (_label, ask) => {
        expect(looksLikeBuild(ask)).toBe(false);
        expect(routesToGoogle(ask)).toBe(true);
    });

    // NEGATIVE — a bare noun with no owner and no imperative reaches nothing.
    it('a bare calendar noun alone is not enough to reach Google', () => {
        expect(routesToGoogle('عندي مواعيد كثيرة هذا الأسبوع')).toBe(false);
    });
});

describe('a table is a thing people ask to be built', () => {
    // POSITIVE — the everyday nouns, in both languages.
    it.each([
        ['جدول', 'بدي جدول أسجل فيه مصاريف البيت: البند والمبلغ والتاريخ'],
        ['قائمة', 'بدي قائمة مهام أضيف عليها وأشطب منها'],
        ['كشف', 'اعمل لي كشف بالديون فيه اسم الزبون والمبلغ'],
        ['table', 'I want a table for my orders: customer name, quantity and price'],
        ['spreadsheet', 'can you make a spreadsheet to track my expenses'],
        ['list', 'I need a list of my clients with name and phone'],
    ])('%s counts as a build', (_label, ask) => {
        expect(looksLikeBuild(ask)).toBe(true);
    });

    // NEGATIVE — the widened nouns must not swallow ordinary sentences.
    it.each([
        ['سؤال عن الوقت', 'بدي أعرف كم الساعة'],
        ['تسجيل دخول', 'سجّل دخولي بالإيميل'],
        ['أمر تقويم', 'افتح تقويمي واعرض مواعيد اليوم'],
        ['شكوى', 'الجدول اللي عملته أمس صار بطيء'],
        ['English question', 'what is on the list you gave me yesterday'],
    ])('%s is not a build', (_label, ask) => {
        expect(looksLikeBuild(ask)).toBe(false);
    });
});

/**
 * The same trap, one layer earlier.
 *
 * After the calendar hijack was closed, the same clinic brief was claimed by
 * the browser fast path instead — because it contains «أبحث»:
 *
 *     [IntentParser] ⚡ Deterministic fast intent (Browser)
 *     [AgentOrchestrator] Executing node: browser_smart
 *         (Search (live typing): المريض باسمه أو تلفونه)
 *
 * «أبحث» there is the FEATURE he wants in his table, not an instruction to
 * Joe. Two different routers, two different words, one defect: a word lifted
 * out of the request and read as if he had addressed it to the machine.
 *
 * The engineering-brief gate that should have caught it asks for 240
 * characters or a word like «حقيقي». Length is a property of how wordy
 * someone is, not of what he asked for.
 */
describe('a verb he wants inside his app is not a command to Joe', () => {
    const quickIntent = (text: string): { suggestedAgent?: string } | null =>
        (IntentParser as unknown as { quickIntent(t: string): { suggestedAgent?: string } | null }).quickIntent(text);

    // POSITIVE — a build brief containing a web verb reaches the planner.
    it.each([
        ['العيادة، وفيها «أبحث»', 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع. وبدي أبحث عن المريض باسمه أو تلفونه، وبدي أعرف كم قبضت الإجمالي.'],
        ['متجر وفيه بحث', 'بدي متجر صغير أضيف فيه المنتجات وأبحث عن المنتج باسمه'],
        ['English search feature', 'I want a table for my clients where I can search a client by name or phone'],
    ])('%s does not become a browser task', (_label, brief) => {
        expect(quickIntent(brief)).toBeNull();
    });

    // NEGATIVE — the browser fast path must survive its own guard.
    it.each([
        ['بحث حقيقي', 'ابحث لي عن سعر الدولار اليوم'],
        ['موقع معروف', 'ادخل على جيت هاب وشوف آخر إشعارات'],
        ['رابط صريح', 'افتح https://example.com واقرأ العنوان'],
        ['تصفّح', 'تصفّح الويب ولخّص لي أول نتيجة'],
    ])('%s is still a browser task', (_label, ask) => {
        expect(quickIntent(ask)?.suggestedAgent).toBe('Browser');
    });

    // NEGATIVE — naming a site keeps the browser even inside a build-shaped ask.
    it('a build verb aimed at a named site is not stolen from the browser', () => {
        expect(looksLikeBuild('افتح جيت هاب واعمل لي issue جديد')).toBe(false);
    });
});
