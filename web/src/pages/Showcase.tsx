import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    Terminal, Bot, FileCode2, Database, Shield, Zap,
    ArrowLeft, Cpu, Globe, Heart, Layers, Sparkles
} from 'lucide-react';

export default function Showcase() {
    const { t, i18n } = useTranslation();
    const nav = useNavigate();
    const isRTL = i18n.language === 'ar';

    const features = [
        {
            icon: <Terminal size={32} className="text-accent-primary" />,
            title: isRTL ? 'محطة أوامر ذكية' : 'Intelligent Terminal',
            desc: isRTL
                ? 'بيئة تنفيذ أوامر متقدمة مع وعي بالسياق، تدعم برمجيات Linux بالكامل.'
                : 'Context-aware command execution environment with full Linux software support.'
        },
        {
            icon: <Bot size={32} className="text-purple-400" />,
            title: isRTL ? 'عملاء أذكياء' : 'Autonomous Agents',
            desc: isRTL
                ? 'أسراب من العملاء الذكيين القادرين على التخطيط، وكتابة الكود، وإصلاح الأخطاء ذاتياً.'
                : 'Swarms of intelligent agents capable of planning, coding, and self-repairing.'
        },
        {
            icon: <FileCode2 size={32} className="text-green-400" />,
            title: isRTL ? 'إدارة ملفات حية' : 'Live File System',
            desc: isRTL
                ? 'محرر أكواد متكامل مع مستكشف ملفات مدمج، يدعم السحب والإفلات والبحث الذكي.'
                : 'Integrated code editor with built-in file explorer, supporting drag-and-drop and smart search.'
        },
        {
            icon: <Database size={32} className="text-yellow-400" />,
            title: isRTL ? 'قواعد بيانات فورية' : 'Instant Databases',
            desc: isRTL
                ? 'إنشاء وإدارة وفحص قواعد البيانات (SQL/NoSQL) بضغطة زر واحدة.'
                : 'Create, manage, and inspect databases (SQL/NoSQL) with a single click.'
        },
        {
            icon: <Shield size={32} className="text-blue-400" />,
            title: isRTL ? 'أمان مؤسسي' : 'Enterprise Security',
            desc: isRTL
                ? 'حماية متقدمة للشيفرة المصدرية، مع عزل تام للبيئات وصلاحيات دقيقة.'
                : 'Advanced source code protection with complete environment isolation and granular permissions.'
        },
        {
            icon: <Layers size={32} className="text-pink-400" />,
            title: isRTL ? 'بنية تحتية مرنة' : 'Scalable Infrastructure',
            desc: isRTL
                ? 'مبني على Docker و Microservices لضمان الأداء العالي والتوسع اللامتناهي.'
                : 'Built on Docker and Microservices to ensure high performance and infinite scalability.'
        }
    ];

    return (
        <div className="min-h-screen bg-[#050a14] text-white overflow-x-hidden">
            {/* Background Glows */}
            <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-accent-primary/10 blur-[120px] rounded-full pointer-events-none" />
            <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-purple-500/10 blur-[120px] rounded-full pointer-events-none" />

            {/* Navigation */}
            <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => nav('/')}>
                    <div className="brand-mark brand-mark-sm" />
                    <div className="font-bold text-xl tracking-tight">JOE <span className="text-accent-primary">AI</span></div>
                </div>
                <button
                    onClick={() => nav('/login')}
                    className="px-6 py-2 rounded-full border border-white/10 hover:bg-white/5 transition-all font-medium text-sm backdrop-blur-md"
                >
                    {t('login')}
                </button>
            </nav>

            {/* Hero Section */}
            <header className="relative z-10 pt-20 pb-32 px-6 text-center max-w-5xl mx-auto">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-xs font-bold tracking-wider mb-8 uppercase animate-fade-in-up">
                    <Sparkles size={12} />
                    {isRTL ? 'الجيل القادم من التطوير' : 'The Next Generation of Development'}
                </div>

                <h1 className="text-5xl md:text-7xl font-bold mb-8 leading-tight animate-fade-in-up delay-100">
                    {isRTL ? 'وداعاً للبرمجة التقليدية.' : 'Say Goodbye to'} <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ffd700] via-[#bf953f] to-[#aa771c] drop-shadow-lg">
                        {isRTL ? 'أهلاً بالمستقبل.' : 'Traditional Coding.'}
                    </span>
                </h1>

                <p className="text-lg md:text-xl text-slate-400 mb-12 max-w-3xl mx-auto leading-relaxed animate-fade-in-up delay-200">
                    {isRTL
                        ? 'نظام "جو" ليس مجرد أداة، بل هو شريكك الذكي في بناء البرمجيات. يدمج بين قوة الذكاء الاصطناعي ومرونة بيئات التطوير السحابية ليمنحك تجربة لم تعهدها من قبل.'
                        : 'Joe System is not just a tool; it is your intelligent partner in software building. It combines the power of AI with the flexibility of cloud development environments to give you an experience like never before.'}
                </p>

                <div className="flex flex-wrap items-center justify-center gap-4 animate-fade-in-up delay-300">
                    <button
                        onClick={() => nav('/login')}
                        className="px-8 py-4 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-black font-bold text-lg hover:transform hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(255,215,0,0.3)] transition-all duration-300"
                    >
                        {isRTL ? 'ابدأ رحلتك الآن' : 'Start Your Journey'}
                    </button>
                    <button
                        onClick={() => nav('/')}
                        className="px-8 py-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white font-medium text-lg transition-all flex items-center gap-2"
                    >
                        <ArrowLeft size={20} className={isRTL ? 'rotate-180' : ''} />
                        {isRTL ? 'العودة للرئيسية' : 'Back Home'}
                    </button>
                </div>
            </header>

            {/* Features Grid */}
            <section className="relative z-10 px-6 pb-32 max-w-7xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {features.map((feat, idx) => (
                        <div
                            key={idx}
                            className="group p-8 rounded-2xl bg-white/5 border border-white/5 hover:border-accent-primary/30 hover:bg-white/[0.07] transition-all duration-300 hover:-translate-y-2 relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-accent-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="relative z-10">
                                <div className="mb-6 p-3 bg-white/5 rounded-xl inline-block group-hover:scale-110 transition-transform duration-300 backdrop-blur-sm">
                                    {feat.icon}
                                </div>
                                <h3 className="text-xl font-bold mb-3 text-white group-hover:text-accent-primary transition-colors">
                                    {feat.title}
                                </h3>
                                <p className="text-slate-400 leading-relaxed text-sm">
                                    {feat.desc}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Stats / Trust Section */}
            <section className="relative z-10 py-24 border-y border-white/5 bg-black/20 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                    <div>
                        <div className="text-4xl font-bold text-accent-primary mb-2">99%</div>
                        <div className="text-sm text-slate-500 uppercase tracking-wider">{isRTL ? 'وقت التشغيل' : 'Uptime'}</div>
                    </div>
                    <div>
                        <div className="text-4xl font-bold text-purple-400 mb-2">10ms</div>
                        <div className="text-sm text-slate-500 uppercase tracking-wider">{isRTL ? 'الاستجابة' : 'Latency'}</div>
                    </div>
                    <div>
                        <div className="text-4xl font-bold text-blue-400 mb-2">256-bit</div>
                        <div className="text-sm text-slate-500 uppercase tracking-wider">{isRTL ? 'التشفير' : 'Encryption'}</div>
                    </div>
                    <div>
                        <div className="text-4xl font-bold text-green-400 mb-2">24/7</div>
                        <div className="text-sm text-slate-500 uppercase tracking-wider">{isRTL ? 'دعم ذكي' : 'AI Support'}</div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="relative z-10 py-12 px-6 border-t border-white/5 text-center text-slate-500 text-sm">
                <div className="flex items-center justify-center gap-2 mb-4">
                    <span>Built with</span>
                    <Heart size={14} className="text-red-500 fill-red-500" />
                    <span>by Xelite Solutions</span>
                </div>
                <p>© 2025 Joe System. All rights reserved.</p>
            </footer>
        </div>
    );
}
