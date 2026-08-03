/**
 * Attachments → words the model can actually read.
 *
 * The paperclip button did everything except the one thing it exists for:
 * the file uploaded, its text was extracted and stored, the chip appeared,
 * the composer sent the ids with the message — and /runs/start silently
 * dropped them. Joe answered every «لخص هذا الملف» blind, which reads to the
 * user as a model that cannot read, when in truth nothing ever showed it
 * the file.
 *
 * This module renders loaded attachments as a bounded text block that rides
 * WITH the goal, the same way standing instructions do. Bounded, because an
 * attachment is unbounded input into a bounded prompt: a 2 MB log pasted
 * whole would evict the instructions it was attached to.
 */

export interface AttachmentInput {
    name: string;
    mimeType: string;
    size: number;
    /** Extracted text — '' for images/audio/video and unreadable binaries. */
    content: string;
    /** Where the raw file lives, for tools that can open binary formats. */
    path: string;
    /** Set when `content` is a vision model's description, not extracted text. */
    visionDescribed?: boolean;
    /** Verbatim text read FROM the image by local OCR (ara+eng). */
    ocrText?: string;
}

/** One file may not eat the whole budget… */
export const ATTACHMENT_PER_FILE_CHARS = 48_000;
/** …and all files together stay well under the model's context. */
export const ATTACHMENT_TOTAL_CHARS = 96_000;

function humanSize(bytes: number): string {
    const b = Number(bytes) || 0;
    if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(b / 1024))} KB`;
}

/**
 * The block appended to the goal. Empty input → empty string, so callers can
 * push it unconditionally.
 */
export function formatAttachmentsBlock(files: AttachmentInput[]): string {
    const list = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!list.length) return '';

    let budget = ATTACHMENT_TOTAL_CHARS;
    const parts: string[] = [];
    list.forEach((f, i) => {
        const head = `--- (${i + 1}) ${f.name} — ${f.mimeType || 'unknown type'}, ${humanSize(f.size)}`;
        const media = /^(image|audio|video)\//i.test(f.mimeType || '');
        let body: string;
        const text = String(f.content || '').trim();
        // What the local OCR READ inside the picture — the verbatim layer the
        // small vision model cannot provide for Arabic screenshots.
        const ocr = String((f as any).ocrText || '').trim();
        const ocrPart = ocr
            ? `\n(OCR — the EXACT text read inside the image, verbatim; quote from THIS when the user asks what the image says:)\n${ocr}`
            : '';
        if (media && text) {
            // An image the vision pass ANALYZED (or an honest size-limit note):
            // the description is the content, clearly labelled as seen, with
            // the raw file's path kept for tools that can open pixels.
            const cap = Math.max(0, Math.min(ATTACHMENT_PER_FILE_CHARS, budget));
            const body0 = text.length > cap ? `${text.slice(0, cap)}\n…[truncated]` : text;
            budget -= Math.min(text.length, cap);
            body = f.visionDescribed
                ? `(the image was ANALYZED by a vision model — this is what it shows:)\n${body0}${ocrPart}\n(Answer ONLY from this description${ocr ? ' and the OCR text' : ''}. The file's binary metadata — exact pixel dimensions, creation date, format internals — is NOT known to you. NEVER state such details; the filename is a name, not data.)\n(raw file on disk at: ${f.path})`
                : `${body0}${ocrPart}`;
        } else if (media) {
            // No text to give — but SAY SO, with the on-disk path, so the model
            // acknowledges the file instead of ignoring it, and a tool that can
            // open media knows where it is.
            /**
             * NOT SEEN means NOT SEEN. A field-measured reply "analyzed" an
             * undescribed image with invented dimensions, a creation date
             * lifted from the FILENAME, and imaginary embedded links — a
             * confident fabrication, the worst failure an assistant has.
             * The block now forbids it in so many words.
             */
            body = ocr
                // No scene description, but the OCR READ the text — that part
                // is real and quotable; only the visual layer is missing.
                ? `(no vision description was available for this run — but local OCR read the image's text verbatim:)${ocrPart}\n(Describe ONLY from this text; you have NOT seen the visuals — say so if asked about colours/layout. The raw file is on disk at: ${f.path})`
                : `(binary ${String(f.mimeType).split('/')[0]} file — no text content, and NO vision analysis was available for this run: you have NOT seen this file. Do NOT invent or guess its contents, dimensions, dates or any metadata — the filename is a name, not data. Tell the user plainly that image analysis is unavailable right now. The raw file is on disk at: ${f.path})`;
        } else if (!text) {
            body = `(no extractable text content. The raw file is on disk at: ${f.path})`;
        } else {
            const cap = Math.max(0, Math.min(ATTACHMENT_PER_FILE_CHARS, budget));
            if (text.length > cap) {
                body = `${text.slice(0, cap)}\n…[truncated: the file continues for ${text.length - cap} more characters]`;
            } else {
                body = text;
            }
            budget -= Math.min(text.length, cap);
        }
        parts.push(`${head}\n${body}`);
    });

    return `[ATTACHED FILES — the user attached ${list.length} file(s) to this message. Read them; the message refers to them.]\n${parts.join('\n\n')}`;
}
