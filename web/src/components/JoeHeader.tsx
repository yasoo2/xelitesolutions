import React from 'react';
import { Bot, MessageSquare, Settings, Moon, Sun } from 'lucide-react';

interface JoeHeaderProps {

    userAvatar?: string;
    userName?: string;
    onSettingsClick?: () => void;
    theme?: 'dark' | 'light';
    onThemeToggle?: () => void;
    onToggleChat?: () => void;
    onToggleExplorer?: () => void;
    isChatCollapsed?: boolean;
    isExplorerCollapsed?: boolean;
}

export default function JoeHeader({

    userAvatar,
    userName,
    onSettingsClick,
    theme = 'dark',
    onThemeToggle,
    onToggleChat,
    onToggleExplorer,
    isChatCollapsed,
    isExplorerCollapsed
}: JoeHeaderProps) {
    return (
        <header className="joe-header">
            {/* Left: Logo & Brand */}
            <div className="joe-header-left">
                <button
                    className={`joe-header-btn sidebar-toggle ${isChatCollapsed ? 'inactive' : 'active'}`}
                    onClick={onToggleChat}
                    title="Toggle Chat"
                >
                    <MessageSquare size={18} />
                </button>
                <div className="joe-logo">J</div>
                <div className="joe-brand">
                    <span className="joe-brand-name">Joe Premium</span>
                    <span className="joe-brand-tagline">Advanced AI Assistant</span>
                </div>
            </div>

            {/* Center: System Status */}
            <div className="joe-header-center">
                <div className="joe-system-badge" style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 16px',
                    borderRadius: 20,
                    background: 'rgba(255, 215, 0, 0.1)',
                    border: '1px solid rgba(255, 215, 0, 0.2)',
                    color: 'var(--joe-gold-primary)',
                    fontSize: 13,
                    fontWeight: 500
                }}>
                    <Bot size={16} />
                    <span>Autonomous Agent Active</span>
                </div>
            </div>

            {/* Right: Settings & Profile */}
            <div className="joe-header-right">
                <div className="joe-user-profile">
                    <div className="joe-user-info hide-mobile">
                        <span className="joe-welcome-text">أهلاً بك،</span>
                        <span className="joe-user-name">{userName || (theme === 'dark' ? 'مستخدم' : 'User')}</span>
                    </div>
                    {userAvatar ? (
                        <img src={userAvatar} alt={userName || 'User'} className="joe-avatar" />
                    ) : (
                        <div className="joe-avatar-placeholder">
                            {userName?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                    )}
                </div>

                <div className="joe-header-divider"></div>

                <div className="joe-header-actions">
                    {onThemeToggle && (
                        <button className="joe-header-btn" onClick={onThemeToggle} title="تبديل المظهر">
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                    )}
                    <button className="joe-header-btn" onClick={onSettingsClick} title="الإعدادات">
                        <Settings size={18} />
                    </button>
                    <button
                        className={`joe-header-btn sidebar-toggle ${isExplorerCollapsed ? 'inactive' : 'active'}`}
                        onClick={onToggleExplorer}
                        title="Toggle Explorer"
                    >
                        <Bot size={18} />
                    </button>
                </div>
            </div>
        </header>
    );
}
