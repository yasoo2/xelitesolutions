import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUiDir } from '../components/NeuralTraceView';

const SERVICES = [
    { titleKey: 'land_svcWebTitle', descKey: 'land_svcWebDesc', icon: '🌐' },
    { titleKey: 'land_svcMobileTitle', descKey: 'land_svcMobileDesc', icon: '📱' },
    { titleKey: 'land_svcAiTitle', descKey: 'land_svcAiDesc', icon: '🤖' },
    { titleKey: 'land_svcEnterpriseTitle', descKey: 'land_svcEnterpriseDesc', icon: '🏢' },
];
const FOUNDED = 2024;

export default function LandingPage() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const uiDir = useUiDir();

    return (
        <div className="landing-page" dir={uiDir} style={{
            backgroundColor: 'var(--bg-dark)',
            color: 'var(--text-primary)',
            minHeight: '100vh',
            fontFamily: 'Inter, system-ui, sans-serif'
        }}>
            {/* Hero Section */}
            <section className="hero" style={{
                position: 'relative',
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                textAlign: 'center'
            }}>
                <div className="hero-background" style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundImage: 'url("/branding/hero.png")',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    opacity: 0.4,
                    filter: 'blur(2px)'
                }} />
                <div className="hero-overlay" style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    background: 'radial-gradient(circle at center, transparent, var(--bg-dark))'
                }} />

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="hero-content"
                    style={{ position: 'relative', zIndex: 2, padding: '0 20px' }}>
                    <h1 style={{
                        fontSize: 'max(4rem, 10vw)',
                        fontWeight: 900,
                        margin: '0 0 10px',
                        background: 'var(--brand-gradient)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        letterSpacing: '-4px'
                    }}>
                        XELITE
                    </h1>
                    <h2 style={{ fontSize: '1.5rem', color: 'var(--accent-secondary)', fontWeight: 400, opacity: 0.8 }}>
                        {t('land_tagline')}
                    </h2>
                    <p style={{ maxWidth: '600px', margin: '40px auto', fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
                        {t('land_heroText')}
                    </p>
                    <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => navigate('/joe')}
                            style={{
                                background: 'var(--accent-primary)',
                                color: '#000',
                                border: 'none',
                                padding: '16px 40px',
                                borderRadius: '50px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                fontSize: '1.1rem',
                                boxShadow: '0 0 20px var(--accent-glow)'
                            }}>
                            {t('land_launchJoe')}
                        </motion.button>
                        <motion.button
                            whileHover={{ scale: 1.05, border: '1px solid var(--accent-primary)' }}
                            style={{
                                background: 'transparent',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-color)',
                                padding: '16px 40px',
                                borderRadius: '50px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                fontSize: '1.1rem'
                            }}>
                            {t('land_ourServices')}
                        </motion.button>
                    </div>
                </motion.div>
            </section>

            {/* Services Grid */}
            <section className="services" style={{ padding: '100px 20px', maxWidth: '1200px', margin: '0 auto' }}>
                <h3 style={{ fontSize: '2.5rem', marginBottom: '60px', textAlign: 'center' }}>{t('land_expertise')}</h3>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '30px'
                }}>
                    {SERVICES.map((s, i) => (
                        <motion.div
                            key={i}
                            whileHover={{ y: -10 }}
                            style={{
                                background: 'var(--bg-card)',
                                padding: '40px',
                                borderRadius: '20px',
                                border: '1px solid var(--border-color)',
                                transition: 'border-color 0.3s ease'
                            }}>
                            <div style={{ fontSize: '3rem', marginBottom: '20px' }}>{s.icon}</div>
                            <h4 style={{ fontSize: '1.5rem', marginBottom: '15px', color: 'var(--accent-primary)' }}>{t(s.titleKey)}</h4>
                            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{t(s.descKey)}</p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* About / Contact Footer */}
            <footer style={{
                padding: '100px 20px',
                borderTop: '1px solid var(--border-color)',
                background: 'linear-gradient(to bottom, transparent, rgba(52, 196, 139, 0.02))'
            }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'center' }}>
                    <h2 style={{ fontSize: '2rem', marginBottom: '20px' }}>{t('land_readyToScale')}</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '40px' }}>
                        {t('land_founded', { year: FOUNDED })}
                    </p>
                    <div dir="ltr" style={{ color: 'var(--text-muted)' }}>
                        info@xelitesoftwaresolutions.com | +94 76 844 9758
                    </div>
                    <div style={{ marginTop: '60px', opacity: 0.5, fontSize: '0.9rem' }}>
                        {t('land_copyright', { year: FOUNDED })}
                    </div>
                </div>
            </footer>
        </div >
    );
}
