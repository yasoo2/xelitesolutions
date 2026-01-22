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
        switch (activeTab) {
            case 'browser':
                return (
                    <div className="w-full h-full relative bg-slate-900">
                        {browserSessionId ? (
                            <Suspense fallback={
                                <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
                                    <div className="relative">
                                        <Loader size={32} className="animate-spin text-blue-500" />
                                        <Globe size={16} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                                    </div>
                                    <span className="text-sm font-medium animate-pulse">Initializing Neural Link to Browser...</span>
                                </div>
                            }>
                                <ModernBrowserStream sessionId={browserSessionId} showBoxes={showBoxes} />
                            </Suspense>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500">
                                <Box size={48} className="mb-4 opacity-20" />
                                <p className="max-w-xs text-sm font-medium">سيتم تشغيل المتصفح المتطور تلقائياً عند بدء مهمة تتطلب استكشاف الويب.</p>
                            </div>
                        )}
                    </div>
                );
            case 'terminal':
                return (
                    <div className="w-full h-full bg-[#0f172a]">
                        <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader className="animate-spin text-purple-500" /></div>}>
                            <EnterpriseTerminalPanel isEmbedded={true} />
                        </Suspense>
                    </div>
                );

        }
    };

    return (
        <div className="flex flex-col w-full h-full bg-slate-900 overflow-hidden">
            {/* Tab Navigation */}
            <div className="flex items-center px-4 bg-slate-950 border-b border-white/5 h-12 shrink-0">
                <div className="flex gap-1">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id as TabType)}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all relative group ${activeTab === tab.id
                                ? 'bg-[var(--accent-primary)] text-slate-900 shadow-lg border border-white/20'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                                }`}
                        >
                            <tab.icon size={14} className={activeTab === tab.id ? 'text-slate-900' : 'text-slate-500 group-hover:text-slate-300'} />
                            {tab.label}
                            {activeTab === tab.id && (
                                <motion.div
                                    layoutId="activeTabUnderline"
                                    className="absolute bottom-[-13px] left-0 right-0 h-0.5 bg-cyan-500 rounded-full z-10"
                                />
                            )}
                        </button>
                    ))}
                </div>

                <div className="ml-auto flex items-center gap-4">
                    {activeTab === 'browser' && browserSessionId && (
                        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">Neural Stream Active</span>
                        </div>
                    )}
                    {activeTab === 'terminal' && (
                        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20">
                            <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-tighter">SSH Bridge Ready</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 relative overflow-hidden">
                {renderContent()}
            </div>
        </div>
    );
}
