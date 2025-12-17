import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';

export default function TopBar() {
  const { i18n, t } = useTranslation();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('theme') as any) || 'dark');
  const [lang, setLang] = useState<string>(() => localStorage.getItem('lang') || 'en');
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

  return (
    <div className="topbar">
      <div className="brand" onClick={() => nav('/')}>JOE</div>
      <div className="spacer" />
      <button className="btn btn-yellow" onClick={() => nav('/login')}>{t('login')}</button>
      <select value={lang} onChange={(e) => setLang(e.target.value)} className="select">
        <option value="en">English</option>
        <option value="ar">العربية</option>
        <option value="fr">Français</option>
        <option value="de">Deutsch</option>
        <option value="ru">Русский</option>
        <option value="es">Español</option>
      </select>
      <button
        className="btn btn-icon"
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
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </div>
  );
}
