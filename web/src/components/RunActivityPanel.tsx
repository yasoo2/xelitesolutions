/**
 * THE ACTIVITY PANEL: what Joe's agent engine is doing, one step at a time.
 *
 * «أريد أن أرى ماذا يفعل المحرّك خطوةً خطوة» — the engine reads, writes,
 * runs, looks and fixes in a loop, and until this panel nothing on screen
 * showed a single tool call with what it was given and what came back. Here
 * the run is laid out as it happens: the plan, every call with its result,
 * the model's own notes, the final checks' verdict, the latest screenshot,
 * the address the app is served on, and the files that changed.
 *
 * Three rules shape it:
 *   - It belongs to one conversation. It listens only to its session, and a
 *     new session is a new, empty panel.
 *   - What it cannot show, it says. A bounded list says how much it left
 *     out; events of the run that never arrived are counted.
 *   - The chrome follows the interface language, while commands, paths,
 *     outputs and the model's English notes keep their own direction. The
 *     Arabic interface hides narration that contains Latin letters; this is
 *     the one place that shows it, in left-to-right blocks.
 *
 * The state itself is built by the pure reducer in lib/activity-feed.ts.
 *
 * ⛔ IT LIVES IN THE CONVERSATION, NOT IN A TAB (2026-11-02). The owner:
 * «احنا اتفقنا انه يكون داخله جوا وليس في قائمة عائمة». The `inline` form is
 * one line inside Joe's reply: while the run works, the step it is on; when
 * the reply arrives, that run's whole record under the reply, opened on
 * demand. A finished reply names its run (`runId`) and reads that run's
 * record the first time it is opened, never before: on a server with
 * thousands of people, most replies are never opened.
 */
import React, { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Activity, AlertTriangle, Brain, CheckCircle2, ChevronDown, ChevronRight, Circle, Copy, CopyCheck,
    Eye, FileText, Globe, Loader2, ShieldAlert, ShieldCheck, XCircle,
} from 'lucide-react';
import { SocketService } from '../services/socket';
import { api } from '../services/apiClient';
import { getRunningRunId, isSessionRunning, subscribeRunningSessions } from '../services/runningSessions';
import { useUiDir } from './NeuralTraceView';
import { stripPictographs } from '../lib/plainText';
import {
    buildCapturePath, decodedBase64ByteCount, isSafeScreenshotDataUrl, isUuid, isValidCaptureMeta, mimeToDataPrefix,
} from './ScreenshotResults';
import {
    ACTIVITY_EVENT_TYPES, emptyActivity, formatStepDuration, hasActivity, inputSummary, latestRunId,
    reduceActivity, restoreActivity, summaryIsProse, toolLabel,
    type ActivityFile, type ActivityNote, type ActivityScreenshot, type ActivityState, type ActivityStep, type PlanItem,
} from '../lib/activity-feed';

type TFn = (key: string, options?: any) => string;

type Action =
    | { kind: 'event'; event: unknown }
    | { kind: 'restore'; runId: string; events: unknown[] }
    | { kind: 'reset' };

function panelReducer(state: ActivityState, action: Action): ActivityState {
    if (action.kind === 'reset') return state.runId || hasActivity(state) ? emptyActivity(state.limits) : state;
    if (action.kind === 'restore') return restoreActivity(state, action.runId, action.events);
    return reduceActivity(state, action.event);
}

const STYLE_ID = 'joe-run-activity-css';
const MONO = "'JetBrains Mono', 'Fira Code', ui-monospace, monospace";
const CSS = `
.ra-root{height:100%;display:flex;flex-direction:column;min-height:0;background:var(--joe-bg-panel,#1a1b1e);color:var(--joe-text-primary,#eceef0);font-size:13px;
  --ra-ok:var(--joe-gold-primary,#34c48b);--ra-fail:#c8574e;--ra-run:var(--joe-blue-primary,#60a5fa);--ra-muted:var(--joe-text-muted,#6e7178);
  --ra-soft:var(--joe-text-secondary,#a2a5ad);--ra-line:var(--joe-border,rgba(255,255,255,.08));--ra-card:var(--joe-bg-card,rgba(37,38,43,.92))}
.ra-head{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--ra-line);flex-shrink:0;flex-wrap:wrap}
.ra-head h3{margin:0;font-size:13px;font-weight:700}
.ra-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;border:1px solid var(--ra-line)}
.ra-chip.run{color:var(--ra-run)}.ra-chip.ok{color:var(--ra-ok)}.ra-chip.fail{color:var(--ra-fail)}.ra-chip.off{color:var(--ra-muted)}
.ra-count{margin-inline-start:auto;font-size:11px;color:var(--ra-muted);font-variant-numeric:tabular-nums}
.ra-body{flex:1;overflow:auto;padding:10px 10px 18px;min-height:0}
.ra-empty{padding:32px 18px;text-align:center;color:var(--ra-muted);line-height:1.8;max-width:460px;margin:0 auto}
.ra-section{margin:0 0 10px;border:1px solid var(--ra-line);border-radius:8px;background:var(--ra-card);overflow:hidden}
.ra-shead{display:flex;align-items:center;gap:6px;width:100%;padding:7px 10px;font-size:12px;font-weight:700;color:var(--ra-soft);background:none;border:none;cursor:pointer;text-align:start;font-family:inherit}
.ra-shead .ra-aside{margin-inline-start:auto;font-weight:500;color:var(--ra-muted);font-size:11px}
.ra-stitle{display:flex;align-items:center;gap:6px;padding:8px 10px 4px;font-size:12px;font-weight:700;color:var(--ra-soft)}
.ra-group{font-size:11px;color:var(--ra-muted);padding:6px 10px 2px;font-weight:600}
.ra-item{display:flex;align-items:flex-start;gap:7px;padding:3px 10px;font-size:12px;line-height:1.55}
.ra-item:last-child{padding-bottom:8px}
.ra-item .ra-mark{flex:none;margin-top:2px}
.ra-item.completed{color:var(--ra-soft)}.ra-item.cancelled{color:var(--ra-muted);text-decoration:line-through}
.ra-step{border:1px solid var(--ra-line);border-radius:8px;margin:0 0 6px;background:var(--ra-card);overflow:hidden}
.ra-step.fail{border-inline-start:3px solid var(--ra-fail)}.ra-step.run{border-inline-start:3px solid var(--ra-run)}
.ra-step-head{display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;background:none;border:none;color:inherit;cursor:pointer;font-family:inherit;font-size:12px;text-align:start;min-width:0}
.ra-label{font-weight:600;white-space:nowrap}
.ra-tool{font-family:${MONO};font-size:11px;color:var(--ra-muted);white-space:nowrap}
.ra-sum{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--ra-soft)}
.ra-sum.code{font-family:${MONO}}
.ra-dur{font-size:11px;color:var(--ra-muted);white-space:nowrap;font-variant-numeric:tabular-nums}
.ra-errline{padding:0 10px 7px;font-family:${MONO};font-size:11px;color:var(--ra-fail);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}
.ra-extra{padding:0 10px 7px;display:flex;flex-wrap:wrap;gap:6px}
.ra-tag{display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:1px 7px;border-radius:999px;border:1px solid var(--ra-line);color:var(--ra-soft);max-width:100%}
.ra-tag code{font-family:${MONO};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ra-io{border-top:1px solid var(--ra-line);padding:4px 10px 10px}
.ra-io-label{font-size:11px;color:var(--ra-muted);margin:8px 0 4px;display:flex;align-items:center;gap:6px}
.ra-pre{margin:0;padding:8px 10px;max-height:340px;overflow:auto;white-space:pre-wrap;word-break:break-word;font-family:${MONO};font-size:11px;line-height:1.55;background:rgba(0,0,0,.22);border-radius:6px;text-align:left}
[data-theme="light"] .ra-pre{background:rgba(28,40,35,.05)}
.ra-note{margin:0 0 6px;padding:6px 10px;border-inline-start:3px solid var(--ra-muted)}
.ra-note.verification{border-inline-start-color:var(--ra-ok)}.ra-note.compacted{border-inline-start-color:var(--ra-run)}
.ra-note-kind{font-size:11px;color:var(--ra-muted);display:flex;align-items:center;gap:5px;margin-bottom:3px}
.ra-note-text{margin:0;white-space:pre-wrap;word-break:break-word;line-height:1.6;font-size:12px;text-align:left}
.ra-more{font-size:11px;color:var(--ra-muted);padding:2px 2px 8px}
.ra-final{padding:9px 12px;display:flex;flex-direction:column;gap:5px}
.ra-final.ok{border-inline-start:3px solid var(--ra-ok)}.ra-final.fail{border-inline-start:3px solid var(--ra-fail)}.ra-final.off{border-inline-start:3px solid var(--ra-muted)}
.ra-final-title{display:flex;align-items:center;gap:7px;font-weight:700}
.ra-meta{font-size:11px;color:var(--ra-muted);display:flex;gap:12px;flex-wrap:wrap}
.ra-block{margin:0;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;text-align:left}
.ra-check{display:flex;gap:7px;padding:4px 10px;font-size:12px;align-items:flex-start;line-height:1.55}
.ra-check .ra-mark{flex:none;margin-top:2px}
.ra-check code{font-family:${MONO};font-size:11px;white-space:nowrap}
.ra-shot{padding:0 10px 10px}
.ra-shot img{display:block;max-width:100%;height:auto;border-radius:6px;border:1px solid var(--ra-line)}
.ra-caption{font-size:11px;color:var(--ra-muted);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
.ra-row{display:flex;align-items:center;gap:8px;padding:3px 10px;font-size:12px;min-width:0}
.ra-row:last-child{padding-bottom:8px}
.ra-row code{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:${MONO};font-size:11px;text-align:left}
.ra-row a{color:var(--ra-run)}
.ra-kind{font-size:11px;color:var(--ra-muted);white-space:nowrap}
.ra-btn{background:none;border:1px solid var(--ra-line);border-radius:6px;padding:2px 8px;color:var(--ra-soft);cursor:pointer;font-family:inherit;font-size:11px;margin:2px 10px 8px}
.ra-icon-btn{background:none;border:none;padding:2px;cursor:pointer;color:var(--ra-muted);display:inline-flex;align-items:center;flex:none}
.ra-ok{color:var(--ra-ok)}.ra-fail{color:var(--ra-fail)}.ra-run{color:var(--ra-run)}.ra-off{color:var(--ra-muted)}
.ra-inline{height:auto;display:block;background:transparent;border:1px solid var(--ra-line);border-radius:10px;margin:6px 0 8px;overflow:hidden;font-size:12px}
.ra-inline .ra-head{width:100%;border:none;background:none;color:inherit;font-family:inherit;cursor:pointer;text-align:start;padding:6px 10px;flex-wrap:nowrap;min-width:0}
.ra-inline .ra-head:hover{background:rgba(255,255,255,.03)}
.ra-inline.open .ra-head{border-bottom:1px solid var(--ra-line)}
.ra-inline .ra-title{font-weight:700;white-space:nowrap}
.ra-inline .ra-now{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ra-soft);font-size:11px}
.ra-inline .ra-now .ra-tool{margin-inline-start:6px}
.ra-inline .ra-body{max-height:min(60vh,520px);padding:8px}
.ra-inline .ra-chev{flex:none;color:var(--ra-muted);transition:transform .2s ease}
.ra-inline.open .ra-chev{transform:rotate(180deg)}
.ra-spin{animation:raSpin 1s linear infinite}
@keyframes raSpin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.ra-spin{animation:none}}
[dir="rtl"] .ra-side{transform:scaleX(-1)}
`;

function useActivityStyles() {
    useEffect(() => {
        if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = CSS;
        document.head.appendChild(el);
    }, []);
}

/** A file's size, its unit in the reader's language. */
function formatBytes(n: number | undefined, t: TFn): string {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '';
    if (n < 1024) return t('act_sizeBytes', { n });
    if (n < 1024 * 1024) return t('act_sizeKB', { n: (n / 1024).toFixed(1) });
    return t('act_sizeMB', { n: (n / (1024 * 1024)).toFixed(1) });
}

function firstLine(s?: string): string {
    return String(s || '').split('\n').map(l => l.trim()).find(Boolean) || '';
}

/** Copy that lands even when the clipboard API refuses (an unfocused page, a denied permission). */
function copyText(text: string): void {
    const fallback = () => {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        } catch { /* nothing else to try */ }
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(fallback);
    else fallback();
}

function CopyButton({ text, t }: { text: string; t: TFn }) {
    const [done, setDone] = useState(false);
    useEffect(() => {
        if (!done) return;
        const id = window.setTimeout(() => setDone(false), 1500);
        return () => window.clearTimeout(id);
    }, [done]);
    return (
        <button type="button" className="ra-icon-btn" title={t('copy')} aria-label={t('copy')}
            onClick={e => { e.stopPropagation(); copyText(text); setDone(true); }}>
            {done ? <CopyCheck size={13} /> : <Copy size={13} />}
        </button>
    );
}

function StatusMark({ ok, size = 14 }: { ok?: boolean; size?: number }) {
    if (ok === undefined) return <Loader2 size={size} className="ra-run ra-spin ra-mark" aria-hidden />;
    return ok
        ? <CheckCircle2 size={size} className="ra-ok ra-mark" aria-hidden />
        : <XCircle size={size} className="ra-fail ra-mark" aria-hidden />;
}

function PlanMark({ status }: { status: PlanItem['status'] }) {
    if (status === 'completed') return <CheckCircle2 size={14} className="ra-ok ra-mark" aria-hidden />;
    if (status === 'in_progress') return <Activity size={14} className="ra-run ra-mark" aria-hidden />;
    if (status === 'cancelled') return <XCircle size={14} className="ra-off ra-mark" aria-hidden />;
    return <Circle size={14} className="ra-off ra-mark" aria-hidden />;
}

/* ───────────────────────── the timeline ───────────────────────── */

interface RowProps {
    step: ActivityStep;
    language: string;
    open: boolean;
    onToggle: (callId: string) => void;
    t: TFn;
    secondSuffix: string;
}

const StepRow = memo(function StepRow({ step, language, open, onToggle, t, secondSuffix }: RowProps) {
    const label = toolLabel(step.tool, language);
    const summary = inputSummary(step.tool, step.input);
    const status = step.ok === undefined ? 'run' : step.ok ? 'ok' : 'fail';
    const statusText = step.ok === undefined ? t('act_stepRunning') : step.ok ? t('act_stepOk') : t('act_stepFailed');
    const duration = step.durationMs !== undefined ? formatStepDuration(step.durationMs, secondSuffix) : '';
    const errorLine = step.ok === false ? firstLine(step.output) : '';
    const extras = (step.filesChanged?.length || 0) > 0 || !!step.served || !!step.screenshotFile;
    return (
        <div className={`ra-step ${status === 'ok' ? '' : status}`}>
            <button type="button" className="ra-step-head" onClick={() => onToggle(step.key)} aria-expanded={open}
                title={open ? t('act_hideDetails') : t('act_showDetails')}>
                <span title={statusText} style={{ display: 'inline-flex' }}><StatusMark ok={step.ok} /></span>
                {label && <span className="ra-label">{label}</span>}
                <span className="ra-tool" dir="ltr">{step.tool}</span>
                <span className={`ra-sum ${summaryIsProse(step.tool) ? '' : 'code'}`} dir={summaryIsProse(step.tool) ? 'auto' : 'ltr'}>
                    {stripPictographs(summary)}
                </span>
                {duration && <span className="ra-dur" dir="ltr">{duration}</span>}
                {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} className="ra-side" aria-hidden />}
            </button>
            {errorLine && !open && <div className="ra-errline" dir="ltr">{stripPictographs(errorLine)}</div>}
            {extras && (
                <div className="ra-extra">
                    {(step.filesChanged || []).map(f => (
                        <span key={`${f.path}:${f.change}`} className="ra-tag">
                            <FileText size={11} aria-hidden />
                            <span>{t(`act_change_${f.change}`)}</span>
                            <code dir="ltr">{f.path}</code>
                        </span>
                    ))}
                    {step.served && (
                        <span className="ra-tag"><Globe size={11} aria-hidden /><code dir="ltr">{step.served.url}</code></span>
                    )}
                    {step.screenshotFile && (
                        <span className="ra-tag"><Eye size={11} aria-hidden /><code dir="ltr">{step.screenshotFile}</code></span>
                    )}
                </div>
            )}
            {open && (
                <div className="ra-io">
                    <div className="ra-io-label">
                        <span>{t('act_input')}</span>
                        {step.input && <CopyButton text={step.input} t={t} />}
                    </div>
                    <pre className="ra-pre" dir="ltr">{step.input ? stripPictographs(step.input) : t('act_emptyOutput')}</pre>
                    <div className="ra-io-label">
                        <span>{t('act_output')}</span>
                        {step.output && <CopyButton text={step.output} t={t} />}
                    </div>
                    <pre className="ra-pre" dir="ltr">
                        {step.ok === undefined ? t('act_stillRunning') : step.output ? stripPictographs(step.output) : t('act_emptyOutput')}
                    </pre>
                </div>
            )}
        </div>
    );
});

const NOTE_KEY: Record<ActivityNote['kind'], string> = {
    thought: 'act_note_thought',
    verification: 'act_note_verification',
    compacted: 'act_note_compacted',
};

const NoteRow = memo(function NoteRow({ note, t }: { note: ActivityNote; t: TFn }) {
    return (
        <div className={`ra-note ${note.kind}`}>
            <div className="ra-note-kind"><Brain size={12} aria-hidden />{t(NOTE_KEY[note.kind])}</div>
            {/* The model writes in English: its note keeps a left-to-right block in either interface. */}
            <p className="ra-note-text" dir="ltr">{stripPictographs(note.text)}</p>
        </div>
    );
});

type TimelineItem =
    | { kind: 'step'; at: number; seq: number; step: ActivityStep }
    | { kind: 'note'; at: number; seq: number; note: ActivityNote };

/* ───────────────────────── the sections ───────────────────────── */

function FinalCard({ state, t }: { state: ActivityState; t: TFn }) {
    const final = state.final!;
    const tone = final.status === 'delivered' ? 'ok' : final.status === 'failed' ? 'fail' : 'off';
    return (
        <div className={`ra-section ra-final ${tone}`} role="status">
            <div className="ra-final-title">
                {final.status === 'delivered'
                    ? <CheckCircle2 size={16} className="ra-ok" aria-hidden />
                    : final.status === 'failed'
                        ? <AlertTriangle size={16} className="ra-fail" aria-hidden />
                        : <XCircle size={16} className="ra-off" aria-hidden />}
                <span>{t(`act_status_${final.status}`)}</span>
            </div>
            {final.reason && <p className="ra-block" dir="ltr">{stripPictographs(final.reason)}</p>}
            <div className="ra-meta">
                <span>{t('act_finalSteps', { n: final.steps })}</span>
                {final.model && <span>{t('act_finalModel')} <bdi dir="ltr">{final.model}</bdi></span>}
            </div>
        </div>
    );
}

function VerdictCard({ state, t }: { state: ActivityState; t: TFn }) {
    const v = state.verification!;
    return (
        <div className="ra-section">
            <div className="ra-stitle">
                {v.passed ? <ShieldCheck size={14} className="ra-ok" aria-hidden /> : <ShieldAlert size={14} className="ra-fail" aria-hidden />}
                <span>{t('act_verdict')}</span>
                <span className={v.passed ? 'ra-ok' : 'ra-fail'} style={{ fontWeight: 600 }}>
                    {v.passed ? t('act_verdictPassed') : t('act_verdictFailed')}
                </span>
                {state.checkRounds > 1 && <span className="ra-kind" style={{ marginInlineStart: 'auto' }}>{t('act_verdictRound', { n: state.checkRounds })}</span>}
            </div>
            {v.checks.map((c, i) => (
                <div key={`${c.id}:${i}`} className="ra-check">
                    {c.status === 'passed'
                        ? <CheckCircle2 size={14} className="ra-ok ra-mark" aria-hidden />
                        : c.status === 'failed'
                            ? <XCircle size={14} className="ra-fail ra-mark" aria-hidden />
                            : <Circle size={14} className="ra-off ra-mark" aria-hidden />}
                    {/* The check by its name in his language; an id with no name keeps its own. */}
                    <span title={c.id} style={{ fontWeight: 600 }}>{t(`act_inst_${c.id}`, { defaultValue: c.id })}</span>
                    <span className="ra-kind">{t(`act_check_${c.status}`)}</span>
                    <span className="ra-block" dir="ltr" style={{ flex: 1, minWidth: 0 }}>{stripPictographs(c.detail)}</span>
                </div>
            ))}
            {v.unproven.length > 0 && (
                <>
                    <div className="ra-group">{t('act_unproven')}</div>
                    {v.unproven.map((u, i) => (
                        <div key={`${u.id}:${i}`} className="ra-check">
                            <AlertTriangle size={14} className="ra-fail ra-mark" aria-hidden />
                            <code dir="ltr">{u.id}</code>
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span dir="auto" style={{ display: 'block' }}>{stripPictographs(u.text)}</span>
                                <span className="ra-block ra-off" dir="ltr" style={{ display: 'block' }}>{stripPictographs(u.reason)}</span>
                            </span>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}

function PlanSection({ state, t }: { state: ActivityState; t: TFn }) {
    const [open, setOpen] = useState(true);
    const all = [...state.plan.steps, ...state.plan.requirements];
    const done = all.filter(x => x.status === 'completed').length;
    const row = (item: PlanItem) => (
        <div key={item.id} className={`ra-item ${item.status}`}>
            <PlanMark status={item.status} />
            <span dir="auto" style={{ flex: 1, minWidth: 0 }}>{stripPictographs(item.content)}</span>
        </div>
    );
    return (
        <div className="ra-section">
            <button type="button" className="ra-shead" onClick={() => setOpen(v => !v)} aria-expanded={open}>
                {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} className="ra-side" aria-hidden />}
                <span>{t('act_plan')}</span>
                <span className="ra-aside">{t('act_planProgress', { done, total: all.length })}</span>
            </button>
            {open && (
                <>
                    {state.plan.steps.length > 0 && <div className="ra-group">{t('act_planSteps')}</div>}
                    {state.plan.steps.map(row)}
                    {state.plan.requirements.length > 0 && <div className="ra-group">{t('act_planRequirements')}</div>}
                    {state.plan.requirements.map(row)}
                </>
            )}
        </div>
    );
}

/**
 * A stored capture is read the way the chat's screenshot results read one:
 * by id, validated (an id, a safe name, a real image type, the exact byte
 * count) before a single pixel is drawn.
 */
function CaptureImage({ sessionId, captureId, alt, t }: { sessionId: string; captureId: string; alt: string; t: TFn }) {
    const [shown, setShown] = useState<{ id: string; url: string | null; failed: boolean }>({ id: '', url: null, failed: false });
    useEffect(() => {
        if (!isUuid(captureId)) { setShown({ id: captureId, url: null, failed: true }); return; }
        const controller = new AbortController();
        setShown({ id: captureId, url: null, failed: false });
        (async () => {
            try {
                const detail: any = await api.get(buildCapturePath(sessionId, captureId), undefined, { signal: controller.signal });
                const capture = detail?.capture;
                const dataUrl = detail?.imageDataUrl;
                if (!isValidCaptureMeta(capture) || capture.id !== captureId || typeof dataUrl !== 'string'
                    || !isSafeScreenshotDataUrl(dataUrl, capture.mimeType)) throw new Error('capture_invalid');
                const prefix = mimeToDataPrefix(capture.mimeType) as string;
                if (decodedBase64ByteCount(dataUrl.slice(prefix.length)) !== capture.bytes) throw new Error('capture_invalid');
                if (!controller.signal.aborted) setShown({ id: captureId, url: dataUrl, failed: false });
            } catch {
                if (!controller.signal.aborted) setShown({ id: captureId, url: null, failed: true });
            }
        })();
        return () => controller.abort();
    }, [sessionId, captureId]);
    if (shown.id !== captureId || (!shown.url && !shown.failed)) return <div className="ra-kind">{t('act_screenshotLoading')}</div>;
    if (!shown.url) return <div className="ra-kind">{t('act_screenshotUnavailable')}</div>;
    return <img src={shown.url} alt={alt} />;
}

function ScreenshotSection({ shot, sessionId, t }: { shot: ActivityScreenshot; sessionId: string; t: TFn }) {
    const [failed, setFailed] = useState('');
    const caption = shot.kind === 'href' ? shot.pageUrl : shot.kind === 'capture' ? shot.pageName : '';
    return (
        <div className="ra-section">
            <div className="ra-stitle"><Eye size={14} aria-hidden /><span>{t('act_screenshot')}</span></div>
            <div className="ra-shot">
                {shot.kind === 'capture' && <CaptureImage sessionId={sessionId} captureId={shot.captureId} alt={t('act_screenshot')} t={t} />}
                {shot.kind === 'href' && (failed === shot.href
                    ? <div className="ra-kind">{t('act_screenshotUnavailable')}</div>
                    : <img src={shot.href} alt={t('act_screenshot')} onError={() => setFailed(shot.href)} />)}
                {shot.kind === 'file' && (
                    <div className="ra-kind">{t('act_screenshotFile')} <bdi dir="ltr" style={{ fontFamily: MONO }}>{shot.name}</bdi></div>
                )}
                {caption && <div className="ra-caption" dir="ltr">{caption}</div>}
            </div>
        </div>
    );
}

/** A URL a person may open from here: the page's own origin, or an http(s) address. */
function isOpenable(url: string): boolean {
    return /^https?:\/\//i.test(url) || (url.startsWith('/') && !url.startsWith('//'));
}

function ServedSection({ state, t }: { state: ActivityState; t: TFn }) {
    return (
        <div className="ra-section">
            <div className="ra-stitle"><Globe size={14} aria-hidden /><span>{t('act_served')}</span></div>
            {state.served.map(s => (
                <div key={`${s.kind}:${s.name}`} className="ra-row">
                    <span className="ra-kind">{s.kind === 'preview' ? t('act_preview') : <bdi dir="ltr">{s.name}</bdi>}</span>
                    {/* The preview is the address meant for a person. A server's
                        address is the one the run saw answering; on a remote
                        deployment it may not be reachable from this browser. */}
                    {s.kind === 'preview' && isOpenable(s.url)
                        ? <code dir="ltr"><a href={s.url} target="_blank" rel="noopener noreferrer">{s.url}</a></code>
                        : <code dir="ltr">{s.url}</code>}
                    <CopyButton text={s.url} t={t} />
                </div>
            ))}
        </div>
    );
}

const FILES_SHOWN = 30;

function FilesSection({ state, t }: { state: ActivityState; t: TFn }) {
    const [open, setOpen] = useState(true);
    const [all, setAll] = useState(false);
    const shown = all ? state.files : state.files.slice(0, FILES_SHOWN);
    const hidden = state.files.length - shown.length;
    const row = (f: ActivityFile) => (
        <div key={f.path} className="ra-row">
            <span className="ra-kind">{t(`act_change_${f.change}`)}</span>
            <code dir="ltr" title={f.path}>{f.path}</code>
            {(f.additions !== undefined || f.deletions !== undefined) && (
                <span className="ra-kind" dir="ltr">
                    <span className="ra-ok">+{f.additions ?? 0}</span> <span className="ra-fail">−{f.deletions ?? 0}</span>
                </span>
            )}
            {f.bytes !== undefined && <span className="ra-kind">{formatBytes(f.bytes, t)}</span>}
        </div>
    );
    return (
        <div className="ra-section">
            <button type="button" className="ra-shead" onClick={() => setOpen(v => !v)} aria-expanded={open}>
                {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} className="ra-side" aria-hidden />}
                <FileText size={14} aria-hidden />
                <span>{t('act_files')}</span>
                <span className="ra-aside">{state.files.length + state.olderFiles}</span>
            </button>
            {open && (
                <>
                    {shown.map(row)}
                    {hidden > 0 && <button type="button" className="ra-btn" onClick={() => setAll(true)}>{t('act_showAllFiles', { n: state.files.length })}</button>}
                    {all && state.files.length > FILES_SHOWN && <button type="button" className="ra-btn" onClick={() => setAll(false)}>{t('act_showFewerFiles')}</button>}
                    {state.olderFiles > 0 && <div className="ra-more" style={{ padding: '2px 10px 8px' }}>{t('act_olderFiles', { n: state.olderFiles })}</div>}
                </>
            )}
        </div>
    );
}

/* ───────────────────────── the panel ───────────────────────── */

interface RunActivityPanelProps {
    sessionId?: string;
    /** True while the tab is on screen: the timeline then follows the newest step. */
    active?: boolean;
    /** 'inline': one line inside the reply, opened on demand (its own `open` replaces `active`). */
    variant?: 'panel' | 'inline';
    /** A finished reply's run: its record is read when opened, and no live event is folded in. */
    runId?: string;
    defaultOpen?: boolean;
}

function RunActivityPanel({ sessionId = '', active = true, variant = 'panel', runId: fixedRun = '', defaultOpen = false }: RunActivityPanelProps) {
    useActivityStyles();
    const { t: rawT, i18n } = useTranslation();
    const t = rawT as unknown as TFn;
    const uiDir = useUiDir();
    const language = String(i18n.language || 'en');
    const secondSuffix = t('traceSecond');
    const [state, dispatch] = useReducer(panelReducer, undefined, () => emptyActivity());
    const inline = variant === 'inline';
    const [open, setOpen] = useState(defaultOpen);
    //  What «on screen» means: the tab for the panel, the open line inline.
    const shown = inline ? open : active;

    //  A new conversation is a new panel: nothing of the previous one stays.
    useEffect(() => { dispatch({ kind: 'reset' }); }, [sessionId]);

    useEffect(() => {
        if (!sessionId || fixedRun) return;
        return SocketService.subscribe((event: any) => {
            //  Fail closed: an event that names no session, or another one,
            //  is never painted here. Nor is a late frame of a run a newer
            //  prompt displaced: the socket marks it, and the chat skips it too.
            const sid = String(event?.sessionId || event?.data?.sessionId || '').trim();
            if (!sid || sid !== sessionId || event?.suppressPresentation === true) return;
            if (!ACTIVITY_EVENT_TYPES.has(String(event?.type || ''))) return;
            dispatch({ kind: 'event', event });
        }, sessionId);
    }, [sessionId, fixedRun]);

    const [running, setRunning] = useState(false);
    useEffect(() => {
        if (!sessionId || fixedRun) { setRunning(false); return; }
        return subscribeRunningSessions(() => setRunning(isSessionRunning(sessionId)));
    }, [sessionId, fixedRun]);

    /**
     *  WHAT HAPPENED BEFORE THIS PANEL WAS ON SCREEN.
     *
     *  The session history returns the step pairs Joe recorded for its tools,
     *  and names the session's latest run. The run's own record holds every
     *  event the run sent, the engine's included. Each record is read at most
     *  once while the run is live and once after it ended, so a panel that
     *  stays open never polls.
     *
     *  Nothing is read while the tab is hidden. The panel is mounted with
     *  every workspace and a run's record can weigh megabytes, so opening a
     *  conversation without looking at Activity costs no read at all; on a
     *  server with thousands of people, that is most conversations. Live
     *  events are folded in all along, and the first time the tab is shown
     *  it reads what it missed.
     */
    const restored = useRef<Map<string, Set<'live' | 'final'>>>(new Map());
    const restoreRun = useCallback(async (runId: string, phase: 'live' | 'final', signal: AbortSignal) => {
        const done = restored.current.get(runId) || new Set<'live' | 'final'>();
        if (done.has(phase)) return;
        done.add(phase);
        restored.current.set(runId, done);
        try {
            const record: any = await api.get(`/runs/${encodeURIComponent(runId)}/receipt`, undefined, { signal });
            if (signal.aborted) { done.delete(phase); return; }
            if (Array.isArray(record?.events)) dispatch({ kind: 'restore', runId, events: record.events });
        } catch {
            //  An aborted read is retried the next time it is needed; a run
            //  with no record keeps what this panel saw live.
            if (signal.aborted) done.delete(phase);
        }
    }, []);

    //  The session whose history this panel has read; cleared when a read is
    //  cut short, so the next time the tab is shown reads again.
    const restoredSession = useRef('');
    useEffect(() => {
        if (!sessionId || fixedRun || !shown || restoredSession.current === sessionId) return;
        restoredSession.current = sessionId;
        const controller = new AbortController();
        let complete = false;
        (async () => {
            const live = SocketService.getActiveRunId(sessionId) || getRunningRunId(sessionId);
            let events: unknown[] = [];
            if (!live) {
                try {
                    const history: any = await api.get(`/sessions/${encodeURIComponent(sessionId)}/history`, undefined, { signal: controller.signal });
                    events = Array.isArray(history?.events) ? history.events : [];
                } catch { return; }
            }
            if (controller.signal.aborted) return;
            const runId = live || latestRunId(events);
            if (runId) {
                if (events.length) dispatch({ kind: 'restore', runId, events });
                await restoreRun(runId, live ? 'live' : 'final', controller.signal);
            }
            complete = !controller.signal.aborted;
        })();
        return () => {
            controller.abort();
            if (!complete && restoredSession.current === sessionId) restoredSession.current = '';
        };
    }, [sessionId, fixedRun, shown, restoreRun]);

    //  A finished reply's run: its record, read the first time it is opened.
    useEffect(() => {
        if (!fixedRun || !shown) return;
        const controller = new AbortController();
        void restoreRun(fixedRun, 'final', controller.signal);
        return () => controller.abort();
    }, [fixedRun, shown, restoreRun]);

    const gap = state.missedEvents > 0;
    const ended = state.final !== null;
    const runId = state.runId;
    const engineRun = state.step > 0 || state.steps.some(s => s.source === 'engine');

    //  The run on screen, once the session stopped running it. A run whose
    //  last events were lost on the way (a reconnect in its last seconds)
    //  leaves no gap to count, since nothing after the last event that arrived
    //  says it exists; its end is what says the panel may not have its last
    //  word.
    const [stoppedRun, setStoppedRun] = useState('');
    const wasRunning = useRef(false);
    useEffect(() => {
        if (running) { wasRunning.current = true; return; }
        if (wasRunning.current && runId) setStoppedRun(runId);
        wasRunning.current = false;
    }, [running, runId]);
    const closed = ended || (!!runId && stoppedRun === runId);

    //  What never arrived is read back from the run's record: events of this
    //  run the panel counted as missing (a reconnect, a panel opened mid run),
    //  or an engine run that stopped without its final word. Once while it
    //  runs, and once after its end, when the record is complete.
    const needsRecord = !fixedRun && (gap || (closed && !ended && engineRun));
    useEffect(() => {
        if (!shown || !runId || !needsRecord) return;
        const controller = new AbortController();
        const timer = window.setTimeout(() => { void restoreRun(runId, closed ? 'final' : 'live', controller.signal); }, closed ? 2000 : 300);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [shown, runId, needsRecord, closed, restoreRun]);

    const [openCalls, setOpenCalls] = useState<Record<string, boolean>>({});
    useEffect(() => { setOpenCalls({}); }, [runId]);
    const toggle = useCallback((key: string) => setOpenCalls(prev => ({ ...prev, [key]: !prev[key] })), []);

    const timeline = useMemo<TimelineItem[]>(() => {
        const items: TimelineItem[] = [
            ...state.steps.map(step => ({ kind: 'step' as const, at: step.startedAt, seq: step.seq, step })),
            ...state.notes.map(note => ({ kind: 'note' as const, at: note.at, seq: note.seq, note })),
        ];
        return items.sort((a, b) => a.at - b.at || a.seq - b.seq);
    }, [state.steps, state.notes]);

    //  Follow the newest step the way a terminal follows its output, unless
    //  he scrolled up to read something.
    const bodyRef = useRef<HTMLDivElement>(null);
    const follow = useRef(true);
    const onScroll = useCallback(() => {
        const el = bodyRef.current;
        if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    }, []);
    const last = state.steps[state.steps.length - 1];
    useEffect(() => {
        const el = bodyRef.current;
        if (el && shown && follow.current) el.scrollTop = el.scrollHeight;
    }, [shown, timeline.length, last?.ok, state.final]);

    const chip = state.final
        ? { tone: state.final.status === 'delivered' ? 'ok' : state.final.status === 'failed' ? 'fail' : 'off', text: t(`act_status_${state.final.status}`) }
        : running && (engineRun || state.steps.length > 0)
            ? { tone: 'run', text: state.step > 0 ? t('act_running', { n: state.step }) : t('act_runningNoStep') }
            : engineRun
                ? { tone: 'off', text: t('act_ended') }
                : null;

    const body = !hasActivity(state) ? (
            <div className="ra-empty">{t('act_empty')}</div>
        ) : (
            <>
                {state.final && <FinalCard state={state} t={t} />}
                {state.verification && <VerdictCard state={state} t={t} />}
                {(state.plan.steps.length > 0 || state.plan.requirements.length > 0) && <PlanSection state={state} t={t} />}
                {state.latestScreenshot && <ScreenshotSection shot={state.latestScreenshot} sessionId={sessionId} t={t} />}
                {state.served.length > 0 && <ServedSection state={state} t={t} />}
                {(state.files.length > 0 || state.olderFiles > 0) && <FilesSection state={state} t={t} />}
                {timeline.length > 0 && (
                    <div>
                        <div className="ra-stitle" style={{ padding: '4px 2px 6px' }}>{t('act_timeline')}</div>
                        {state.olderSteps > 0 && <div className="ra-more">{t('act_olderSteps', { n: state.olderSteps })}</div>}
                        {state.olderNotes > 0 && <div className="ra-more">{t('act_olderNotes', { n: state.olderNotes })}</div>}
                        {timeline.map(item => item.kind === 'step'
                            ? <StepRow key={`s:${item.step.key}`} step={item.step} language={language}
                                open={!!openCalls[item.step.key]} onToggle={toggle} t={t} secondSuffix={secondSuffix} />
                            : <NoteRow key={`n:${item.note.id}`} note={item.note} t={t} />)}
                    </div>
                )}
                {state.missedEvents > 0 && <div className="ra-more">{t('act_missed', { n: state.missedEvents })}</div>}
            </>
        );

    const chipEl = chip && (
        <span className={`ra-chip ${chip.tone}`}>
            {chip.tone === 'run' && <Loader2 size={11} className="ra-spin" aria-hidden />}
            {chip.text}
        </span>
    );
    const countEl = state.steps.length > 0 && <span className="ra-count">{t('act_callCount', { n: state.steps.length + state.olderSteps })}</span>;

    if (inline) {
        //  Live, the line appears with the run's first step; a finished
        //  reply's line is there to be opened.
        if (!fixedRun && !hasActivity(state)) return null;
        const current = !state.final && last ? last : undefined;
        return (
            <section className={`ra-root ra-inline${open ? ' open' : ''}`} dir={uiDir} aria-label={t('act_title')}>
                <button type="button" className="ra-head" aria-expanded={open} onClick={() => setOpen(v => !v)}
                    title={open ? t('act_hideDetails') : t('act_showDetails')}>
                    <Activity size={13} aria-hidden />
                    <span className="ra-title">{t('act_title')}</span>
                    {chipEl}
                    {!open && current && (
                        <span className="ra-now" dir="auto">
                            {toolLabel(current.tool, language) || ''}
                            <span className="ra-tool" dir="ltr">{stripPictographs(inputSummary(current.tool, current.input)) || current.tool}</span>
                        </span>
                    )}
                    {countEl}
                    <ChevronDown size={14} className="ra-chev" aria-hidden />
                </button>
                {open && (
                    <div className="ra-body" ref={bodyRef} onScroll={onScroll}>
                        {body}
                    </div>
                )}
            </section>
        );
    }

    return (
        <section className="ra-root" dir={uiDir} aria-label={t('act_title')}>
            <header className="ra-head">
                <Activity size={15} aria-hidden />
                <h3>{t('act_title')}</h3>
                {chipEl}
                {countEl}
            </header>
            <div className="ra-body" ref={bodyRef} onScroll={onScroll}>
                {body}
            </div>
        </section>
    );

}

export default memo(RunActivityPanel);
