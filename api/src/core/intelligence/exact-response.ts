/**
 * A bounded literal reply is content, even when its words name executable
 * capabilities. Keep this contract shared by intent parsing and planning so
 * neither stage asks a provider to reinterpret the requested text as a tool.
 */
export function extractExactEchoRequest(goal: string): string | null {
    const source = String(goal || '');
    const injectedAt = source.search(/\n+\[(STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|ATTACHED FILES|RESPONSE LANGUAGE)/i);
    const raw = (injectedAt >= 0 ? source.slice(0, injectedAt) : source).trim();
    const match = raw.match(/^(?:reply|respond|answer)\s+with\s+exactly\s+(.+?)\s+and\s+nothing\s+else\.?$/i)
        || raw.match(/^(?:say|reply|respond|answer)\s+only\s*[:：]\s*([\s\S]+)$/i)
        || raw.match(/^(?:قل|أجب|اجب)\s+فقط\s*[:：]\s*([\s\S]+)$/u);
    if (!match) return null;
    const value = match[1].trim().replace(/^(["'\x60])([\s\S]*)\1$/, '$2').trim();
    return value && value.length <= 240 ? value : null;
}
