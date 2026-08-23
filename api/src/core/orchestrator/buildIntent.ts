/**
 * Shared build-intent classifier.
 *
 * A request that asks for a thing and describes the contents it will hold is a
 * build even when its domain noun is unseen. This is shape evidence, not a
 * catalogue of business sectors, and keeps browser/planner/build routes aligned.
 */
import { stripArabicDiacritics } from './promptNormalizer';
import { derivedColumns } from '../design/app-blueprints';

export function looksLikeBuild(goalRaw: string): boolean {
    const g = String(goalRaw || '');
    const bare = stripArabicDiacritics(g);
    const verb = /\b(build|create|make|develop|generate|scaffold|implement|code)\b/i.test(g)
        || /(?:^|[\s،:؛])(?:ابن|ابني|انشئ|أنشئ|اصنع|صمم|طور|اعمل|اصمم|سو|برمج|شيّ?د|أقم|اقم)(?=$|[\s،:؛])/.test(bare)
        || /(^|\s)بنِ?\s/.test(g)
        || /(?:^|[\s،:؛])بن(?=$|[\s،:؛])/.test(bare);

    // Desire is admitted when it reaches a build surface within two words;
    // questions about information remain questions rather than builds.
    const asking = /(?:^|[\s،:؛])(?:بدي|بدى|ودي|ابغي|ابغى|اريد|عايز|عاوز|محتاج|نبي)(?=$|[\s،:؛])/.test(bare)
        || /(?:^|[\s،:؛])(?:ابن|ابني|انشئ|اصنع|صمم|طور|اعمل|اصمم|سو|سوي|برمج|جهز)(?=$|[\s،:؛])/.test(bare)
        || /\b(?:i\s+(?:want|need)|can\s+you|could\s+you|please|make\s+me|give\s+me|build\s+me)\b/i.test(g);

    const noun = /\b(platform|marketplace|storefront|e-?commerce|site|website|page|app|application|software|system|dashboard|panel|console|admin|store|shop|portal|api|backend|tool|service|saas|crm|erp|pos|blog|editor|tracker|game|table|spreadsheet|list|ledger|register)\b/i.test(g)
        || /(موقع|صفحة|تطبيق|متجر|نظام|منصّ?ة|لوحة|واجهة|أداة|اداة|برنامج|بوابة|خدمة|جدول|قائمة|كشف)/.test(bare);

    return (verb && noun) || (asking && Boolean(derivedColumns(g)?.length));
}
