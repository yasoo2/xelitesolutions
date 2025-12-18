import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, LogIn, Globe, ChevronDown } from 'lucide-react';

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
  const [isLangOpen, setIsLangOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.dataset.theme = theme;
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
      <div className="brand" onClick={() => nav('/')}>JOE</div>
      <div className="spacer" />
      
      <div className="topbar-actions">
        {/* Language Dropdown */}
        <div className="lang-dropdown" ref={langMenuRef}>
          <button 
            className={`lang-btn ${isLangOpen ? 'active' : ''}`}
            onClick={() => setIsLangOpen(!isLangOpen)}
            title={currentLangLabel}
          >
            <Globe size={20} />
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
            document.documentElement.classList.add('theme-switching');
            const next = theme === 'dark' ? 'light' : 'dark';
            setTheme(next);
            window.setTimeout(() => {
              document.documentElement.classList.remove('theme-switching');
            }, 300);
          }}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* Login Button */}
        <button className="login-btn" onClick={() => nav('/login')} title={t('login')}>
          <LogIn size={20} />
        </button>
      </div>
    </div>
  );
}
