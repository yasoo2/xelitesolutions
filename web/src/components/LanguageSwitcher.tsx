import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe } from 'lucide-react';
import { useState } from 'react';

export default function LanguageSwitcher() {
    const { i18n } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);

    const changeLanguage = (lang: string) => {
        i18n.changeLanguage(lang);
        setIsOpen(false);
    };

    const currentLang = i18n.language || 'en';

    const languages = [
        { code: 'en', label: 'English', flag: '🇺🇸' },
        { code: 'ar', label: 'العربية', flag: '🇸🇦' },
        { code: 'fr', label: 'Français', flag: '🇫🇷' },
        { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
        { code: 'ru', label: 'Русский', flag: '🇷🇺' },
    ];

    return (
        <div style={{ position: 'fixed', top: 24, left: 24, zIndex: 1000, fontFamily: 'Inter, sans-serif' }}>
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    background: 'rgba(0, 0, 0, 0.6)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    padding: '8px 12px',
                    display: 'flex', alignItems: 'center', gap: 8,
                    cursor: 'pointer', color: '#fff', fontSize: '14px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
            >
                <Globe size={16} />
                <span style={{ textTransform: 'uppercase' }}>{currentLang}</span>
            </motion.button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        style={{
                            position: 'absolute', top: '100%', left: 0, marginTop: 8,
                            background: 'rgba(24, 24, 27, 0.95)',
                            backdropFilter: 'blur(16px)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '12px',
                            padding: '6px',
                            display: 'flex', flexDirection: 'column', gap: 4,
                            minWidth: '140px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                        }}
                    >
                        {languages.map((lang) => (
                            <button
                                key={lang.code}
                                onClick={() => changeLanguage(lang.code)}
                                style={{
                                    background: currentLang === lang.code ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                                    color: currentLang === lang.code ? '#f59e0b' : '#a1a1aa',
                                    border: 'none', borderRadius: '8px',
                                    padding: '8px 12px',
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    cursor: 'pointer', fontSize: '13px',
                                    textAlign: 'left', width: '100%',
                                    fontWeight: currentLang === lang.code ? 600 : 400
                                }}
                            >
                                <span>{lang.flag}</span>
                                <span>{lang.label}</span>
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
