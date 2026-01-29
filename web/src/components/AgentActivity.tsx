import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle, Loader2, Circle } from 'lucide-react';

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
    const { t } = useTranslation();

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
                {t('errorEncountered', 'حدث خطأ')}
            </motion.div>
        );
    }

    if (status === 'idle' && steps.length === 0 && logs.length === 0) return null;

    const phaseLabels = useMemo(() => {
        const rawExecute = t('executePrefix', { tool: '' });
        const execute = String(rawExecute || '').replace(/[:：]\s*$/, '').trim() || t('statusRunning', 'قيد التنفيذ');
        return {
            plan: t('tools.plan', 'تحليل وتخطيط'),
            execute,
            summarize: t('tools.summarize', 'تلخيص النتائج'),
        };
    }, [t]);

    const detectPhase = (stepName: string) => {
        const name = String(stepName || '');
        if (name === 'plan' || name.startsWith('planning_step_')) return 'plan';
        if (name === 'summarize' || name.startsWith('summarize')) return 'summarize';
        if (name.startsWith('execute:')) return 'execute';
        return 'execute';
    };

    const [activePhase, setActivePhase] = useState<'all' | 'plan' | 'execute' | 'summarize'>('all');

    const currentThought = useMemo(() => {
        const runningStep = steps.find(s => s.status === 'running');
        const lastStep = steps[steps.length - 1];

        const activeStep = runningStep || lastStep;

        if (!activeStep) return t('processing', 'جارٍ المعالجة...');
        const name = (activeStep.displayName || activeStep.name || '').trim();
        return name ? `${name}…` : t('processing', 'جارٍ المعالجة...');
    }, [steps, t]);

    const { totalCount, doneCount, failedCount } = useMemo(() => {
        const total = steps.length;
        const done = steps.filter((s) => s.status === 'done').length;
        const failed = steps.filter((s) => s.status === 'failed').length;
        return { totalCount: total, doneCount: done, failedCount: failed };
    }, [steps]);

    const phaseStats = useMemo(() => {
        const base = {
            plan: { total: 0, done: 0, running: 0, failed: 0 },
            execute: { total: 0, done: 0, running: 0, failed: 0 },
            summarize: { total: 0, done: 0, running: 0, failed: 0 },
        };

        for (const s of steps) {
            const ph = detectPhase(s.name) as 'plan' | 'execute' | 'summarize';
            base[ph].total += 1;
            if (s.status === 'done') base[ph].done += 1;
            else if (s.status === 'running') base[ph].running += 1;
            else if (s.status === 'failed') base[ph].failed += 1;
        }

        const toStatus = (ph: keyof typeof base): 'pending' | 'running' | 'done' | 'failed' => {
            const st = base[ph];
            if (st.failed > 0) return 'failed';
            if (st.running > 0) return 'running';
            if (st.total > 0 && st.done === st.total) return 'done';
            return 'pending';
        };

        return {
            ...base,
            status: {
                plan: toStatus('plan'),
                execute: toStatus('execute'),
                summarize: toStatus('summarize'),
            },
        };
    }, [steps]);

    const filteredSteps = useMemo(() => {
        if (activePhase === 'all') return steps;
        return steps.filter((s) => detectPhase(s.name) === activePhase);
    }, [activePhase, steps]);

    const visibleLogs = useMemo(() => {
        const arr = Array.isArray(logs) ? logs : [];
        return arr.slice(Math.max(0, arr.length - 50));
    }, [logs]);

    const progress = totalCount > 0 ? Math.max(0, Math.min(1, doneCount / totalCount)) : 0;

    const statusLabel =
        status === 'done'
            ? t('statusDone', 'تم')
            : status === 'running'
                ? t('statusRunning', 'قيد التنفيذ')
                : t('processing', 'جارٍ المعالجة...');

    const statusTone =
        status === 'done' ? 'text-emerald-300' : 'text-cyan-300';

    const phasePill = (
        id: 'plan' | 'execute' | 'summarize',
        label: string,
        phStatus: 'pending' | 'running' | 'done' | 'failed'
    ) => {
        const selected = activePhase === id;
        const base =
            phStatus === 'done'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : phStatus === 'failed'
                    ? 'border-red-500/30 bg-red-500/10 text-red-200'
                    : phStatus === 'running'
                        ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
                        : 'border-slate-700/60 bg-slate-900/30 text-slate-300';

        return (
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActivePhase((prev) => (prev === id ? 'all' : id));
                }}
                className={[
                    'px-2.5 py-1 rounded-full border text-[11px] leading-4 font-medium transition-colors',
                    base,
                    selected ? 'ring-1 ring-white/10' : 'hover:border-slate-500/60',
                ].join(' ')}
            >
                <span className="inline-flex items-center gap-1.5">
                    {phStatus === 'done' ? <CheckCircle2 size={12} /> : phStatus === 'failed' ? <XCircle size={12} /> : phStatus === 'running' ? <Loader2 size={12} className="animate-spin" /> : <Circle size={10} />}
                    <span className="truncate">{label}</span>
                </span>
            </button>
        );
    };

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
                                <div className={['text-sm font-semibold', statusTone].join(' ')}>
                                    {statusLabel}
                                </div>
                                <div className="text-xs text-slate-400 tabular-nums">
                                    {failedCount ? `${t('statusFailed', 'فشل')} ${failedCount}` : totalCount ? `${doneCount}/${totalCount}` : ''}
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
                            {totalCount ? (
                                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800/70 overflow-hidden">
                                    <div
                                        className={[
                                            'h-full rounded-full transition-all',
                                            status === 'done' ? 'bg-emerald-500/70' : 'bg-cyan-500/70',
                                        ].join(' ')}
                                        style={{ width: `${Math.round(progress * 100)}%` }}
                                    />
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="text-xs text-slate-400 shrink-0">{expanded ? 'إخفاء' : 'عرض'}</div>
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
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2 flex-wrap">
                                    {phasePill('plan', phaseLabels.plan, phaseStats.status.plan)}
                                    {phasePill('execute', phaseLabels.execute, phaseStats.status.execute)}
                                    {phasePill('summarize', phaseLabels.summarize, phaseStats.status.summarize)}
                                </div>
                                {activePhase !== 'all' ? (
                                    <div className="text-[11px] text-slate-400">
                                        {t('stepsLabel', 'خطوات')}: {filteredSteps.length}
                                    </div>
                                ) : null}
                            </div>

                            {filteredSteps.length ? (
                                <div className="rounded-xl border border-slate-700/50 bg-slate-950/40 px-3 py-2">
                                    <div className="text-xs font-semibold text-slate-300 mb-2">{t('stepsLabel', 'خطوات')}</div>
                                    <div className="grid gap-2">
                                        {filteredSteps.map((s) => (
                                            <div key={s.key} className="flex items-start justify-between gap-3 text-xs">
                                                <div className="flex items-start gap-2 min-w-0">
                                                    <span className="shrink-0 mt-0.5 text-slate-300">
                                                        {s.status === 'done' ? (
                                                            <CheckCircle2 size={14} className="text-emerald-400" />
                                                        ) : s.status === 'failed' ? (
                                                            <XCircle size={14} className="text-red-400" />
                                                        ) : s.status === 'running' ? (
                                                            <Loader2 size={14} className="text-cyan-300 animate-spin" />
                                                        ) : (
                                                            <Circle size={12} className="text-slate-500" />
                                                        )}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="truncate text-slate-200 font-medium">{String(s.displayName || s.name || '')}</div>
                                                        {showTechnical && (s.error != null) ? (
                                                            <div className="mt-0.5 text-[11px] text-red-300 whitespace-pre-wrap break-words">
                                                                {String(s.error)}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                <span className="shrink-0 text-slate-400 tabular-nums">
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
                                        <div className="text-xs font-semibold text-slate-300">{t('systemLogs', 'سجلّ النظام')}</div>
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
                                                {showTechnical ? t('hideTechnicalDetails', 'إخفاء التفاصيل التقنية') : t('showTechnicalDetails', 'عرض التفاصيل التقنية')}
                                            </button>
                                        ) : null}
                                    </div>
                                    <pre className="text-[11px] leading-5 whitespace-pre-wrap break-words text-slate-200 max-h-64 overflow-auto">
                                        {showTechnical ? visibleLogs.join('\n') : visibleLogs.slice(-6).join('\n')}
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
