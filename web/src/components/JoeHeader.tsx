import React from 'react';
import { Bot, MessageSquare, Settings, Moon, Sun, Plus } from 'lucide-react';

interface JoeHeaderProps {

    userAvatar?: string;
    userName?: string;
    onSettingsClick?: () => void;
    onNewProject?: () => void;
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
    onNewProject,
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
                    <span className="joe-brand-name">JOE</span>
                    <span className="joe-brand-tagline">Comprehensive AI System</span>
                </div>
            </div>

            {/* Center: System Status - Removed as requested */}
            <div className="joe-header-center">
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
                    {onNewProject && (
                        <button className="joe-header-btn" onClick={onNewProject} title="مشروع جديد" style={{ color: 'var(--joe-gold-primary)' }}>
                            <Plus size={18} />
                        </button>
                    )}
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
