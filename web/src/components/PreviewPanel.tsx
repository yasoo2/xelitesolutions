/**
 * PreviewPanel - Live preview component for BottomPanel
 * Shows live preview of HTML/React apps or Code differences
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Eye,
    RefreshCw,
    ExternalLink,
    Smartphone,
    Tablet,
    Monitor,
    X,
    Link,
    Code
} from 'lucide-react';
import Editor from '@monaco-editor/react';

type DeviceType = 'desktop' | 'tablet' | 'mobile';
type PreviewMode = 'web' | 'code';

interface DeviceConfig {
    type: DeviceType;
    icon: React.ElementType;
    labelKey: string;
    width: number | '100%';
    height?: number;
}

const DEVICES: DeviceConfig[] = [
    { type: 'desktop', icon: Monitor, labelKey: 'viewportDesktop', width: '100%' },
    { type: 'tablet', icon: Tablet, labelKey: 'viewportTablet', width: 768 },
    { type: 'mobile', icon: Smartphone, labelKey: 'viewportMobile', width: 375 },
];

interface PreviewPanelProps {
    url?: string;
    onReady?: () => void;
}

export default function PreviewPanel({
    url: initialUrl,
    onReady
}: PreviewPanelProps) {
    const { t } = useTranslation();
    const [mode, setMode] = useState<PreviewMode>('web');
    const [previewUrl, setPreviewUrl] = useState(initialUrl || '');
    const [inputUrl, setInputUrl] = useState(initialUrl || '');
    
    // Code preview state
    const [codePath, setCodePath] = useState('');
    const [codeContent, setCodeContent] = useState('');

    const [device, setDevice] = useState<DeviceType>('desktop');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [key, setKey] = useState(0); // For forcing iframe reload
    const [buildProgress, setBuildProgress] = useState<{
        phase: string;
        message: string;
        progress: number;
    } | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Listen for preview events
    useEffect(() => {
        const handlePreviewReady = (e: CustomEvent) => {
            const detail = e.detail as { url?: string };
            if (detail?.url) {
                setMode('web');
                setPreviewUrl(detail.url);
                setInputUrl(detail.url);
                setError(null);
                setBuildProgress(null); // Clear build progress when ready
                // Force a HARD iframe reload so edits (e.g. "add a button") always
                // appear, even if the browser would otherwise reuse the cached frame.
                setKey(k => k + 1);
                onReady?.();
            }
        };

        const handleCodeDiff = (e: CustomEvent) => {
            const detail = e.detail as { path: string; content: string };
            if (detail?.path && detail?.content !== undefined) {
                setMode('code');
                setCodePath(detail.path);
                setCodeContent(detail.content);
                setBuildProgress(null);
                onReady?.();
            }
        };

        const handleBuildProgress = (e: CustomEvent) => {
            setBuildProgress(e.detail);
        };

        window.addEventListener('preview:ready', handlePreviewReady as any);
        window.addEventListener('preview:code_diff', handleCodeDiff as any);
        window.addEventListener('preview:build_progress', handleBuildProgress as any);
        
        return () => {
            window.removeEventListener('preview:ready', handlePreviewReady as any);
            window.removeEventListener('preview:code_diff', handleCodeDiff as any);
            window.removeEventListener('preview:build_progress', handleBuildProgress as any);
        };
    }, [onReady]);

    // Update when initial URL changes
    useEffect(() => {
        if (initialUrl && mode === 'web') {
            setPreviewUrl(initialUrl);
            setInputUrl(initialUrl);
        }
    }, [initialUrl, mode]);

    const handleNavigate = useCallback((url: string) => {
        if (!url?.trim()) return;

        let targetUrl = url.trim();
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            // If it starts with localhost or port, add http
            if (targetUrl.match(/^(localhost|127\.0\.0\.1|\d+\.)/)) {
                targetUrl = 'http://' + targetUrl;
            } else {
                targetUrl = 'https://' + targetUrl;
            }
        }

        setPreviewUrl(targetUrl);
        setInputUrl(targetUrl);
        setError(null);
        setKey(k => k + 1);
    }, []);

    const handleRefresh = useCallback(() => {
        setKey(k => k + 1);
    }, []);

    const openExternal = useCallback(() => {
        if (previewUrl && mode === 'web') {
            window.open(previewUrl, '_blank');
        }
    }, [previewUrl, mode]);

    const currentDevice = DEVICES.find(d => d.type === device) || DEVICES[0];

    // Determine Monaco language based on extension
    const getLanguage = (filename: string) => {
        if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'typescript';
        if (filename.endsWith('.js') || filename.endsWith('.jsx')) return 'javascript';
        if (filename.endsWith('.css')) return 'css';
        if (filename.endsWith('.html')) return 'html';
        if (filename.endsWith('.json')) return 'json';
        if (filename.endsWith('.md')) return 'markdown';
        return 'plaintext';
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: 'var(--bg-dark)'
        }}>
            {/* Toolbar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 8px',
                borderBottom: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                flexWrap: 'wrap',
                gap: 8
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    {/* Mode Switcher */}
                    <div style={{ display: 'flex', gap: 2, background: 'rgba(0,0,0,0.2)', padding: 2, borderRadius: 6 }}>
                        <PreviewButton
                            icon={Eye}
                            tooltip="وضع الويب"
                            onClick={() => setMode('web')}
                            active={mode === 'web'}
                        />
                        <PreviewButton
                            icon={Code}
                            tooltip="وضع الكود"
                            onClick={() => setMode('code')}
                            active={mode === 'code'}
                        />
                    </div>

                    {/* URL/Path Input */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 12px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 6,
                        minWidth: 200,
                    }}>
                        {mode === 'web' ? (
                            <Link size={12} style={{ color: previewUrl ? '#22c55e' : 'var(--text-muted)', flexShrink: 0 }} />
                        ) : (
                            <Code size={12} style={{ color: codePath ? '#3b82f6' : 'var(--text-muted)', flexShrink: 0 }} />
                        )}
                        <input
                            type="text"
                            value={mode === 'web' ? inputUrl : codePath}
                            readOnly={mode === 'code'}
                            onChange={e => mode === 'web' && setInputUrl(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && mode === 'web') {
                                    handleNavigate(inputUrl);
                                }
                            }}
                            placeholder={mode === 'web' ? "http://localhost:3000" : "لم يتم تحديد مسار الملف"}
                            style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                color: 'var(--text-primary)',
                                fontSize: 12,
                                fontFamily: 'monospace',
                                direction: 'ltr',
                            }}
                        />
                    </div>
                </div>

                {/* Right Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {mode === 'web' && (
                        <div style={{ display: 'flex', gap: 2, marginRight: 8, borderRight: '1px solid var(--border-color)', paddingRight: 8 }}>
                            {DEVICES.map(d => (
                                <PreviewButton
                                    key={d.type}
                                    icon={d.icon}
                                    tooltip={t(d.labelKey)}
                                    onClick={() => setDevice(d.type)}
                                    active={device === d.type}
                                />
                            ))}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        {buildProgress && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '4px 8px',
                                background: 'rgba(56, 189, 248, 0.1)',
                                borderRadius: 4,
                                marginRight: 8,
                            }}>
                                <RefreshCw size={10} style={{ color: '#38bdf8', animation: 'spin 2s linear infinite' }} />
                                <span style={{ fontSize: 10, color: '#38bdf8', fontWeight: 600 }}>جاري البناء...</span>
                            </div>
                        )}
                        
                        {mode === 'web' && (
                            <>
                                <PreviewButton
                                    icon={RefreshCw}
                                    tooltip="تحديث"
                                    onClick={handleRefresh}
                                    spinning={isLoading}
                                />
                                <PreviewButton
                                    icon={ExternalLink}
                                    tooltip="فتح خارجياً"
                                    onClick={openExternal}
                                    disabled={!previewUrl}
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Preview Container */}
            <div style={{
                flex: 1,
                overflow: 'hidden',
                display: 'flex',
                justifyContent: 'center',
                alignItems: mode === 'web' && device !== 'desktop' ? 'flex-start' : 'stretch',
                padding: mode === 'web' && device !== 'desktop' ? 16 : 0,
                background: mode === 'web' && device !== 'desktop' ? 'var(--bg-card)' : 'transparent',
                position: 'relative',
                minHeight: 0,
            }}>
                {/* Build Progress Overlay */}
                {buildProgress && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 100,
                        background: 'rgba(10, 10, 15, 0.85)',
                        backdropFilter: 'blur(12px)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 40,
                        textAlign: 'center',
                    }}>
                        <div style={{
                            width: '100%',
                            maxWidth: 400,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 20,
                        }}>
                            {/* Animated Construction Icon */}
                            <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto' }}>
                                <div style={{
                                    position: 'absolute',
                                    inset: 0,
                                    border: '4px solid rgba(56, 189, 248, 0.2)',
                                    borderRadius: '50%',
                                    borderTopColor: '#38bdf8',
                                    animation: 'spin 3s linear infinite',
                                }} />
                                <div style={{
                                    position: 'absolute',
                                    inset: 10,
                                    border: '4px solid rgba(139, 92, 246, 0.2)',
                                    borderRadius: '50%',
                                    borderBottomColor: '#8b5cf6',
                                    animation: 'spin 2s linear reverse infinite',
                                }} />
                                <div style={{
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Eye size={32} style={{ color: '#38bdf8' }} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18, fontWeight: 700 }}>
                                    {buildProgress.phase === 'scaffolding' ? t('buildScaffolding') :
                                        buildProgress.phase === 'dependencies' ? t('buildInstalling') :
                                            buildProgress.phase === 'building' ? t('buildQuality') :
                                                buildProgress.phase === 'preview' ? t('buildStartingPreview') :
                                                    t('buildFinishing')}
                                </h3>
                                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
                                    {buildProgress.message}
                                </p>
                            </div>

                            {/* Progress Bar */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{
                                    width: '100%',
                                    height: 6,
                                    background: 'rgba(255,255,255,0.05)',
                                    borderRadius: 10,
                                    overflow: 'hidden'
                                }}>
                                    <div style={{
                                        width: `${buildProgress.progress}%`,
                                        height: '100%',
                                        background: 'linear-gradient(90deg, #38bdf8, #8b5cf6)',
                                        transition: 'width 0.5s ease-out',
                                        boxShadow: '0 0 10px rgba(56, 189, 248, 0.5)',
                                    }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
                                    <span>{Math.round(buildProgress.progress)}%</span>
                                    <span>التقدم الإجمالي</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {mode === 'code' ? (
                    codePath ? (
                        <div style={{ flex: 1, width: '100%', height: '100%' }}>
                            <Editor
                                height="100%"
                                language={getLanguage(codePath)}
                                theme="vs-dark"
                                value={codeContent}
                                options={{
                                    readOnly: true,
                                    minimap: { enabled: false },
                                    scrollBeyondLastLine: false,
                                    fontSize: 13,
                                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
                                    wordWrap: 'on',
                                    padding: { top: 16 }
                                }}
                            />
                        </div>
                    ) : (
                        <EmptyState 
                            icon={Code} 
                            title="لا يوجد كود للمعاينة" 
                            subtitle="انتظر حتى يقوم النظام بإنشاء أو تعديل ملف" 
                        />
                    )
                ) : (
                    previewUrl ? (
                        <div style={{
                            width: currentDevice.width,
                            height: '100%',
                            maxWidth: '100%',
                            position: 'relative',
                            background: '#fff',
                            borderRadius: device === 'desktop' ? 0 : 8,
                            boxShadow: device === 'desktop' ? 'none' : '0 4px 24px rgba(0,0,0,0.2)',
                            overflow: 'hidden',
                            flex: device === 'desktop' ? 1 : undefined,
                        }}>
                            <iframe
                                ref={iframeRef}
                                key={key}
                                src={previewUrl}
                                onLoad={() => {
                                    setIsLoading(false);
                                    setError(null);
                                }}
                                onError={() => {
                                    setIsLoading(false);
                                    setError(t('previewLoadFailed'));
                                }}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    border: 'none',
                                    display: 'block',
                                }}
                                sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
                            />
                        </div>
                    ) : (
                        !buildProgress && (
                            <EmptyState 
                                icon={Eye} 
                                title="لا توجد معاينة" 
                                subtitle="ادخل رابط أو انتظر حتى يتم إنشاء واجهة" 
                            />
                        )
                    )
                )}
            </div>

            {/* Error Display */}
            {error && (
                <div style={{
                    padding: '8px 12px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    borderTop: '1px solid rgba(239, 68, 68, 0.2)',
                    color: '#ef4444',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }}>
                    <X size={14} />
                    {error}
                </div>
            )}
        </div>
    );
}

function EmptyState({ icon: Icon, title, subtitle }: { icon: any, title: string, subtitle: string }) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            width: '100%',
            color: 'var(--text-muted)',
            gap: 12,
        }}>
            <Icon size={48} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 14, textAlign: 'center' }}>
                {title}
                <br />
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                    {subtitle}
                </span>
            </div>
        </div>
    );
}

function PreviewButton({
    icon: Icon,
    tooltip,
    onClick,
    disabled = false,
    spinning = false,
    active = false
}: {
    icon: React.ElementType;
    tooltip: string;
    onClick: () => void;
    disabled?: boolean;
    spinning?: boolean;
    active?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={tooltip}
            style={{
                width: 28,
                height: 28,
                borderRadius: 4,
                border: 'none',
                background: active ? 'var(--accent-primary)' : 'transparent',
                color: active ? '#000' : disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: disabled ? 0.5 : 1,
                transition: 'all 0.15s',
            }}
        >
            <Icon
                size={14}
                style={spinning ? { animation: 'spin 1s linear infinite' } : undefined}
            />
        </button>
    );
}
