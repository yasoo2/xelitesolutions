import React from 'react';
import { motion } from 'framer-motion';
import { Github, Globe, Cpu, Rocket, ArrowRight, Shield, Zap, Layout } from 'lucide-react';

const JoeWelcome: React.FC = () => {
    return (
        <div style={{
            minHeight: '100vh',
            background: 'radial-gradient(circle at top right, #1a1a2e 0%, #0d0d12 100%)',
            color: '#fff',
            fontFamily: '"Inter", system-ui, sans-serif',
            overflow: 'hidden',
            position: 'relative'
        }}>
            {/* Animated Background Orbs */}
            <motion.div
                animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.5, 0.3],
                }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                style={{
                    position: 'absolute', top: '-10%', right: '-5%',
                    width: '500px', height: '500px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, transparent 70%)',
                    filter: 'blur(60px)'
                }}
            />

            <motion.div
                animate={{
                    scale: [1, 1.1, 1],
                    opacity: [0.2, 0.4, 0.2],
                }}
                transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                style={{
                    position: 'absolute', bottom: '10%', left: '-5%',
                    width: '400px', height: '400px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
                    filter: 'blur(60px)'
                }}
            />

            <div style={{
                maxWidth: '1200px',
                margin: '0 auto',
                padding: '80px 24px',
                position: 'relative',
                zIndex: 1
            }}>
                {/* Header */}
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '100px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '40px', height: '40px', background: 'linear-gradient(45deg, #3b82f6, #8b94f6)',
                            borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Rocket size={24} color="#white" />
                        </div>
                        <span style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.5px' }}>XElite Solutions</span>
                    </div>
                    <nav style={{ display: 'flex', gap: '32px', fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>
                        <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Platform</a>
                        <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Solutions</a>
                        <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Enterprise</a>
                    </nav>
                </header>

                {/* Hero Section */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '60px', alignItems: 'center' }}>
                    <motion.div
                        initial={{ opacity: 0, x: -30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                    >
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                            background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)',
                            padding: '6px 12px', borderRadius: '100px', marginBottom: '24px',
                            fontSize: '12px', fontWeight: 600, color: '#60a5fa'
                        }}>
                            <Zap size={14} />
                            <span>New Release: v2.4.0 is now live</span>
                        </div>

                        <h1 style={{
                            fontSize: '64px', fontWeight: 800, lineHeight: 1.1,
                            letterSpacing: '-2px', marginBottom: '32px'
                        }}>
                            Build the <span style={{
                                background: 'linear-gradient(90deg, #60a5fa, #a78bfa)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent'
                            }}>Future</span> with AI Precision.
                        </h1>

                        <p style={{
                            fontSize: '18px', color: 'rgba(255,255,255,0.6)',
                            lineHeight: 1.6, marginBottom: '40px', maxWidth: '500px'
                        }}>
                            Experience the next generation of software development. Our autonomous agent, Joe,
                            is now fully integrated with your GitHub repositories.
                        </p>

                        <div style={{ display: 'flex', gap: '16px' }}>
                            <button style={{
                                background: '#fff', color: '#000', border: 'none',
                                padding: '14px 28px', borderRadius: '8px',
                                fontWeight: 600, fontSize: '15px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '8px'
                            }}>
                                Get Started <ArrowRight size={18} />
                            </button>
                            <button style={{
                                background: 'rgba(255,255,255,0.05)', color: '#fff',
                                border: '1px solid rgba(255,255,255,0.1)',
                                padding: '14px 28px', borderRadius: '8px',
                                fontWeight: 600, fontSize: '15px', cursor: 'pointer',
                                backdropFilter: 'blur(10px)'
                            }}>
                                Learn More
                            </button>
                        </div>
                    </motion.div>

                    {/* Visual Element: Card Mockups */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, rotateY: -10 }}
                        animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                        transition={{ duration: 1, delay: 0.2 }}
                        style={{ perspective: '1000px' }}
                    >
                        <div style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '24px',
                            padding: '32px',
                            backdropFilter: 'blur(20px)',
                            boxShadow: '0 40px 80px -20px rgba(0,0,0,0.5)'
                        }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                                {[
                                    { icon: <Github />, label: 'Git Sync', val: 'Connected' },
                                    { icon: <Globe />, label: 'Global Edge', val: 'Active' },
                                    { icon: <Cpu />, label: 'AI Engine', val: 'Genesis' },
                                    { icon: <Shield />, label: 'Security', val: 'Enterprise' }
                                ].map((item, idx) => (
                                    <div key={idx} style={{
                                        background: 'rgba(255,255,255,0.02)',
                                        border: '1px solid rgba(255,255,255,0.05)',
                                        padding: '20px', borderRadius: '16px'
                                    }}>
                                        <div style={{ color: '#60a5fa', marginBottom: '12px' }}>{item.icon}</div>
                                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>{item.label}</div>
                                        <div style={{ fontSize: '16px', fontWeight: 600 }}>{item.val}</div>
                                    </div>
                                ))}
                            </div>

                            <div style={{
                                marginTop: '24px', padding: '20px',
                                background: 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(139,92,246,0.1) 100%)',
                                border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '8px', height: '8px', borderRadius: '50%',
                                        background: '#10b981', boxShadow: '0 0 10px #10b981'
                                    }} />
                                    <span style={{ fontSize: '13px', fontWeight: 500 }}>System Integrity Verified</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* Sub-features */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px', marginTop: '100px' }}>
                    {[
                        { icon: <Layout />, title: "Modular Architecture", desc: "Scale internal systems with pre-built Genesis components." },
                        { icon: <Zap />, title: "Instant Deployment", desc: "Push to main and watch your production environment update." },
                        { icon: <Shield />, title: "Enterprise Grade", desc: "End-to-end encryption for all your agent communications." }
                    ].map((feature, i) => (
                        <motion.div
                            key={i}
                            whileHover={{ y: -5 }}
                            style={{ padding: '24px', borderLeft: '1px solid rgba(255,255,255,0.1)' }}
                        >
                            <div style={{ color: '#fff', marginBottom: '16px' }}>{feature.icon}</div>
                            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>{feature.title}</h3>
                            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{feature.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default JoeWelcome;
