import { WorkspaceSelector } from './WorkspaceSelector';

export default function TopBar() {
  const { i18n, t } = useTranslation();
  // ... (existing state)

  // ... (existing effects)

  return (
    <div className="topbar">
      <div className="brand brand-artifact" onClick={() => nav('/')} style={{ cursor: 'pointer' }}>
        <div className="brand-text-3d">JOE</div>
        <div className="brand-ai-badge">AI</div>
      </div>

      {user && <WorkspaceSelector />}

      <div className="spacer" />

      <div className="topbar-actions">
        {/* Theme Toggle Button */}
        <button
          className="action-btn theme-toggle-btn"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? t('lightMode', 'Light Mode') : t('darkMode', 'Dark Mode')}
          style={{ marginRight: '8px' }}
        >
          {theme === 'dark' ? <Moon size={20} className="theme-icon moon" /> : <Sun size={20} className="theme-icon sun" />}
        </button>

        {/* Admin Dashboard Link */}
        {user?.role === 'OWNER' && (
          <button
            className="action-btn"
            onClick={() => window.open('/dashboard', '_blank')}
            title="Admin Dashboard"
          >
            <LayoutDashboard size={20} />
          </button>
        )}

        {user ? (
          <div className="user-menu-container" ref={userMenuRef}>
            <button
              className="user-menu-btn"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            >
              <div className="user-avatar-small">
                {user.picture ? (
                  <img src={user.picture} alt={user.name} />
                ) : (
                  <User size={20} />
                )}
              </div>
              <ChevronDown size={14} className={`chevron ${isUserMenuOpen ? 'open' : ''}`} />
            </button>

            {isUserMenuOpen && (
              <div className="dropdown-menu">
                <div className="dropdown-header">
                  <span className="user-name">{user.name}</span>
                  <span className="user-role">{user.role}</span>
                </div>
                <div className="dropdown-divider" />

                <button className="dropdown-item" onClick={() => { setIsProfileOpen(true); setIsUserMenuOpen(false); }}>
                  <User size={16} />
                  <span>{t('profile', 'Profile')}</span>
                </button>

                <button className="dropdown-item" onClick={() => { setIsSettingsOpen(true); setIsUserMenuOpen(false); }}>
                  <Settings size={16} />
                  <span>{t('settings', 'Settings')}</span>
                </button>

                <div className="dropdown-divider" />

                <button className="dropdown-item danger" onClick={() => { setIsConfirmLogoutOpen(true); setIsUserMenuOpen(false); }}>
                  <LogOut size={16} />
                  <span>{t('logout', 'Logout')}</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            className="action-btn"
            onClick={() => nav('/login')}
            title={t('login')}
          >
            <LogIn size={20} />
          </button>
        )}
      </div>

      {user && (
        <>
          <ProfileDialog
            isOpen={isProfileOpen}
            onClose={() => setIsProfileOpen(false)}
            user={user}
          />
          <SettingsDialog
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            theme={theme}
            setTheme={setTheme}
            lang={lang}
            setLang={setLang}
          />
          <ConfirmDialog
            isOpen={isConfirmLogoutOpen}
            onClose={() => setIsConfirmLogoutOpen(false)}
            onConfirm={() => {
              localStorage.removeItem('token');
              setIsConfirmLogoutOpen(false);
              nav('/login');
            }}
            title={t('confirmLogout', 'Confirm Logout')}
            message={t('areYouSureLogout', 'Are you sure you want to logout?')}
          />
        </>
      )}
    </div>
  );
}
