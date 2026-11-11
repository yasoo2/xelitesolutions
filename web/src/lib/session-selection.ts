/**
 * WHICH CONVERSATION IS OPEN AFTER THE SESSION LIST LOADS.
 *
 * 2026-11-05, the UI/UX check of Joe's own page: a reload never stayed on
 * the conversation the user was reading. Every reload opened the newest one.
 * The list loads with nothing selected, the store defaulted to the first
 * (newest) agent session, React committed that at once, and the effect that
 * remembers the open conversation wrote the NEWEST id over the saved one
 * — before the code that restores the saved id had read it. So the restore
 * read its own overwrite.
 *
 * The saved id is read once, when this module loads, before anything can
 * render or write, and the default prefers it whenever it still exists.
 */
export const ACTIVE_SESSION_KEY = 'joe-active-session';

function readSaved(): string {
    try { return String(globalThis.localStorage?.getItem(ACTIVE_SESSION_KEY) || '').trim(); } catch { return ''; }
}

/** The conversation open when the page loaded: read before the first render. */
export const savedAtBoot: string = readSaved();

export interface SelectionInput {
    chatIds: string[];
    agentIds: string[];
    selected: string | null;
    agentSelected: string | null;
    preferred?: string | null;
}

/**
 * The single-active invariant (at most one of selected / agentSelected), with
 * the default going to the preferred conversation when it still exists, and
 * only otherwise to the newest agent session, then the newest chat.
 */
export function chooseActiveSession({ chatIds, agentIds, selected, agentSelected, preferred }: SelectionInput): { selected: string | null; agentSelected: string | null } {
    const chats = new Set(chatIds);
    const agents = new Set(agentIds);
    let nextSelected = selected && chats.has(selected) ? selected : null;
    let nextAgent = agentSelected && agents.has(agentSelected) ? agentSelected : null;
    // agentSelected wins in the view, so if both survived, keep only the chat one.
    if (nextSelected && nextAgent) nextAgent = null;
    if (!nextSelected && !nextAgent) {
        const want = String(preferred || '').trim();
        if (want && agents.has(want)) nextAgent = want;
        else if (want && chats.has(want)) nextSelected = want;
        else if (agentIds[0]) nextAgent = agentIds[0];
        else if (chatIds[0]) nextSelected = chatIds[0];
    }
    return { selected: nextSelected, agentSelected: nextAgent };
}
