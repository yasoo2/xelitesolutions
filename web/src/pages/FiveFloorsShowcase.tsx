
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, Sparkles, Shield, Cpu, Zap, Layout } from 'lucide-react';

export default function FiveFloorsShowcase() {
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // HSL Based Theme Config (Floor 5 Math)
    const colors = {
        primary: theme === 'dark' ? 'hsl(250, 80%, 65%)' : 'hsl(250, 70%, 50%)',
        bg: theme === 'dark' ? 'hsl(230, 20%, 8%)' : 'hsl(230, 20%, 96%)',
        panel: theme === 'dark' ? 'hsla(230, 20%, 15%, 0.4)' : 'hsla(230, 20%, 100%, 0.6)',
        text: theme === 'dark' ? 'hsl(0, 0%, 95%)' : 'hsl(230, 30%, 15%)',
        accent: 'hsl(180, 100%, 50%)'
    };

    if (!mounted) return null;

    const floors = [
        { id: 1, name: 'Essentials', icon: <Layout />, desc: 'Modern React & Web Scalability' },
        { id: 2, name: 'Specialized', icon: <Shield />, desc: 'Cybersecurity & AI Integration' },
        { id: 3, name: 'God-Tier', icon: <Cpu />, desc: 'Deep Performance & Blockchain' },
        { id: 4, name: 'Unstoppable', icon: <Zap />, desc: 'Fintech & Disaster Recovery' },
        { id: 5, name: 'Elegant', icon: <Sparkles />, desc: 'Visual Art & Design Systems' }
    ];

    return (
        <div
            className="min-h-screen transition-colors duration-700 flex flex-col items-center justify-center p-6"
            style={{ backgroundColor: colors.bg, color: colors.text, fontFamily: 'Inter, sans-serif' }}
        >
            {/* Background Glows */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[120px] opacity-20" style={{ background: colors.primary }} />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full blur-[100px] opacity-10" style={{ background: colors.accent }} />
            </div>

            {/* Header Content */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-12 relative z-10"
            >
                <h1 className="text-5xl font-black mb-4 tracking-tight">
                    THE <span style={{ color: colors.primary }}>FIVE FLOORS</span> OF JOE
                </h1>
                <p className="text-gray-500 max-w-md mx-auto">
                    A physical manifestation of engineering mastery, designed in real-time to your specifications.
                </p>
            </motion.div>

            {/* Theme Toggle (Floor 5 UX) */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="mb-12 p-1 rounded-2xl flex items-center gap-2 border border-white/10 backdrop-blur-xl relative z-10"
                style={{ backgroundColor: colors.panel }}
            >
                <div className={`p-3 rounded-xl transition-all ${theme === 'dark' ? 'bg-purple-600 shadow-lg text-white' : 'text-gray-400'}`}>
                    <Moon size={20} />
                </div>
                <div className={`p-3 rounded-xl transition-all ${theme === 'light' ? 'bg-amber-400 shadow-lg text-white' : 'text-gray-400'}`}>
                    <Sun size={20} />
                </div>
            </motion.button>

            {/* Cards Grid (Floor 1 Layout + Floor 5 Glassmorphism) */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 max-w-7xl w-full relative z-10">
                {floors.map((floor, idx) => (
                    <motion.div
                        key={floor.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        whileHover={{ y: -5, borderColor: colors.primary }}
                        className="p-6 rounded-3xl border border-white/5 backdrop-blur-2xl flex flex-col items-center text-center group"
                        style={{ backgroundColor: colors.panel }}
                    >
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:rotate-12"
                            style={{ backgroundColor: `${colors.primary}20`, color: colors.primary }}>
                            {floor.icon}
                        </div>
                        <h3 className="font-bold mb-2 uppercase tracking-widest text-xs opacity-60">Floor 0{floor.id}</h3>
                        <h2 className="text-xl font-bold mb-2">{floor.name}</h2>
                        <p className="text-sm opacity-50">{floor.desc}</p>
                    </motion.div>
                ))}
            </div>

            {/* CTA Button (Floor 5 Micro-interactions) */}
            <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                whileHover={{ scale: 1.02, boxShadow: `0 0 30px ${colors.primary}40` }}
                className="mt-16 px-10 py-4 rounded-full font-bold text-white shadow-2xl transition-all"
                style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})` }}
            >
                GENESIS EXECUTION COMPLETE
            </motion.button>

            <footer className="mt-20 opacity-30 text-[10px] uppercase tracking-[0.3em]">
                Engineered by Joe • XELITE SOLUTIONS • 2026
            </footer>
        </div>
    );
};
