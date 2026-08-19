/**
 * Generic source-level contracts shared by file generation and project editing.
 *
 * JSX can parse perfectly while still failing at runtime when a generated shell
 * renders a component that is neither imported nor declared in that module. This
 * gate is intentionally framework-light: it protects capitalised JSX component
 * references without knowing a product, domain, or saved template.
 */

const JSX_COMPONENT = /<([A-Z][A-Za-z0-9_$]*(?:\.[A-Za-z0-9_$]+)?)(?=\s|\/?>)/g;
const IMPORT_DEFAULT = /\bimport\s+([A-Z][A-Za-z0-9_$]*)\s+from\s*['"]/g;
const IMPORT_NAMESPACE = /\bimport\s*\*\s+as\s+([A-Z][A-Za-z0-9_$]*)\s+from\s*['"]/g;
const IMPORT_NAMED = /\bimport\s*\{([\s\S]*?)\}\s*from\s*['"]/g;
const DECLARED_COMPONENT = /\b(?:function|class)\s+([A-Z][A-Za-z0-9_$]*)\b|\b(?:const|let|var)\s+([A-Z][A-Za-z0-9_$]*)\s*=/g;

const collect = (source: string, pattern: RegExp): Set<string> => {
    const out = new Set<string>();
    for (const match of String(source || '').matchAll(new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g'))) {
        for (const value of match.slice(1)) {
            if (value) out.add(value.trim().split('.')[0]);
        }
    }
    return out;
};

/**
 * Return a deterministic runtime-contract error for undefined JSX components,
 * or null when every custom component reference has local evidence.
 */
export function undefinedJsxComponentMismatch(filePath: string, sourceRaw: string): string | null {
    const ext = String(filePath || '').toLowerCase().split('.').pop();
    if (ext !== 'jsx' && ext !== 'tsx') return null;

    // Comments and quoted strings are not JSX. Removing comments here prevents a
    // prose example such as `<WishlistApp />` from becoming a false rejection;
    // the source parser remains the syntax gate for actual JavaScript validity.
    const source = String(sourceRaw || '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const used = collect(source, JSX_COMPONENT);
    if (!used.size) return null;

    const declared = new Set<string>([
        'React', 'Fragment',
        ...collect(source, IMPORT_DEFAULT),
        ...collect(source, IMPORT_NAMESPACE),
        ...collect(source, DECLARED_COMPONENT),
    ]);
    for (const match of source.matchAll(new RegExp(IMPORT_NAMED.source, IMPORT_NAMED.flags))) {
        const members = String(match[1] || '').split(',');
        for (const member of members) {
            const alias = member.trim().match(/\bas\s+([A-Z][A-Za-z0-9_$]*)\s*$/);
            const name = alias?.[1] || member.trim().match(/^([A-Z][A-Za-z0-9_$]*)/)?.[1];
            if (name) declared.add(name);
        }
    }

    const missing = [...used].filter(name => !declared.has(name));
    if (!missing.length) return null;
    return `source_component_mismatch: ${filePath} renders JSX component(s) without an import or local declaration: ${missing.join(', ')}`;
}
