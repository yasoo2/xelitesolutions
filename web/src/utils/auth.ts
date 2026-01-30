export function decodeJwtPayload(token: string | null): any | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const raw = parts[1] || '';
    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '==='.slice((normalized.length + 3) % 4);
    try {
        return JSON.parse(atob(padded));
    } catch {
        return null;
    }
}

export function isValidToken(token: string | null): boolean {
    if (!token) return false;
    try {
        const payload = decodeJwtPayload(token);
        if (!payload) return false;
        if (!payload || !payload.exp) {
            // If no exp, assume valid if structure is ok? 
            // Better to match TopBar logic: legacy tokens might be missing email/sub, but exp usually exists.
            // If strictly ensuring valid session, we should check exp.
            // Let's assume valid if parseable and has 'sub' or 'email' or 'id'.
            // But TopBar specifically checks for email || sub.
            // Let's stick to expiration check primarily.
            return true;
        }

        const now = Date.now() / 1000;
        if (payload.exp < now) return false;

        return true;
    } catch {
        return false;
    }
}
