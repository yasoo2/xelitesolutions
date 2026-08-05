import React, { useEffect, useState } from 'react';
import { useMonacoReady } from '../monaco-setup';
import { DiffEditor } from '@monaco-editor/react';
import { X, GitBranch } from 'lucide-react';

interface DiffViewerProps {
    originalContent: string;
    modifiedContent: string;
    originalTitle?: string;
    modifiedTitle?: string;
    language?: string;
    onClose?: () => void;
}

export default function DiffViewer({
    originalContent,
    modifiedContent,
    originalTitle = 'Original',
    modifiedTitle = 'Modified',
    language = 'javascript',
    onClose
}: DiffViewerProps) {
    const [theme, setTheme] = useState<'vs-dark' | 'light'>('vs-dark');
    // Monaco arrives with this view, not with the page — see monaco-setup.
    const monacoReady = useMonacoReady();

    useEffect(() => {
        const updateTheme = () => {
            const current = document.documentElement.getAttribute('data-theme');
            setTheme(current === 'light' ? 'light' : 'vs-dark');
        };
        updateTheme();
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                    updateTheme();
                }
            });
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);

    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
            width: '100%', height: '100%',
            background: 'var(--surface-color)',
            borderRadius: 8,
            overflow: 'hidden'
        }}>
            {/* Diff Header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px',
                borderBottom: '1px solid var(--border-color)',
                background: 'rgba(255,255,255,0.02)',
                fontSize: 12
            }}>
                <GitBranch size={14} style={{ color: '#e2b340' }} />
                <span style={{ opacity: 0.6 }}>{originalTitle}</span>
                <span style={{ opacity: 0.3 }}>→</span>
                <span style={{ fontWeight: 600 }}>{modifiedTitle}</span>
                <div style={{ flex: 1 }} />
                {onClose && (
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', padding: 2
                        }}
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {/* Monaco Diff Editor — loaded with this view, not with the page */}
            <div style={{ flex: 1 }}>
                {!monacoReady ? (
                    <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-muted)' }}>…</div>
                ) : (
                <DiffEditor
                    height="100%"
                    original={originalContent}
                    modified={modifiedContent}
                    language={language}
                    theme={theme}
                    options={{
                        readOnly: true,
                        renderSideBySide: true,
                        automaticLayout: true,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 13,
                        fontFamily: 'JetBrains Mono, Menlo, Monaco, "Courier New", monospace',
                        padding: { top: 12, bottom: 12 },
                        renderOverviewRuler: true,
                        diffWordWrap: 'on',
                    }}
                    loading={<div style={{ color: 'var(--text-muted)', padding: 20 }}>Loading Diff Viewer...</div>}
                />
                )}
            </div>
        </div>
    );
}
