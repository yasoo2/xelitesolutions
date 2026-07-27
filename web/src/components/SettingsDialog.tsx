import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Moon, Sun, Check, LogOut, X,
    Palette, Globe, Shield, ChevronLeft,
    Monitor, Smartphone, Mail
} from 'lucide-react';
import { API_URL } from '../config';

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
                            <GoogleConnect t={t} />
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

/** Connect / disconnect the user's Google account (Gmail, Calendar, Drive) via
 *  the standard OAuth flow. Joe then acts in the account through official APIs. */
const GoogleConnect: React.FC<{ t: (k: string, f: string) => string }> = ({ t }) => {
    const [status, setStatus] = useState<{ configured: boolean; connected: boolean; email?: string | null } | null>(null);
    const [busy, setBusy] = useState(false);

    const token = () => localStorage.getItem('token') || '';
    const load = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/oauth/google/status`, { headers: { Authorization: `Bearer ${token()}` } });
            const d = await res.json();
            setStatus({ configured: !!d.configured, connected: !!d.connected, email: d.email });
        } catch { setStatus({ configured: false, connected: false }); }
    }, []);

    useEffect(() => {
        load();
        // Reflect the ?google=connected redirect param, then clean the URL.
        const p = new URLSearchParams(window.location.search);
        if (p.get('google')) { setTimeout(load, 300); const u = new URL(window.location.href); u.searchParams.delete('google'); u.searchParams.delete('email'); window.history.replaceState({}, '', u.toString()); }
    }, [load]);

    const connect = () => {
        // Full-page navigation to the OAuth start (pass the token so the server can
        // attribute the connection to this user even without a header).
        window.location.href = `${API_URL}/oauth/google/start?token=${encodeURIComponent(token())}`;
    };
    const disconnect = async () => {
        setBusy(true);
        try { await fetch(`${API_URL}/oauth/google/disconnect`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` } }); } catch { /* ignore */ }
        setBusy(false); load();
    };

    if (!status) return null;

    return (
        <div className="stg-google-connect" style={{ border: '1px solid var(--joe-border, rgba(255,255,255,0.1))', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Mail size={20} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{t('googleAccount', 'حساب Google')}</div>
                    <div style={{ fontSize: 12, opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {!status.configured
                            ? t('googleNotConfigured', 'لم تُضبط بيانات Google بعد (GOOGLE_CLIENT_ID/SECRET)')
                            : status.connected
                                ? `${t('connectedAs', 'متصل باسم')} ${status.email || ''}`
                                : t('googleConnectDesc', 'اربط حسابك ليتصرّف جو في بريدك وتقويمك وملفاتك')}
                    </div>
                </div>
                {status.configured && (status.connected
                    ? <button className="stg-logout-btn" disabled={busy} onClick={disconnect} style={{ whiteSpace: 'nowrap' }}>{t('disconnect', 'فصل')}</button>
                    : <button className="stg-logout-btn" onClick={connect} style={{ whiteSpace: 'nowrap', background: '#1a73e8', color: '#fff' }}>{t('connectGoogle', 'ربط Google')}</button>)}
            </div>
        </div>
    );
};

export default SettingsDialog;
