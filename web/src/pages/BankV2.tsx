
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, LogOut, ShieldCheck, Wallet, ArrowUpRight, ArrowDownLeft, Landmark, Menu } from 'lucide-react';

export default function BankV2() {
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [balance] = useState(142580.42);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Dynamic HSL Scale (Imperial Theme)
    const primary = theme === 'dark' ? 'hsl(280, 80%, 65%)' : 'hsl(280, 70%, 45%)';
    const bg = theme === 'dark' ? 'hsl(230, 25%, 7%)' : 'hsl(0, 0%, 98%)';
    const surface = theme === 'dark' ? 'hsla(230, 20%, 15%, 0.5)' : 'hsla(0, 0%, 100%, 0.8)';
    const text = theme === 'dark' ? 'hsl(0, 0%, 98%)' : 'hsl(230, 30%, 10%)';

    const transactions = [
        { id: 1, type: 'in', name: 'Dividend Payment', date: 'Oct 24, 2026', amount: '+ $12,500.00', status: 'Settled' },
        { id: 2, type: 'out', name: 'Luxury Auto Lease', date: 'Oct 22, 2026', amount: '- $2,450.00', status: 'Processing' },
        { id: 3, type: 'in', name: 'Consulting Retainer', date: 'Oct 20, 2026', amount: '+ $4,800.00', status: 'Settled' },
    ];

    return (
        <div
            className="min-h-screen transition-all duration-1000 p-4 md:p-8"
            style={{ backgroundColor: bg, color: text, fontFamily: 'Outfit, sans-serif' }}
        >
            {/* Background Architecture */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full blur-[150px] opacity-20" style={{ background: primary }} />
                <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[120px] opacity-10 bg-cyan-500" />
            </div>

            {/* Navigation Bar */}
            <nav className="max-w-7xl mx-auto flex justify-between items-center mb-12 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                        <Landmark className="text-white" size={20} />
                    </div>
                    <span className="font-black text-xl tracking-tighter uppercase">Imperial <span style={{ color: primary }}>Bank</span></span>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        className="p-3 rounded-full hover:bg-black/5 transition-colors border border-white/10 backdrop-blur-md"
                        style={{ backgroundColor: surface }}
                    >
                        {theme === 'dark' ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-indigo-600" />}
                    </button>
                    <button
                        className="hidden md:flex items-center gap-2 px-6 py-2.5 rounded-full font-bold transition-all border border-white/5 active:scale-95"
                        style={{ backgroundColor: surface }}
                    >
                        <LogOut size={16} className="text-red-500" /> Logout
                    </button>
                    <button className="md:hidden p-2"><Menu size={24} /></button>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
                {/* Left: Financial Overview */}
                <div className="lg:col-span-8 space-y-8">
                    {/* Hero Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-10 rounded-[2.5rem] relative overflow-hidden shadow-2xl border border-white/10"
                        style={{ background: `linear-gradient(225deg, ${primary}, #4f46e5)` }}
                    >
                        <div className="absolute top-0 right-0 p-8 opacity-20"><Wallet size={120} /></div>
                        <h3 className="text-white/70 font-medium mb-2 uppercase tracking-widest text-xs">Total Net Worth</h3>
                        <div className="flex items-baseline gap-2 mb-8">
                            <span className="text-white text-5xl font-black">${balance.toLocaleString()}</span>
                            <span className="text-white/60 text-xl">USD</span>
                        </div>
                        <div className="flex gap-4">
                            <button className="px-8 py-3 bg-white text-indigo-700 rounded-full font-bold shadow-xl shadow-indigo-900/20 active:scale-95 transition-transform">Transfer</button>
                            <button className="px-8 py-3 bg-indigo-900/20 backdrop-blur-md border border-white/20 text-white rounded-full font-bold hover:bg-white/10 transition-all">Exchange</button>
                        </div>
                    </motion.div>

                    {/* Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            { label: 'Spending', value: '$8,420', icon: <ArrowUpRight className="text-red-400" /> },
                            { label: 'Income', value: '$22,100', icon: <ArrowDownLeft className="text-green-400" /> },
                            { label: 'Status', value: 'Elite Black', icon: <ShieldCheck className="text-cyan-400" /> },
                        ].map((stat, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.1 }}
                                className="p-6 rounded-3xl border border-white/10 backdrop-blur-2xl"
                                style={{ backgroundColor: surface }}
                            >
                                <div className="flex justify-between items-center mb-2">
                                    <span className="opacity-50 text-xs font-bold uppercase">{stat.label}</span>
                                    {stat.icon}
                                </div>
                                <span className="text-2xl font-bold">{stat.value}</span>
                            </motion.div>
                        ))}
                    </div>

                    {/* Transactions */}
                    <div className="p-8 rounded-[2rem] border border-white/5 backdrop-blur-xl" style={{ backgroundColor: surface }}>
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-xl font-bold">Recent Intelligence</h2>
                            <button className="text-xs font-bold uppercase opacity-50 hover:opacity-100 transition-opacity">View Atlas</button>
                        </div>
                        <div className="space-y-6">
                            {transactions.map((tx) => (
                                <div key={tx.id} className="flex justify-between items-center group">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:rotate-12 ${tx.type === 'in' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                            {tx.type === 'in' ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                                        </div>
                                        <div>
                                            <h4 className="font-bold">{tx.name}</h4>
                                            <p className="text-xs opacity-40">{tx.date}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`font-black ${tx.type === 'in' ? 'text-green-500' : ''}`}>{tx.amount}</div>
                                        <div className="text-[10px] uppercase opacity-30 font-bold">{tx.status}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: Side Assets */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="p-8 rounded-[2rem] border border-white/5 overflow-hidden relative" style={{ backgroundColor: surface }}>
                        <div className="relative z-10">
                            <h2 className="text-lg font-bold mb-4">Security Level</h2>
                            <div className="w-full h-2 bg-black/10 rounded-full mb-6 overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: '92%' }}
                                    transition={{ duration: 2, ease: "easeOut" }}
                                    className="h-full bg-gradient-to-r from-purple-500 to-cyan-400"
                                />
                            </div>
                            <p className="text-xs opacity-50 leading-relaxed mb-4">
                                System Awareness is currently at 92%. Genesis core is active and monitoring all tools.
                            </p>
                            <button className="text-xs text-purple-500 font-bold flex items-center gap-1 hover:gap-2 transition-all">Audit Protocols <ArrowUpRight size={12} /></button>
                        </div>
                    </div>

                    <div className="p-8 rounded-[2rem] bg-gradient-to-br from-indigo-600/10 to-purple-600/10 border border-white/5">
                        <ShieldCheck className="text-purple-500 mb-4" size={32} />
                        <h3 className="font-bold mb-2">Immutable Leger</h3>
                        <p className="text-xs opacity-50 leading-relaxed">
                            Every interaction is recorded in the append-only local atlas. Data integrity is guaranteed via Phase 4 fintech protocols.
                        </p>
                    </div>
                </div>
            </main>

            <footer className="mt-20 text-center opacity-20 text-[10px] uppercase tracking-[0.5em] relative z-10">
                Constructed by Joe • XELITE SOLUTIONS • 2026
            </footer>
        </div>
    );
}
