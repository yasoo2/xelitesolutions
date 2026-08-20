/**
 * Who is signed in — derived from the signed JWT first, localStorage second.
 *
 * The header used to show the literal string "User" (the placeholder `name`
 * claim) next to an avatar fetched from ui-avatars.com — an external request
 * that leaks the user's name to a third party and simply fails when Joe runs
 * offline, which is how it is normally run. What the user saw was a broken
 * image and a generic word.
 *
 * Everything here is computed locally from the email the user actually signed
 * in with. Nothing is fetched, and nothing is invented: when there is no email
 * to derive from, the caller gets empty strings rather than a plausible-looking
 * placeholder.
 */

export type UserRole = 'USER' | 'ADMIN' | 'OWNER' | 'SUPER_ADMIN';

export interface UserIdentity {
    email: string;
    /** Full display name: the `name` claim when it is real, otherwise derived from the email. */
    name: string;
    /** Two letters for the avatar, e.g. "YS". Empty when there is no identity. */
    initials: string;
    role: UserRole | '';
    /** A real profile picture URL if one was provided (Google sign-in). Never a generated one. */
    picture: string;
    /** Deterministic avatar colours derived from the email — stable across sessions. */
    color: string;
    colorSoft: string;
}

/** Placeholder names that carry no information and must not be shown as a name. */
const PLACEHOLDER_NAMES = new Set(['user', 'users', 'admin', 'anonymous', 'unknown', 'n/a', 'مستخدم']);

/**
 * "younes.sowady2011@gmail.com" -> "Younes Sowady".
 * Separators become spaces, the +tag is dropped, and trailing digits (which are
 * almost always a uniqueness suffix rather than part of a name) are trimmed.
 */
export function nameFromEmail(email: string): string {
    const local = String(email || '').split('@')[0].split('+')[0];
    if (!local) return '';
    const words = local
        .split(/[._\-\s]+/)
        .map(w => w.replace(/\d+$/, '').trim())
        .filter(Boolean)
        .map(w => w.charAt(0).toLocaleUpperCase() + w.slice(1));
    return words.join(' ').trim();
}

/** First letters of the first two words — works for Arabic and Latin alike. */
export function initialsFrom(name: string, email: string): string {
    const source = (name || nameFromEmail(email) || '').trim();
    if (!source) return '';
    const words = source.split(/\s+/).filter(Boolean);
    const letters = words.slice(0, 2).map(w => Array.from(w)[0] || '').join('');
    return letters.toLocaleUpperCase();
}

/**
 * Stable hue from the email, so the same person always gets the same avatar.
 * Constrained to the cool range (cyan → blue → indigo): a free 0-360 hue landed
 * on purple and red badges next to a blue-and-white interface. Different people
 * still get visibly different avatars, all of them within the palette.
 */
function hueFrom(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    return 190 + (Math.abs(hash) % 66); // 190..255
}

function decodeJwt(token: string): any | null {
    try {
        const part = token.split('.')[1];
        if (!part) return null;
        const json = decodeURIComponent(
            atob(part.replace(/-/g, '+').replace(/_/g, '/'))
                .split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(json);
    } catch { return null; }
}

const VALID_ROLES: UserRole[] = ['USER', 'ADMIN', 'OWNER', 'SUPER_ADMIN'];

/** Where the Google profile photo/name are cached between loads. */
const GOOGLE_PROFILE_KEY = 'joe-google-profile';

export interface GoogleProfile { email?: string; name?: string; picture?: string }

export function readGoogleProfile(): GoogleProfile | null {
    try {
        const raw = localStorage.getItem(GOOGLE_PROFILE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

/**
 * Pull the connected Google account's name and photo from the API and cache it.
 * The photo URL points at Joe's own avatar endpoint, so it keeps rendering when
 * there is no internet. Returns null when no account is connected.
 */
export async function loadGoogleProfile(apiUrl: string): Promise<GoogleProfile | null> {
    try {
        const token = localStorage.getItem('token');
        const r = await fetch(`${apiUrl}/oauth/google/profile`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!r.ok) return null;
        const data = await r.json();
        if (!data?.connected) { try { localStorage.removeItem(GOOGLE_PROFILE_KEY); } catch { } return null; }
        // The avatar route cannot read an Authorization header, so carry the token
        // in the query string the way the OAuth start route already does.
        const picture = data.picture
            ? `${apiUrl}/oauth/google/avatar${token ? `?token=${encodeURIComponent(token)}` : ''}`
            : '';
        const profile: GoogleProfile = { email: data.email || '', name: data.name || '', picture };
        try { localStorage.setItem(GOOGLE_PROFILE_KEY, JSON.stringify(profile)); } catch { }
        return profile;
    } catch { return null; }
}

export function resolveIdentity(): UserIdentity {
    let claims: any = null;
    let stored: any = null;
    try {
        const token = localStorage.getItem('token');
        if (token) claims = decodeJwt(token);
    } catch { /* storage unavailable */ }
    try {
        const raw = localStorage.getItem('user');
        if (raw) stored = JSON.parse(raw);
    } catch { /* not JSON */ }

    const google = readGoogleProfile();

    // The token is signed by the server, so it wins over anything cached locally.
    const email = String(claims?.email || stored?.email || google?.email || '').trim();
    // Placeholder names are skipped PER SOURCE: a token that literally says
    // 'User' (the local default) used to shadow the real name stored by the
    // account/Google — «يونس السوادي» lost to a placeholder via `||`.
    const firstRealName = (...candidates: unknown[]): string => {
        for (const c of candidates) {
            const v = String(c || '').trim();
            if (v && !PLACEHOLDER_NAMES.has(v.toLowerCase())) return v;
        }
        return '';
    };
    const name = firstRealName(claims?.name, stored?.name, google?.name) || nameFromEmail(email);
    const rawRole = String(claims?.role || stored?.role || '').trim().toUpperCase();
    const role = (VALID_ROLES as string[]).includes(rawRole) ? (rawRole as UserRole) : '';
    const picture = String(claims?.picture || stored?.picture || stored?.avatar || google?.picture || '').trim();
    const hue = hueFrom(email || name || 'joe');

    return {
        email,
        name,
        initials: initialsFrom(name, email),
        role,
        picture,
        color: `hsl(${hue}, 62%, 48%)`,
        colorSoft: `hsl(${hue}, 62%, 62%)`,
    };
}

/**
 * A real photo for accounts that never connected Google — looked up by the
 * EMAIL itself, which is the one identity every sign-in method shares.
 *
 * Gravatar officially serves avatars by the SHA-256 of the lowercased email,
 * and `d=404` means «answer 404 instead of inventing a face» — so the header's
 * existing broken-image fallback lands on the initials, never on a placeholder
 * person. Only a hash ever leaves the machine (not the address, not the name),
 * and only when there is no locally-known picture to show — which keeps the
 * spirit of the no-third-party-avatar decision while honouring the owner's
 * ask: each user sees their own photo, per the email they signed in with.
 */
export async function gravatarUrlFor(email: string, size = 96): Promise<string> {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || typeof crypto === 'undefined' || !crypto.subtle) return '';
    try {
        const bytes = new TextEncoder().encode(normalized);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const hash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
        return `https://www.gravatar.com/avatar/${hash}?d=404&s=${size}`;
    } catch {
        return '';
    }
}

/** Role -> i18n key. Kept here so every surface labels a role the same way. */
export const ROLE_KEY: Record<UserRole, string> = {
    USER: 'roleUser',
    ADMIN: 'roleAdmin',
    OWNER: 'roleOwner',
    SUPER_ADMIN: 'roleSuperAdmin',
};

/** Roles allowed into system management / deployments. */
export function isPrivileged(role: string | undefined): boolean {
    const r = String(role || '').toUpperCase();
    return r === 'SUPER_ADMIN' || r === 'OWNER' || r === 'ADMIN';
}
