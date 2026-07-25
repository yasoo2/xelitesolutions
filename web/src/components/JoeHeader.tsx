import { Bot, MessageSquare, Settings, Moon, Sun, Plus, PanelLeft, PanelRight, Columns2, Rocket, Activity, Shield } from 'lucide-react';

interface JoeHeaderProps {
    userAvatar?: string;
    userName?: string;
    userEmail?: string;
    userRole?: string;
    onSettingsClick?: () => void;
    onNewProject?: () => void;
    onDeploymentsClick?: () => void;
    onSystemClick?: () => void;
    theme?: 'dark' | 'light';
    onThemeToggle?: () => void;
    onToggleChat?: () => void;
    onToggleExplorer?: () => void;
    onToggleWorkspace?: () => void;
    isChatCollapsed?: boolean;
    isExplorerCollapsed?: boolean;
    isWorkspaceCollapsed?: boolean;
}

export default function JoeHeader({
    userAvatar,
    userName,
    userEmail,
    userRole,
    onSettingsClick,
    onNewProject,
    onDeploymentsClick,
    onSystemClick,
    theme = 'dark',
    onThemeToggle,
    onToggleChat,
    onToggleExplorer,
    onToggleWorkspace,
    isChatCollapsed,
    isExplorerCollapsed,
    isWorkspaceCollapsed
}: JoeHeaderProps) {
    // Generate avatar color from name/email
    const getAvatarColor = (str: string) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = Math.abs(hash % 360);
        return `hsl(${h}, 70%, 45%)`;
    };

    const displayName = userName || (userEmail ? userEmail.split('@')[0] : 'User');
    const displayAvatar = userAvatar || (userEmail ? `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=f0c14b&color=0a0c10&bold=true` : null);

    return (
        <header className="joe-header">
            {/* Left: Logo & Brand */}
            <div className="joe-header-left">
                <div className="joe-logo">J</div>
                <div className="joe-brand">
                    <span className="joe-brand-name">JOE</span>
                    <span className="joe-brand-tagline">Comprehensive AI System</span>
                </div>
            </div>

            {/* Center: System Status - Removed as requested */}
            <div className="joe-header-center">
            </div>

            {/* Right: Settings & Profile - Reordered to have Profile in Corner */}
            <div className="joe-header-right">
                <div className="joe-header-actions">
                    <button
                        className={`joe-header-btn sidebar-toggle ${isChatCollapsed ? 'inactive' : 'active'}`}
                        onClick={onToggleChat}
                        title="Toggle Chat"
                    >
                        <PanelLeft size={18} />
                    </button>
                    <button
                        className={`joe-header-btn sidebar-toggle ${isWorkspaceCollapsed ? 'inactive' : 'active'}`}
                        onClick={onToggleWorkspace}
                        title="إظهار/إخفاء مساحة العمل (المعاينة والطرفية)"
                    >
                        <Columns2 size={18} />
                    </button>
                    <button
                        className={`joe-header-btn sidebar-toggle ${isExplorerCollapsed ? 'inactive' : 'active'}`}
                        onClick={onToggleExplorer}
                        title="Toggle Explorer"
                    >
                        <PanelRight size={18} />
                    </button>
                    <div className="joe-action-spacer" style={{ width: '8px' }}></div>
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
                    {(() => {
                        const email = userEmail?.toLowerCase().trim() || '';
                        const isAdmin = userRole === 'SUPER_ADMIN' ||
                            email === 'info.auraaluxury@gmail.com' ||
                            email === 'younes.sowady2011@gmail.com' ||
                            localStorage.getItem('admin') === 'true';

                        if (isAdmin) {
                            return (
                                <button
                                    className="joe-header-btn"
                                    onClick={onSystemClick}
                                    title="System Management"
                                    style={{ color: '#60a5fa' }}
                                >
                                    <Shield size={18} />
                                </button>
                            );
                        }

                        return (
                            <button
                                className="joe-header-btn"
                                disabled
                                title="Deployment Access Restricted"
                                style={{ color: '#3f3f46', opacity: 0.5, cursor: 'not-allowed' }}
                            >
                                <Rocket size={18} />
                            </button>
                        );
                    })()}
                </div>

                <div className="joe-header-divider"></div>

                <div className="joe-user-profile">
                    <div className="joe-user-info hide-mobile">
                        <span className="joe-welcome-text">أهلاً بك،</span>
                        <span className="joe-user-name">{displayName}</span>
                    </div>
                    {displayAvatar ? (
                        <img src={displayAvatar} alt={displayName} className="joe-avatar" />
                    ) : (
                        <div className="joe-avatar-placeholder" style={{ background: getAvatarColor(displayName) }}>
                            {displayName.charAt(0).toUpperCase()}
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
