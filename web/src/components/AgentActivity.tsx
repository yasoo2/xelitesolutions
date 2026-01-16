import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Cpu, Loader2, CheckCircle2, XCircle, ChevronRight, ChevronDown,
    Terminal, Wifi, Globe, Database, Sparkles, AlertTriangle, Eye, EyeOff,
    Code, FileText, Search
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

// --- Types ---
export interface AgentStep {
    key: string;
    name: string;
    displayName?: string;
    status: 'running' | 'done' | 'failed' | 'pending';
    duration?: number;
    input?: any;
    result?: any;
    error?: any;
}

export interface AgentActivityProps {
    runId: string;
    steps: AgentStep[];
    status: 'idle' | 'running' | 'done' | 'failed';
    logs: string[];
    expanded: boolean;
    onToggle: () => void;
    showTechnical?: boolean;
    onToggleTechnical?: () => void;
}

// --- Helpers ---
const formatValue = (val: any, limit = 1000): string => {
    if (val === undefined || val === null) return '';
    let s = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
    if (s.length > limit) s = s.slice(0, limit) + `\n... (${s.length - limit} more chars)`;
    return s;
};

const getToolIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('browser') || n.includes('web')) return <Globe size={18} />;
    if (n.includes('database') || n.includes('sql')) return <Database size={18} />;
    if (n.includes('terminal') || n.includes('exec')) return <Terminal size={18} />;
    if (n.includes('file') || n.includes('read') || n.includes('write')) return <FileText size={18} />;
    if (n.includes('code') || n.includes('gen')) return <Code size={18} />;
    if (n.includes('search')) return <Search size={18} />;
    return <Cpu size={18} />;
};

const StepRow = ({ step }: { step: AgentStep }) => {
    const [open, setOpen] = useState(false);

    const isFailed = step.status === 'failed';
    const isRunning = step.status === 'running';

    const icon = getToolIcon(step.name);

    // Format Inputs/Outputs
    const inputStr = useMemo(() => formatValue(step.input), [step.input]);
    const outputStr = useMemo(() => formatValue(step.result?.output || step.result), [step.result]);

    // Parse error
    const errorDisplay = useMemo(() => {
        if (!step.error) return null;
        if (typeof step.error === 'object') return JSON.stringify(step.error, null, 2);
        try { return JSON.stringify(JSON.parse(step.error), null, 2); } catch { return String(step.error); }
    }, [step.error]);

    return (
        <div className="group border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-hover)] transition-all duration-200">
            <div
                className={`flex items-center gap-4 px-5 py-3.5 cursor-pointer ${open ? 'bg-[var(--bg-hover)]' : ''}`}
                onClick={() => setOpen(!open)}
            >
                {/* Icon Box matching Hero Card style */}
                <div className={`
                    shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border transition-all duration-300
                    ${isRunning
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)]'
                        : isFailed
                            ? 'bg-red-500/10 border-red-500/30 text-red-400'
                            : 'bg-[rgba(var(--accent-rgb),0.05)] border-[var(--border-color)] text-[var(--accent-primary)] group-hover:bg-[var(--accent-primary)] group-hover:text-black group-hover:border-transparent'}
                `}>
                    {isRunning ? <Loader2 size={18} className="animate-spin" /> :
                        isFailed ? <XCircle size={18} /> :
                            icon}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[15px] font-semibold truncate ${isFailed ? 'text-red-400' : 'text-[var(--text-primary)]'
                            }`}>
                            {step.displayName || step.name}
                        </span>
                        {step.duration && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-mono border border-[var(--border-color)]">
                                {(step.duration / 1000).toFixed(1)}s
                            </span>
                        )}
                    </div>
                </div>

                <div className={`
                    shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] 
                    transition-all duration-200 group-hover:bg-[var(--bg-secondary)] group-hover:text-[var(--text-primary)]
                `}>
                    <ChevronRight size={18} className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
                </div>
            </div>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-[var(--bg-secondary)]/30 shadow-inner"
                    >
                        <div className="p-5 pl-[4.5rem] space-y-4 text-xs font-mono">
                            {errorDisplay && (
                                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 relative overflow-hidden">
                                    <div className="flex items-center gap-2 mb-2 text-red-400 font-bold uppercase tracking-wider text-[10px]">
                                        <AlertTriangle size={14} /> Error Details
                                    </div>
                                    <pre className="text-red-200 whitespace-pre-wrap">{errorDisplay}</pre>
                                </div>
                            )}

                            {inputStr && (
                                <div>
                                    <div className="text-[var(--text-secondary)] font-semibold mb-2 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span> Input
                                    </div>
                                    <div className="bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-xl p-3 text-[var(--text-secondary)] whitespace-pre-wrap overflow-x-auto">
                                        {inputStr}
                                    </div>
                                </div>
                            )}

                            {outputStr && !isFailed && (
                                <div>
                                    <div className="text-[var(--text-secondary)] font-semibold mb-2 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Output
                                    </div>
                                    <div className="bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-xl p-3 text-emerald-400/90 whitespace-pre-wrap overflow-x-auto">
                                        {outputStr}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export const AgentActivity: React.FC<AgentActivityProps> = ({
    steps,
    status,
    logs,
    expanded,
    onToggle,
    showTechnical,
    onToggleTechnical
}) => {
    const isRunning = status === 'running';
    const isFailed = status === 'failed';
    const isDone = status === 'done';

    // Auto-collapse when done after a delay (optional logic could go here)
    // For now, we respect the 'expanded' prop controlled by parent.

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`
                my-6 rounded-[20px] overflow-hidden transition-all duration-300
                bg-[var(--bg-card)] border border-[var(--border-color)]
                ${isRunning ? 'shadow-[0_0_30px_rgba(59,130,246,0.15)] border-blue-500/30' : 'shadow-xl'}
                ${isFailed ? 'shadow-[0_0_30px_rgba(239,68,68,0.15)] border-red-500/30' : ''}
            `}
        >
            {/* Header / Hero Card Style */}
            <div
                onClick={onToggle}
                className="relative p-5 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors group select-none"
            >
                {/* Status Bar */}
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors duration-500 ${isRunning ? 'bg-blue-500' : isFailed ? 'bg-red-500' : isDone ? 'bg-emerald-500' : 'bg-[var(--border-color)]'
                    }`} />

                <div className="flex items-center justify-between pl-3">
                    <div className="flex items-center gap-5">
                        {/* Main Status Icon */}
                        <div className={`
                            w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-500
                            ${isRunning
                                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25 border-transparent scale-110'
                                : isFailed
                                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/25 border-transparent'
                                    : isDone
                                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 border-transparent'
                                        : 'bg-[rgba(var(--accent-rgb),0.1)] text-[var(--accent-primary)] border-[var(--border-color)]'}
                        `}>
                            {isRunning ? <Loader2 size={24} className="animate-spin" /> :
                                isFailed ? <AlertTriangle size={24} /> :
                                    isDone ? <CheckCircle2 size={24} /> :
                                        <Sparkles size={24} />}
                        </div>

                        <div>
                            {/* Explicit text color enforcement using CSS vars for Day/Night mode switch */}
                            <h3 className="text-lg font-bold text-[color:var(--text-primary)] flex items-center gap-3">
                                {isRunning ? 'Agent Working' : isFailed ? 'Task Interrupted' : 'Task Complete'}
                                {isRunning && (
                                    <span className="flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-blue-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                                    </span>
                                )}
                            </h3>
                            <div className="flex items-center gap-2 mt-1 text-[13px] font-medium text-[color:var(--text-secondary)]">
                                <span className="bg-[var(--bg-secondary)] px-2 py-0.5 rounded border border-[var(--border-color)]">
                                    {steps.length} Actions
                                </span>
                                <span className={`uppercase tracking-wider font-semibold ${isRunning ? 'text-blue-500' : isFailed ? 'text-red-500' : isDone ? 'text-emerald-500' : 'text-[color:var(--text-muted)]'
                                    }`}>
                                    {status}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className={`
                        w-10 h-10 rounded-xl flex items-center justify-center border border-[var(--border-color)]
                        text-[color:var(--text-muted)] transition-all duration-300
                        group-hover:border-[var(--accent-primary)] group-hover:text-[var(--accent-primary)] group-hover:bg-[rgba(var(--accent-rgb),0.1)]
                    `}>
                        <ChevronDown size={20} className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
                    </div>
                </div>
            </div>

            {/* Content Body */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
                    >
                        <div className="border-t border-[var(--border-color)] bg-[rgba(0,0,0,0.2)]">
                            <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                                {steps.length > 0 ? (
                                    steps.map(step => <StepRow key={step.key} step={step} />)
                                ) : (
                                    <div className="py-16 flex flex-col items-center justify-center text-[var(--text-secondary)] gap-4">
                                        <div className="w-16 h-16 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center animate-pulse">
                                            <Wifi size={28} className="opacity-50" />
                                        </div>
                                        <div className="text-sm font-medium opacity-70">Waiting for intelligence stream...</div>
                                    </div>
                                )}
                            </div>

                            {/* Footer / Logs */}
                            <div className="bg-[var(--bg-dark)] border-t border-[var(--border-color)]">
                                <div
                                    className="flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors group"
                                    onClick={onToggleTechnical}
                                >
                                    <div className="flex items-center gap-2 text-[var(--text-secondary)] text-xs font-semibold uppercase tracking-wider group-hover:text-[var(--text-primary)]">
                                        <Terminal size={14} /> System Logs
                                    </div>
                                    <div className="text-[10px] px-2 py-1 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)] font-mono border border-[var(--border-color)] group-hover:border-[var(--text-muted)]">
                                        {logs.length} Lines
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {showTechnical && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: '240px', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="border-t border-[var(--border-color)] bg-[#000000] font-mono text-[11px] text-[var(--text-secondary)] overflow-hidden relative"
                                        >
                                            <div className="h-full overflow-y-auto p-4 custom-scrollbar space-y-1">
                                                {logs.length > 0 ? logs.map((log, i) => (
                                                    <div key={i} className="flex gap-3 border-b border-white/5 pb-1 mb-1 last:border-0 hover:bg-white/5 px-2 py-0.5 rounded transition-colors break-words">
                                                        <span className="text-[var(--text-muted)] opacity-40 select-none w-8 text-right">{(i + 1)}</span>
                                                        <span className="flex-1 text-[var(--text-primary)] opacity-90">{log}</span>
                                                    </div>
                                                )) : (
                                                    <div className="text-[var(--text-muted)] italic p-2">No system logs available.</div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};
