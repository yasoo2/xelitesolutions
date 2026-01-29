import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

export const AgentActivity = React.forwardRef<HTMLDivElement, AgentActivityProps>(
    ({ status, steps, logs, expanded, onToggle, showTechnical, onToggleTechnical }, ref) => {
    // Safety: Minimal error state
    if (status === 'failed') {
        return (
            <motion.div
                ref={ref}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="my-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-medium flex items-center justify-center gap-2"
            >
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                توقف التنفيذ
            </motion.div>
        );
    }

    if (status === 'idle' && steps.length === 0 && logs.length === 0) return null;

    const currentThought = useMemo(() => {
        const runningStep = steps.find(s => s.status === 'running');
        const lastStep = steps[steps.length - 1];

        const activeStep = runningStep || lastStep;

        if (!activeStep) return "جاري التنفيذ…";
        const name = (activeStep.displayName || activeStep.name || '').trim();
        return name ? `${name}…` : "جاري التنفيذ…";
    }, [steps]);

    const { totalCount, doneCount, failedCount } = useMemo(() => {
        const total = steps.length;
        const done = steps.filter((s) => s.status === 'done').length;
        const failed = steps.filter((s) => s.status === 'failed').length;
        return { totalCount: total, doneCount: done, failedCount: failed };
    }, [steps]);

    const visibleLogs = useMemo(() => {
        const arr = Array.isArray(logs) ? logs : [];
        return arr.slice(Math.max(0, arr.length - 50));
    }, [logs]);

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="my-4 w-full"
        >
            <div
                className="rounded-2xl border border-slate-700/60 bg-slate-900/40 backdrop-blur px-4 py-3"
                dir="auto"
            >
                <button
                    type="button"
                    onClick={onToggle}
                    className="w-full flex items-center justify-between gap-3 text-left"
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                            <motion.div
                                className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-500 border-r-blue-500"
                                animate={status === 'running' ? { rotate: 360 } : undefined}
                                transition={status === 'running' ? { duration: 2, ease: "linear", repeat: Infinity } : undefined}
                            />
                            <motion.div
                                className="absolute inset-2 rounded-full border-2 border-transparent border-b-purple-500 border-l-pink-500"
                                animate={status === 'running' ? { rotate: -360 } : undefined}
                                transition={status === 'running' ? { duration: 3, ease: "linear", repeat: Infinity } : undefined}
                            />
                            <motion.div
                                className="w-2.5 h-2.5 bg-white rounded-full"
                                animate={status === 'running' ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                                transition={status === 'running' ? { duration: 1.2, repeat: Infinity } : { duration: 0.2 }}
                                style={{ boxShadow: '0 0 18px rgba(56, 189, 248, 0.55)' }}
                            />
                        </div>

                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold" style={{ color: '#22d3ee' }}>
                                    {status === 'done' ? 'تم التنفيذ' : status === 'running' ? 'قيد التنفيذ' : 'تنفيذ'}
                                </div>
                                <div className="text-xs text-slate-400">
                                    {failedCount ? `فشل ${failedCount}` : totalCount ? `${doneCount}/${totalCount}` : ''}
                                </div>
                            </div>
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentThought}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.18 }}
                                    className="mt-1 text-xs font-mono truncate"
                                    style={{ color: 'var(--text-muted)' }}
                                >
                                    {currentThought}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>

                    <div className="text-xs text-slate-400 shrink-0">
                        {expanded ? 'إخفاء' : 'عرض'}
                    </div>
                </button>

                <AnimatePresence initial={false}>
                    {expanded ? (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.18 }}
                            className="mt-3 grid gap-3"
                        >
                            {steps.length ? (
                                <div className="rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2">
                                    <div className="text-xs font-semibold text-slate-300 mb-2">الخطوات</div>
                                    <div className="grid gap-1">
                                        {steps.map((s) => (
                                            <div key={s.key} className="flex items-center justify-between gap-2 text-xs">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="shrink-0">
                                                        {s.status === 'done' ? '✓' : s.status === 'failed' ? '✕' : s.status === 'running' ? '…' : '•'}
                                                    </span>
                                                    <span className="truncate text-slate-200">{String(s.displayName || s.name || '')}</span>
                                                </div>
                                                <span className="shrink-0 text-slate-400">
                                                    {typeof s.duration === 'number' && Number.isFinite(s.duration) ? `${Math.max(0, Math.round(s.duration))}ms` : ''}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {visibleLogs.length ? (
                                <div className="rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <div className="text-xs font-semibold text-slate-300">السجلّ</div>
                                        {onToggleTechnical ? (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    onToggleTechnical();
                                                }}
                                                className="text-xs text-slate-400 hover:text-slate-200"
                                            >
                                                {showTechnical ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
                                            </button>
                                        ) : null}
                                    </div>
                                    <pre className="text-[11px] leading-5 whitespace-pre-wrap break-words text-slate-200 max-h-64 overflow-auto">
                                        {showTechnical ? visibleLogs.join('\n') : visibleLogs.slice(-1).join('\n')}
                                    </pre>
                                </div>
                            ) : null}
                        </motion.div>
                    ) : null}
                </AnimatePresence>
            </div>
        </motion.div>
    );
});

AgentActivity.displayName = 'AgentActivity';
