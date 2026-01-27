export function isValidToken(token: string | null): boolean {
    if (!token) return false;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return false;

        const payload = JSON.parse(atob(parts[1]));
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
