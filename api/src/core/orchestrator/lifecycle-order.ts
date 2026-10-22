/**
 * RUN, STOP AND PUBLISH HAVE ONE READER.
 *
 * The planner decides these three orders deterministically, behind guards it
 * learned one live round at a time: a question describes a topic and does not
 * command it («how do I run the project»), publishing an ARTICLE is not
 * deploying a SITE («انشر مقالاً»), a build verb outranks a run verb, and a
 * request that denies publishing never publishes.
 *
 * Then a second router learned the same three tools. The capability matcher
 * ranks a request against every tool's own words, and «انشر» is bridged to
 * deploy / publish / pages, «run» is in project_run's name. It knew none of
 * the guards, and it was asked AFTER they had declined — so it re-claimed
 * exactly what they had refused:
 *
 *     how do I run the project   → project_run, project_stop
 *     انشر مقالاً عن القهوة       → deploy_pages, deploy_project
 *
 * Two sides that must agree, kept apart, and nothing forcing them to. The
 * guards were not wrong and the matcher was not wrong; each was right about a
 * different question. So the question is asked once, here, and both ask it:
 * the planner's fast path dispatches on it, and the matcher keeps a lifecycle
 * tool only when this reader gives the same answer for the same words.
 *
 * Nothing in this file names a business, a site or a product. It reads verbs,
 * question shapes and what kind of thing is the target.
 */
import { normalizeIntentText } from './promptNormalizer';

export type LifecycleTool = 'project_run' | 'project_stop' | 'deploy_pages';

/** The tools whose dispatch this reader owns, and the order each answers to. */
export const LIFECYCLE_FAMILY: Readonly<Record<string, LifecycleTool>> = {
    project_run: 'project_run',
    project_stop: 'project_stop',
    deploy_pages: 'deploy_pages',
    deploy_project: 'deploy_pages',
};

/** The runtime appends coaching blocks to a goal; only the request decides. */
function requestOnly(goalRaw: string): string {
    const raw = String(goalRaw || '');
    const injectedAt = raw.search(/\n+\[(STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|ATTACHED FILES|RESPONSE LANGUAGE)/i);
    return injectedAt >= 0 ? raw.slice(0, injectedAt).trim() : raw;
}

/**
 * «لا نشر خارجي» — a request that forbids publishing. A build that says so is
 * a local build, and no chain or scorer may turn its bare «نشر» into a deploy.
 */
export function deniesExternalPublish(userGoal: string): boolean {
    return /(?:^|[\s،؛,:.!?])(?:(?:لا|ليس|بدون|غير)\s+(?:(?:أي|أية|اي)\s+)?|(?:do\s+not|don't|without|no)\s+(?:(?:any|external)\s+)?)(?:نشر|انشر|أنشر|رفع|استضافة|deploy|publish|host|go\s*live|github\s*pages)(?=$|[\s،؛,:.!?])/i.test(userGoal);
}

export function lifecycleOrder(goalRaw: string): LifecycleTool | null {
    const userGoal = requestOnly(goalRaw);
    const goalNorm = normalizeIntentText(userGoal);
    const probe = goalNorm && goalNorm !== userGoal.toLowerCase() ? `${userGoal}\n${goalNorm}` : userGoal;

    // A question/search ("how do I run…", "ابحث عن كيفية…", "…؟") describes
    // a topic; it does NOT command run/stop/deploy — those must yield to it.
    const isQuestion = /^\s*(how|what|why|when|where|which|can|do|does|is|are|should|explain)\b/i.test(userGoal.trim())
        || /^\s*(كيف|ماذا|لماذا|متى|أين|هل|اشرح|وضّ?ح|ما\s+هو|ما\s+هي)(?=\s|$)/.test(userGoal)
        || /(ابحث|بحث|دوّ?ر\s*عن|ابغى\s*اعرف|search\s+for|google|look\s*up)/i.test(probe)
        || /\?\s*$/.test(userGoal.trim());

    // إنشاء مشروع جديد يتغلب على التشغيل فقط إذا ورد كفعل إنشاء صريح في
    // نص المستخدم الأصلي. لا نقرأ النسخة المطَبَّعة `probe` هنا: فهي قد
    // تحوّل الاسم «البناء» في جملة تحقق مثل «أثبت هل البناء والتشغيل نجحا»
    // إلى «ابن»، فتختطف أمراً واضحاً لتشغيل مشروع قائم.
    // أما «ابنِ المشروع ثم شغّله» فيبقى إنشاءً جديداً كما ينبغي.
    //
    // النفي جزء من النية، لا كلمة فصل يمكن إسقاطها. كان «لا تنشئ مشروعاً
    // جديداً؛ شغّل المشروع القائم» يطابق `انشئ` هنا، فيحجب مسار التشغيل
    // الحتمي ثم تسقط الجملة إلى منشئ React. نزيل فعل الإنشاء فقط حين يقع
    // مباشرة بعد نفي صريح، ونبقي أي فعل إيجابي لاحق في الجملة مرئياً.
    const userGoalWithoutNegatedBuildVerb = userGoal
        .replace(/(^|[\s،؛,:.!?])(?:لا|ليس|بدون)\s+(?:ت?نشئ|ت?نشيء|ت?بن(?:ي|ِ)?|ت?صمم|ت?طور|ت?عمل|ت?سوي|ت?سوّي|ت?ول[ّد]{1,2}|ت?برمج)(?=\s|$|[،,:؛.!?])/giu, '$1')
        .replace(/(^|[\s,;:.!?])(?:do\s+not|don't|no)\s+(?:build|create|make|develop|design|generate|code|scaffold)(?=\s|$|[,;:.!?])/giu, '$1');
    const hasBuildVerb = /\b(build|create|make|develop|scaffold|generate|code)\b/i.test(userGoalWithoutNegatedBuildVerb)
        // The imperative «ابنِ» carries a kasra after the final noon;
        // accept optional Arabic vowel marks while still matching only a
        // standalone explicit creation verb from the original user text.
        || /(^|\s)(?:ابن[ً-ٟ]*|ابني|انشئ|أنشئ|اصنع|صمم|طور|اعمل|اصمم|برمج)(?=\s|$|[،,:؛.!])/i.test(userGoalWithoutNegatedBuildVerb);
    const hasProjectMutation = /\b(add|change|modify|update|edit|remove|delete|implement|repair|fix)\b/i.test(userGoal)
        || /(أضف|اضف|إضافة|اضافة|غيّر|غير|تغيير|عدّل|عدل|تعديل|حذف|إزالة|أصلح|اصلح|إصلاح|صلّح|عالج)/.test(userGoal);

    // A concrete project/server target — NOT a browser, NOT content. Word
    // boundaries keep "serve" out of "server" and "app" out of "happen".
    //  A PATTERN WRITTEN WITH THE ARTICLE MATCHES HALF THE LANGUAGE.
    //
    //  Measured through generatePlan, the real road a request takes:
    //
    //      شغّل الخادم   → project_run
    //      شغّل خادم     → central_answer
    //      أوقف الخادم   → project_stop
    //      أوقف خادم     → central_answer
    //
    //  The same sentence, one article apart, and one of them does
    //  nothing. «المشروع» already carried its bare twin «مشروع»
    //  right beside it; the other four did not, and «ال» is a
    //  PREFIX — a bare form matches both, a prefixed one matches
    //  half. Writing the article into a pattern can only subtract.
    const projectTarget = /((?:ال)?مشروع|(?:ال)?نظام|(?:ال)?خادم|(?:ال)?سيرفر|(?:ال)?معاينة|\bproject\b|\bserver\b|\bapp\b|\bapplication\b|\bpreview\b|dev\s*server|localhost)/i.test(probe);
    //  …AND THE SAME PREFIX, ONE LINE DOWN.
    //
    //  Measured through generatePlan on his own phrasings:
    //
    //      انشر الموقع   → deploy_pages
    //      انشر موقع     → browser_launch
    //
    //  One article apart, and the bare one opens a BROWSER instead
    //  of publishing anything. The deploy guard did not match, so
    //  the request fell through to the browser router, which takes
    //  «انشر» and a noun as something to go and look at.
    //
    //  The definite form was not more correct — it was accidentally
    //  protected, and «ال» is a prefix.
    const deployTarget = projectTarget || /((?:ال)?موقع|(?:ال)?صفحة|\bsite\b|\bwebsite\b|\bpage\b)/i.test(probe);
    // Content that "انشر/publish" ALSO applies to — publishing an article is
    // NOT deploying a site. This is the collision that sent "انشر مقالاً" to deploy.
    const contentNoun = /(مقال|منشور|تدوينة|تغريدة|خبر|إعلان|محتوى|قصة|\barticle\b|\bpost\b|\bblog\b|\btweet\b|\bstory\b|\bcontent\b)/i.test(probe);

    const stopIntent = !isQuestion && !hasBuildVerb && projectTarget
        && /(أوقف|اوقف|إيقاف|ايقاف|اقفل|\bstop\b|\bkill\b|shut\s*down)/i.test(probe);
    if (stopIntent) return 'project_stop';
    const runIntent = !isQuestion && !hasBuildVerb && !hasProjectMutation && projectTarget
        && /(شغّ?ل|تشغيل|شغلي|\brun\b|\bstart\b|\blaunch\b|\bserve\b|\bpreview\b)/i.test(probe);
    if (runIntent) return 'project_run';

    // Deploy: the unambiguous words (deploy / go live / رابط دائم / استضف)
    // fire on their own; the ambiguous ones (انشر / publish / host) need a
    // site/project target and must not be about content.
    const strongDeploy = /(\bdeploy\b|استضف|استضافة|go\s*live|رابط\s*دائم|github\s*pages|gh-pages)/i.test(probe);
    const softPublish = /(انشر|أنشر|\bpublish\b|\bhost\b)/i.test(probe);
    const deployIntent = !deniesExternalPublish(userGoal) && !isQuestion && !hasBuildVerb && !contentNoun
        && (strongDeploy || (softPublish && deployTarget));
    return deployIntent ? 'deploy_pages' : null;
}

/**
 * May a tool be chosen for these words by similarity alone?
 *
 * Every tool outside the lifecycle family: yes — this reader has no opinion.
 * A lifecycle tool: only when the lifecycle reader, asked about the very same
 * words, names that tool's family. Similarity may find it; only this decides.
 */
export function lifecycleAgrees(toolName: string, text: string): boolean {
    const family = LIFECYCLE_FAMILY[toolName];
    return !family || lifecycleOrder(text) === family;
}
