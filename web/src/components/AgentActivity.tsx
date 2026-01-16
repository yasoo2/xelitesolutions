
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Cpu, Loader2, CheckCircle2, XCircle, ChevronRight, ChevronDown,
    Code, Terminal, FileText, Globe, Search, Database, Layers,
    Eye, EyeOff, Sparkles, AlertTriangle
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
    if (n.includes('write') || n.includes('edit')) return <Code size={14} className="text-blue-400" />;
    if (n.includes('read') || n.includes('tree')) return <FileText size={14} className="text-emerald-400" />;
    if (n.includes('shell') || n.includes('exec')) return <Terminal size={14} className="text-amber-400" />;
    if (n.includes('web') || n.includes('browser')) return <Globe size={14} className="text-purple-400" />;
    if (n.includes('search')) return <Search size={14} className="text-sky-400" />;
    if (n.includes('sql') || n.includes('db')) return <Database size={14} className="text-pink-400" />;
    return <Sparkles size={14} className="text-gray-400" />;
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

    return (
        <div className="border-b border-white/5 last:border-0">
            <div
                className={`flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-white/5 transition-colors ${open ? 'bg-white/5' : ''}`}
                onClick={() => setOpen(!open)}
            >
                <div className="shrink-0 pt-0.5">
                    {isRunning ? <Loader2 size={14} className="animate-spin text-blue-400" /> :
                        isFailed ? <XCircle size={14} className="text-red-400" /> :
                            <div className="opacity-80">{icon}</div>}
                </div>

                <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-gray-200 truncate">{step.displayName || step.name}</span>
                        {step.duration && <span className="text-[10px] text-gray-500 font-mono">{(step.duration / 1000).toFixed(1)}s</span>}
                    </div>
                </div>

                <div className="shrink-0 text-gray-500">
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
            </div>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-black/20"
                    >
                        <div className="p-3 pl-10 text-xs font-mono space-y-3">
                            {inputStr && (
                                <div>
                                    <div className="text-gray-500 uppercase tracking-wider text-[10px] mb-1">Input</div>
                                    <div className="text-gray-300 bg-black/30 p-2 rounded border border-white/5 whitespace-pre-wrap overflow-x-auto">
                                        {inputStr}
                                    </div>
                                </div>
                            )}

                            {outputStr && (
                                <div>
                                    <div className="text-gray-500 uppercase tracking-wider text-[10px] mb-1">Output</div>
                                    <div className={`p-2 rounded border border-white/5 whitespace-pre-wrap overflow-x-auto ${isFailed ? 'bg-red-900/10 text-red-200 border-red-900/20' : 'bg-black/30 text-emerald-300'}`}>
                                        {outputStr}
                                    </div>
                                </div>
                            )}

                            {step.error && (
                                <div className="bg-red-900/20 border border-red-900/30 p-2 rounded text-red-300">
                                    <div className="flex items-center gap-2 mb-1">
                                        <AlertTriangle size={12} />
                                        <span className="font-bold">Error</span>
                                    </div>
                                    {String(step.error)}
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

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="my-4 rounded-xl border border-white/10 bg-[#0F1117] shadow-xl overflow-hidden"
        >
            {/* Header */}
            <div
                onClick={onToggle}
                className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-white/5 to-transparent cursor-pointer hover:bg-white/10 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg ${isRunning ? 'bg-blue-500/20' : isFailed ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
                        <Cpu size={16} className={isRunning ? 'text-blue-400 animate-pulse' : isFailed ? 'text-red-400' : 'text-green-400'} />
                    </div>
                    <div>
                        <div className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                            Agent Cognitive Stream
                            {isRunning && <span className="flex h-2 w-2 rounded-full bg-blue-400 animate-pulse" />}
                        </div>
                        <div className="text-[11px] text-gray-500 font-medium">
                            {steps.length} steps • {status.toUpperCase()}
                        </div>
                    </div>
                </div>

                <div className="text-gray-500">
                    {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </div>
            </div>

            {/* Body */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                    >
                        <div className="border-t border-white/10">
                            {/* Steps List */}
                            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                                {steps.map(step => (
                                    <StepRow key={step.key} step={step} />
                                ))}

                                {steps.length === 0 && (
                                    <div className="p-8 text-center text-gray-600 italic text-sm">
                                        Waiting for neural activity...
                                    </div>
                                )}
                            </div>

                            {/* Technical Details Footer */}
                            <div className="bg-black/40 border-t border-white/5">
                                <div
                                    className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:text-gray-300 text-gray-500 text-xs font-medium"
                                    onClick={onToggleTechnical}
                                >
                                    {showTechnical ? <EyeOff size={12} /> : <Eye size={12} />}
                                    {showTechnical ? 'Hide System Logs' : 'Show System Logs'}
                                </div>

                                {showTechnical && logs.length > 0 && (
                                    <div className="border-t border-white/5 p-3 bg-black/20 font-mono text-[10px] text-gray-400 h-32 overflow-y-auto">
                                        {logs.map((log, i) => (
                                            <div key={i} className="mb-1 border-b border-white/5 pb-1 last:border-0 last:pb-0 font-mono whitespace-pre-wrap">
                                                {log}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};
