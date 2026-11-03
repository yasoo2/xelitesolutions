/**
 * THE INTERFACE SPEAKS ONLY THE LANGUAGE THE USER CHOSE.
 *
 * The owner's rule, 2026-11-01: «when the user changes the system language,
 * everything changes to what the user chose. Arabic means everything in
 * Arabic; English means everything in English.» Six languages are offered —
 * en, ar, fr, de, ru, es — and every word the interface writes must come from
 * the dictionary (web/src/i18n.ts) in the language chosen.
 *
 * What was measured before this file: 356 code lines in web/src carried Arabic
 * outside the dictionary, and English literals bypassed it too. With the
 * interface in English the screen still said «مزوّد مدفوع — يحتاج مفتاحه»,
 * «جو محدّث — أعد البناء» and «انسخ الرد»; with it in Arabic, Settings said
 * "Standing instructions" — a t('joeInstructions', 'Standing instructions')
 * whose key existed in no block, so the fallback was all anyone ever saw.
 *
 * So three things are pinned here:
 *   1. no user-visible literal in web/src bypasses t() — Arabic anywhere in
 *      code, English where a person reads it (JSX text, display attributes,
 *      JSX children, alert/confirm/prompt, state setters, label-like props,
 *      a component's default for a prop it shows);
 *   2. every key the interface asks for through t('…') exists in all six
 *      blocks — a missing key shows its fallback in every language;
 *   3. no component forces right-to-left: direction follows the language.
 *
 * The detector is checked on fixtures first (it must flag what it is meant to
 * flag and pass what it is meant to pass), so a green run cannot mean "it
 * scanned nothing".
 *
 * To see it fail on older code: extract that tree (`git archive <rev> web/src
 * | tar -x -C <dir>`) and run with JOE_I18N_WEB_SRC=<dir>/web/src.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const WEB_SRC = process.env.JOE_I18N_WEB_SRC || path.join(__dirname, '..', '..', '..', 'web', 'src');
const LANGS = ['en', 'ar', 'fr', 'de', 'ru', 'es'] as const;
const LANG_SET = new Set<string>(LANGS);

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/** Attributes whose value a person reads or hears (screen readers included). */
const DISPLAY_ATTRS = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label', 'aria-description',
    'aria-placeholder', 'aria-roledescription', 'aria-valuetext']);
/** Object properties that, in this code base, hold text shown to a person. */
const DISPLAY_PROPS = new Set(['label', 'title', 'description', 'placeholder', 'hint', 'tooltip']);
/** Product and company names: the same word in every language. */
const BRANDS = new Set(['Joe', 'JOE', 'XElite', 'XELITE', 'GitHub', 'Git', 'Google', 'Gemini', 'OpenRouter', 'OpenAI',
    'Anthropic', 'Groq', 'Cerebras', 'Mistral', 'DeepSeek', 'Ollama', 'Grok', 'xAI', 'Docker', 'MongoDB',
    'Node', 'Node.js', 'PowerShell', 'Windows', 'Sentinel', 'Vite', 'React', 'Monaco', 'Chromium', 'WebSocket',
    'OAuth', 'Kimi', 'Llama', 'Gemma', 'MiniMax', 'Qwen']);
/** Units, key names and technical acronyms written the same way across these languages. */
const ACRONYMS = new Set(['API', 'URL', 'URLs', 'ID', 'IDs', 'PID', 'CPU', 'RAM', 'MEM', 'FPS', 'JS', 'KB', 'MB', 'GB',
    'TB', 'SSH', 'IP', 'ESC', 'Esc', 'Ctrl', 'Shift', 'Enter', 'Alt', 'Tab', 'HTML', 'CSS', 'JSON', 'SHA', 'HTTP',
    'HTTPS', 'UI', 'IDE', 'LLM', 'AI', 'zip', 'ZIP']);

/**
 * Legitimate literals the structural rules below cannot see. Each says why.
 * `text` is the exact literal (trimmed); an entry without `text` covers the file.
 */
const ALLOW: Array<{ file: string; text?: string; reason: string }> = [
    {
        file: 'lib/greetings.ts',
        reason: 'per-language greeting tables (AR / EN / …): composeGreeting picks the table by the interface '
            + 'language, and the Arabic joiner « يا » is used only when that language is Arabic',
    },
    {
        file: 'lib/userIdentity.ts', text: 'مستخدم',
        reason: 'a placeholder name the identity parser rejects — matched against input, never shown',
    },
    {
        file: 'components/UpdateJoeItem.tsx', text: 'cd $HOME\\Documents\\xelitesolutions ; .\\update-joe.ps1',
        reason: 'the PowerShell command the user copies: a command stays as it is typed',
    },
    {
        file: 'components/CommandComposer.tsx', text: 'افتح',
        reason: 'the verb of a machine instruction POSTed to /browser/run and matched by the server\'s parser '
            + '(api/src/modules/browser/runner.ts, /(افتح|…|open|go to|visit)/) — sent, never shown',
    },
];

type Hit = { file: string; line: number; why: string; text: string };

/** True when the text holds an English word a reader is meant to read. */
function englishProse(s: string): boolean {
    for (const raw of s.split(/\s+/)) {
        if (/[-_](\.\.\.|…)$/.test(raw)) continue; // a key-format example such as sk-...
        const tok = raw.replace(/^[\s·•\-–—|/(«"'“[{]+|[\s·•\-–—|/)»"'”\]}:;,.!?…%]+$/g, '');
        if (!/[A-Za-z]{2,}/.test(tok)) continue;
        if (BRANDS.has(tok) || ACRONYMS.has(tok)) continue;
        if (/[_/\\:@.$<>={}()[\]#|`~^*+&]/.test(tok)) continue; // code, path, URL, e-mail, version, key=value
        if (/\d/.test(tok)) continue; // ids, versions, model names
        return true;
    }
    return false;
}
const wordy = (s: string) => englishProse(s) && /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(s.trim());

function inStyleElement(n: ts.Node): boolean {
    for (let p = n.parent; p; p = p.parent) {
        if (ts.isJsxElement(p) && p.openingElement.tagName.getText() === 'style') return true;
    }
    return false;
}

/** Climb through the expressions that pass a value through unchanged. */
function climb(n: ts.Node): { node: ts.Node; parent: ts.Node | undefined } {
    let c = n;
    for (;;) {
        const p = c.parent;
        if (!p) return { node: c, parent: p };
        if (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isNonNullExpression(p)) { c = p; continue; }
        if (ts.isConditionalExpression(p) && (p.whenTrue === c || p.whenFalse === c)) { c = p; continue; }
        if (ts.isBinaryExpression(p) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken,
            ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.PlusToken].includes(p.operatorToken.kind)) { c = p; continue; }
        if (ts.isTemplateSpan(p)) { c = p.parent; continue; }
        if (ts.isTemplateExpression(p)) { c = p; continue; }
        return { node: c, parent: p };
    }
}

/** Where a person meets this literal, or null when nobody reads it there. */
function displayPosition(n: ts.Node): string | null {
    const { node, parent } = climb(n);
    if (!parent) return null;
    if (ts.isJsxAttribute(parent) && DISPLAY_ATTRS.has(parent.name.getText())) return `attr:${parent.name.getText()}`;
    if (ts.isJsxExpression(parent)) {
        const pp = parent.parent;
        if (pp && ts.isJsxAttribute(pp) && DISPLAY_ATTRS.has(pp.name.getText())) return `attr:${pp.name.getText()}`;
        if (pp && (ts.isJsxElement(pp) || ts.isJsxFragment(pp))) return 'jsx-child';
    }
    if (ts.isCallExpression(parent) && parent.arguments.includes(node as ts.Expression)) {
        const callee = parent.expression.getText();
        if (/^(window\.)?(alert|confirm|prompt)$/.test(callee)) return `dialog:${callee}`;
        if (/^set[A-Z]\w*$/.test(callee) && !/^set(Timeout|Interval|Immediate)$/.test(callee)) return `setter:${callee}`;
    }
    if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
        const name = parent.name.getText().replace(/['"]/g, '');
        if (DISPLAY_PROPS.has(name)) return `prop:${name}`;
    }
    // a component's default for a prop it shows: ({ placeholder = 'Ask Joe…' })
    if (ts.isBindingElement(parent) && parent.initializer === node) {
        const name = (parent.propertyName || parent.name).getText();
        if (DISPLAY_ATTRS.has(name) || DISPLAY_PROPS.has(name) || /Title$|Label$|Text$|Placeholder$/.test(name)) return `default:${name}`;
    }
    return null;
}

/** Structural reasons a literal is read, not shown. Each is a rule, not an entry. */
function readNotShown(node: ts.Node): string | null {
    const p = node.parent;
    if (!p) return null;
    // compared against input (s === 'موافق'): read, never displayed
    if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind)) return 'comparison';
    // the source of a regular expression that recognises Arabic input
    if ((ts.isNewExpression(p) || ts.isCallExpression(p)) && p.expression.getText() === 'RegExp') return 'regex';
    if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression)) {
        const m = p.expression.name.getText();
        // a needle searched for in input text
        if (['includes', 'startsWith', 'endsWith', 'indexOf', 'lastIndexOf', 'test', 'match', 'matchAll', 'search',
            'split'].includes(m)) return 'matcher';
        // .replace(/[أإآ]/g, 'ا'): a one-letter fold of input before matching
        if ((m === 'replace' || m === 'replaceAll') && p.arguments[1] === node && ts.isRegularExpressionLiteral(p.arguments[0])
            && ts.isStringLiteral(node) && [...node.text].length <= 2) return 'char-fold';
        // the developer console is not the interface
        if (p.expression.expression.getText() === 'console') return 'console';
    }
    // the key of a t() call — the dictionary check covers it
    if (ts.isCallExpression(p) && p.arguments[0] === node && /^(t|i18n\.t|i18next\.t)$/.test(p.expression.getText())) return 't-key';
    // extra search terms of a palette command, matched against what the user types
    if (ts.isPropertyAssignment(p) && p.initializer === node && p.name.getText() === 'keywords') return 'search-keywords';
    // the language picker names each language in that language: { code: 'fr', label: 'Français' }
    if (ts.isPropertyAssignment(p) && p.initializer === node && p.name.getText() === 'label' && ts.isObjectLiteralExpression(p.parent)
        && p.parent.properties.some(q => ts.isPropertyAssignment(q) && q.name.getText() === 'code'
            && ts.isStringLiteral(q.initializer) && LANG_SET.has(q.initializer.text))) return 'language-name';
    return null;
}

/** The Arabic entry of a per-language table ({ ar: '…', en: '…' }, nested or in arrays) picks itself by language. */
function underLanguageKey(n: ts.Node): boolean {
    for (let c: ts.Node = n, p = n.parent; p; c = p, p = p.parent) {
        if (ts.isPropertyAssignment(p) && p.initializer === c) {
            if (LANG_SET.has(p.name.getText().replace(/['"]/g, ''))) return true;
            continue;
        }
        if (ts.isObjectLiteralExpression(p) || ts.isArrayLiteralExpression(p) || ts.isParenthesizedExpression(p)) continue;
        return false;
    }
    return false;
}

const allowedEntry = (file: string, text: string) =>
    ALLOW.find(a => a.file === file && (a.text === undefined || a.text === text.trim()));

function scanSource(file: string, source: string, used?: Set<(typeof ALLOW)[number]>): Hit[] {
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const hits: Hit[] = [];
    const hit = (n: ts.Node, why: string, text: string) =>
        hits.push({ file, line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, why, text: text.trim().slice(0, 120) });
    const visit = (n: ts.Node) => {
        // A literal dir="rtl" / direction: 'rtl' forces Arabic layout on every language.
        if (ts.isJsxAttribute(n) && n.name.getText() === 'dir' && n.initializer && ts.isStringLiteral(n.initializer)
            && n.initializer.text === 'rtl') hit(n, 'forced-rtl', 'dir="rtl"');
        if (ts.isPropertyAssignment(n) && n.name.getText() === 'direction' && ts.isStringLiteral(n.initializer)
            && n.initializer.text === 'rtl') hit(n, 'forced-rtl', "direction: 'rtl'");
        let text: string | null = null;
        if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n)
            || ts.isTemplateTail(n) || ts.isJsxText(n)) text = n.text;
        if (text != null && text.trim() && !inStyleElement(n)) {
            const entry = allowedEntry(file, text);
            if (entry) { used?.add(entry); }
            else {
                const node = ts.isTemplateHead(n) ? n.parent : (ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) ? n.parent.parent : n;
                if (ARABIC.test(text)) {
                    if (!readNotShown(node) && !underLanguageKey(node)) hit(n, 'arabic', text);
                } else if (ts.isJsxText(n)) {
                    if (englishProse(text)) hit(n, 'jsx-text', text);
                } else if (!readNotShown(node)) {
                    const pos = displayPosition(node);
                    if (pos && ((pos.startsWith('setter') || pos.startsWith('prop')) ? wordy(text) : englishProse(text))) hit(n, pos, text);
                }
            }
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return hits;
}

function webFiles(root: string): string[] {
    const out: string[] = [];
    const walk = (d: string) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
        }
    };
    walk(root);
    return out.map(f => path.relative(root, f).replace(/\\/g, '/')).filter(f => f !== 'i18n.ts').sort();
}
const read = (rel: string) => fs.readFileSync(path.join(WEB_SRC, rel), 'utf-8');

/** Every key of each language block, nested objects flattened with dots. */
function dictionaryKeys(source: string): Record<string, { keys: Set<string>; dupes: string[] }> {
    const sf = ts.createSourceFile('i18n.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    let resources: ts.ObjectLiteralExpression | undefined;
    const find = (n: ts.Node) => {
        if (ts.isVariableDeclaration(n) && n.name.getText() === 'resources' && n.initializer && ts.isObjectLiteralExpression(n.initializer)) resources = n.initializer;
        ts.forEachChild(n, find);
    };
    find(sf);
    if (!resources) throw new Error('web/src/i18n.ts has no `resources` object');
    const name = (p: ts.ObjectLiteralElementLike) => (p.name ? p.name.getText().replace(/^['"]|['"]$/g, '') : '');
    const out: Record<string, { keys: Set<string>; dupes: string[] }> = {};
    for (const lp of resources.properties) {
        if (!ts.isPropertyAssignment(lp) || !ts.isObjectLiteralExpression(lp.initializer)) continue;
        const tr = lp.initializer.properties.find(p => name(p) === 'translation');
        if (!tr || !ts.isPropertyAssignment(tr) || !ts.isObjectLiteralExpression(tr.initializer)) continue;
        const keys = new Set<string>();
        const dupes: string[] = [];
        const flat = (obj: ts.ObjectLiteralExpression, prefix: string) => {
            const seen = new Set<string>();
            for (const p of obj.properties) {
                if (!ts.isPropertyAssignment(p)) continue;
                const k = name(p);
                if (seen.has(k)) dupes.push(prefix + k);
                seen.add(k);
                if (ts.isObjectLiteralExpression(p.initializer)) flat(p.initializer, `${prefix}${k}.`);
                else keys.add(prefix + k);
            }
        };
        flat(tr.initializer, '');
        out[name(lp)] = { keys, dupes };
    }
    return out;
}

/** Keys asked for by a literal: t('k'), i18n.t('k'), and the key-holding props of item tables. */
const KEY_PROPS = /^(labelKey|descKey|titleKey|nameKey|tagKey|placeholderKey|descriptionKey|hintKey|i18nKey)$/;
function usedKeys(file: string, source: string): Array<{ key: string; at: string }> {
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const out: Array<{ key: string; at: string }> = [];
    const at = (n: ts.Node) => `${file}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
    const visit = (n: ts.Node) => {
        if (ts.isCallExpression(n) && /^(t|i18n\.t|i18next\.t)$/.test(n.expression.getText()) && n.arguments[0]
            && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]))) out.push({ key: n.arguments[0].text, at: at(n) });
        if (ts.isPropertyAssignment(n) && KEY_PROPS.test(n.name.getText()) && ts.isStringLiteral(n.initializer)) out.push({ key: n.initializer.text, at: at(n) });
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return out;
}
const PLURALS = ['zero', 'one', 'two', 'few', 'many', 'other'];
const hasKey = (keys: Set<string>, k: string) => keys.has(k) || PLURALS.some(s => keys.has(`${k}_${s}`));

describe('the detector flags what a person reads and passes what code reads', () => {
    const flagged = (src: string) => scanSource('fixture.tsx', src).map(h => `${h.why} ${h.text}`);

    it('flags hard-coded words in both directions, and a forced direction', () => {
        expect(flagged(`const A = () => <button title="Save changes">حفظ</button>;`)).toEqual(['attr:title Save changes', 'arabic حفظ']);
        expect(flagged(`function f() { alert('Failed to save'); }`)).toEqual(['dialog:alert Failed to save']);
        expect(flagged(`const A = ({ ok }) => <p>{ok ? 'Connected' : 'Offline'}</p>;`)).toEqual(['jsx-child Connected', 'jsx-child Offline']);
        expect(flagged(`const A = () => <div>Loading the editor…</div>;`)).toEqual(['jsx-text Loading the editor…']);
        expect(flagged(`function f(setError) { setError('Guest login failed'); }`)).toEqual(['setter:setError Guest login failed']);
        expect(flagged(`const s = { label: 'New folder' };`)).toEqual(['prop:label New folder']);
        expect(flagged(`function C({ placeholder = 'Ask Joe or type a command' }) { return null; }`)).toEqual(['default:placeholder Ask Joe or type a command']);
        expect(flagged(`const x = 'تم النسخ';`)).toEqual(['arabic تم النسخ']);
        expect(flagged(`const A = () => <div dir="rtl" />;`)).toEqual(['forced-rtl dir="rtl"']);
        expect(flagged(`const s = { direction: 'rtl' };`)).toEqual([`forced-rtl direction: 'rtl'`]);
    });

    it('passes keys, code, brands, input matchers, language tables and the language picker', () => {
        expect(flagged(`const A = ({ t }) => <button title={t('saveChanges')}>{t('save')}</button>;`)).toEqual([]);
        expect(flagged(`const ok = (s) => s === 'موافق' || s.includes('نعم') || new RegExp('افتح').test(s);`)).toEqual([]);
        expect(flagged(`const f = (s) => s.replace(/[أإآ]/g, 'ا');`)).toEqual([]);
        expect(flagged(`const A = () => <div className="joe-btn" data-testid="copy-log" dir="ltr"><code>{'ghp_xxx'}</code></div>;`)).toEqual([]);
        expect(flagged(`const A = () => <span>Joe · GitHub · API</span>;`)).toEqual([]);
        expect(flagged(`const p = <input placeholder="https://api.example.com/v1" />;`)).toEqual([]);
        expect(flagged(`const L = [{ code: 'fr', label: 'Français' }, { code: 'ar', label: 'العربية' }];`)).toEqual([]);
        expect(flagged(`const T = { ok: { ar: 'نعم', en: 'Yes' }, n: { ar: { other: 'صفحات' } } };`)).toEqual([]);
        expect(flagged(`console.log('تم الحفظ');`)).toEqual([]);
        expect(flagged(`const c = { keywords: 'settings إعدادات' };`)).toEqual([]);
    });

    it('finds a key missing from a block, and accepts a plural family as the key', () => {
        const dict = dictionaryKeys(`const resources = { en: { translation: { a: 'A', n_one: '1', n_other: 'N', g: { x: 'X' } } }, ar: { translation: { a: 'أ' } } };`);
        expect([...dict.en.keys].sort()).toEqual(['a', 'g.x', 'n_one', 'n_other']);
        expect(hasKey(dict.en.keys, 'n')).toBe(true);
        expect(hasKey(dict.ar.keys, 'g.x')).toBe(false);
        expect(usedKeys('f.tsx', `const A = ({ t }) => <p title={t('a')}>{t('g.x')}</p>; const M = [{ labelKey: 'n' }];`).map(u => u.key))
            .toEqual(['a', 'g.x', 'n']);
    });
});

describe('the interface speaks only the language the user chose', () => {
    const files = webFiles(WEB_SRC);

    it('scans the whole web interface', () => {
        expect(files.length).toBeGreaterThan(60);
        expect(files).toEqual(expect.arrayContaining(['components/CommandComposer.tsx', 'components/SettingsDialog.tsx', 'pages/admin/SystemManagement.tsx']));
    });

    it('no user-visible literal in web/src bypasses t()', () => {
        const hits = files.flatMap(f => scanSource(f, read(f)));
        expect(hits.map(h => `${h.file}:${h.line} [${h.why}] ${h.text}`)).toEqual([]);
    });

    it('every allowlist entry still matches a literal (an entry that matches nothing is rot)', () => {
        const used = new Set<(typeof ALLOW)[number]>();
        for (const f of files) scanSource(f, read(f), used);
        expect(ALLOW.filter(a => !used.has(a)).map(a => `${a.file} ${a.text ?? '(whole file)'}`)).toEqual([]);
    });

    it('every key used through t() exists in all six language blocks', () => {
        const dict = dictionaryKeys(read('i18n.ts'));
        expect(Object.keys(dict).sort()).toEqual([...LANGS].sort());
        const missing: string[] = [];
        let used = 0;
        for (const f of files) {
            for (const { key, at } of usedKeys(f, read(f))) {
                used++;
                const lacking = LANGS.filter(l => !hasKey(dict[l].keys, key));
                if (lacking.length) missing.push(`${key} [${lacking.join(',')}] @ ${at}`);
            }
        }
        expect(missing).toEqual([]);
        // …and it read real call sites, not an empty tree.
        expect(used).toBeGreaterThan(300);
    });

    it('no language block defines a key twice', () => {
        const dict = dictionaryKeys(read('i18n.ts'));
        expect(LANGS.flatMap(l => dict[l].dupes.map(d => `${l}.${d}`))).toEqual([]);
    });

    it('direction follows the language: Arabic reads right-to-left, the others left-to-right', () => {
        const i18n = read('i18n.ts');
        expect(i18n).toMatch(/export const RTL_LANGUAGES = \['ar'/);
        const traceView = read('components/NeuralTraceView.tsx');
        expect(traceView).toMatch(/export function useUiDir\(\)[\s\S]{0,200}RTL_LANGUAGES\.includes\(base\) \? 'rtl' : 'ltr'/);
        // …and nothing hard-codes rtl on its own (scanSource reports forced-rtl).
        expect(files.flatMap(f => scanSource(f, read(f))).filter(h => h.why === 'forced-rtl')
            .map(h => `${h.file}:${h.line} ${h.text}`)).toEqual([]);
    });
});
