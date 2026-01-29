import React, { useState, Suspense, lazy } from 'react';
import {
    Globe,
    Terminal as TerminalIcon,
    List,
    Activity,
    Box,
    Cpu,
    Zap,
    Loader
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ModernBrowserStream = lazy(() => import('./ModernBrowserStream'));
const EnterpriseTerminalPanel = lazy(() => import('./terminal/EnterpriseTerminalPanel'));

interface AgentCentralPanelProps {
    sessionId?: string;
    browserSessionId?: string | null;

    showBoxes?: boolean;
    activeTab: TabType;
    onTabChange: (tab: TabType) => void;
}

type TabType = 'browser' | 'terminal';

export default function AgentCentralPanel({
    sessionId,
    browserSessionId,

    showBoxes,
    activeTab,
    onTabChange
}: AgentCentralPanelProps) {

    const tabs = [
        { id: 'browser', label: 'Browser', icon: Globe, color: 'text-blue-400' },
        { id: 'terminal', label: 'Terminal', icon: TerminalIcon, color: 'text-purple-400' },
    ];

    const renderContent = () => {
        return (
            <div className="w-full h-full relative">
                {/* Browser Layer */}
                <div className={`absolute inset-0 z-10 transition-opacity duration-300 ${activeTab === 'browser' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                    <div className="w-full h-full" style={{ background: 'var(--bg-dark)' }}>
                        {browserSessionId ? (
                            <Suspense fallback={
                                <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: 'var(--text-secondary)' }}>
                                    <div className="relative">
                                        <Loader size={32} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                                        <Globe size={16} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                                    </div>
                                    <span className="text-sm font-semibold animate-pulse">Initializing Neural Link to Browser...</span>
                                </div>
                            }>
                                <ModernBrowserStream sessionId={browserSessionId} showBoxes={showBoxes} />
                            </Suspense>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full p-8 text-center" style={{ color: 'var(--text-secondary)' }}>
                                <Box size={48} className="mb-4 opacity-20" />
                                <p className="max-w-xs text-sm font-medium">سيتم تشغيل المتصفح المتطور تلقائياً عند بدء مهمة تتطلب استكشاف الويب.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Terminal Layer */}
                <div className={`absolute inset-0 z-0 transition-opacity duration-300 ${activeTab === 'terminal' ? 'opacity-100 pointer-events-auto z-20' : 'opacity-0 pointer-events-none'}`}>
                    <div className="w-full h-full" style={{ background: 'var(--bg-dark)' }}>
                        <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader className="animate-spin" style={{ color: 'var(--accent-primary)' }} /></div>}>
                            <EnterpriseTerminalPanel isEmbedded={true} />
                        </Suspense>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col w-full h-full overflow-hidden relative" style={{ background: 'var(--bg-card)' }}>
            {/* Elite Tab Navigation (Overlay Style) */}
            <div
                className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center p-1.5 rounded-2xl"
                style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    boxShadow: 'var(--shadow-md)',
                    backdropFilter: 'blur(12px)',
                }}
            >
                <div className="flex gap-1">
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        const activeBg = 'linear-gradient(135deg, rgba(var(--accent-primary-rgb), 0.95) 0%, rgba(var(--accent-primary-rgb), 0.72) 100%)';

                        return (
                            <button
                                key={tab.id}
                                onClick={() => onTabChange(tab.id as TabType)}
                                className="flex items-center gap-3 px-6 py-2.5 rounded-xl text-sm font-black transition-all relative group"
                                style={isActive ? {
                                    background: activeBg,
                                    color: 'rgba(0, 0, 0, 0.9)',
                                    boxShadow: '0 0 24px var(--accent-glow)',
                                } : {
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                <tab.icon size={18} style={{ color: isActive ? 'rgba(0, 0, 0, 0.9)' : 'var(--text-muted)' }} />
                                <span className="uppercase tracking-widest">{tab.label}</span>
                                {isActive && (
                                    <motion.div
                                        layoutId="eliteTabGlow"
                                        className="absolute inset-0 rounded-xl"
                                        initial={false}
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                        style={{ background: 'rgba(255,255,255,0.10)' }}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Content Area (Forced Full Height/Width) */}
            <div className="flex-1 relative overflow-hidden" style={{ background: 'var(--bg-dark)' }}>
                {renderContent()}
            </div>
        </div>
    );
}
