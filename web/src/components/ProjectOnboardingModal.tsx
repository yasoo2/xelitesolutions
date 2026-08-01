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
            {/* The scrim is a token so light mode gets a navy veil instead of a
                near-black one; the inline background here used to win over it. */}
            <div className="dialog-overlay" onClick={onClose} style={{ backdropFilter: 'blur(12px)' }}>
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
                            <span>{t('onboardingWelcome', 'Welcome to JOE')}</span>
                        </motion.div>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 650, color: 'var(--joe-text-primary)', letterSpacing: '-0.01em' }}>
                            {t('onboardingTitle', 'Project setup')}
                        </h2>
                        <p style={{ marginTop: '5px', fontSize: '12px', color: 'var(--joe-text-secondary)', opacity: 0.7, maxWidth: '320px', marginInline: 'auto', lineHeight: '1.5' }}>
                            {t('onboardingSubtitle', 'Choose the workspace to start building your app.')}
                        </p>
                    </div>

                    {/* Options Stack - Clean & Technical */}
                    <div style={{ padding: '0 20px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {/* Local Option */}
                        <motion.div
                            className="onboarding-option-card"
                            variants={itemVariants}
                            initial="hidden"
                            animate="visible"
                            onClick={onSelectLocal}
                        >
                            <div className="onboarding-card-icon" style={{ color: '#3b82f6' }}>
                                <Monitor size={19} />
                            </div>
                            <div className="onboarding-card-content">
                                <h3 className="onboarding-card-title">{t('onboardingLocal', 'Local environment')}</h3>
                                <p className="onboarding-card-desc">{t('onboardingLocalDesc', 'Start straight away on this machine.')}</p>
                            </div>
                            <div className="onboarding-card-tag" style={{ color: '#3b82f6' }}>{t('onboardingFast', 'Fast')}</div>
                            <ArrowUpRight size={14} style={{ opacity: 0.3, flexShrink: 0 }} />
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
                                <Github size={19} />
                            </div>
                            <div className="onboarding-card-content">
                                <h3 className="onboarding-card-title">{t('onboardingGitHub', 'GitHub repository')}</h3>
                                <p className="onboarding-card-desc">{t('onboardingGitHubDesc', 'Link the project to an external repository for syncing.')}</p>
                            </div>
                            <div className="onboarding-card-tag" style={{ color: 'var(--joe-gold-primary)' }}>{t('onboardingProShort', 'Pro')}</div>
                            <ArrowUpRight size={14} style={{ opacity: 0.3, flexShrink: 0 }} />
                        </motion.div>
                    </div>

                    {/* One slim row: feature chips + skip, instead of two tall footers */}
                    <div className="onboarding-footer">
                        <div className="onboarding-feature-item">
                            <Zap size={12} />
                            <span>AI Integration</span>
                        </div>
                        <div className="onboarding-feature-item">
                            <Shield size={12} />
                            <span>Secure</span>
                        </div>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--joe-text-muted)',
                                fontSize: '10.5px',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                textUnderlineOffset: '3px',
                                padding: 0,
                            }}
                        >
                            {t('onboardingSkip', 'Set up later')}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};


export default ProjectOnboardingModal;
