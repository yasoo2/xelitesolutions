/**
 * What the UI/UX check of Joe's own page found on 2026-11-05, held in place:
 * the update notice lies over no control, a phone opens on the conversation,
 * the composer's chips do not overlap, and the light theme's quiet text and
 * chips can be read (WCAG 4.5:1).
 */
import fs from 'fs';
import path from 'path';

const web = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'src', ...p), 'utf8');

function contrast(hexA: string, hexB: string): number {
    const lum = (hex: string) => {
        const n = hex.replace('#', '');
        const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255)
            .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [a, b] = [lum(hexA), lum(hexB)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
}

describe('Joe\'s page leaves room and reads clearly', () => {
    it('the update notice sits in the header\'s own flow, not over it', () => {
        const header = web('components', 'JoeHeader.tsx');
        expect(header).toMatch(/<div className="joe-header-center">\s*<UpdateAutoPilot inline \/>/);
        const item = web('components', 'UpdateJoeItem.tsx');
        expect(item).toMatch(/return inline \? banner : createPortal\(banner, document\.body\);/);
        // The commit id is in the tooltip, not in the sentence.
        expect(item).not.toMatch(/\$\{latest \? ` — \$\{latest\}` : ''\}/);
        const theme = web('theme.css');
        expect(theme).toMatch(/\.joe-autoupdate-banner\.is-inline \{[^}]*position: static;/);
        const premium = web('styles', 'joe-premium.css');
        expect(premium).toMatch(/\.joe-header-center \{[^}]*flex: 1 1 auto;[^}]*min-width: 0;/);
    });

    it('a phone opens a session on the conversation, not on the canvas', () => {
        const layout = web('components', 'JoeIDELayout.tsx');
        expect(layout).toMatch(/if \(previewUrl && !isMobile\) \{ autoOpenedRef\.current = true; setIsWorkspaceCollapsed\(false\); \}/);
        expect(layout).toMatch(/if \(\(browserSessionId && !isMobile\) \|\| workspaceTab === 'browser'\) \{/);
    });

    it('on a phone the provider button grows to its words', () => {
        const premium = web('styles', 'joe-premium.css');
        const phone = premium.slice(premium.indexOf('@media (max-width: 640px)'), premium.indexOf('@media (max-width: 640px)') + 1600);
        expect(phone).toMatch(/\.joe-chat-input-area \.provider-btn \{\s*width: auto !important;\s*\}/);
    });

    it('the light theme\'s quiet text reads at 4.5:1 on white and on the canvas', () => {
        const premium = web('styles', 'joe-premium.css');
        const light = premium.slice(premium.search(/\[data-theme="light"\],\r?\n\[data-theme="light"\] \.joe-ide-layout/));
        const muted = (light.match(/--joe-text-muted:\s*(#[0-9A-Fa-f]{6})/) || [])[1];
        expect(muted).toBeTruthy();
        expect(contrast(muted, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
        expect(contrast(muted, '#F6F7F6')).toBeGreaterThanOrEqual(4.5);
        const themeMuted = (web('theme.css').match(/--text-muted:\s*(#[0-9A-Fa-f]{6});/g) || []).map(m => m.match(/#[0-9A-Fa-f]{6}/)![0]);
        // The light block's token (the second one declared) is as readable.
        expect(themeMuted.some(hex => contrast(hex, '#FFFFFF') >= 4.5 && contrast(hex, '#F6F7F6') >= 4.5)).toBe(true);
    });

    it('the light theme\'s provider name and session chip read at 4.5:1', () => {
        const premium = web('styles', 'joe-premium.css');
        const label = (premium.match(/\[data-theme="light"\] \.provider-btn\.is-connected \.provider-label \{\s*color: (#[0-9A-Fa-f]{6})/) || [])[1];
        const chip = (premium.match(/\[data-theme="light"\] \.joe-chat-input-area \.provider-session \{\s*color: (#[0-9A-Fa-f]{6})/) || [])[1];
        expect(contrast(label, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
        expect(contrast(chip, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    });

    it('a Gravatar miss is remembered, so the console is not given a 404 on every load', () => {
        const header = web('components', 'JoeHeader.tsx');
        expect(header).toMatch(/localStorage\.setItem\(GRAVATAR_MISS/);
        expect(header).toMatch(/Date\.now\(\) - Number\(miss\.at\) < 86_400_000\) return;/);
    });
});
