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
    thinkingChain: any[];
    showBoxes?: boolean;
    activeTab: TabType;
    onTabChange: (tab: TabType) => void;
}

type TabType = 'browser' | 'terminal' | 'logs' | 'flow';

export default function AgentCentralPanel({
    sessionId,
    browserSessionId,
    thinkingChain,
    showBoxes,
    activeTab,
    onTabChange
}: AgentCentralPanelProps) {

    const tabs = [
        { id: 'browser', label: 'Browser', icon: Globe, color: 'text-blue-400' },
        { id: 'terminal', label: 'Terminal', icon: TerminalIcon, color: 'text-purple-400' },
        { id: 'logs', label: 'Logs', icon: List, color: 'text-slate-400' },
        { id: 'flow', label: 'Agent Flow', icon: Activity, color: 'text-cyan-400' },
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
            case 'logs':
                return (
                    <div className="w-full h-full bg-[#020617] font-mono text-[11px] p-4 overflow-auto custom-scrollbar">
                        <div className="flex flex-col gap-1">
                            <div className="text-slate-500 mb-2 border-b border-slate-800 pb-1 flex justify-between">
                                <span>SYSTEM KERNEL LOGS</span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">LIVE</span>
                            </div>
                            {thinkingChain.map((step, i) => (
                                <div key={i} className="flex gap-4 group">
                                    <span className="text-slate-700 shrink-0 select-none">[{new Date(step.ts || Date.now()).toLocaleTimeString()}]</span>
                                    <div className="flex flex-col">
                                        <div className="flex gap-2 items-center">
                                            <span className={`h-1 w-1 rounded-full ${step.status === 'done' ? 'bg-green-500' : 'bg-blue-500 animate-pulse'}`} />
                                            <span className="text-slate-300 font-bold uppercase tracking-tighter">{step.name || 'PROCESS_EXEC'}</span>
                                            <span className="text-slate-600">target: {step.id || 'system'}</span>
                                        </div>
                                        {step.input && (
                                            <div className="text-slate-500 overflow-hidden text-ellipsis whitespace-nowrap max-w-2xl opacity-60 group-hover:opacity-100 italic">
                                                &gt; {JSON.stringify(step.input)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {thinkingChain.length === 0 && (
                                <div className="text-slate-700 italic">Waiting for process initiation...</div>
                            )}
                        </div>
                    </div>
                );
            case 'flow':
                return (
                    <div className="w-full h-full bg-slate-900 p-6 overflow-auto custom-scrollbar">
                        <div className="max-w-3xl mx-auto flex flex-col gap-8">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20">
                                    <Cpu className="text-cyan-400" size={24} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-100">Neural Workflow</h2>
                                    <p className="text-xs text-slate-400 font-medium">Visualization of agent decision making and tool orchestration.</p>
                                </div>
                            </div>

                            {thinkingChain.map((step, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="relative pl-8 border-l border-slate-800 pb-8 last:pb-0"
                                >
                                    <div className={`absolute left-[-5px] top-0 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${step.status === 'done' ? 'bg-green-500' : 'bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.5)] animate-pulse'}`} />

                                    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 hover:bg-slate-800/60 transition-all">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">{step.name || 'Thought Component'}</span>
                                            <span className="text-[10px] text-slate-500 font-mono">{step.duration ? `${step.duration}ms` : 'Active'}</span>
                                        </div>
                                        <p className="text-sm text-slate-200 mb-3">{step.displayName || step.name}</p>
                                        {step.result && (
                                            <div className="bg-black/30 rounded-lg p-3 text-[11px] font-mono text-slate-400 border border-slate-800 overflow-hidden max-h-32">
                                                {typeof step.result === 'string' ? step.result : JSON.stringify(step.result, null, 2)}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            ))}

                            {thinkingChain.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-20 opacity-30">
                                    <Zap size={48} className="mb-4" />
                                    <p className="text-sm font-medium">Waiting for neural activity...</p>
                                </div>
                            )}
                        </div>
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
                                ? 'bg-white/5 text-white shadow-[0_0_15px_rgba(255,255,255,0.03)]'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                                }`}
                        >
                            <tab.icon size={14} className={activeTab === tab.id ? tab.color : 'group-hover:text-slate-400'} />
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
