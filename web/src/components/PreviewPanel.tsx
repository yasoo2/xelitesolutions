/**
 * PreviewPanel - Live preview component for BottomPanel
 * Shows live preview of HTML/React apps being developed
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    Eye,
    RefreshCw,
    ExternalLink,
    Smartphone,
    Tablet,
    Monitor,
    X,
    Link
} from 'lucide-react';

type DeviceType = 'desktop' | 'tablet' | 'mobile';

interface DeviceConfig {
    type: DeviceType;
    icon: React.ElementType;
    label: string;
    width: number | '100%';
    height?: number;
}

const DEVICES: DeviceConfig[] = [
    { type: 'desktop', icon: Monitor, label: 'سطح المكتب', width: '100%' },
    { type: 'tablet', icon: Tablet, label: 'تابلت', width: 768 },
    { type: 'mobile', icon: Smartphone, label: 'موبايل', width: 375 },
];

interface PreviewPanelProps {
    url?: string;
    onReady?: () => void;
}

export default function PreviewPanel({
    url: initialUrl,
    onReady
}: PreviewPanelProps) {
    const [previewUrl, setPreviewUrl] = useState(initialUrl || '');
    const [inputUrl, setInputUrl] = useState(initialUrl || '');
    const [device, setDevice] = useState<DeviceType>('desktop');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [key, setKey] = useState(0); // For forcing iframe reload
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Listen for preview_ready events
    useEffect(() => {
        const handlePreviewReady = (e: CustomEvent) => {
            const detail = e.detail as { url?: string };
            if (detail?.url) {
                setPreviewUrl(detail.url);
                setInputUrl(detail.url);
                setError(null);
                onReady?.();
            }
        };

        window.addEventListener('preview:ready', handlePreviewReady as any);
        return () => window.removeEventListener('preview:ready', handlePreviewReady as any);
    }, [onReady]);

    // Update when initial URL changes
    useEffect(() => {
        if (initialUrl) {
            setPreviewUrl(initialUrl);
            setInputUrl(initialUrl);
        }
    }, [initialUrl]);

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
        if (previewUrl) {
            window.open(previewUrl, '_blank');
        }
    }, [previewUrl]);

    const currentDevice = DEVICES.find(d => d.type === device) || DEVICES[0];

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
                gap: 8,
                padding: '4px 8px',
                borderBottom: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                flexWrap: 'wrap',
            }}>
                {/* URL Input */}
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
                    <Link size={12} style={{ color: previewUrl ? '#22c55e' : 'var(--text-muted)', flexShrink: 0 }} />
                    <input
                        type="text"
                        value={inputUrl}
                        onChange={e => setInputUrl(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                handleNavigate(inputUrl);
                            }
                        }}
                        placeholder="http://localhost:3000"
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

                {/* Device Selector */}
                <div style={{ display: 'flex', gap: 2 }}>
                    {DEVICES.map(d => (
                        <PreviewButton
                            key={d.type}
                            icon={d.icon}
                            tooltip={d.label}
                            onClick={() => setDevice(d.type)}
                            active={device === d.type}
                        />
                    ))}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 2 }}>
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
                </div>
            </div>

            {/* Preview Container */}
            <div style={{
                flex: 1,
                overflow: 'auto',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                padding: device === 'desktop' ? 0 : 16,
                background: device === 'desktop' ? 'transparent' : 'var(--bg-card)',
            }}>
                {previewUrl ? (
                    <div style={{
                        width: currentDevice.width,
                        height: '100%',
                        maxWidth: '100%',
                        position: 'relative',
                        background: '#fff',
                        borderRadius: device === 'desktop' ? 0 : 8,
                        boxShadow: device === 'desktop' ? 'none' : '0 4px 24px rgba(0,0,0,0.2)',
                        overflow: 'hidden',
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
                                setError('فشل تحميل الصفحة');
                            }}
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none',
                            }}
                            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
                        />
                    </div>
                ) : (
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
                        <Eye size={48} style={{ opacity: 0.3 }} />
                        <div style={{ fontSize: 14, textAlign: 'center' }}>
                            لا توجد معاينة
                            <br />
                            <span style={{ fontSize: 12, opacity: 0.7 }}>
                                ادخل رابط أو انتظر حتى يتم إنشاء ملف
                            </span>
                        </div>
                    </div>
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
