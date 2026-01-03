import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, LogIn, LogOut, Globe, ChevronDown } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ru', label: 'Русский' },
  { code: 'es', label: 'Español' }
];

// Corresponds to Section 3 (Core Product) and Section 4 (Internationalization) of the JOE MASTER SPEC
// Provides global navigation, theme switching, and language selection.
export default function TopBar() {
  const { i18n, t } = useTranslation();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('theme') as any) || 'dark');
  const [lang, setLang] = useState<string>(() => localStorage.getItem('lang') || 'en');
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

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
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setIsLangOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLangLabel = LANGUAGES.find(l => l.code === lang)?.label || 'English';

  return (
    <div className="topbar">
      <div className="brand" onClick={() => nav('/')}>
        <span>J</span>
        <span className="logo-letter-yellow">O</span>
        <span>E</span>
      </div>
      <div className="spacer" />
      
      <div className="topbar-actions">
        
        {/* Language Dropdown */}
        <div className="lang-dropdown" ref={langMenuRef}>
          <button 
            className={`lang-btn ${isLangOpen ? 'active' : ''}`}
            onClick={() => setIsLangOpen(!isLangOpen)}
          >
            <Globe size={20} />
            <span className="lang-label">{currentLangLabel}</span>
            <ChevronDown size={16} className={`chevron ${isLangOpen ? 'open' : ''}`} />
          </button>
          
          {isLangOpen && (
            <div className="lang-menu">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  className={`lang-option ${lang === l.code ? 'active' : ''}`}
                  onClick={() => {
                    setLang(l.code);
                    setIsLangOpen(false);
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <button
          className="action-btn"
          aria-label={t('toggleTheme')}
          title={t('toggleTheme')}
          onClick={() => {
            const next = theme === 'dark' ? 'light' : 'dark';
            setTheme(next);
          }}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* Login/Logout Button */}
        <button 
          className="action-btn"
          onClick={() => {
            if (localStorage.getItem('token')) {
              setIsConfirmOpen(true);
            } else {
                nav('/login');
            }
          }} 
          title={localStorage.getItem('token') ? t('logout', 'Logout') : t('login')}
        >
          {localStorage.getItem('token') ? <LogOut size={20} /> : <LogIn size={20} />}
        </button>
      </div>
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          localStorage.removeItem('token');
          setIsConfirmOpen(false);
          nav('/login');
        }}
        title={t('confirmLogout', 'Confirm Logout')}
        message={t('areYouSureLogout', 'Are you sure you want to logout?')}
      />
    </div>
  );
}
