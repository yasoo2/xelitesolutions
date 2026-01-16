import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Cpu, Loader2, CheckCircle2, XCircle, ChevronRight, ChevronDown,
    Terminal, Wifi, Globe, Database, Sparkles, AlertTriangle, Eye, EyeOff,
    Code, FileText, Search, ArrowRight
} from 'lucide-react';

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
    if (n.includes('browser') || n.includes('web')) return <Globe size={16} />;
    if (n.includes('database') || n.includes('sql')) return <Database size={16} />;
    if (n.includes('terminal') || n.includes('exec')) return <Terminal size={16} />;
    if (n.includes('file') || n.includes('read') || n.includes('write')) return <FileText size={16} />;
    if (n.includes('code') || n.includes('gen')) return <Code size={16} />;
    if (n.includes('search')) return <Search size={16} />;
    return <Cpu size={16} />;
};

const StepRow = ({ step }: { step: AgentStep }) => {
    const [open, setOpen] = useState(false);
    const isFailed = step.status === 'failed';
    const isRunning = step.status === 'running';

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
        <div className="border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors">
            <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
                onClick={() => setOpen(!open)}
            >
                {/* Status Indicator (Minimalist Dot) */}
                <div className="w-4 flex items-center justify-center">
                    {isRunning ? <Loader2 size={14} className="animate-spin text-blue-500" /> :
                        isFailed ? <div className="w-2 h-2 rounded-full bg-red-500" /> :
                            <div className="w-2 h-2 rounded-full bg-emerald-500/50" />}
                </div>

                {/* Tool Icon */}
                <div className="text-[var(--text-muted)] opacity-70">
                    {getToolIcon(step.name)}
                </div>

                {/* Step Name */}
                <div className="flex-1 font-medium text-[13px] text-[var(--text-primary)] truncate">
                    {step.displayName || step.name}
                </div>

                {/* Duration */}
                {step.duration && (
                    <div className="text-[11px] font-mono text-[var(--text-muted)] opacity-60">
                        {(step.duration / 1000).toFixed(1)}s
                    </div>
                )}

                {/* Chevron */}
                <ChevronRight size={14} className={`text-[var(--text-muted)] transition-transform ${open ? 'rotate-90' : ''}`} />
            </div>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-[var(--bg-secondary)]"
                    >
                        <div className="p-4 pl-11 space-y-3 text-xs font-mono border-t border-[var(--border-color)]">
                            {errorDisplay && (
                                <div className="text-red-400 bg-red-900/10 p-2 rounded border border-red-500/20 whitespace-pre-wrap">
                                    <div className="font-bold mb-1">Error:</div>
                                    {errorDisplay}
                                </div>
                            )}

                            {inputStr && (
                                <div>
                                    <div className="text-[var(--text-muted)] mb-1 flex items-center gap-1.5 uppercase text-[10px] tracking-wider font-semibold">
                                        <ArrowRight size={10} /> Input
                                    </div>
                                    <div className="text-[var(--text-secondary)] whitespace-pre-wrap overflow-x-auto opacity-90 pl-3 border-l-2 border-[var(--border-color)]">
                                        {inputStr}
                                    </div>
                                </div>
                            )}

                            {outputStr && !isFailed && (
                                <div className="pt-1">
                                    <div className="text-[var(--text-muted)] mb-1 flex items-center gap-1.5 uppercase text-[10px] tracking-wider font-semibold">
                                        <ArrowRight size={10} /> Output
                                    </div>
                                    <div className="text-[var(--text-primary)] whitespace-pre-wrap overflow-x-auto pl-3 border-l-2 border-emerald-500/30">
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

    return (
        <div className={`
            my-4 rounded-lg overflow-hidden border transition-all duration-200
            bg-[var(--bg-card)] border-[var(--border-color)]
            ${isRunning ? 'border-blue-500/40 shadow-sm shadow-blue-500/10' : ''}
        `}>
            {/* Header - Simple & Clean */}
            <div
                onClick={onToggle}
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors select-none"
            >
                <div className="flex items-center gap-3">
                    {/* Status Icon */}
                    <div className="flex items-center justify-center">
                        {isRunning ? <Loader2 size={18} className="animate-spin text-blue-500" /> :
                            isFailed ? <XCircle size={18} className="text-red-500" /> :
                                isDone ? <CheckCircle2 size={18} className="text-emerald-500" /> :
                                    <Sparkles size={18} className="text-[var(--text-muted)]" />}
                    </div>

                    {/* Title & Status */}
                    <div className="flex items-baseline gap-3">
                        <span className="text-[14px] font-semibold text-[var(--text-primary)]">
                            {isRunning ? 'Agent Working...' : 'Activity Log'}
                        </span>
                        <span className={`text-[11px] font-mono uppercase tracking-wider ${isRunning ? 'text-blue-500' : 'text-[var(--text-muted)]'
                            }`}>
                            {status}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-secondary)] px-2 py-0.5 rounded border border-[var(--border-color)]">
                        {steps.length}
                    </span>
                    <ChevronDown size={16} className={`text-[var(--text-muted)] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                </div>
            </div>

            {/* Content */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        className="border-t border-[var(--border-color)]"
                    >
                        <div className="max-h-[500px] overflow-y-auto">
                            {steps.length > 0 ? (
                                steps.map(step => <StepRow key={step.key} step={step} />)
                            ) : (
                                <div className="py-8 flex text-[var(--text-muted)] justify-center text-xs italic">
                                    No activity recorded yet.
                                </div>
                            )}
                        </div>

                        {/* Logs Footer */}
                        {logs.length > 0 && (
                            <div className="border-t border-[var(--border-color)] bg-[var(--bg-secondary)]">
                                <div
                                    className="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-hover)]"
                                    onClick={onToggleTechnical}
                                >
                                    <div className="flex items-center gap-2 text-[11px] font-medium text-[var(--text-secondary)]">
                                        <Terminal size={12} /> Console Output
                                    </div>
                                    <span className="text-[10px] font-mono text-[var(--text-muted)]">{logs.length}</span>
                                </div>
                                <AnimatePresence>
                                    {showTechnical && (
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: 200 }}
                                            exit={{ height: 0 }}
                                            className="overflow-hidden border-t border-[var(--border-color)] bg-[#0d0d0d]"
                                        >
                                            <div className="p-3 h-full overflow-y-auto font-mono text-[10px] text-gray-300 space-y-1">
                                                {logs.map((log, i) => (
                                                    <div key={i} className="flex gap-2 opacity-80 hover:opacity-100">
                                                        <span className="text-gray-600 select-none w-6 text-right">{i + 1}</span>
                                                        <span className="break-all">{log}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
