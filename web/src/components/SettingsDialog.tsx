import React from 'react';
import { useTranslation } from 'react-i18next';
import { Moon, Sun, Globe, Check, LogOut } from 'lucide-react';

interface SettingsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    theme: 'dark' | 'light';
    setTheme: (theme: 'dark' | 'light') => void;
    lang: string;
    setLang: (lang: string) => void;
    onLogout?: () => void;
}

const LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'ar', label: 'العربية' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'ru', label: 'Русский' },
    { code: 'es', label: 'Español' }
];

const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose, theme, setTheme, lang, setLang, onLogout }) => {
    const { t } = useTranslation();

    if (!isOpen) return null;

    return (
        <div className="dialog-overlay" onClick={onClose}>
            <div className="dialog-box settings-dialog" onClick={(e) => e.stopPropagation()}>
                <h3>{t('settings', 'خيارات النظام')}</h3>

                <div className="settings-section">
                    <h4>{t('appearance', 'المظهر العام')}</h4>
                    <div className="theme-toggles">
                        <button
                            className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
                            onClick={() => setTheme('light')}
                        >
                            <Sun size={24} />
                            <span>{t('lightMode', 'الوضع النهاري')}</span>
                            {theme === 'light' && <Check size={16} className="check" />}
                        </button>
                        <button
                            className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
                            onClick={() => setTheme('dark')}
                        >
                            <Moon size={24} />
                            <span>{t('darkMode', 'الوضع الليلي')}</span>
                            {theme === 'dark' && <Check size={16} className="check" />}
                        </button>
                    </div>
                </div>

                <div className="settings-section">
                    <h4>{t('language', 'لغة الواجهة')}</h4>
                    <div className="lang-grid">
                        {LANGUAGES.map(l => (
                            <button
                                key={l.code}
                                className={`lang-option-btn ${lang === l.code ? 'active' : ''}`}
                                onClick={() => setLang(l.code)}
                            >
                                <span className="lang-name">{l.label}</span>
                                {lang === l.code && <Check size={14} className="check-icon" />}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="settings-section">
                    <h4>{t('account', 'الحساب والنظام')}</h4>
                    <button className="logout-btn-premium" onClick={onLogout}>
                        <LogOut size={18} />
                        <span>{t('logout', 'تسجيل الخروج')}</span>
                    </button>
                </div>

                <div className="dialog-actions">
                    <button onClick={onClose} className="btn btn-primary">{t('done', 'تم الحفظ')}</button>
                </div>
            </div>
        </div>
    );
};

export default SettingsDialog;
