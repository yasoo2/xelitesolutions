import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    Terminal, Bot, FileCode2, Database, Shield, Zap,
    ArrowLeft, CheckCircle
} from 'lucide-react';

export default function Showcase() {
    const { t, i18n } = useTranslation();
    const nav = useNavigate();
    const isRTL = i18n.language === 'ar';

    // High-Quality Tech Imagery
    const heroImage = "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=2070"; // Cyberpunk City/Data
    const terminalImage = "https://images.unsplash.com/photo-1629654297299-c8506221ca97?auto=format&fit=crop&q=80&w=1974"; // Matrix/Code
    const agentImage = "https://images.unsplash.com/photo-1531746790731-6c087fecd65a?auto=format&fit=crop&q=80&w=2006"; // AI/Robot
    const teamImage = "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=2070"; // Collaboration

    const features = [
        {
            icon: <Terminal size={24} className="text-accent-primary" />,
            title: isRTL ? 'محطة أوامر ذكية' : 'Intelligent Terminal',
            desc: isRTL
                ? 'بيئة "باش" كاملة واعية بالسياق، تفهم مشروعك وتنفذ الأوامر بدقة.'
                : 'Context-aware Bash environment that understands your project.',
            image: terminalImage
        },
        {
            icon: <Bot size={24} className="text-purple-400" />,
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
                <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    <div className="relative z-10 animate-fade-in-up">
                        <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-[1.1] tracking-tight">
                            {isRTL ? 'مستقبل البرمجة' : 'The Future of'} <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-primary to-accent-secondary">
                                {isRTL ? 'بين يديك.' : 'Development.'}
                            </span>
                        </h1>
                        <p className="text-xl text-[var(--text-secondary)] mb-8 leading-relaxed max-w-lg">
                            {isRTL
                                ? 'نظام "جو" يدمج قوة الذكاء الاصطناعي مع أدوات التطوير التقليدية لخلق تجربة لا مثيل لها.'
                                : 'Joe System fuses AI power with traditional dev tools creates an unparalleled experience.'}
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <button
                                onClick={() => nav('/login')}
                                className="px-8 py-4 rounded-xl bg-accent-primary text-black font-bold text-lg hover:shadow-lg hover:-translate-y-1 transition-all"
                            >
                                {t('start_now')}
                            </button>
                            <button
                                onClick={() => nav('/')}
                                className="px-8 py-4 rounded-xl border border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-all font-medium flex items-center gap-2"
                            >
                                <ArrowLeft size={20} className={isRTL ? 'rotate-180' : ''} />
                                {isRTL ? 'الرئيسية' : 'Home'}
                            </button>
                        </div>
                    </div>

                    <div className="relative z-0 lg:h-[600px] rounded-3xl overflow-hidden shadow-2xl animate-fade-in-up delay-200 group">
                        <div className="absolute inset-0 bg-gradient-to-tr from-accent-primary/20 to-purple-500/20 mix-blend-overlay z-10" />
                        <img
                            src={heroImage}
                            alt="Futuristic City"
                            className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-1000"
                        />
                    </div>
                </div>
            </section>

            {/* Feature Grid with Real Images */}
            <section className="py-24 bg-[var(--bg-secondary)]">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-bold mb-4">{isRTL ? 'قدرات غير محدودة' : 'Limitless Capabilities'}</h2>
                        <p className="text-[var(--text-secondary)] max-w-2xl mx-auto">
                            {isRTL ? 'اكتشف الأدوات التي ستغير طريقة عملك للأبد.' : 'Discover the tools that will change how you work forever.'}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {features.map((feat, idx) => (
                            <div key={idx} className="group relative rounded-3xl overflow-hidden bg-[var(--bg-card)] border border-[var(--border-color)] hover:shadow-xl transition-all h-[400px] flex flex-col">
                                <div className="h-48 overflow-hidden relative">
                                    <div className="absolute inset-0 bg-black/20 z-10" />
                                    <img src={feat.image} alt={feat.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                </div>
                                <div className="p-8 flex-1 flex flex-col justify-center">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="p-2 rounded-lg bg-[var(--bg-hover)]">{feat.icon}</div>
                                        <h3 className="text-2xl font-bold">{feat.title}</h3>
                                    </div>
                                    <p className="text-[var(--text-secondary)] leading-relaxed">
                                        {feat.desc}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Text/Content Section */}
            <section className="py-24">
                <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    <div className="order-2 lg:order-1 rounded-3xl overflow-hidden shadow-2xl h-[500px]">
                        <img src={teamImage} alt="Team" className="w-full h-full object-cover" />
                    </div>
                    <div className="order-1 lg:order-2">
                        <h2 className="text-4xl font-bold mb-6">{isRTL ? 'مصمم للفرق الطموحة' : 'Built for Ambitious Teams'}</h2>
                        <p className="text-lg text-[var(--text-secondary)] mb-8 leading-relaxed">
                            {isRTL
                                ? 'سواء كنت تعمل بمفردك أو ضمن فريق كبير، يوفر جو بيئة آمنة وسريعة للتعاون الفوري، مع أدوات إدارة صلاحيات وحماية بيانات على مستوى المؤسسات.'
                                : 'Whether you work alone or in a large team, Joe provides a secure, fast environment for real-time collaboration, with enterprise-grade permission management and data protection.'}
                        </p>
                        <ul className="space-y-4">
                            {[
                                isRTL ? 'تشفير شامل للبيانات' : 'End-to-End Encryption',
                                isRTL ? 'بنية تحتية سحابية مرنة' : 'Scalable Cloud Infrastructure',
                                isRTL ? 'دعم فني ذكي 24/7' : '24/7 Intelligent Support'
                            ].map((item, i) => (
                                <li key={i} className="flex items-center gap-3 text-lg font-medium">
                                    <CheckCircle className="text-green-500" size={20} />
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 border-t border-[var(--border-color)] text-center text-[var(--text-secondary)] bg-[var(--bg-secondary)]">
                <p>© 2025 Joe System. All rights reserved.</p>
            </footer>
        </div>
    );
}
