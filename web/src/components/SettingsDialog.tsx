import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Moon, Sun, Check, LogOut, X,
    Palette, Globe, Shield, ChevronLeft,
    Monitor, Smartphone
} from 'lucide-react';

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
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'ar', label: 'العربية', flag: '🇸🇦' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
    { code: 'ru', label: 'Русский', flag: '🇷🇺' },
    { code: 'es', label: 'Español', flag: '🇪🇸' }
];

type SettingsTab = 'appearance' | 'language' | 'account';

interface MenuItem {
    id: SettingsTab;
    icon: React.ReactNode;
    labelKey: string;
    labelFallback: string;
    descKey: string;
    descFallback: string;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({
    isOpen, onClose, theme, setTheme, lang, setLang, onLogout
}) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

    if (!isOpen) return null;

    const menuItems: MenuItem[] = [
        {
            id: 'appearance',
            icon: <Palette size={18} />,
            labelKey: 'appearance',
            labelFallback: 'المظهر',
            descKey: 'appearanceDesc',
            descFallback: 'الوضع النهاري والليلي'
        },
        {
            id: 'language',
            icon: <Globe size={18} />,
            labelKey: 'language',
            labelFallback: 'اللغة',
            descKey: 'languageDesc',
            descFallback: 'لغة واجهة المستخدم'
        },
        {
            id: 'account',
            icon: <Shield size={18} />,
            labelKey: 'account',
            labelFallback: 'الحساب',
            descKey: 'accountDesc',
            descFallback: 'إدارة الجلسة والخروج'
        }
    ];

    const currentLang = LANGUAGES.find(l => l.code === lang);

    const renderContent = () => {
        switch (activeTab) {
            case 'appearance':
                return (
                    <div className="stg-content-section stg-fade-in">
                        <div className="stg-content-header">
                            <Palette size={22} />
                            <div>
                                <h3>{t('appearance', 'المظهر العام')}</h3>
                                <p>{t('chooseTheme', 'اختر المظهر المناسب لك')}</p>
                            </div>
                        </div>
                        <div className="stg-theme-cards">
                            <button
                                className={`stg-theme-card ${theme === 'dark' ? 'active' : ''}`}
                                onClick={() => setTheme('dark')}
                            >
                                <div className="stg-theme-preview stg-theme-dark-preview">
                                    <div className="stg-preview-header" />
                                    <div className="stg-preview-body">
                                        <div className="stg-preview-sidebar" />
                                        <div className="stg-preview-content">
                                            <div className="stg-preview-line" />
                                            <div className="stg-preview-line short" />
                                        </div>
                                    </div>
                                </div>
                                <div className="stg-theme-info">
                                    <Moon size={16} />
                                    <span>{t('darkMode', 'الوضع الليلي')}</span>
                                    {theme === 'dark' && <Check size={14} className="stg-check" />}
                                </div>
                            </button>
                            <button
                                className={`stg-theme-card ${theme === 'light' ? 'active' : ''}`}
                                onClick={() => setTheme('light')}
                            >
                                <div className="stg-theme-preview stg-theme-light-preview">
                                    <div className="stg-preview-header" />
                                    <div className="stg-preview-body">
                                        <div className="stg-preview-sidebar" />
                                        <div className="stg-preview-content">
                                            <div className="stg-preview-line" />
                                            <div className="stg-preview-line short" />
                                        </div>
                                    </div>
                                </div>
                                <div className="stg-theme-info">
                                    <Sun size={16} />
                                    <span>{t('lightMode', 'الوضع النهاري')}</span>
                                    {theme === 'light' && <Check size={14} className="stg-check" />}
                                </div>
                            </button>
                        </div>
                        <div className="stg-option-row">
                            <div className="stg-option-label">
                                <Monitor size={16} />
                                <span>{t('currentTheme', 'المظهر الحالي')}</span>
                            </div>
                            <div className="stg-option-value stg-badge">
                                {theme === 'dark' ? '🌙 ' + t('darkMode', 'ليلي') : '☀️ ' + t('lightMode', 'نهاري')}
                            </div>
                        </div>
                    </div>
                );
            case 'language':
                return (
                    <div className="stg-content-section stg-fade-in">
                        <div className="stg-content-header">
                            <Globe size={22} />
                            <div>
                                <h3>{t('language', 'لغة الواجهة')}</h3>
                                <p>{t('chooseLang', 'اختر لغة واجهة المستخدم')}</p>
                            </div>
                        </div>
                        <div className="stg-lang-list">
                            {LANGUAGES.map(l => (
                                <button
                                    key={l.code}
                                    className={`stg-lang-item ${lang === l.code ? 'active' : ''}`}
                                    onClick={() => setLang(l.code)}
                                >
                                    <span className="stg-lang-flag">{l.flag}</span>
                                    <span className="stg-lang-name">{l.label}</span>
                                    {lang === l.code && (
                                        <div className="stg-lang-check">
                                            <Check size={14} />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                        <div className="stg-option-row">
                            <div className="stg-option-label">
                                <Smartphone size={16} />
                                <span>{t('currentLang', 'اللغة الحالية')}</span>
                            </div>
                            <div className="stg-option-value stg-badge">
                                {currentLang?.flag} {currentLang?.label}
                            </div>
                        </div>
                    </div>
                );
            case 'account':
                return (
                    <div className="stg-content-section stg-fade-in">
                        <div className="stg-content-header">
                            <Shield size={22} />
                            <div>
                                <h3>{t('account', 'الحساب والأمان')}</h3>
                                <p>{t('manageSession', 'إدارة جلستك الحالية')}</p>
                            </div>
                        </div>
                        <div className="stg-account-section">
                            <div className="stg-danger-zone">
                                <div className="stg-danger-label">
                                    <LogOut size={16} />
                                    <div>
                                        <span className="stg-danger-title">{t('logout', 'تسجيل الخروج')}</span>
                                        <span className="stg-danger-desc">{t('logoutDesc', 'سيتم مسح جلستك الحالية وتوجيهك لصفحة الدخول')}</span>
                                    </div>
                                </div>
                                <button className="stg-logout-btn" onClick={onLogout}>
                                    <LogOut size={16} />
                                    <span>{t('logout', 'خروج')}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="dialog-overlay" onClick={onClose}>
            <div className="stg-panel" onClick={(e) => e.stopPropagation()}>
                {/* Sidebar */}
                <div className="stg-sidebar">
                    <div className="stg-sidebar-header">
                        <span className="stg-sidebar-title">{t('settings', 'الإعدادات')}</span>
                        <button className="stg-close-btn" onClick={onClose}>
                            <X size={16} />
                        </button>
                    </div>
                    <nav className="stg-nav">
                        {menuItems.map(item => (
                            <button
                                key={item.id}
                                className={`stg-nav-item ${activeTab === item.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(item.id)}
                            >
                                <div className="stg-nav-icon">{item.icon}</div>
                                <div className="stg-nav-text">
                                    <span className="stg-nav-label">{t(item.labelKey, item.labelFallback)}</span>
                                    <span className="stg-nav-desc">{t(item.descKey, item.descFallback)}</span>
                                </div>
                                <ChevronLeft size={14} className="stg-nav-arrow" />
                            </button>
                        ))}
                    </nav>
                    <div className="stg-sidebar-footer">
                        <span className="stg-version">JOE v2.0</span>
                    </div>
                </div>

                {/* Content */}
                <div className="stg-content">
                    <div className="stg-content-scroll">
                        {renderContent()}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsDialog;
