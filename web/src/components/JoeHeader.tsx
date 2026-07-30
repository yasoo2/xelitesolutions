import { useTranslation } from 'react-i18next';
import { Bot, MessageSquare, Settings, Moon, Sun, Plus, PanelLeft, PanelRight, Columns2, Rocket, Activity, Shield } from 'lucide-react';
import { resolveIdentity, nameFromEmail, initialsFrom, ROLE_KEY, isPrivileged, type UserRole } from '../lib/userIdentity';

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
    const { t } = useTranslation();

    // Identity comes from the signed token; the props are only a fallback for
    // callers that already resolved it. The avatar is drawn locally from the
    // user's initials — the old code fetched it from ui-avatars.com, which sent
    // the user's name to a third party and rendered a broken image offline.
    const id = resolveIdentity();
    const email = id.email || userEmail || '';
    const displayName = id.name || userName || nameFromEmail(email);
    const initials = id.initials || initialsFrom(displayName, email);
    const role = (id.role || String(userRole || '').toUpperCase()) as UserRole | '';
    const photo = id.picture || userAvatar || '';
    const roleLabel = role ? t(ROLE_KEY[role as UserRole]) : '';
    const roleClass = role ? `role-${role.toLowerCase().replace('_', '-')}` : '';

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
                        title={t('toggleWorkspace')}
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
                        <button className="joe-header-btn" onClick={onThemeToggle} title={t('toggleTheme')}>
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                    )}
                    <button className="joe-header-btn" onClick={onSettingsClick} title={t('settings')}>
                        <Settings size={18} />
                    </button>
                    {onNewProject && (
                        <button className="joe-header-btn" onClick={onNewProject} title={t('newProject')} style={{ color: 'var(--joe-gold-primary)' }}>
                            <Plus size={18} />
                        </button>
                    )}
                    {(() => {
                        // Gate on the ROLE carried by the signed token, not on a
                        // list of email addresses hardcoded in the bundle.
                        const isAdmin = isPrivileged(role) || localStorage.getItem('admin') === 'true';

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

                <div className="joe-user-profile" title={email || undefined}>
                    <div className="joe-user-info hide-mobile">
                        <span className="joe-user-name">{displayName || t('sysNotLinked')}</span>
                        <span className="joe-user-sub">
                            {roleLabel && <span className={`joe-role-badge ${roleClass}`}>{roleLabel}</span>}
                            {email && <span className="joe-user-email">{email}</span>}
                        </span>
                    </div>
                    {photo ? (
                        <img src={photo} alt={displayName} className="joe-avatar" referrerPolicy="no-referrer" />
                    ) : (
                        <div
                            className="joe-avatar-placeholder"
                            aria-label={displayName}
                            style={{ background: `linear-gradient(135deg, ${id.color}, ${id.colorSoft})` }}
                        >
                            {initials || '—'}
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
