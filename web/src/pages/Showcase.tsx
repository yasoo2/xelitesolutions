import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    Terminal, Bot, FileCode2, Database, Shield, Zap,
    ArrowLeft, ArrowRight, CheckCircle, Smartphone, Globe
} from 'lucide-react';

export default function Showcase() {
    const { t, i18n } = useTranslation();
    const nav = useNavigate();
    const isRTL = i18n.language === 'ar';

    // High-Quality Tech Imagery
    const heroImage = "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=2070";
    const terminalImage = "https://images.unsplash.com/photo-1629654297299-c8506221ca97?auto=format&fit=crop&q=80&w=1974";
    const agentImage = "https://images.unsplash.com/photo-1531746790731-6c087fecd65a?auto=format&fit=crop&q=80&w=2006";

    const featureSections = [
        {
            icon: <Terminal size={28} className="text-accent-primary" />,
            title: isRTL ? 'محطة أوامر ذكية' : 'Intelligent Terminal',
            desc: isRTL
                ? 'بيئة "باش" كاملة واعية بالسياق، تفهم مشروعك وتنفذ الأوامر بدقة.'
                : 'Context-aware Bash environment that understands your project.',
            image: terminalImage
        },
        {
            icon: <Bot size={28} className="text-purple-400" />,
            title: isRTL ? 'عملاء أذكياء' : 'Autonomous Agents',
            desc: isRTL
                ? 'أسراب من الذكاء الاصطناعي تخطط وتبني وتصلح الأخطاء تلقائياً.'
                : 'AI swarms that plan, build, and self-repair automatically.',
            image: agentImage
        }
    ];

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans overflow-x-hidden transition-colors duration-300">

            {/* Navigation */}
            <nav className="fixed top-0 w-full z-50 bg-[var(--bg-primary)]/80 backdrop-blur-md border-b border-[var(--border-color)]">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => nav('/')}>
                        <div className="brand-text-3d" style={{ fontSize: '24px' }}>JOE</div>
                        <div className="brand-ai-badge">AI</div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => nav('/login')}
                            className="px-6 py-2.5 rounded-full bg-[var(--text-primary)] text-[var(--bg-primary)] font-bold hover:opacity-90 transition-all font-medium text-sm"
                        >
                            {t('login')}
                        </button>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 px-6 overflow-hidden">
                <div className="max-w-7xl mx-auto flex flex-col items-center text-center">
                    <h1 className="text-5xl md:text-8xl font-black mb-6 leading-[1.1] tracking-tight animate-fade-in-up">
                        {isRTL ? 'مستقبل البرمجة' : 'The Future of'} <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-primary to-accent-secondary">
                            {isRTL ? 'بين يديك.' : 'Development.'}
                        </span>
                    </h1>
                    <p className="text-2xl text-[var(--text-secondary)] mb-12 leading-relaxed max-w-2xl animate-fade-in-up delay-100">
                        {isRTL
                            ? 'نظام "جو" يدمج قوة الذكاء الاصطناعي مع أدوات التطوير التقليدية لخلق تجربة لا مثيل لها.'
                            : 'Joe System fuses AI power with traditional dev tools creates an unparalleled experience.'}
                    </p>

                    <div className="relative w-full max-w-5xl aspect-video rounded-3xl overflow-hidden shadow-2xl border border-[var(--border-color)] animate-fade-in-up delay-200">
                        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-primary)] via-transparent to-transparent z-10" />
                        <img
                            src={heroImage}
                            alt="Hero"
                            className="w-full h-full object-cover"
                        />
                    </div>
                </div>
            </section>

            {/* "Boxed" Feature Sections (Standardized) */}
            <section className="py-24 space-y-32">
                {featureSections.map((feat, idx) => (
                    <div key={idx} className="max-w-7xl mx-auto px-6">
                        <div className={`flex flex-col lg:flex-row items-center gap-16 ${idx % 2 === 1 ? 'lg:flex-row-reverse' : ''}`}>

                            {/* Image Box (Floating Card Effect) */}
                            <div className="w-full lg:w-1/2 rounded-3xl overflow-hidden h-[360px] md:h-[480px] relative shadow-2xl border border-[var(--border-color)] group hover:shadow-[0_20px_60px_rgba(var(--accent-primary-rgb),0.2)] transition-all duration-500">
                                <div className="absolute inset-0 bg-black/5 z-10" />
                                <img src={feat.image} alt={feat.title} className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-1000" />

                                {/* Floating Badge */}
                                <div className="absolute bottom-6 left-6 z-20 bg-[var(--bg-card)]/90 backdrop-blur-md px-4 py-2 rounded-full border border-[var(--border-color)] shadow-lg flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
                                    <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-primary)]">AI Powered</span>
                                </div>
                            </div>

                            {/* Text Box (Contained/Boxed) */}
                            <div className="w-full lg:w-1/2">
                                <div className="relative p-8 md:p-10 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-xl relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-accent-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

                                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--bg-hover)] border border-[var(--border-color)] mb-6 text-accent-primary shadow-sm group-hover:scale-110 transition-transform duration-300">
                                        {feat.icon}
                                    </div>

                                    <h2 className="text-3xl md:text-4xl font-bold mb-4 leading-tight">{feat.title}</h2>
                                    <div className="w-12 h-1 bg-accent-primary rounded-full mb-6" />

                                    <p className="text-lg text-[var(--text-secondary)] leading-relaxed mb-8 max-w-md">
                                        {feat.desc}
                                    </p>

                                    <button className="group/btn flex items-center gap-3 text-[var(--text-primary)] font-bold text-sm tracking-wide hover:text-accent-primary transition-colors">
                                        {isRTL ? 'اقرأ المزيد' : 'READ MORE'}
                                        <div className="w-8 h-8 rounded-full border border-[var(--border-color)] flex items-center justify-center group-hover/btn:bg-accent-primary group-hover/btn:border-accent-primary group-hover/btn:text-black transition-all">
                                            <ArrowRight size={16} className={isRTL ? 'rotate-180' : ''} />
                                        </div>
                                    </button>
                                </div>
                            </div>

                        </div>
                    </div>
                ))}
            </section>

            {/* Final CTA */}
            <section className="py-24 bg-[var(--bg-secondary)] border-t border-[var(--border-color)]">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <h2 className="text-4xl font-bold mb-8">{isRTL ? 'جاهز للبدء؟' : 'Ready to Start?'}</h2>
                    <button
                        onClick={() => nav('/login')}
                        className="px-10 py-5 rounded-full bg-accent-primary text-black font-bold text-xl hover:shadow-lg hover:-translate-y-1 transition-all"
                    >
                        {t('start_now')}
                    </button>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 border-t border-[var(--border-color)] text-center text-[var(--text-secondary)]">
                <p>© 2025 Joe System. All rights reserved.</p>
            </footer>
        </div>
    );
}
