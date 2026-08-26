/**
 *  WHAT A SESSION DID, WRITTEN THE SAME WAY TWICE.
 *
 *  He closed Joe's window, reopened it, and picked a session out of the row
 *  at the bottom. The conversation came back — «وهذا ممتاز» — and then:
 *
 *      «عندما اضغط على شاشة البرفيو فانه لا يعرض الملف الذي بني في تلك الجلسه
 *       … وكل الجلسات السابقة لا تعرض على البرفيو واللوجز ما تم في تلك الجلسة»
 *
 *  Measured on his machine, as a guest, opening two past sessions:
 *
 *      «جدول مهام متصفح»      chat 211 lines · preview iframes=0 src=null · logs empty
 *      «برنامج لحفظ الزبائن»  chat 205 lines · preview iframes=0 src=null · logs empty
 *
 *  and at the same moment, from the same machine:
 *
 *      GET /project-preview/6a8c269c433c89409960335d/index.html  →  HTTP 200
 *      <title>AUTHORITATIVE — العملاء</title>
 *
 *  The work was never lost. The SERVER had it the whole time — the project
 *  directory in joe-projects.json, the run's events in run-evidence. What
 *  died was the browser's memory of which session owned it: previewBySession
 *  and panelArchive are both useRef Maps, and a ref lives exactly as long as
 *  the window. The chat survived because the chat is asked for; the preview
 *  and the logs were never asked for, only listened for — and a listener
 *  hears nothing about a build that finished yesterday.
 *
 *  So restoring them means writing the same lines the live stream writes, and
 *  the only way two writers stay identical is to not be two. These rules live
 *  here: the browser applies them to an event arriving now, the server applies
 *  them to the same event read back from disk, and neither owns a private
 *  copy that can drift from the other.
 */

/** Markdown is structure for a document; a log line is speech. */
export function asPlainLine(input: unknown): string {
    let t = String(input ?? '');
    if (!t) return '';
    //  Fenced and inline code keep their contents, lose their fences.
    t = t.replace(/```[a-zA-Z0-9]*\n?/g, '').replace(/`([^`]+)`/g, '$1');
    //  Bold and italic, in that order: ** before * or the inner pass eats
    //  one asterisk of each pair and leaves the other stranded.
    t = t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2');
    t = t.replace(/__([^_]+)__/g, '$1');
    //  A link keeps its words, not its address.
    t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    //  Headings and quote marks are structure, not speech.
    t = t.replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s{0,3}>\s?/gm, '');
    //  A bullet becomes a bullet the panel can draw in one font.
    t = t.replace(/^\s{0,3}[-*+]\s+/gm, '· ');
    return t.replace(/[ \t]+$/gm, '');
}

export interface LoggableEvent {
    type?: string;
    id?: string;
    data?: any;
}

/**
 *  The lines one event contributes to the Logs panel — none, one, or many.
 *
 *  The stamp is deliberately NOT here. A live line is stamped when it arrives
 *  and a restored line with the moment it happened, and a function that
 *  invented its own clock would put today's time on last week's build.
 */
export function logTextFor(event: LoggableEvent): string[] {
    const type = String(event?.type || '');
    const data: any = event?.data;

    if (type === 'step_started') return [`Step Started: ${data?.name || 'Unknown'}`];
    if (type === 'step_done') return ['Step Done'];
    if (type === 'run_finished') return ['Run Finished'];

    if (type === 'text') {
        //  data is { text, sessionId } — logging the object printed a literal
        //  «[object Object]» line in the panel.
        const t = typeof data === 'string' ? data : String(data?.text ?? '');
        return t ? [asPlainLine(t)] : [];
    }

    if (type === 'terminal_output') {
        //  THE BUILD'S REAL VOICE — npm install, the vite build, the audit
        //  verdict. The server may fan one session-owned line to several
        //  terminal ids; taking one canonical id keeps it from landing here
        //  several times without making the id a cross-session scope.
        if (event.id !== 'panel-terminal') return [];
        return String(data ?? '')
            .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')   // ANSI colours never reach the DOM
            .split(/\r?\n/)
            .map(l => l.trimEnd())
            .filter(Boolean);
    }

    //  The stage narration the user already sees in chat — in the log it is
    //  the spine the terminal lines hang from.
    if (type === 'thinking_detail' && data?.detail) return [String(data.detail)];

    if (type === 'tool_started' && (data?.name || data?.tool)) return [`▶ ${String(data.name || data.tool)}`];

    //  A FAILED STEP AND A FAILED SYSTEM READ DIFFERENTLY, AND SHOULD.
    //  A step names the tool that broke; a system error is Joe itself. The
    //  two wordings and the two fallbacks are preserved exactly as the live
    //  panel wrote them, so a restored log is the same text, not a paraphrase.
    if (type === 'step_failed') {
        let message: any = 'Unknown error';
        if (typeof data === 'string') message = data;
        else if (data) {
            message = data.result?.error || data.result?.message || data.error || data.message || 'Unknown error';
            if (typeof message === 'object') message = JSON.stringify(message);
        }
        return [`ERROR: ${message}`];
    }
    if (type === 'error') {
        let message: any = 'System error';
        if (typeof data === 'string') message = data;
        else if (data) {
            message = data.message || data.error || 'System error';
            if (typeof message === 'object') message = JSON.stringify(message);
        }
        return [`SYSTEM ERROR: ${message}`];
    }

    return [];
}

/** A locale-free 24h stamp, so a restored line reads like a live one. */
export function logStampFor(ts: unknown): string {
    const n = Number(ts);
    const d = Number.isFinite(n) && n > 0 ? new Date(n) : null;
    if (!d || Number.isNaN(d.getTime())) return '--:--:--';
    const p = (v: number) => String(v).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
