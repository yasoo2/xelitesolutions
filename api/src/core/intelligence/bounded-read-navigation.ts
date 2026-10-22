import { hasRequestedAction } from './requested-action';

/** A scoped file-write prohibition is not authority to execute arbitrary tools.
 * Only explicit, non-mutating URL navigation can cross this narrow boundary.
 * All existing ToolService and browser policy checks still apply.
 */
export function boundedReadNavigationUnderFileConstraint(text: string): boolean {
    const scopedFileDenial = /\bdo\s+not\s+(?:create|write|modify|edit|change)(?:\s+(?:or|and)\s+(?:create|write|modify|edit|change))*\s+(?:any\s+)?files?\b|\b(?:no|without)\s+file\s+changes?\b/gi;
    const observation = String(text || '').replace(scopedFileDenial, '');
    if (observation === text) return false;
    // A quoted specification or an explanatory question never grants navigation.
    if (!/^\s*(?:please\s+)?(?:open|visit|go\s+to|navigate\s+to)\b/i.test(observation)) return false;
    if (/```/.test(observation)) return false;
    const urls = observation.match(/https?:\/\/[^\s<>"'`]+/gi) || [];
    if (urls.length !== 1) return false;
    const remainingDenial = hasRequestedAction(observation);
    if (remainingDenial.isAnswerOnly || remainingDenial.isNoFileChanges) return false;
    // Refuse mixed work and mutations, including negated mutation wording;
    // this conservative boundary never promotes a browser interaction request.
    if (/\b(?:log\s*[- ]?\s*in|sign\s*[- ]?\s*in|click|fill|submit|upload|download|delete|remove|install|execute|run|write|edit|modify|change|create|build|implement|generate|buy|purchase|checkout|repair|autofix)\b/i.test(observation)) return false;
    return true;
}
