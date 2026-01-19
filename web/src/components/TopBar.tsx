import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, LogIn, LogOut, Globe, ChevronDown, LayoutDashboard, User, Settings, Shield } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import ProfileDialog from './ProfileDialog';
import SettingsDialog from './SettingsDialog';
import './UserMenu.css';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ru', label: 'Русский' },
  { code: 'es', label: 'Español' }
];

export default function TopBar() {
  const { i18n, t } = useTranslation();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('theme') as any) || 'dark');
  const [lang, setLang] = useState<string>(() => localStorage.getItem('lang') || 'en');

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isConfirmLogoutOpen, setIsConfirmLogoutOpen] = useState(false);

  const [user, setUser] = useState<any>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({
          name: payload.name || 'User',
          email: payload.email || 'user@example.com',
          role: payload.role || 'USER',
          picture: payload.picture
        });
      } else {
        setUser(null);
      }
    } catch (e) {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.dataset.theme = theme;
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('lang', lang);
    i18n.changeLanguage(lang);
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  }, [lang, i18n]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="topbar">
      <div className="brand brand-artifact" onClick={() => nav('/')} style={{ cursor: 'pointer' }}>
        <div className="brand-text-3d">JOE</div>
        <div className="brand-ai-badge">AI</div>
      </div>
      <div className="spacer" />

      <div className="topbar-actions">
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
