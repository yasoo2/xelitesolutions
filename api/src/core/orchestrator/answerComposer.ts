/**
 * WHAT THE USER ACTUALLY READS AT THE END OF A RUN.
 *
 * The orchestrator finishes with a map of stepId -> output, and the reply was
 * built by walking that map BACKWARDS and returning the first non-empty value.
 * For a one-step run that is right, and it stays right here. For anything
 * longer it was wrong in two ways at once, measured on a real run of
 * «افحص الروابط ثم اكتب تقريراً»:
 *
 *   {"collect":{"content":"وجدتُ 3 روابط مكسورة: /a /b /c"},"report":{"success":true}}
 *   → the chat message was:  {"success":true}
 *
 * The material the user asked for was discarded because it was not produced by
 * the LAST step, and a raw JSON object was printed into a chat window as if it
 * were a sentence.
 *
 * The rule is deliberately conservative, because most runs are one step and
 * those answers are already good:
 *
 *   - what a step CHOSE to say — its answer, text, summary or message — always
 *     reaches the user, in the order it was said. One speaking step therefore
 *     answers exactly as it did before;
 *   - raw material (a `content`, a `stdout`) is NOT prose and stays out while
 *     any step is speaking — otherwise a run that merely read a file would dump
 *     it above a perfectly good answer. It surfaces only when nothing spoke, or
 *     when everything said was a one-line «تم», and it is capped, never dumped;
 *   - and when the run produced no words at all, the answer is an honest list of
 *     what was DONE, in the user's language — never a JSON object.
 */

export interface RunStep {
    id: string;
    task?: string;
    tool?: string;
    input?: any;
    status?: string;
    result?: any;
}

/** A one-line «تم» is a status, not an answer — but it is still worth saying. */
const STATUS_MAX = 40;
/** How much raw material (a file's text, a command's stdout) may reach the chat. */
const MAX_DATA = 1200;
const MAX_BLOCKS = 4;

/** The sentence a step said, if it said one. */
export function proseOf(output: any): string {
    if (output == null) return '';
    if (typeof output === 'string') return output.trim();
    if (typeof output !== 'object') return String(output);
    // `summary` before `message`: a tool's message is a one-line status
    // («analysis complete») while the summary is the content itself.
    for (const k of ['answer', 'text', 'summary', 'message']) {
        const v = (output as any)[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
}

/** The material a step produced, when it produced material instead of prose. */
export function dataOf(output: any): string {
    if (!output || typeof output !== 'object') return '';
    for (const k of ['content', 'stdout', 'output', 'result', 'body']) {
        const v = (output as any)[k];
        if (typeof v === 'string' && v.trim()) {
            const t = v.trim();
            return t.length > MAX_DATA ? `${t.slice(0, MAX_DATA)}\n…` : t;
        }
    }
    return '';
}

const isStatusLine = (s: string) => !!s && s.length <= STATUS_MAX && !s.includes('\n');

/** Joins blocks in order, dropping repeats and anything already contained. */
function join(blocks: string[]): string {
    const kept: string[] = [];
    for (const b of blocks) {
        if (!b) continue;
        if (kept.some(k => k.includes(b))) continue;
        kept.push(b);
    }
    return kept.slice(-MAX_BLOCKS).join('\n\n');
}

function readFileEvidence(step: RunStep): { file: string; content: string; totalLines: number; expectedMarker?: string } | null {
    if (String(step.tool || '') !== 'read_file') return null;
    const raw = step.result;
    const output = raw?.output && typeof raw.output === 'object' ? raw.output : raw;
    if (!output || typeof output.content !== 'string' || typeof output.totalLines !== 'number') return null;
    const task = String(step.task || '').replace(/\s+/g, ' ').trim();
    const file = String(step.input?.path || task.match(/:\s*(\S+)$/)?.[1] || 'الملف المحدد');
    const expectedMarker = typeof step.input?.expectedMarker === 'string' && step.input.expectedMarker.trim()
        ? step.input.expectedMarker.trim()
        : undefined;
    return { file, content: output.content.trim(), totalLines: output.totalLines, expectedMarker };
}

function composeReadFileReport(done: RunStep[], language?: string): string {
    if (!done.length || !done.every(step => String(step.tool || '') === 'read_file')) return '';
    const evidence = done.map(readFileEvidence);
    if (evidence.some(item => !item)) return '';
    const rows = (evidence as Array<{ file: string; content: string; totalLines: number; expectedMarker?: string }>).map(item => {
        const marker = item.expectedMarker
            ? `\n**Marker:** ${item.content.includes(item.expectedMarker) ? 'PASS' : 'FAIL'} — \`${item.expectedMarker}\``
            : '';
        return `**${item.file}** — ${item.totalLines} ${item.totalLines === 1 ? 'line' : 'lines'}${marker}\n\`\`\`text\n${item.content}\n\`\`\``;
    }
    ).join('\n\n');
    const ar = String(language || '').startsWith('ar');
    const hasExpectedMarkers = (evidence as Array<{ expectedMarker?: string }>).some(item => item.expectedMarker);
    return ar
        ? `## ✅ تقرير قراءة الملفات\n\n${rows}\n\n${hasExpectedMarkers ? '**حالة العلامات:** تم التحقق من كل علامة مذكورة مقابل المحتوى المقروء.' : '**العلامة المتوقعة:** لم تُذكر قيمة العلامة في الطلب، لذلك لا أدّعي تحققها.'} لم تُجرَ أي كتابة أو تعديل.`
        : `## ✅ File reading report\n\n${rows}\n\n${hasExpectedMarkers ? '**Marker status:** Each supplied marker was checked against the file content.' : '**Expected marker:** No marker value was specified, so Joe cannot claim that check.'} No files were written or modified.`;
}

function composeDirectoryReport(done: RunStep[], language?: string): string {
    if (!done.length || !done.every(step => String(step.tool || '') === 'inspect_directory')) return '';
    const evidence = done.map(step => {
        const raw = step.result;
        const output = raw?.output && typeof raw.output === 'object' ? raw.output : raw;
        const tree = Array.isArray(output?.tree) ? output.tree : null;
        if (!tree) return null;
        return { path: String(step.input?.path || 'المجلد المحدد'), tree, expectedEntry: String(step.input?.expectedEntry || '').trim() };
    });
    if (evidence.some(item => !item)) return '';
    const rows = (evidence as Array<{ path: string; tree: any[]; expectedEntry: string }>).map(item => {
        const entries = item.tree.map(entry => `- ${entry.type === 'directory' ? '[dir]' : '[file]'} ${entry.name}`).join('\n') || '- (empty)';
        const found = item.expectedEntry
            ? item.tree.some(entry => entry.name === item.expectedEntry || entry.name === item.expectedEntry.replace(/^[\\/]+/, '').split(/[\\/]/).pop())
            : false;
        const confirmation = item.expectedEntry
            ? `\n**${found ? 'Confirmed' : 'Not found'}:** \`${item.expectedEntry}\` ${found ? 'exists in this directory.' : 'was not found in this directory.'}`
            : '';
        return `**${item.path}**\n${entries}${confirmation}`;
    }).join('\n\n');
    const ar = String(language || '').startsWith('ar');
    return ar
        ? `## ✅ تقرير استكشاف المجلد\n\n${rows}\n\nلم تُجرَ أي كتابة أو تعديل.`
        : `## ✅ Directory inspection report\n\n${rows}\n\nNo files were written or modified.`;
}

/**
 * The whole run, in one message. `steps` is in plan order; anything that never
 * completed is ignored.
 */
export function composeAnswer(steps: RunStep[], language?: string): string {
    const done = (steps || []).filter(s => s && s.status !== 'failed');
    if (!done.length) return '';

    const readFileReport = composeReadFileReport(done, language);
    if (readFileReport) return readFileReport;

    const directoryReport = composeDirectoryReport(done, language);
    if (directoryReport) return directoryReport;

    const prose = done.map(s => proseOf(s.result)).filter(Boolean);

    // What a step CHOSE to say always reaches the user, in the order it was
    // said. One step that spoke gives exactly what it gave before — the case
    // that covers most requests, unchanged.
    if (prose.length) {
        const said = join(prose);
        // …unless every word of it was a status line («تم»). Then the run's
        // material is all it really has to show, and that material is what the
        // question was about.
        if (prose.every(isStatusLine)) {
            const material = join(done.map(s => (proseOf(s.result) ? '' : dataOf(s.result))));
            if (material) return `${material}\n\n${said}`;
        }
        return said;
    }

    // Nothing spoke. Raw material now counts — this is the measured failure:
    // the findings lived in a `content` field and the reply was the next step's
    // `{success:true}`.
    const material = join(done.map(s => dataOf(s.result)));
    if (material) return material;

    // And when the run produced no words at all, report what was DONE —
    // truthfully, from the tasks that really ran — instead of printing an
    // object into a chat window.
    const ar = String(language || '').startsWith('ar');
    const lines = done.map(s => `- ${s.task || s.tool || s.id}`).join('\n');
    return ar ? `تمّ التنفيذ:\n${lines}` : `Done:\n${lines}`;
}

/**
 * A RUN THAT FAILED HALFWAY STILL DID SOMETHING.
 *
 * Measured on a real three-step run — build a page, write a note, then a step
 * that failed: two files were on disk, and the entire reply was
 *
 *   ⚠️ File not found
 *
 * The user was not told the page existed, not told WHICH of the three steps
 * failed, and read it in English in an Arabic session. The work was invisible
 * and the error was unplaceable.
 *
 * The technical detail stays — it is real and it is what repairs the problem —
 * but it arrives inside a sentence that names the step it belongs to, above a
 * list of what survived.
 */
/**
 * A STEP NAME IS A LABEL, NOT THE REQUEST IT CARRIES.
 *
 * Measured on a real WeatherGo run: the pipeline names its step «استكشف السياق
 * ثم خطط ونفّذ تطبيق React المطلوب بأدلة واختبارات: <the whole 1700-character
 * prompt>». The failure line then read the entire prompt back to the person who
 * had just typed it — twice, once here and once in the surrounding report —
 * and buried the one sentence that mattered under it.
 *
 * A colon that introduces a payload longer than the label is not punctuation in
 * a title; it is a seam. Cut there, then cap. Nothing is lost: the request is
 * on screen already, two lines above, in his own words.
 */
export function stepLabel(raw: string, max = 70): string {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    const at = text.indexOf(':');
    const head = at > 0 && text.length - at > at ? text.slice(0, at).trim() : text;
    return head.length > max ? `${head.slice(0, max - 1).trimEnd()}…` : head;
}

export function composeFailure(steps: RunStep[], rawError: string, language?: string): string {
    const ar = String(language || '').startsWith('ar');
    const detail = String(rawError || '').trim().slice(0, 400);
    const list = (steps || []).filter(s => s && s.status === 'completed');
    const failed = (steps || []).find(s => s && s.status === 'failed');

    const name = failed ? stepLabel(failed.task || failed.id) : '';
    const failedOutput = failed?.result?.output && typeof failed.result.output === 'object'
        ? proseOf(failed.result.output)
        : proseOf(failed?.result);
    const head = failed
        ? (ar ? `توقّفت عند الخطوة «${name}»${detail ? ` — ${detail}` : ''}`
              : `Stopped at step “${name}”${detail ? ` — ${detail}` : ''}`)
        : detail;
    const explained = failedOutput && !head.includes(failedOutput)
        ? `${head}\n\n${failedOutput.slice(0, 1800)}`
        : head;
    if (!list.length) return explained;

    const lines = list.map(s => {
        const p = proseOf(s.result);
        const extra = p && !isStatusLine(p) ? `\n  ${p.split('\n')[0].slice(0, 200)}` : '';
        return `- ${stepLabel(s.task || s.tool || s.id, 90)}${extra}`;
    }).join('\n');
    return `${explained}\n\n${ar ? 'وما أُنجز قبل التوقّف — وهو باقٍ:' : 'Completed before stopping — and it is still there:'}\n${lines}`;
}
