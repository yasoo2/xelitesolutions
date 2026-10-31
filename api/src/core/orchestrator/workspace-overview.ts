import { isKnowledgeQuestion, isReadOnlyRequest } from './buildIntent';
import { hasRequestedAction } from '../intelligence/requested-action';

/** No-mutation constraints permit real inspection; no-execution takes precedence. */
export function isReadOnlyWorkspaceOverviewRequest(request: string): boolean {
    return !hasRequestedAction(request).isAnswerOnly && !isKnowledgeQuestion(request)
        && isReadOnlyRequest(request) && isWorkspaceOverviewRequest(request);
}

/** A bounded workspace question does not need a project selection. */
export function isWorkspaceOverviewRequest(request: string): boolean {
    const text = String(request || '').replace(/\s+/g, ' ').trim();
    const asksForRootListing = /\b(?:list|show|inspect)\b[^.!?\n]{0,80}\b(?:top[- ]level|root)\b[^.!?\n]{0,40}\bfiles?\b/i.test(text)
        || /(?:اعرض|اعطِني|أعطني|اذكر|استكشف|افحص)[^.!؟\n]{0,80}(?:ملفات|محتويات)[^.!؟\n]{0,40}(?:الجذر|المستوى\s+الأعلى|مساحة\s+العمل\s+(?:الرئيسية|الأساسية))/i.test(text);
    const asksForReadme = /\b(?:readme|read\s+the\s+readme|summari[sz]e\s+(?:the\s+)?readme)\b/i.test(text)
        || /(?:اقرأ|لخ[ّّ]ص|لخص|ملخص)[^.!؟\n]{0,40}(?:README|الملف\s+التعريفي)/i.test(text);
    return asksForRootListing || asksForReadme;
}
