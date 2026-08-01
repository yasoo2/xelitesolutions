import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Moon, Sun, Check, LogOut, X,
    Palette, Globe, Shield, ChevronLeft,
    Monitor, Smartphone, Mail, Activity, Terminal, Wand2
} from 'lucide-react';
import { API_URL } from '../config';
import SystemStatusPanel from './SystemStatusPanel';

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

type SettingsTab = 'status' | 'appearance' | 'language' | 'instructions' | 'account';

/** One-click preset: makes Joe use the terminal automatically while building. */
const TERMINAL_FIRST_PRESET = `منهجية إلزامية في كل مهمة بناء أو تطوير:
1) استخدم الطرفية تلقائياً في كل مرحلة: أنشئ مجلدات المشروع بأوامر حقيقية، وبعد كل مرحلة اعرض هيكل الملفات.
2) بعد كتابة أي ملف تحقق منه من الطرفية (اعرض حجمه وأول أسطره).
3) قبل إعلان أي إنجاز شغّل فحوصات حقيقية من الطرفية وأظهر نواتجها كاملة في تبويب Terminal.
4) إذا فشل أمر: اقرأ الخطأ، أصلح السبب، وأعد المحاولة — لا تتجاوز خطأً أبداً.
5) لا تقل «اكتمل العمل» إلا بعد نجاح كل الفحوصات، مع ملخص الأوامر التي نُفّذت.`;

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
    const [activeTab, setActiveTab] = useState<SettingsTab>('status');

    // Standing instructions travel with EVERY run (the composer reads this key
    // at send time), so what is written here shapes how Joe works permanently.
    const [instructions, setInstructions] = useState<string>(() => {
        try { return localStorage.getItem('system_instructions') || ''; } catch { return ''; }
    });
    const [instrSaved, setInstrSaved] = useState(false);
    const saveInstructions = (value: string) => {
        setInstructions(value);
        try { localStorage.setItem('system_instructions', value); } catch { }
        setInstrSaved(true);
        setTimeout(() => setInstrSaved(false), 1200);
    };

    if (!isOpen) return null;

    const menuItems: MenuItem[] = [
        {
            id: 'status',
            icon: <Activity size={18} />,
            labelKey: 'systemStatus',
            labelFallback: 'System status',
            descKey: 'systemStatusDesc',
            descFallback: 'A real, live check of every Joe subsystem'
        },
        {
            id: 'appearance',
            icon: <Palette size={18} />,
            labelKey: 'appearance',
            labelFallback: 'Appearance',
            descKey: 'appearanceDesc',
            descFallback: 'Light and dark mode'
        },
        {
            id: 'language',
            icon: <Globe size={18} />,
            labelKey: 'language',
            labelFallback: 'Interface language',
            descKey: 'languageDesc',
            descFallback: 'Interface language'
        },
        {
            id: 'instructions',
            icon: <Terminal size={18} />,
            labelKey: 'joeInstructions',
            labelFallback: 'Standing instructions',
            descKey: 'joeInstructionsDesc',
            descFallback: 'Rules Joe applies to every task'
        },
        {
            id: 'account',
            icon: <Shield size={18} />,
            labelKey: 'account',
            labelFallback: 'Account & security',
            descKey: 'accountDesc',
            descFallback: 'Manage your session and sign out'
        }
    ];

    const currentLang = LANGUAGES.find(l => l.code === lang);

    const renderContent = () => {
        switch (activeTab) {
            case 'status':
                return (
                    <div className="stg-content-section stg-fade-in">
                        <div className="stg-content-header">
                            <Activity size={22} />
                            <div>
                                <h3>{t('systemStatus', 'System status')}</h3>
                                <p>{t('systemStatusDesc', 'A real, live check of every Joe subsystem')}</p>
                            </div>
                        </div>
                        <SystemStatusPanel />
                    </div>
                );
            case 'appearance':
                return (
                    <div className="stg-content-section stg-fade-in">
                        <div className="stg-content-header">
                            <Palette size={22} />
                            <div>
                                <h3>{t('appearance', 'Appearance')}</h3>
                                <p>{t('chooseTheme', 'Choose the theme that suits you')}</p>
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
                                    <span>{t('darkMode', 'Dark mode')}</span>
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
                                    <span>{t('lightMode', 'Light mode')}</span>
                                    {theme === 'light' && <Check size={14} className="stg-check" />}
                                </div>
                            </button>
                        </div>
                        <div className="stg-option-row">
                            <div className="stg-option-label">
                                <Monitor size={16} />
                                <span>{t('currentTheme', 'Current theme')}</span>
                            </div>
                            <div className="stg-option-value stg-badge">
                                {theme === 'dark' ? `🌙 ${t('themeNight', 'Dark')}` : `☀️ ${t('themeDay', 'Light')}`}
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
                                <h3>{t('language', 'Interface language')}</h3>
                                <p>{t('chooseLang', 'Choose the interface language')}</p>
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
                                <span>{t('currentLang', 'Current language')}</span>
                            </div>
                            <div className="stg-option-value stg-badge">
                                {currentLang?.flag} {currentLang?.label}
                            </div>
                        </div>
                    </div>
                );
            case 'instructions':
                return (
                    <div className="stg-content-section stg-fade-in">
                        <div className="stg-content-header">
                            <Terminal size={22} />
                            <div>
                                <h3>{t('joeInstructions', 'Standing instructions')}</h3>
                                <p>{t('joeInstructionsDesc', 'Rules Joe applies to every task')}</p>
                            </div>
                        </div>
                        <textarea
                            value={instructions}
                            onChange={(e) => saveInstructions(e.target.value)}
                            placeholder={t('joeInstructionsPh', 'مثال: استخدم الطرفية في كل خطوة بناء، وتحقق من كل ملف بعد كتابته…')}
                            dir="auto"
                            style={{
                                width: '100%', minHeight: 190, resize: 'vertical',
                                background: 'var(--joe-bg-card, rgba(255,255,255,0.04))',
                                border: '1px solid var(--joe-border, rgba(255,255,255,0.1))',
                                borderRadius: 12, padding: '12px 14px',
                                color: 'var(--joe-text-primary, #eceef0)',
                                fontSize: 13.5, lineHeight: 1.8, fontFamily: 'inherit',
                                outline: 'none',
                            }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                            <button
                                onClick={() => saveInstructions(TERMINAL_FIRST_PRESET)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                                    border: '1px solid rgba(52,196,139,0.3)',
                                    background: 'rgba(52,196,139,0.1)',
                                    color: 'var(--joe-gold-primary, #34c48b)',
                                    fontSize: 12.5, fontWeight: 650, fontFamily: 'inherit',
                                }}
                            >
                                <Wand2 size={14} />
                                {t('presetTerminalFirst', 'استخدام الطرفية تلقائياً في كل بناء')}
                            </button>
                            {instructions && (
                                <button
                                    onClick={() => saveInstructions('')}
                                    style={{
                                        padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                                        border: '1px solid var(--joe-border, rgba(255,255,255,0.1))',
                                        background: 'transparent', color: 'var(--joe-text-muted)',
                                        fontSize: 12.5, fontFamily: 'inherit',
                                    }}
                                >
                                    {t('clearInstructions', 'مسح التعليمات')}
                                </button>
                            )}
                            <span style={{
                                fontSize: 12, color: 'var(--joe-gold-primary, #34c48b)',
                                opacity: instrSaved ? 1 : 0, transition: 'opacity 0.3s',
                                display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                                <Check size={13} /> {t('instrSaved', 'حُفظت — تُطبَّق على كل مهمة قادمة')}
                            </span>
                        </div>
                    </div>
                );
            case 'account':
                return (
                    <div className="stg-content-section stg-fade-in">
                        <div className="stg-content-header">
                            <Shield size={22} />
                            <div>
                                <h3>{t('account', 'Account & security')}</h3>
                                <p>{t('manageSession', 'Manage your current session')}</p>
                            </div>
                        </div>
                        <div className="stg-account-section">
                            <GoogleConnect t={t} />
                            <div className="stg-danger-zone">
                                <div className="stg-danger-label">
                                    <LogOut size={16} />
                                    <div>
                                        <span className="stg-danger-title">{t('logout', 'Log out')}</span>
                                        <span className="stg-danger-desc">{t('logoutDesc', 'Your current session will be cleared and you will be sent to the login page')}</span>
                                    </div>
                                </div>
                                <button className="stg-logout-btn" onClick={onLogout}>
                                    <LogOut size={16} />
                                    <span>{t('logout', 'Log out')}</span>
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
                        <span className="stg-sidebar-title">{t('settings', 'Settings')}</span>
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
        // Reuse the ONE unified Google flow (identity + account scopes in a single
        // consent). After consent it returns to /login#token=… which stores the
        // session; the account tokens are stored server-side in the same step.
        window.location.href = `${API_URL}/auth/google?returnTo=${encodeURIComponent(window.location.origin)}`;
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
                    <div style={{ fontWeight: 600 }}>{t('googleAccount', 'Google account')}</div>
                    <div style={{ fontSize: 12, opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {!status.configured
                            ? t('googleNotConfigured', 'Google credentials are not configured yet (GOOGLE_CLIENT_ID/SECRET)')
                            : status.connected
                                ? `${t('connectedAs', 'Connected as')} ${status.email || ''}`
                                : t('googleConnectDesc', 'Connect your account so Joe can act on your mail, calendar and files')}
                    </div>
                </div>
                {status.configured && (status.connected
                    ? <button className="stg-logout-btn" disabled={busy} onClick={disconnect} style={{ whiteSpace: 'nowrap' }}>{t('disconnect', 'Disconnect')}</button>
                    : <button className="stg-logout-btn" onClick={connect} style={{ whiteSpace: 'nowrap', background: '#1a73e8', color: '#fff' }}>{t('connectGoogle', 'Connect Google')}</button>)}
            </div>
        </div>
    );
};

export default SettingsDialog;
