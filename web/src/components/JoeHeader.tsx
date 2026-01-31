import React from 'react';
import { Bot, MessageSquare, Settings, Moon, Sun } from 'lucide-react';

interface JoeHeaderProps {
    mode: 'agent' | 'chat';
    onModeChange: (mode: 'agent' | 'chat') => void;
    userAvatar?: string;
    userName?: string;
    onSettingsClick?: () => void;
    theme?: 'dark' | 'light';
    onThemeToggle?: () => void;
}

export default function JoeHeader({
    mode,
    onModeChange,
    userAvatar,
    userName,
    onSettingsClick,
    theme = 'dark',
    onThemeToggle
}: JoeHeaderProps) {
    return (
        <header className="joe-header">
            {/* Left: Logo & Brand */}
            <div className="joe-header-left">
                <div className="joe-logo">J</div>
                <div className="joe-brand">
                    <span className="joe-brand-name">Joe</span>
                    <span className="joe-brand-tagline">AI Assistant</span>
                </div>
            </div>

            {/* Center: Mode Toggle */}
            <div className="joe-header-center">
                <div className="joe-mode-toggle">
                    <button
                        className={`joe-mode-btn ${mode === 'agent' ? 'active' : ''}`}
                        onClick={() => onModeChange('agent')}
                    >
                        <Bot size={16} />
                        Agent Mode
                    </button>
                    <button
                        className={`joe-mode-btn ${mode === 'chat' ? 'active' : ''}`}
                        onClick={() => onModeChange('chat')}
                    >
                        <MessageSquare size={16} />
                        Chat Mode
                    </button>
                </div>
            </div>

            {/* Right: Settings & Profile */}
            <div className="joe-header-right">
                {onThemeToggle && (
                    <button className="joe-header-btn" onClick={onThemeToggle} title="Toggle Theme">
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                )}
                <button className="joe-header-btn" onClick={onSettingsClick} title="Settings">
                    <Settings size={18} />
                </button>
                {userAvatar ? (
                    <img src={userAvatar} alt={userName || 'User'} className="joe-avatar" />
                ) : (
                    <div className="joe-avatar" style={{
                        background: 'linear-gradient(135deg, var(--joe-gold-primary), var(--joe-gold-dark))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--joe-bg-primary)',
                        fontWeight: 600,
                        fontSize: 14
                    }}>
                        {userName?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                )}
            </div>
        </header>
    );
}
