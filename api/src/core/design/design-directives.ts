/**
 * THE DESIGN LANGUAGE THE REQUEST SPEAKS — read, not guessed.
 *
 * «انت عملت قالب ولكن انا اريد جو يمتلك مهارة في تصميم أي موقع مهما كان
 * المطلوب من أي بروميت» — and by this repository's own measurable law he was
 * right: the lift that landed before this file produced the SAME bytes for
 * every request. A floor is not a skill.
 *
 * Skill, deterministically, is a reader: the user's own design directives —
 * his ground, his logo's place, his dropdown, his corners, his motion, his
 * photos, his footer — parsed from the prompt and OBEYED, with every obeyed
 * directive said out loud and everything unsaid left to the engine's
 * defaults. The shapes below are the finite design vocabulary of two
 * languages, never a list of businesses; the named-colour reader that
 * already exists in design-system.ts keeps owning colour words, and the hex
 * reader here owns the one colour language more precise than words.
 *
 * The test this file must always pass is the fishing law's: two prompts with
 * different directives produce different bytes, and a prompt with none
 * produces exactly what the engine produced before this file existed.
 */

export interface DesignDirectives {
    /** The page's own ground: dark by default when he asked for it. */
    ground?: 'dark' | 'light';
    /** A colour typed as #RRGGBB — more precise than any colour word. */
    hex?: string;
    /** ذهبي — gold rides as the ACCENT (its classic pairing, above all on dark). */
    goldAccent?: boolean;
    /** «الشعار في المنتصف» — the centred-logo masthead. */
    logoPosition?: 'center';
    /** «قائمة منسدلة» — overflow links fold into a native, keyboardable menu. */
    navDropdown?: boolean;
    corners?: 'sharp' | 'pill';
    /** Only 'off' acts — motion is already the default and reduced-motion is honoured. */
    motion?: 'off';
    photos?: 'off';
    footer?: 'minimal';
    /** فخم/فاخر — air between sections; مضغوط — tighter rhythm. */
    density?: 'airy' | 'compact';
    /** What was read, in the reader's language — for the terminal and the delivery note. */
    spoken: string[];
}

const strip = (s: string) => String(s || '').replace(/[ً-ْـ]/g, '');

export function readDesignDirectives(requestRaw: string, isAr = true): DesignDirectives {
    const r = strip(requestRaw);
    const d: DesignDirectives = { spoken: [] };
    const say = (ar: string, en: string) => d.spoken.push(isAr ? ar : en);

    // The ground. «خلفية داكنة/سوداء», «موقع داكن/ليلي», dark mode/theme.
    if (/(?:خلفي[ةه]|موقع|تصميم|ثيم|وضع)\s*(?:داكن[ةه]?|غامق[ةه]?|سوداء|أسود|اسود|ليلي)|داكن[ةه]?\s*(?:الخلفي[ةه])?|dark\s*(?:mode|theme|background|design)?\b/i.test(r)
        && !/بدون\s*داكن|not\s*dark/i.test(r)) {
        if (/داكن|غامق|ليلي|dark/i.test(r)) { d.ground = 'dark'; say('أرضية داكنة', 'dark ground'); }
    }
    if (/(?:خلفي[ةه]|موقع|تصميم|ثيم)\s*(?:فاتح[ةه]?|بيضاء|أبيض|ابيض)|light\s*(?:mode|theme|background)\b/i.test(r)) {
        d.ground = 'light'; say('أرضية فاتحة', 'light ground');
    }

    // A typed hex is the most precise colour language there is.
    const hex = r.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
    if (hex) { d.hex = `#${hex[1]}`; say(`اللون ${d.hex}`, `colour ${d.hex}`); }

    if (/ذهبي[ةه]?|ذهب|لمس[ةه]\s*ذهبي[ةه]|gold(?:en)?\b/i.test(r)) {
        d.goldAccent = true; say('لمسة ذهبية', 'gold accent');
    }

    if (/الشعار\s*(?:في\s*)?(?:المنتصف|الوسط|وسط\s*الصفح[ةه])|logo\s*(?:in\s*the\s*)?cent(?:er|re)/i.test(r)) {
        d.logoPosition = 'center'; say('الشعار في المنتصف', 'centred logo');
    }

    if (/قوائم?\s*منسدل[ةه]?|منسدل[ةه]|dropdown/i.test(r)) {
        d.navDropdown = true; say('قائمة منسدلة في الرأس', 'dropdown navigation');
    }

    if (/زوايا\s*(?:حاد[ةه]|قائم[ةه]|مربع[ةه])|sharp\s*corners?/i.test(r)) {
        d.corners = 'sharp'; say('زوايا حادة', 'sharp corners');
    } else if (/كبسولي[ةه]?|زوايا\s*(?:دائري[ةه]\s*جدا|كامل[ةه]\s*الاستدار[ةه])|pill\s*(?:corners?|buttons?)/i.test(r)) {
        d.corners = 'pill'; say('زوايا كبسولية', 'pill corners');
    }

    if (/بدون\s*(?:حركات|حرك[ةه]|أنيميشن|انيميشن|تأثيرات)|بلا\s*حركات|no\s*animations?|static\s*(?:page|design)/i.test(r)) {
        d.motion = 'off'; say('بلا حركات', 'no animations');
    }

    if (/بدون\s*صور|بلا\s*صور|من\s*غير\s*صور|no\s*(?:photos|images)/i.test(r)) {
        d.photos = 'off'; say('بلا صور', 'no photos');
    }

    if (/(?:فوتر|تذييل|footer)\s*(?:بسيط|مختصر|صغير|minimal|simple)|(?:بسيط|minimal)\s*footer|بدون\s*فوتر\s*ضخم/i.test(r)) {
        d.footer = 'minimal'; say('تذييل بسيط', 'minimal footer');
    }

    if (/فخم[ةه]?|فاخر[ةه]?|luxur(?:y|ious)|premium\s*feel|elegant/i.test(r)) {
        d.density = 'airy'; say('إيقاع فخم متباعد', 'airy, premium rhythm');
        // Luxury's classic pairing — only when he named no colour himself.
        // Arabic colours decline: «زرقاء» is «أزرق» to every reader, so the
        // guard hears the feminine and plural forms too.
        if (!d.hex && !/أزرق|زرقاء|زرق|أحمر|حمراء|حمر|أخضر|خضراء|خضر|بنفسجي|برتقالي|وردي[ةه]?|أصفر|صفراء|blue|red|green|purple|orange|pink|yellow/i.test(r)) d.goldAccent = true;
    } else if (/مضغوط[ةه]?|كثيف[ةه]?|compact|dense/i.test(r)) {
        d.density = 'compact'; say('إيقاع مضغوط', 'compact rhythm');
    }

    return d;
}

/** #RGB/#RRGGBB → hue (0-360), for handing to paletteForHue. */
export function hexToHue(hexRaw: string): number | null {
    const m = String(hexRaw || '').trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    if (delta === 0) return 0;
    let hue: number;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    return Math.round(((hue * 60) + 360) % 360);
}

/**
 * The CSS the directives add on top of the build's stylesheet — appended LAST
 * so it wins through the same selectors, exactly like the lift layer, and
 * empty when nothing was asked.
 */
export function directivesCss(d: DesignDirectives): string {
    const out: string[] = [];
    if (d.corners === 'sharp') out.push(':root{--radius:4px;--radius-lg:8px}', '.btn,.cta,button{border-radius:6px}');
    if (d.corners === 'pill') out.push(':root{--radius:18px;--radius-lg:24px}', '.btn,.cta,button{border-radius:999px}');
    if (d.motion === 'off') out.push('*,*::before,*::after{animation:none!important}');
    if (d.density === 'airy') out.push('.section{padding-block:104px}', '.wrap{gap:22px}');
    if (d.density === 'compact') out.push('.section{padding-block:44px}', '.wrap{gap:10px}');
    if (d.logoPosition === 'center') out.push(
        '.header-inner{flex-direction:column;gap:10px;padding-block:14px}',
        '.header-inner .brand{order:-1;font-size:1.35rem}',
        '.header-inner .theme-toggle{position:absolute;inset-inline-end:16px;top:14px}',
        '.site-header{position:relative}',
    );
    if (d.goldAccent) out.push(':root,[data-theme="dark"],[data-theme="light"]{--accent:#c9a227}');
    return out.length ? `\n/* ─── ما طلبتَه أنت — التوجيهات المقروءة من البرومبت ─── */\n${out.join('\n')}\n` : '';
}
