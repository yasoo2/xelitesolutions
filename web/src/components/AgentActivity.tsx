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
                className="my-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    color: 'rgb(239, 68, 68)',
                }}
            >
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                {t('errorEncountered', 'حدث خطأ')}
            </motion.div>
        );
    }

    if (status === 'idle' && steps.length === 0 && logs.length === 0) return null;

    const visibleStepsAll = useMemo(() => {
        const out: AgentStep[] = [];
        for (const s of Array.isArray(steps) ? steps : []) {
            const name = String(s?.name || '').trim();
            const display = String(s?.displayName || '').trim();
            const tool = name.toLowerCase().startsWith('execute:') ? name.slice('execute:'.length).trim() : '';
            if (tool === 'central_answer') continue;
            if (/(?:^|\b)central_answer(?:\b|$)/i.test(name) || /(?:^|\b)central_answer(?:\b|$)/i.test(display)) continue;
            if (/^عملية التفكير\b/.test(name) || /^thinking\s*process\b/i.test(name)) continue;
            out.push(s);
        }
        return out;
    }, [steps]);

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
        const runningStep = visibleStepsAll.find(s => s.status === 'running');
        const lastStep = visibleStepsAll[visibleStepsAll.length - 1];

        const activeStep = runningStep || lastStep;

        if (!activeStep) return t('processing', 'جارٍ المعالجة...');
        const name = (activeStep.displayName || activeStep.name || '').trim();
        return name ? `${name}…` : t('processing', 'جارٍ المعالجة...');
    }, [visibleStepsAll, t]);

    const { totalCount, doneCount, failedCount } = useMemo(() => {
        const total = visibleStepsAll.length;
        const done = visibleStepsAll.filter((s) => s.status === 'done').length;
        const failed = visibleStepsAll.filter((s) => s.status === 'failed').length;
        return { totalCount: total, doneCount: done, failedCount: failed };
    }, [visibleStepsAll]);

    const phaseStats = useMemo(() => {
        const base = {
            plan: { total: 0, done: 0, running: 0, failed: 0 },
            execute: { total: 0, done: 0, running: 0, failed: 0 },
            summarize: { total: 0, done: 0, running: 0, failed: 0 },
        };

        for (const s of visibleStepsAll) {
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
    }, [visibleStepsAll]);

    const filteredSteps = useMemo(() => {
        if (activePhase === 'all') return visibleStepsAll;
        return visibleStepsAll.filter((s) => detectPhase(s.name) === activePhase);
    }, [activePhase, visibleStepsAll]);

    const visibleLogs = useMemo(() => {
        const arr = Array.isArray(logs) ? logs : [];
        return arr
            .map((l) => String(l || '').trim())
            .filter((l) => l && !/(?:^|\b)central_answer(?:\b|$)/i.test(l) && !/^عملية التفكير\b/.test(l) && !/^thinking\s*process\b/i.test(l))
            .slice(Math.max(0, arr.length - 50));
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
        const pillStyle: React.CSSProperties =
            phStatus === 'done'
                ? { background: 'rgba(16, 185, 129, 0.14)', borderColor: 'rgba(16, 185, 129, 0.35)', color: 'rgb(16, 185, 129)' }
                : phStatus === 'failed'
                    ? { background: 'rgba(239, 68, 68, 0.14)', borderColor: 'rgba(239, 68, 68, 0.35)', color: 'rgb(239, 68, 68)' }
                    : phStatus === 'running'
                        ? { background: 'rgba(var(--accent-primary-rgb), 0.14)', borderColor: 'rgba(var(--accent-primary-rgb), 0.35)', color: 'var(--accent-primary)' }
                        : { background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' };

        return (
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActivePhase((prev) => (prev === id ? 'all' : id));
                }}
                className={[
                    'px-2.5 py-1 rounded-full border text-[11px] leading-4 font-semibold transition-colors whitespace-nowrap',
                    selected ? 'ring-1 ring-black/10' : '',
                ].join(' ')}
                style={pillStyle}
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
                className="rounded-2xl px-4 py-3"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)' }}
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
                                className="absolute inset-0 rounded-full"
                                animate={status === 'running' ? { rotate: 360 } : undefined}
                                transition={status === 'running' ? { duration: 2, ease: "linear", repeat: Infinity } : undefined}
                                style={{
                                    border: '2px solid rgba(0,0,0,0)',
                                    borderTopColor: 'var(--accent-primary)',
                                    borderRightColor: 'rgba(var(--accent-primary-rgb), 0.35)',
                                }}
                            />
                            <motion.div
                                className="w-2.5 h-2.5 rounded-full"
                                animate={status === 'running' ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                                transition={status === 'running' ? { duration: 1.2, repeat: Infinity } : { duration: 0.2 }}
                                style={{ background: 'var(--accent-primary)', boxShadow: '0 0 18px var(--accent-glow)' }}
                            />
                        </div>

                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <div className={['text-sm font-semibold', statusTone].join(' ')} style={{ color: status === 'done' ? 'var(--accent-success)' : 'var(--accent-primary)' }}>
                                    {statusLabel}
                                </div>
                                <div className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
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
                                <div className="mt-2 h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                                    <div
                                        className="h-full rounded-full transition-all"
                                        style={{ background: 'var(--brand-gradient)', width: `${Math.round(progress * 100)}%` }}
                                    />
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>{expanded ? 'إخفاء' : 'عرض'}</div>
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
                                    <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                        {t('stepsLabel', 'خطوات')}: {filteredSteps.length}
                                    </div>
                                ) : null}
                            </div>

                            {filteredSteps.length ? (
                                <div className="rounded-xl px-3 py-2" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                    <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>{t('stepsLabel', 'خطوات')}</div>
                                    <div className="grid gap-2">
                                        {filteredSteps.map((s) => (
                                            <div key={s.key} className="flex items-start justify-between gap-3 text-xs">
                                                <div className="flex items-start gap-2 min-w-0">
                                                    <span className="shrink-0 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                                        {s.status === 'done' ? (
                                                            <CheckCircle2 size={14} style={{ color: 'var(--accent-success)' }} />
                                                        ) : s.status === 'failed' ? (
                                                            <XCircle size={14} style={{ color: 'var(--accent-danger)' }} />
                                                        ) : s.status === 'running' ? (
                                                            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                                                        ) : (
                                                            <Circle size={12} style={{ color: 'var(--text-muted)' }} />
                                                        )}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>{String(s.displayName || s.name || '')}</div>
                                                        {showTechnical && (s.error != null) ? (
                                                            <div className="mt-0.5 text-[11px] whitespace-pre-wrap break-words" style={{ color: 'rgb(239, 68, 68)' }}>
                                                                {String(s.error)}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                <span className="shrink-0 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                                                    {typeof s.duration === 'number' && Number.isFinite(s.duration) ? `${Math.max(0, Math.round(s.duration))}ms` : ''}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {visibleLogs.length ? (
                                <div className="rounded-xl px-3 py-2" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('systemLogs', 'سجلّ النظام')}</div>
                                        {onToggleTechnical ? (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    onToggleTechnical();
                                                }}
                                                className="text-xs"
                                                style={{ color: 'var(--text-secondary)' }}
                                            >
                                                {showTechnical ? t('hideTechnicalDetails', 'إخفاء التفاصيل التقنية') : t('showTechnicalDetails', 'عرض التفاصيل التقنية')}
                                            </button>
                                        ) : null}
                                    </div>
                                    <pre className="text-[11px] leading-5 whitespace-pre-wrap break-words max-h-64 overflow-auto" style={{ color: 'var(--text-primary)' }}>
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
