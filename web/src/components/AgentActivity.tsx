import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Cpu, Loader2, CheckCircle2, XCircle, ChevronRight, ChevronDown,
    Terminal, Wifi, Globe, Database, Sparkles, AlertTriangle, Eye, EyeOff
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
    if (n.includes('browser') || n.includes('web')) return <Globe size={14} className="text-purple-400" />;
    if (n.includes('database') || n.includes('sql')) return <Database size={14} className="text-pink-400" />;
    if (n.includes('terminal') || n.includes('exec')) return <Terminal size={14} className="text-amber-400" />;
    return <Cpu size={14} className="text-blue-400" />;
};

const StepRow = ({ step }: { step: AgentStep }) => {
    const [open, setOpen] = useState(false);
    const { t } = useTranslation();

    const isDone = step.status === 'done';
    const isFailed = step.status === 'failed';
    const isRunning = step.status === 'running';

    const icon = getToolIcon(step.name);

    // Format Inputs/Outputs
    const inputStr = useMemo(() => formatValue(step.input), [step.input]);
    const outputStr = useMemo(() => formatValue(step.result?.output || step.result), [step.result]);

    // Parse error if it looks like JSON or is an object
    const errorDisplay = useMemo(() => {
        if (!step.error) return null;
        if (typeof step.error === 'object') return JSON.stringify(step.error, null, 2);
        try {
            const parsed = JSON.parse(step.error);
            return JSON.stringify(parsed, null, 2);
        } catch {
            return String(step.error);
        }
    }, [step.error]);

    return (
        <div className="border-b border-[var(--border-glass)]/20 last:border-0 hover:bg-[var(--bg-hover)]/30 transition-colors">
            <div
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all ${open ? 'bg-[var(--bg-hover)]/20' : ''}`}
                onClick={() => setOpen(!open)}
            >
                <div className="shrink-0 pt-0.5 relative flex items-center justify-center w-5 h-5">
                    {isRunning ? (
                        <>
                            <div className="absolute inset-0 bg-blue-500/20 blur-sm rounded-full animate-pulse" />
                            <Loader2 size={16} className="animate-spin text-blue-400 relative z-10" />
                        </>
                    ) : isFailed ? (
                        <XCircle size={16} className="text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.3)]" />
                    ) : (
                        <div className="opacity-90 drop-shadow-[0_0_5px_rgba(255,255,255,0.1)]">{icon}</div>
                    )}
                </div>

                <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium truncate ${isFailed ? 'text-red-300' : 'text-[var(--text-primary)]'}`}>
                            {step.displayName || step.name}
                        </span>
                        {step.duration && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--bg-card)] text-[var(--text-secondary)] font-mono border border-[var(--border-glass)]">
                                {(step.duration / 1000).toFixed(1)}s
                            </span>
                        )}
                    </div>
                </div>

                <div className="shrink-0 text-[var(--text-muted)] transition-transform duration-200" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>
                    <ChevronRight size={16} />
                </div>
            </div>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-[var(--bg-card)]/30"
                    >
                        <div className="p-4 pl-12 text-xs font-mono space-y-4">
                            {errorDisplay && (
                                <motion.div
                                    initial={{ opacity: 0, y: -5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="relative overflow-hidden rounded-lg bg-red-500/10 border border-red-500/20"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent pointer-events-none" />
                                    <div className="relative p-3">
                                        <div className="flex items-center gap-2 mb-2 text-red-400 font-semibold uppercase tracking-wider text-[10px]">
                                            <AlertTriangle size={12} />
                                            Error Details
                                        </div>
                                        <pre className="text-red-200/90 whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
                                            {errorDisplay}
                                        </pre>
                                    </div>
                                </motion.div>
                            )}

                            {inputStr && (
                                <div>
                                    <div className="text-[var(--text-muted)] uppercase tracking-wider text-[10px] mb-1.5 flex items-center gap-2">
                                        <span className="w-1 h-1 rounded-full bg-blue-500/50" />
                                        Input Parameters
                                    </div>
                                    <div className="text-[var(--text-secondary)] bg-[var(--bg-card)] p-2.5 rounded-lg border border-[var(--border-glass)]/50 whitespace-pre-wrap overflow-x-auto selection:bg-blue-500/30">
                                        {inputStr}
                                    </div>
                                </div>
                            )}

                            {outputStr && !isFailed && (
                                <div>
                                    <div className="text-[var(--text-muted)] uppercase tracking-wider text-[10px] mb-1.5 flex items-center gap-2">
                                        <span className="w-1 h-1 rounded-full bg-emerald-500/50" />
                                        Result Output
                                    </div>
                                    <div className="bg-[var(--bg-card)] text-emerald-300/90 p-2.5 rounded-lg border border-[var(--border-glass)]/50 whitespace-pre-wrap overflow-x-auto selection:bg-emerald-500/30">
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
    const { t } = useTranslation();

    const isRunning = status === 'running';
    const isFailed = status === 'failed';
    const isDone = status === 'done';

    // Auto-collapse when done after a delay (optional logic could go here)
    // For now, we respect the 'expanded' prop controlled by parent.

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
            className="my-5 rounded-xl border border-[var(--border-glass)] bg-[var(--bg-glass)] shadow-[var(--shadow-glass)] backdrop-blur-xl overflow-hidden ring-1 ring-white/5"
            style={{
                boxShadow: isRunning ? '0 0 20px rgba(59, 130, 246, 0.1)' : undefined
            }}
        >
            {/* Header */}
            <div
                onClick={onToggle}
                className={`
                    relative group flex items-center justify-between px-5 py-3.5 cursor-pointer transition-all duration-300
                    ${expanded ? 'bg-white/[0.03]' : 'hover:bg-white/[0.02]'}
                `}
            >
                {/* Status Indicator Bar */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 transition-colors duration-500 ${isRunning ? 'bg-blue-500' : isFailed ? 'bg-red-500' : isDone ? 'bg-emerald-500' : 'bg-[var(--border-color)]'
                    }`} />

                <div className="flex items-center gap-4 pl-2">
                    <div className={`
                        p-2 rounded-xl border backdrop-blur-md shadow-inner transition-colors duration-500 flex items-center justify-center
                        ${isRunning ? 'bg-blue-500/10 border-blue-500/20 shadow-blue-500/5' :
                            isFailed ? 'bg-red-500/10 border-red-500/20 shadow-red-500/5' :
                                isDone ? 'bg-emerald-500/10 border-emerald-500/20 shadow-emerald-500/5' :
                                    'bg-[var(--bg-card)] border-[var(--border-glass)]'}
                    `}>
                        <Sparkles size={18} className={`
                            transition-colors duration-500
                            ${isRunning ? 'text-blue-400 animate-pulse' :
                                isFailed ? 'text-red-400' :
                                    isDone ? 'text-emerald-400' :
                                        'text-[var(--text-secondary)]'}
                        `} />
                    </div>
                    <div>
                        <div className="text-[14px] font-semibold text-[var(--text-primary)] flex items-center gap-2.5">
                            {isRunning ? 'Agent Working...' : isFailed ? 'Task Failed' : 'Task Completed'}
                            {isRunning && (
                                <span className="flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-blue-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                </span>
                            )}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] font-medium tracking-wide mt-0.5 flex items-center gap-2">
                            <span>{steps.length} STEPS</span>
                            <span className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
                            <span className={isRunning ? 'text-blue-400' : isFailed ? 'text-red-400' : isDone ? 'text-emerald-400' : ''}>
                                {status.toUpperCase()}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors bg-[var(--bg-card)]/50 p-1.5 rounded-lg border border-[var(--border-glass)] group-hover:border-[var(--border-light)]">
                    <div className="transition-transform duration-300" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}>
                        <ChevronDown size={16} />
                    </div>
                </div>
            </div>

            {/* Body */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                    >
                        <div className="border-t border-[var(--border-glass)]/20 bg-[var(--bg-card)]/20">
                            {/* Steps List */}
                            <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                                {steps.length > 0 ? (
                                    steps.map(step => (
                                        <StepRow key={step.key} step={step} />
                                    ))
                                ) : (
                                    <div className="py-12 flex flex-col items-center justify-center text-[var(--text-muted)] gap-3">
                                        <Wifi size={24} className="opacity-20 animate-pulse" />
                                        <div className="text-sm font-medium opacity-60">Initializing neural pathways...</div>
                                    </div>
                                )}
                            </div>

                            {/* Technical Details Footer */}
                            <div className="bg-[var(--bg-glass)] border-t border-[var(--border-glass)]/30 backdrop-blur-md">
                                <div
                                    className="flex items-center justify-between px-5 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors group"
                                    onClick={onToggleTechnical}
                                >
                                    <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs font-medium group-hover:text-[var(--text-primary)] transition-colors">
                                        <Terminal size={12} />
                                        System Logs
                                    </div>
                                    <div className="text-[10px] text-[var(--text-muted)] font-mono group-hover:text-[var(--text-secondary)]">
                                        {logs.length} lines
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {showTechnical && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: '200px', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="border-t border-[var(--border-glass)]/20 bg-black/40 font-mono text-[10px] text-[var(--text-secondary)] overflow-hidden relative"
                                        >
                                            <div className="h-full overflow-y-auto p-4 custom-scrollbar space-y-1">
                                                {logs.length > 0 ? logs.map((log, i) => (
                                                    <div key={i} className="whitespace-pre-wrap break-all border-b border-white/[0.03] pb-0.5 mb-0.5 last:border-0 hover:text-[var(--text-primary)] hover:bg-white/[0.02] px-1 rounded transition-colors">
                                                        <span className="text-[var(--text-muted)] mr-2 opacity-50 select-none">{(i + 1).toString().padStart(3, '0')}</span>
                                                        {log}
                                                    </div>
                                                )) : (
                                                    <div className="text-[var(--text-muted)] italic">No logs available</div>
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
