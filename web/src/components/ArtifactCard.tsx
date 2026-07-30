import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * ArtifactCard — an elegant card for a file/site Joe generated (Claude-artifacts
 * style). Rendered inside chat when an assistant message contains a
 * ```joe-artifact <json> ``` block. Shows the file(s), a type badge, and actions:
 * open in the live preview, download, view raw. Emerald design tokens; theme-aware.
 */

export interface ArtifactMeta {
    kind?: string;        // 'web' | 'file' | ...
    filename?: string;
    url?: string;         // absolute preview URL
    previewUrl?: string;
    files?: string[];     // for multi-file projects
}

const iconFor = (name = '') => {
    if (/\.html?$/i.test(name)) return '🌐';
    if (/\.css$/i.test(name)) return '🎨';
    if (/\.(js|ts)x?$/i.test(name)) return '⚙️';
    if (/\.(png|jpe?g|svg|gif|webp)$/i.test(name)) return '🖼️';
    return '📄';
};

export const ArtifactCard: React.FC<{ meta: ArtifactMeta; isArabic?: boolean }> = ({ meta }) => {
    const { t } = useTranslation();
    const url = meta.previewUrl || meta.url || '';
    const files = (meta.files && meta.files.length ? meta.files : (meta.filename ? [meta.filename] : []));
    const title = meta.filename || files[0] || t('artifactFile');

    const openPreview = () => {
        if (!url) return;
        try { window.dispatchEvent(new CustomEvent('preview:ready', { detail: { url } })); } catch { /* noop */ }
    };

    return (
        <div
            dir="auto"
            style={{
                border: '1px solid var(--joe-border, rgba(52,196,139,0.3))',
                borderRadius: 14,
                overflow: 'hidden',
                background: 'var(--joe-bg-card, #232428)',
                margin: '10px 0',
                boxShadow: 'var(--joe-shadow-sm, 0 2px 10px rgba(0,0,0,0.35))',
            }}
        >
            {/* header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: '1px solid var(--joe-border, rgba(255,255,255,0.08))' }}>
                <span style={{
                    width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', flex: '0 0 auto',
                    background: 'var(--joe-gold-subtle, rgba(52,196,139,0.14))', fontSize: 16,
                }}>{iconFor(title)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--joe-text-primary, #eceef0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--joe-text-muted, #6e7178)' }}>
                        {meta.kind === 'web' ? t('artifactWebPage') : t('artifactFile')}
                        {files.length > 1 ? ` · ${files.length} ${t('artifactFiles')}` : ''}
                    </div>
                </div>
                <span style={{
                    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
                    color: 'var(--joe-gold-primary, #34c48b)', border: '1px solid var(--joe-gold-border, rgba(52,196,139,0.35))',
                    background: 'var(--joe-gold-subtle, rgba(52,196,139,0.12))', borderRadius: 999, padding: '3px 9px',
                }}>ARTIFACT</span>
            </div>

            {/* multi-file list */}
            {files.length > 1 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 14px 0' }}>
                    {files.map((f) => (
                        <span key={f} style={{ fontSize: 11.5, color: 'var(--joe-text-secondary, #a2a5ad)', border: '1px solid var(--joe-border)', borderRadius: 8, padding: '4px 9px' }}>
                            {iconFor(f)} {f}
                        </span>
                    ))}
                </div>
            )}

            {/* actions */}
            <div style={{ display: 'flex', gap: 8, padding: '12px 14px' }}>
                <button
                    onClick={openPreview}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                        fontSize: 12.5, fontWeight: 650, fontFamily: 'inherit',
                        color: '#08130d', background: 'linear-gradient(135deg, var(--joe-gold-primary, #34c48b), var(--joe-gold-dark, #1f7d5c))',
                        border: 'none', borderRadius: 9, padding: '8px 13px',
                    }}
                >👁 {t('artifactOpenInPreview')}</button>
                {url && (
                    <a href={url} target="_blank" rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
                            fontSize: 12.5, fontWeight: 600, color: 'var(--joe-text-secondary, #a2a5ad)',
                            border: '1px solid var(--joe-border)', borderRadius: 9, padding: '8px 13px' }}
                    >⤓ {t('artifactCodeOrFile')}</a>
                )}
            </div>
        </div>
    );
};

export default ArtifactCard;
