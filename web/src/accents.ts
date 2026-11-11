/**
 * Theme accent choice — one colour PER MODE, remembered separately.
 *
 * The user asked for it in these words: «عند التغيير من الليلي إلى النهاري
 * يجب أن يكون تحت كل وضع عدة ألوان لتغيّر لون الثيم». So the dark theme and
 * the light theme each keep their own accent in localStorage, and whichever
 * mode is active decides which of the two is applied — as a data-accent
 * attribute on <html> that styles/accents.css turns into a full palette.
 */

export type AccentId = 'emerald' | 'gold' | 'turquoise' | 'mono' | 'ice';
export type ThemeMode = 'dark' | 'light';

export interface AccentOption {
    id: AccentId;
    /** The colour's name, as a dictionary key: Settings shows it in the interface language. */
    labelKey: string;
    /** Swatch colour as shown in Settings for each mode. */
    dark: string;
    light: string;
}

/** The palette. Emerald is Joe's signature and the default. */
export const ACCENTS: AccentOption[] = [
    { id: 'emerald', labelKey: 'accent_emerald', dark: '#34C48B', light: '#0E7A5F' },
    { id: 'gold', labelKey: 'accent_gold', dark: '#E3B65A', light: '#A87E22' },
    { id: 'turquoise', labelKey: 'accent_turquoise', dark: '#3BC8C2', light: '#0F7E79' },
    { id: 'mono', labelKey: 'accent_mono', dark: '#ECF2EE', light: '#1B2620' },
    { id: 'ice', labelKey: 'accent_ice', dark: '#8FBFEA', light: '#2D6FA8' },
];

const KEY: Record<ThemeMode, string> = { dark: 'joe-accent-dark', light: 'joe-accent-light' };
const VALID = new Set<string>(ACCENTS.map(a => a.id));

/** The stored accent for a mode ('emerald' when never chosen or invalid). */
export function getAccent(mode: ThemeMode): AccentId {
    try {
        const v = localStorage.getItem(KEY[mode]) || '';
        return (VALID.has(v) ? v : 'emerald') as AccentId;
    } catch { return 'emerald'; }
}

/** Store a mode's accent and re-apply if that mode is the active one. */
export function setAccent(mode: ThemeMode, id: AccentId, activeTheme: ThemeMode): void {
    try { localStorage.setItem(KEY[mode], id); } catch { /* storage unavailable */ }
    if (mode === activeTheme) applyAccent(activeTheme);
}

/**
 * Put the active mode's stored accent on <html>. Emerald means NO attribute —
 * the stylesheets' own defaults are the emerald palette, so zero overrides
 * apply and the app renders exactly as before this feature existed.
 */
export function applyAccent(activeTheme: ThemeMode): void {
    const id = getAccent(activeTheme);
    const root = document.documentElement;
    if (id === 'emerald') root.removeAttribute('data-accent');
    else root.setAttribute('data-accent', id);
}
