/**
 * ProjectOnboardingModal - A premium onboarding experience for first-time Joe users.
 * Redesigned for a stunning, high-end "WOW" factor.
 */
import React from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
    Monitor,
    Github,
    Sparkles,
    ArrowRight,
    Zap,
    Shield,
    Globe,
    ArrowUpRight
} from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSelectLocal: () => void;
    onSelectGitHub: () => void;
}

const ProjectOnboardingModal: React.FC<Props> = ({ isOpen, onClose, onSelectLocal, onSelectGitHub }) => {
    const { t } = useTranslation();

    if (!isOpen) return null;

    // Simplified precise variants
    const itemVariants: Variants = {
        hidden: { opacity: 0, y: 10 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { type: "tween", duration: 0.3, ease: "easeOut" }
        }
    };

    return (
        <AnimatePresence>
            <div className="dialog-overlay" onClick={onClose} style={{ backdropFilter: 'blur(12px)', background: 'rgba(0,0,0,0.85)' }}>
                <motion.div
                    className="dialog-box onboarding-modal"
                    onClick={(e) => e.stopPropagation()}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.25 }}
                >
                    {/* Header - Refined Technical */}
                    <div className="onboarding-header">
                        <motion.div className="onboarding-badge" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <Sparkles size={12} />
                            <span>{t('onboardingWelcome', 'أهلاً بك في JOE')}</span>
                        </motion.div>
                        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: '#fff', letterSpacing: '-0.01em' }}>
                            {t('onboardingTitle', 'تهيئة المشروع')}
                        </h2>
                        <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--joe-text-secondary)', opacity: 0.7, maxWidth: '400px', marginInline: 'auto', lineHeight: '1.5' }}>
                            {t('onboardingSubtitle', 'اختر بيئة العمل المناسبة للبدء في بناء تطبيقك.')}
                        </p>
                    </div>

                    {/* Options Stack - Clean & Technical */}
                    <div style={{ padding: '0 32px 32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {/* Local Option */}
                        <motion.div
                            className="onboarding-option-card"
                            variants={itemVariants}
                            initial="hidden"
                            animate="visible"
                            onClick={onSelectLocal}
                        >
                            <div className="onboarding-card-icon" style={{ color: '#3b82f6' }}>
                                <Monitor size={24} />
                            </div>
                            <div className="onboarding-card-content">
                                <h3 className="onboarding-card-title">{t('onboardingLocal', 'بيئة محلية')}</h3>
                                <p className="onboarding-card-desc">{t('onboardingLocalDesc', 'البدء مباشرة على جهازك الحالي.')}</p>
                            </div>
                            <div className="onboarding-card-tag" style={{ color: '#3b82f6' }}>{t('onboardingFast', 'سريع')}</div>
                            <ArrowUpRight size={16} style={{ opacity: 0.3 }} />
                        </motion.div>

                        {/* GitHub Option */}
                        <motion.div
                            className="onboarding-option-card"
                            variants={itemVariants}
                            initial="hidden"
                            animate="visible"
                            transition={{ delay: 0.1 }}
                            onClick={onSelectGitHub}
                        >
                            <div className="onboarding-card-icon" style={{ color: 'var(--joe-gold-primary)' }}>
                                <Github size={24} />
                            </div>
                            <div className="onboarding-card-content">
                                <h3 className="onboarding-card-title">{t('onboardingGitHub', 'مستودع GitHub')}</h3>
                                <p className="onboarding-card-desc">{t('onboardingGitHubDesc', 'ربط المشروع بمستودع خارجي للمزامنة.')}</p>
                            </div>
                            <div className="onboarding-card-tag" style={{ color: 'var(--joe-gold-primary)' }}>{t('onboardingPro', 'احترافي')}</div>
                            <ArrowUpRight size={16} style={{ opacity: 0.3 }} />
                        </motion.div>
                    </div>

                    {/* Minimal Footer */}
                    <div className="onboarding-footer">
                        <div className="onboarding-feature-item">
                            <Zap size={14} />
                            <span>AI Integration</span>
                        </div>
                        <div className="onboarding-feature-item">
                            <Shield size={14} />
                            <span>Secure</span>
                        </div>
                    </div>

                    {/* Setup Later */}
                    <div style={{ paddingBottom: '32px', textAlign: 'center' }}>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--joe-text-muted)',
                                fontSize: '11px',
                                cursor: 'pointer',
                                opacity: 0.6
                            }}
                        >
                            {t('onboardingSkip', 'تجهيز لاحقاً')}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};


export default ProjectOnboardingModal;
