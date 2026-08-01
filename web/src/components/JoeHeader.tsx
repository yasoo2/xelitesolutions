import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, MessageSquare, Settings, Moon, Sun, Plus, PanelLeft, PanelRight, Columns2, Rocket, Activity, Shield, ChevronDown } from 'lucide-react';
import { resolveIdentity, nameFromEmail, initialsFrom, ROLE_KEY, isPrivileged, type UserRole } from '../lib/userIdentity';
import JoeMark from './JoeMark';

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
    // If the photo cannot be loaded (no cached copy yet and no internet) fall
    // back to the initials rather than leaving a broken image in the header.
    const [photoBroken, setPhotoBroken] = useState(false);
    useEffect(() => { setPhotoBroken(false); }, [photo]);

    // The avatar opens a dropdown holding settings / theme / system management.
    // Closes on any outside click or Escape.
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!menuOpen) return;
        const onDown = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [menuOpen]);

    const isAdmin = isPrivileged(role) || localStorage.getItem('admin') === 'true';

    return (
        <header className="joe-header">
            {/* Left: Logo & Brand — the mark signs itself once per load.
                The brand name is ALWAYS the Latin word "Joe", in every locale. */}
            <div className="joe-header-left">
                <JoeMark size={30} animate className="joe-brand-mark" />
                <div className="joe-brand">
                    <span className="joe-brand-name" style={{ textTransform: 'none', letterSpacing: '-0.3px' }}>Joe</span>
                    <span className="joe-brand-tagline">{t('brandTagline', 'AI Software Engineer')}</span>
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
                    {onNewProject && (
                        <button className="joe-header-btn" onClick={onNewProject} title={t('newProject')} style={{ color: 'var(--joe-gold-primary)' }}>
                            <Plus size={18} />
                        </button>
                    )}
                </div>

                <div className="joe-header-divider"></div>

                {/* Modern account chip: just the avatar + a chevron. Everything
                    else (name, email, settings, theme, system management) lives
                    in the dropdown it opens. */}
                <div className="joe-user-profile" ref={menuRef} style={{ position: 'relative' }}>
                    <button
                        type="button"
                        className={`joe-user-trigger ${menuOpen ? 'open' : ''}`}
                        onClick={() => setMenuOpen(v => !v)}
                        title={displayName || email || undefined}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                    >
                        {photo && !photoBroken ? (
                            <img
                                src={photo}
                                alt={displayName}
                                className="joe-avatar"
                                referrerPolicy="no-referrer"
                                onError={() => setPhotoBroken(true)}
                            />
                        ) : (
                            <div
                                className="joe-avatar-placeholder"
                                aria-label={displayName}
                                style={{ background: `linear-gradient(135deg, ${id.color}, ${id.colorSoft})` }}
                            >
                                {initials || '—'}
                            </div>
                        )}
                        <ChevronDown size={14} className="joe-user-chevron" />
                    </button>

                    {menuOpen && (
                        <div className="joe-user-menu" role="menu">
                            <div className="joe-user-menu-head">
                                <div
                                    className="joe-avatar-placeholder"
                                    style={{ background: `linear-gradient(135deg, ${id.color}, ${id.colorSoft})`, width: 38, height: 38 }}
                                >
                                    {initials || '—'}
                                </div>
                                <div className="joe-user-menu-id">
                                    <span className="joe-user-menu-name">{displayName || t('sysNotLinked')}</span>
                                    {email && <span className="joe-user-menu-email">{email}</span>}
                                </div>
                                {roleLabel && <span className={`joe-role-badge ${roleClass}`}>{roleLabel}</span>}
                            </div>

                            <button className="joe-user-menu-item" role="menuitem"
                                onClick={() => { setMenuOpen(false); onSettingsClick?.(); }}>
                                <Settings size={16} />
                                <span>{t('settings')}</span>
                            </button>

                            {onThemeToggle && (
                                <button className="joe-user-menu-item" role="menuitem"
                                    onClick={() => { setMenuOpen(false); onThemeToggle(); }}>
                                    {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                                    <span>{theme === 'dark' ? t('themeLight', 'الوضع النهاري') : t('themeDark', 'الوضع الليلي')}</span>
                                </button>
                            )}

                            {isAdmin && (
                                <button className="joe-user-menu-item" role="menuitem"
                                    onClick={() => { setMenuOpen(false); onSystemClick?.(); }}>
                                    <Shield size={16} />
                                    <span>{t('systemManagement', 'إدارة النظام')}</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
