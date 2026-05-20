/**
 * EmbeddedBrowser - Browser component for BottomPanel
 * Wraps ModernBrowserStream with panel-specific controls
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    Globe,
    RefreshCw,
    ArrowLeft,
    ArrowRight,
    Home,
    ExternalLink,
    Maximize2,
    Camera,
    Search,
    X
} from 'lucide-react';

import ModernBrowserStream from './ModernBrowserStream';
import { API_URL } from '../config';

interface EmbeddedBrowserProps {
    sessionId?: string;
    onReady?: () => void;
}

export default function EmbeddedBrowser({
    sessionId = 'panel-browser',
    onReady
}: EmbeddedBrowserProps) {
    const [currentUrl, setCurrentUrl] = useState('');
    const [inputUrl, setInputUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [showUrlInput, setShowUrlInput] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

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
            if (detail?.sessionId) {
                setIsConnected(true);
                onReady?.();
            }
        };

        window.addEventListener('browser:session_status', handleStatus as any);
        return () => window.removeEventListener('browser:session_status', handleStatus as any);
    }, [onReady, showUrlInput]);

    // Reset state when sessionId changes
    useEffect(() => {
        setCurrentUrl('');
        setInputUrl('');
        setIsLoading(false);
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
            await fetch(`${API_URL}/browser/nav/goto`, {
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
            setCurrentUrl(targetUrl);
            setInputUrl(targetUrl);
        } catch {
            // Navigation failed silently
        } finally {
            setIsLoading(false);
        }
    }, [sessionId]);

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
                    <BrowserButton icon={ArrowRight} tooltip="رجوع" onClick={handleBack} />
                    <BrowserButton icon={ArrowLeft} tooltip="تقدم" onClick={handleForward} />
                    <BrowserButton
                        icon={isLoading ? RefreshCw : RefreshCw}
                        tooltip="تحديث"
                        onClick={handleRefresh}
                        spinning={isLoading}
                    />
                    <BrowserButton icon={Home} tooltip="الرئيسية" onClick={handleHome} />
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
                            placeholder="ادخل رابط أو ابحث..."
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
                            <Globe size={12} style={{ color: isConnected ? '#22c55e' : 'var(--text-muted)', flexShrink: 0 }} />
                            <span style={{
                                flex: 1,
                                fontSize: 12,
                                color: currentUrl ? 'var(--text-primary)' : 'var(--text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontFamily: 'monospace',
                                direction: 'ltr',
                            }}>
                                {currentUrl || 'لا يوجد صفحة محملة'}
                            </span>
                        </>
                    )}
                </div>

                {/* Extra actions */}
                <div style={{ display: 'flex', gap: 2 }}>
                    <BrowserButton icon={Camera} tooltip="لقطة شاشة" onClick={handleScreenshot} />
                    <BrowserButton icon={ExternalLink} tooltip="فتح خارجياً" onClick={openExternal} disabled={!currentUrl} />
                </div>
            </div>

            {/* Browser View */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
                <ModernBrowserStream sessionId={sessionId} showBoxes={true} />

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
