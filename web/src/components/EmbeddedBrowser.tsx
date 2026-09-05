/**
 * EmbeddedBrowser - Browser component for BottomPanel
 * Wraps ModernBrowserStream with panel-specific controls
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Globe,
    RefreshCw,
    ArrowLeft,
    ArrowRight,
    Home,
    ExternalLink,
    Maximize2,
    Camera,
    Search
} from 'lucide-react';

import ModernBrowserStream from './ModernBrowserStream';
import MyBrowserView from './MyBrowserView';
import { API_URL } from '../config';

interface EmbeddedBrowserProps {
    /** Browser ownership is explicit; a shared panel browser is forbidden. */
    sessionId: string;
    onReady?: () => void;
}

export default function EmbeddedBrowser({
    sessionId,
    onReady
}: EmbeddedBrowserProps) {
    const { t } = useTranslation();
    const [currentUrl, setCurrentUrl] = useState('');
    const [pageTitle, setPageTitle] = useState('');
    const [inputUrl, setInputUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [liveQuality, setLiveQuality] = useState<'good' | 'degraded' | 'blocked' | 'unknown'>('unknown');
    const [runtimeErrorCount, setRuntimeErrorCount] = useState(0);
    const [showUrlInput, setShowUrlInput] = useState(false);
    const [showMine, setShowMine] = useState(false); // false = Joe's browser, true = user's real browser
    // "My personal browser" only works through the Joe BROWSER EXTENSION. On a local
    // setup with no extension it shows nothing, so we only surface the toggle when
    // the extension is actually connected — otherwise it's confusing dead UI.
    const [extConnected, setExtConnected] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const hasSession = Boolean(sessionId.trim());

    useEffect(() => {
        if (!hasSession) return;

        let alive = true;
        (async () => {
            try {
                const token = localStorage.getItem('token');
                const r = await fetch(`${API_URL}/extension/status`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
                const st = await r.json().catch(() => ({ connected: false }));
                if (alive) setExtConnected(!!st?.connected);
            } catch { if (alive) setExtConnected(false); }
        })();
        return () => { alive = false; };
    }, [hasSession]);

    // Listen for session status from ModernBrowserStream
    useEffect(() => {
        const handleStatus = (e: CustomEvent) => {
            const detail = e.detail as { url?: string; sessionId?: string };
            if (detail?.url) {
                setCurrentUrl(detail.url);
                // Only update input if user isn't actively editing
                if (!showUrlInput) {
                    setInputUrl(detail.url);
                }
            }
            if (detail?.sessionId && (!detail.sessionId || detail.sessionId === sessionId)) {
                setIsConnected(true);
                onReady?.();
            }
        };

        const handlePageSnapshot = (e: CustomEvent) => {
            const detail = e.detail as { sessionId?: string; url?: string; title?: string };
            if (detail?.sessionId && detail.sessionId !== sessionId) return;
            if (detail?.url) {
                setCurrentUrl(detail.url);
                if (!showUrlInput) setInputUrl(detail.url);
            }
            setPageTitle(String(detail?.title || ''));
        };
        const handleQuality = (e: CustomEvent) => {
            const detail = e.detail as { sessionId?: string; status?: 'good' | 'degraded' | 'blocked' | 'unknown' };
            if (detail?.sessionId && detail.sessionId !== sessionId) return;
            setLiveQuality(detail?.status || 'unknown');
        };
        const handleDiagnostics = (e: CustomEvent) => {
            const detail = e.detail as { sessionId?: string; jsErrors?: number; networkErrors?: number };
            if (detail?.sessionId && detail.sessionId !== sessionId) return;
            setRuntimeErrorCount(Number(detail?.jsErrors || 0) + Number(detail?.networkErrors || 0));
        };

        window.addEventListener('browser:session_status', handleStatus as any);
        window.addEventListener('browser:page_snapshot', handlePageSnapshot as any);
        window.addEventListener('browser:quality', handleQuality as any);
        window.addEventListener('browser:diagnostics', handleDiagnostics as any);
        return () => {
            window.removeEventListener('browser:session_status', handleStatus as any);
            window.removeEventListener('browser:page_snapshot', handlePageSnapshot as any);
            window.removeEventListener('browser:quality', handleQuality as any);
            window.removeEventListener('browser:diagnostics', handleDiagnostics as any);
        };
    }, [onReady, sessionId, showUrlInput]);

    // Reset state when sessionId changes
    useEffect(() => {
        setCurrentUrl('');
        setPageTitle('');
        setInputUrl('');
        setIsLoading(false);
        setLiveQuality('unknown');
        setRuntimeErrorCount(0);
    }, [sessionId]);

    // Navigate to URL
    const handleNavigate = useCallback(async (url: string) => {
        if (!url.trim()) return;

        // Add protocol if missing
        let targetUrl = url.trim();
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            // Check if it looks like a URL or a search query
            if (targetUrl.includes('.') && !targetUrl.includes(' ')) {
                targetUrl = 'https://' + targetUrl;
            } else {
                // Treat as search query
                targetUrl = `https://www.google.com/search?q=${encodeURIComponent(targetUrl)}`;
            }
        }

        setIsLoading(true);
        setShowUrlInput(false);

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/browser/nav/goto`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    sessionId,
                    url: targetUrl
                })
            });
            const result = await response.json().catch(() => null);
            if (!response.ok || !result?.ok) throw new Error(String(result?.error || 'nav_goto_failed'));
            const resolvedUrl = String(result.url || targetUrl);
            setCurrentUrl(resolvedUrl);
            setInputUrl(resolvedUrl);
        } catch {
            // The stream will show the actual page; do not present a failed
            // navigation as if the requested URL opened successfully.
            setLiveQuality('degraded');
        } finally {
            setIsLoading(false);
        }
    }, [sessionId]);

    // A completed build publishes its preview through the session that owns
    // this panel. It must not leave the Browser showing a prior project.
    useEffect(() => {
        const handlePreviewNavigation = (event: Event) => {
            const detail = (event as CustomEvent<{ sessionId?: string; url?: string }>).detail;
            if (detail?.sessionId !== sessionId || !detail.url) return;
            void handleNavigate(detail.url);
        };
        window.addEventListener('joe:browser-navigate', handlePreviewNavigation);
        return () => window.removeEventListener('joe:browser-navigate', handlePreviewNavigation);
    }, [handleNavigate, sessionId]);

    // Browser actions
    const sendAction = useCallback(async (action: any) => {
        setIsLoading(true);
        try {
            const token = localStorage.getItem('token');
            await fetch(`${API_URL}/browser/actions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    sessionId,
                    actions: [action]
                })
            });
        } catch {
            // Action failed silently
        } finally {
            setIsLoading(false);
        }
    }, [sessionId]);

    const handleBack = () => sendAction({ type: 'back' });
    const handleForward = () => sendAction({ type: 'forward' });
    const handleRefresh = () => sendAction({ type: 'reload' });
    const handleHome = () => handleNavigate('https://www.google.com');
    const handleScreenshot = () => sendAction({ type: 'screenshot' });

    const openExternal = () => {
        if (currentUrl) {
            window.open(currentUrl, '_blank');
        }
    };

    // (Removed the manual "save login" button/handler: the browser session already
    // auto-saves on every navigation, so the user stays signed in forever with no
    // button to press — the manual one was redundant.)

    if (!hasSession) {
        return <div className="joe-browser-container" aria-label="No active browser session" />;
    }

    return (
        <div className="joe-browser-container" style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: 'rgba(0,0,0,0.2)'
        }}>
            {/* Toolbar */}
            <div className="joe-browser-toolbar" style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 16px',
                borderBottom: '1px solid var(--joe-border)',
                background: 'var(--joe-bg-card)',
                backdropFilter: 'blur(10px)',
            }}>
                {/* Navigation buttons */}
                <div style={{ display: 'flex', gap: 2 }}>
                    <BrowserButton icon={ArrowRight} tooltip={t('browserBack')} onClick={handleBack} />
                    <BrowserButton icon={ArrowLeft} tooltip={t('browserForward')} onClick={handleForward} />
                    <BrowserButton
                        icon={isLoading ? RefreshCw : RefreshCw}
                        tooltip={t('browserRefresh')}
                        onClick={handleRefresh}
                        spinning={isLoading}
                    />
                    <BrowserButton icon={Home} tooltip={t('browserHome')} onClick={handleHome} />
                </div>

                {/* URL Bar */}
                <div
                    className="joe-browser-url-bar"
                    onClick={() => {
                        setShowUrlInput(true);
                        setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 14px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid var(--joe-border)',
                        borderRadius: 10,
                        cursor: 'text',
                        minWidth: 0,
                        transition: 'all 0.2s ease',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
                    }}
                >
                    {showUrlInput ? (
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputUrl}
                            onChange={e => setInputUrl(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    handleNavigate(inputUrl);
                                } else if (e.key === 'Escape') {
                                    setShowUrlInput(false);
                                    setInputUrl(currentUrl);
                                }
                            }}
                            onBlur={() => {
                                setShowUrlInput(false);
                                setInputUrl(currentUrl);
                            }}
                            placeholder={t('urlOrSearchPlaceholder')}
                            style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                color: 'var(--text-primary)',
                                fontSize: 12,
                                fontFamily: 'monospace',
                            }}
                        />
                    ) : (
                        <>
                            <Globe size={12} style={{ color: !isConnected ? 'var(--text-muted)' : liveQuality === 'good' ? '#22c55e' : liveQuality === 'degraded' ? '#f59e0b' : liveQuality === 'blocked' ? '#ef4444' : '#94a3b8', flexShrink: 0 }} />
                            <span style={{
                                flex: 1,
                                fontSize: 12,
                                color: currentUrl ? 'var(--text-primary)' : 'var(--text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontFamily: 'monospace',
                                direction: 'ltr',
                            }} title={pageTitle ? `${pageTitle}${runtimeErrorCount ? ` · أخطاء: ${runtimeErrorCount}` : ''}` : undefined}>
                                {currentUrl || t('browserNoPageLoaded')}
                            </span>
                        </>
                    )}
                </div>

                {/* Extra actions. The "my personal browser" toggle appears ONLY when the
                    Joe extension is connected (otherwise it shows nothing). The manual
                    "save login" button was removed — the session already auto-saves on
                    every navigation, so it stays logged in forever with no button. */}
                <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    {extConnected && (
                        <button
                            onClick={() => setShowMine(v => !v)}
                            title={showMine ? t('browserJoeBrowser') : t('browserMyBrowser')}
                            style={{ height: 28, padding: '0 10px', borderRadius: 8, fontSize: 11, cursor: 'pointer', border: '1px solid var(--joe-border)', background: showMine ? '#1a73e8' : 'transparent', color: showMine ? '#fff' : 'var(--joe-text-secondary)', whiteSpace: 'nowrap' }}
                        >
                            {showMine ? `🧩 ${t('browserMyBrowser')}` : t('browserJoeBrowser')}
                        </button>
                    )}
                    <BrowserButton icon={Camera} tooltip={t('browserScreenshot')} onClick={handleScreenshot} />
                    <BrowserButton icon={ExternalLink} tooltip={t('browserOpenExternal')} onClick={openExternal} disabled={!currentUrl} />
                </div>
            </div>

            {/* Browser View — Joe's browser, or the user's own real browser (extension) */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
                {showMine ? <MyBrowserView sessionId={sessionId} /> : <ModernBrowserStream sessionId={sessionId} showBoxes={true} />}
            </div>
        </div>
    );
}

function BrowserButton({
    icon: Icon,
    tooltip,
    onClick,
    disabled = false,
    spinning = false
}: {
    icon: React.ElementType;
    tooltip: string;
    onClick: () => void;
    disabled?: boolean;
    spinning?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={tooltip}
            style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: '1px solid transparent',
                background: 'transparent',
                color: disabled ? 'var(--joe-text-muted)' : 'var(--joe-text-secondary)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: disabled ? 0.5 : 1,
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseOver={(e) => {
                if (!disabled) {
                    e.currentTarget.style.background = 'var(--joe-bg-hover)';
                    e.currentTarget.style.color = 'var(--joe-gold-primary)';
                    e.currentTarget.style.borderColor = 'var(--joe-gold-border)';
                }
            }}
            onMouseOut={(e) => {
                if (!disabled) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--joe-text-secondary)';
                    e.currentTarget.style.borderColor = 'transparent';
                }
            }}
        >
            <Icon
                size={16}
                style={spinning ? { animation: 'spin 1s linear infinite' } : undefined}
            />
        </button>
    );
}
