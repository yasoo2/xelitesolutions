/**
 * WHAT A LIST NAMES, ONCE THE ACTIONS AND THE RULES ARE TAKEN OFF IT.
 *
 * Round 20 review: «… لإدارة مصمم مستقل: إضافة وتعديل وحذف وبحث في الأعمال
 * والعملاء والفواتير» lists the actions BEFORE the records they act on. Read
 * raw, «بحث في الأعمال» is one item, so «الأعمال» was never a table — while
 * the delivery gate, reading the same sentence, demanded it. Builders and the
 * gate must read one list, so this is the one reader both use: the leading
 * actions («إضافة/تعديل/حذف/عرض/بحث في», «add, edit, delete, search for») come
 * off, an action-only colon clause («: add, edit, delete and search each one»)
 * comes out, and a trailing rule («, and each staff member only sees their own
 * records», «، وكل موظف يرى سجلاته فقط») is cut off the list and kept as its
 * own sentence. Verbs and verbal nouns of record work are a closed class of
 * the language, not a domain list.
 */
import { FoldedRegExp, listRegion, type ListMarker } from './request-lists';

/*
 * Every Arabic pattern here is matched folded (round 21 review, R5): one
 * spelling of a word is every spelling of it, so «اضافه», «إضافة» and
 * «اضافة» are one word without being written three times.
 */
const AR_ACTION = '(?:إضافة|تعديل|حذف|مسح|عرض|استعراض|بحث|البحث|تحديث|إنشاء|تصفح|فلترة|تصفية|فرز|ترتيب|متابعة|إدارة)';
const EN_ACTION = '(?:add(?:s|ing)?|create(?:s)?|creating|edit(?:s|ing)?|update(?:s)?|updating|delete(?:s)?|deleting|remove(?:s)?|removing|view(?:s|ing)?|list(?:s|ing)?|search(?:es|ing)?|filter(?:s|ing)?|sort(?:s|ing)?|browse|browsing|manag(?:e|es|ing)|track(?:s|ing)?)';
const AR_ACTION_HEAD = new FoldedRegExp(`^و?${AR_ACTION}(?:\\s+(?:في|عن|على|ضمن|بين))?(?=\\s|[،,]|$)`, 'u');
const EN_ACTION_HEAD = new RegExp(`^(?:and\\s+|or\\s+|then\\s+)?${EN_ACTION}(?:\\s+(?:for|in|through|by))?(?=\\s|,|$)`, 'iu');
const AR_ACTION_WORD = new FoldedRegExp(`^و?${AR_ACTION}$`, 'u');
const EN_ACTION_WORD = new RegExp(`^${EN_ACTION}$`, 'iu');
/** What an action-only clause ends with: «each one», «them», «كل منها». */
const ACTION_FILLER = new FoldedRegExp('^(?:(?:each|every|all)(?:\\s+(?:one|of\\s+them|item|record|entry))?|them|it|those|these|كل\\s+(?:منها|واحدة?|منهم)|عليها|فيها|منها)?$', 'iu');

/** Is this item nothing but an action word («إضافة», «وتعديل», «delete», «adds»)? */
export function isActionWord(item: string): boolean {
    const t = String(item || '').trim();
    if (!t) return false;
    return AR_ACTION_WORD.test(t) || EN_ACTION_WORD.test(t);
}

/** Take a leading run of actions off a list: «إضافة وتعديل وحذف وبحث في الطلاب…» → «الطلاب…». */
export function stripLeadingActions(region: string): { rest: string; removed: boolean; consumed: number; actions: number } {
    const original = String(region || '');
    let at = original.length - original.trimStart().length;
    let actions = 0;
    for (let guard = 0; guard < 12; guard++) {
        const tail = original.slice(at);
        const m = tail.match(AR_ACTION_HEAD) || tail.match(EN_ACTION_HEAD);
        if (!m) break;
        at += m[0].length;
        const sep = original.slice(at).match(/^(?:[\s،,]+|(?:and|or)\s+)*/iu);
        at += sep ? sep[0].length : 0;
        actions++;
    }
    return { rest: original.slice(at).trim(), removed: actions > 0, consumed: at, actions };
}

/** «بحث في الأعمال» → «الأعمال», «manage orders» → «orders»: the record an item's action works on. */
export function withoutLeadingAction(item: string): string {
    const stripped = stripLeadingActions(item);
    return stripped.removed ? stripped.rest : String(item || '').trim();
}

/**
 * A rule clause that ends the records list: «, and each staff member only
 * sees their own records», «، وكل موظف يرى سجلاته فقط», «where …», «حيث …».
 * What follows is behaviour, never a record.
 */
export const RULE_OPENER = new FoldedRegExp('(?:,\\s*|\\s+)(?:and\\s+)?(?:each|every|where|whereas|while|so\\s+that|such\\s+that|but)\\s+|(?:،\\s*|\\s+)و?(?:كل|حيث|بحيث|لكن)\\s+', 'iu');

/**
 * UI or feature words that head a section, not a record: «زر إعادة»,
 * «شاشة نتيجة», «حساب النقاط», «a summary page», «a timer».
 * A closed class of interface nouns; «حسابات» (accounts) is plural and stays.
 * Not «آراء» (round 22): «آراء العملاء» is content about a record, read as
 * such by the list reader in both languages ("customer testimonials" too) —
 * said, never skipped in silence. Not «رسوم»: it is fees as often as it is
 * drawings, and «رسوم الطلاب» in a records list is the students' fees.
 */
const FEATURE_HEAD_AR = new FoldedRegExp('^و?(?:ال)?(?:زر|أزرار|شاشة|صفحة|قسم|نموذج|مؤقت|رسم|رسماً|حساب|عرض|تقويم|لوحة|خريطة|ملخص|إحصائيات|واجهة|خادم|سيرفر|تسجيل|باك|فرونت|سلة)(?=\\s|$)', 'u');
/** Interface, stack and feature heads: «React frontend», «Node backend», «user login», «a summary page». */
const FEATURE_HEADS_EN = new Set(['button', 'buttons', 'screen', 'screens', 'page', 'section', 'form', 'timer', 'chart', 'graph', 'calculation',
    'score', 'scoring', 'view', 'calendar', 'dashboard', 'map', 'summary', 'statistics', 'stats', 'frontend', 'front-end', 'backend', 'back-end',
    'server', 'login', 'logins', 'signin', 'sign-in', 'interface', 'ui', 'gui', 'api', 'cart']);

export function isFeaturePhrase(item: string): boolean {
    const t = String(item || '').trim();
    if (FEATURE_HEAD_AR.test(t)) return true;
    const words = t.toLowerCase().replace(/^(?:a|an|the)\s+/u, '').replace(/\b(front|back|sign|log)\s+(end|in)\b/gu, '$1-$2').split(/\s+/).filter(Boolean);
    return !!words.length && (FEATURE_HEADS_EN.has(words[0]) || FEATURE_HEADS_EN.has(words[words.length - 1]));
}

export interface NormalisedRequest {
    /** The request with action-only colon clauses removed and the list's leading actions and trailing rules taken off. */
    text: string;
    region: string | null;
    marker: ListMarker | null;
    /** The list opened with actions on its records («إضافة وتعديل … في X»): a records list by construction. */
    actionLed: boolean;
    /** Rule clauses cut off the end of the list. */
    rules: string[];
}

/** The request as its records list reads once the actions and the rules are off it. */
export function normaliseListedRequest(request: string): NormalisedRequest {
    let text = String(request || '').replace(/\s+/g, ' ').trim();
    // «…, tables: add, edit, delete and search each one, with a summary…» —
    // an action-only clause after a colon declares no table.
    for (let guard = 0; guard < 6; guard++) {
        let changed = false;
        for (const colon of Array.from(text.matchAll(/[:：]/gu))) {
            const at = colon.index || 0;
            const after = text.slice(at + 1);
            const stripped = stripLeadingActions(after);
            if (!stripped.removed) continue;
            const remainder = after.slice(stripped.consumed);
            const end = remainder.search(/[,،.;؛!?؟]|\s+(?:with|مع)\s+/iu);
            const filler = (end < 0 ? remainder : remainder.slice(0, end)).trim();
            if (!ACTION_FILLER.test(filler)) continue;
            const removeLen = stripped.consumed + (end < 0 ? remainder.length : end);
            text = `${text.slice(0, at)}${text.slice(at + 1 + removeLen)}`.replace(/\s+/g, ' ').trim();
            changed = true;
            break;
        }
        if (!changed) break;
    }
    const found = listRegion(text);
    if (!found) return { text, region: null, marker: null, actionLed: false, rules: [] };
    const stripped = stripLeadingActions(found.region);
    // «تسجيل دخول بصلاحيات (مدير وموظف)» — the parenthesis names roles, not records.
    let region = stripped.rest.replace(/\s*\([^)]*\)/gu, ' ').replace(/\s+/g, ' ').trim();
    const rules: string[] = [];
    const rule = region.match(RULE_OPENER);
    if (rule && rule.index !== undefined && rule.index > 0) {
        rules.push(region.slice(rule.index).replace(/^[\s,،]+/u, '').replace(/[.!?؟]+$/u, '').trim());
        region = region.slice(0, rule.index).trim();
    }
    const rebuilt = text.replace(found.region, rules.length ? `${region}. ${rules.join('. ')}` : region);
    // One «عرض المنتجات بالصور» is a feature; a run «إضافة وتعديل وحذف وبحث في …» acts on records.
    return { text: rebuilt, region, marker: found.marker, actionLed: stripped.actions >= 2, rules };
}
