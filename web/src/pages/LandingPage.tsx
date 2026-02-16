import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
    const navigate = useNavigate();

    const services = [
        {
            title: 'Web Development',
            desc: 'High-performance React & Next.js applications tailored for scale.',
            icon: '🌐'
        },
        {
            title: 'Mobile Apps',
            desc: 'Seamless iOS and Android experiences with React Native.',
            icon: '📱'
        },
        {
            title: 'AI Solutions',
            desc: 'Custom LLM integrations and autonomous agent architectures.',
            icon: '🤖'
        },
        {
            title: 'Enterprise IT',
            desc: 'Robust cloud infrastructure and scalable backend systems.',
            icon: '🏢'
        }
    ];

    return (
        <div className="landing-page" style={{
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
                        SOFTWARE SOLUTIONS & AI EXCELLENCE
                    </h2>
                    <p style={{ maxWidth: '600px', margin: '40px auto', fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
                        Empowering businesses in the digital landscape with customized IT services, high-end design, and autonomous intelligence.
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
                            Launch Joe
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
                            Our Services
                        </motion.button>
                    </div>
                </motion.div>
            </section>

            {/* Services Grid */}
            <section className="services" style={{ padding: '100px 20px', maxWidth: '1200px', margin: '0 auto' }}>
                <h3 style={{ fontSize: '2.5rem', marginBottom: '60px', textAlign: 'center' }}>Expertise That Defines XElite</h3>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '30px'
                }}>
                    {services.map((s, i) => (
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
                            <h4 style={{ fontSize: '1.5rem', marginBottom: '15px', color: 'var(--accent-primary)' }}>{s.title}</h4>
                            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{s.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* About / Contact Footer */}
            <footer style={{
                padding: '100px 20px',
                borderTop: '1px solid var(--border-color)',
                background: 'linear-gradient(to bottom, transparent, rgba(240, 185, 11, 0.02))'
            }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'center' }}>
                    <h2 style={{ fontSize: '2rem', marginBottom: '20px' }}>Ready to Scale?</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '40px' }}>
                        Founded in 2024, XElite continues to push the boundaries of IT automation.
                    </p>
                    <div style={{ color: 'var(--text-muted)' }}>
                        info@xelitesoftwaresolutions.com | +94 76 844 9758
                    </div>
                    <div style={{ marginTop: '60px', opacity: 0.5, fontSize: '0.9rem' }}>
                        &copy; 2024 XElite Software Solutions. All rights reserved.
                    </div>
                </div>
            </footer>
        </div >
    );
}
