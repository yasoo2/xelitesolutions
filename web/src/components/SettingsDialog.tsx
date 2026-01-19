import React from 'react';
import { useTranslation } from 'react-i18next';
import { Moon, Sun, Globe, Check } from 'lucide-react';

interface SettingsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    theme: 'dark' | 'light';
    setTheme: (theme: 'dark' | 'light') => void;
    lang: string;
    setLang: (lang: string) => void;
}

const LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'ar', label: 'العربية' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'ru', label: 'Русский' },
    { code: 'es', label: 'Español' }
];

const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose, theme, setTheme, lang, setLang }) => {
    const { t } = useTranslation();

    if (!isOpen) return null;

    return (
        <div className="dialog-overlay" onClick={onClose}>
            <div className="dialog-box settings-dialog" onClick={(e) => e.stopPropagation()}>
                <h3>{t('settings', 'Settings')}</h3>

                <div className="settings-section">
                    <h4>{t('appearance', 'Appearance')}</h4>
                    <div className="theme-toggles">
                        <button
                            className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
                            onClick={() => setTheme('light')}
                        >
                            <Sun size={20} />
                            <span>{t('lightMode', 'Light')}</span>
                            {theme === 'light' && <Check size={16} className="check" />}
                        </button>
                        <button
                            className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
                            onClick={() => setTheme('dark')}
                        >
                            <Moon size={20} />
                            <span>{t('darkMode', 'Dark')}</span>
                            {theme === 'dark' && <Check size={16} className="check" />}
                        </button>
                    </div>
                </div>

                <div className="settings-section">
                    <h4>{t('language', 'Language')}</h4>
                    <div className="lang-grid">
                        {LANGUAGES.map(l => (
                            <button
                                key={l.code}
                                className={`lang-option-btn ${lang === l.code ? 'active' : ''}`}
                                onClick={() => setLang(l.code)}
                            >
                                <span className="lang-name">{l.label}</span>
                                {lang === l.code && <Check size={14} />}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="dialog-actions">
                    <button onClick={onClose} className="btn btn-primary">{t('done', 'Done')}</button>
                </div>
            </div>
        </div>
    );
};

export default SettingsDialog;
