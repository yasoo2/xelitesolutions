/**
 * How a neural trace LOOKS — live while Joe works, and afterwards in the chat.
 *
 * One vocabulary, two moments. The timeline that scrolls under the orb during a
 * build is the same timeline that unfolds out of the receipt a week later, so
 * the thing he watched and the thing he keeps are recognisably one object.
 *
 * Three defects from the old indicator are fixed here by construction:
 *   · every line carries `dir="auto"`, so «… react project [pipeline]» keeps its
 *     bracket where it was written instead of flipping to the far margin;
 *   · nothing is caged in 140px behind a 3px scrollbar;
 *   · and the steps come from a stored trace, so they do not die with the run.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RTL_LANGUAGES } from '../i18n';
import { Copy, Check, ChevronDown, Brain } from 'lucide-react';
import { stripPictographs } from '../lib/plainText';
import {
    type NeuralTrace,
    type TracePhase,
    type TraceStep,
    formatDuration,
    groupByPhase,
    stepDurations,
    traceDuration,
    traceToText,
} from '../lib/neuralTrace';

/**
 * «أريد ألواناً رسمية راكزة» — the owner found the saturated green/amber
 * timeline loud and informal. The phases now share one desaturated, office-
 * calm family: same lightness, low chroma, still distinguishable, never neon.
 */
export const PHASE_COLOR: Record<TracePhase, string> = {
    analyzing: '#5c7f74',
    synthesizing: '#5c6f88',
    executing: '#87775c',
    idle: '#8b93a1',
};

const PHASE_KEY: Record<TracePhase, [string, string]> = {
    analyzing: ['tracePhaseAnalysis', 'Analysis'],
    synthesizing: ['tracePhasePlanning', 'Planning'],
    executing: ['tracePhaseExecution', 'Execution'],
    idle: ['tracePhaseWrapUp', 'Wrap-up'],
};

/**
 * The stylesheet lives in the document once, not once per card. The old
 * indicator re-emitted its whole CSS inside every render because it
 * interpolated the accent colour; here the accent is a custom property set on
 * the element, so the rules themselves are static.
 */
const STYLE_ID = 'joe-neural-trace-css';
const TRACE_CSS = `
.jt { --jt-line: color-mix(in srgb, var(--jt-accent, #34c48b) 26%, transparent); }

/* ── the timeline ───────────────────────────────────────────────── */
/* Inside a chat bubble: never wider than what it was given, and a long
   line wraps instead of pushing the card past the conversation's border. */
.jt-timeline { display: flex; flex-direction: column; gap: 2px; min-width: 0; max-width: 100%; }
.jt-group { position: relative; padding-inline-start: 20px; min-width: 0; }
.jt-group::before {
  content: ""; position: absolute; inset-inline-start: 6px; top: 14px; bottom: 2px; width: 1.5px;
  background: linear-gradient(180deg, var(--jt-line), color-mix(in srgb, var(--jt-line) 18%, transparent));
  border-radius: 2px;
}
.jt-group:last-child::before { bottom: 10px; }
.jt-ghead {
  display: flex; align-items: center; gap: 8px; margin: 6px 0 3px;
  font-size: 10.5px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase;
  color: var(--jt-phase);
}
.jt-ghead::before {
  content: ""; position: absolute; inset-inline-start: 1.5px; width: 11px; height: 11px; border-radius: 50%;
  background: var(--jt-phase); box-shadow: 0 0 0 3px color-mix(in srgb, var(--jt-phase) 18%, transparent);
  margin-top: 1px;
}
.jt-gtime {
  margin-inline-start: auto; font-size: 10px; font-weight: 600; letter-spacing: 0;
  text-transform: none; color: var(--joe-text-muted, #6e7178); font-variant-numeric: tabular-nums;
}
.jt-step {
  display: flex; align-items: baseline; gap: 8px; min-width: 0;
  font-size: 11.5px; line-height: 1.55; color: var(--joe-text-secondary, #a2a5ad);
  padding: 1.5px 0; position: relative;
}
.jt-step::before {
  content: ""; position: absolute; inset-inline-start: -19px; top: .72em; width: 5px; height: 5px;
  border-radius: 50%; background: color-mix(in srgb, var(--jt-phase) 55%, transparent);
}
.jt-step.status { color: var(--joe-text-primary, #eceef0); font-weight: 600; }
.jt-text { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.jt-ms {
  flex: none; font-size: 10px; font-variant-numeric: tabular-nums;
  color: var(--joe-text-muted, #6e7178);
  background: color-mix(in srgb, var(--jt-phase) 10%, transparent);
  border-radius: 999px; padding: 1px 6px;
}
.jt-step.now { color: var(--joe-text-primary, #eceef0); font-weight: 600; }
.jt-step.now::before { background: var(--jt-phase); }

/* ── the proportional phase ribbon ──────────────────────────────── */
.jt-ribbon { display: flex; height: 3px; border-radius: 999px; overflow: hidden; gap: 1.5px; margin-top: 8px; }
.jt-ribbon > i { display: block; height: 100%; border-radius: 999px; background: var(--seg); min-width: 3px; }

/* ── the receipt kept in the chat ───────────────────────────────── */
.jt-receipt { margin: 2px 0 6px; max-width: 100%; }
.jt-rbtn {
  display: inline-flex; align-items: center; gap: 8px; width: 100%;
  background: color-mix(in srgb, var(--jt-accent, #34c48b) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--jt-accent, #34c48b) 18%, transparent);
  border-radius: 11px; padding: 6px 11px; cursor: pointer;
  color: var(--joe-text-secondary, #a2a5ad); font: inherit; font-size: 11.5px;
  text-align: start; transition: background .18s ease, border-color .18s ease;
}
.jt-rbtn:hover { background: color-mix(in srgb, var(--jt-accent, #34c48b) 12%, transparent); }
.jt-rbtn:focus-visible { outline: 2px solid var(--jt-accent, #34c48b); outline-offset: 2px; }
.jt-rbtn .lead { color: var(--jt-accent, #34c48b); display: inline-flex; flex: none; }
.jt-rbtn .who { color: var(--joe-text-primary, #eceef0); font-weight: 650; }
.jt-sep { opacity: .4; }
.jt-num { font-variant-numeric: tabular-nums; }
.jt-chev { margin-inline-start: auto; flex: none; transition: transform .22s cubic-bezier(.22,1,.36,1); }
.jt-rbtn[aria-expanded="true"] .jt-chev { transform: rotate(180deg); }
.jt-body {
  margin-top: 7px; padding: 9px 11px 11px;
  border: 1px solid color-mix(in srgb, var(--jt-accent, #34c48b) 14%, transparent);
  border-radius: 11px; background: color-mix(in srgb, var(--jt-accent, #34c48b) 4%, transparent);
  animation: jt-open .22s cubic-bezier(.22,1,.36,1);
}
@keyframes jt-open { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }
.jt-tools { display: flex; justify-content: flex-end; margin-top: 8px; }
.jt-copy {
  display: inline-flex; align-items: center; gap: 5px; font: inherit; font-size: 11px;
  background: transparent; border: none; cursor: pointer; padding: 3px 7px; border-radius: 7px;
  color: var(--joe-text-muted, #6e7178);
}
.jt-copy:hover { color: var(--joe-text-primary, #eceef0); background: rgba(255,255,255,.05); }
.jt-copy:focus-visible { outline: 2px solid var(--jt-accent, #34c48b); outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) {
  .jt-chev, .jt-body { transition: none !important; animation: none !important; }
}
`;

/** Inject the stylesheet once, on first mount of anything that needs it. */
export function useTraceStyles(): void {
    useEffect(() => {
        if (typeof document === 'undefined') return;
        if (document.getElementById(STYLE_ID)) return;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = TRACE_CSS;
        document.head.appendChild(el);
    }, []);
}

/**
 * The trace mirrors with the LANGUAGE, not with the document.
 *
 * `<html dir>` is pinned to ltr on purpose — flipping the whole IDE breaks the
 * editor, terminal and browser panes — and content areas opt in per block. The
 * timeline's rail, phase dots and duration pills are chrome, so `dir="auto"`
 * would flip them on whichever step happened to start with a Latin word. It
 * follows the UI language instead, while each LINE inside still resolves its
 * own direction.
 */
export function useUiDir(): 'rtl' | 'ltr' {
    const { i18n } = useTranslation();
    const base = String(i18n.language || 'en').split('-')[0];
    return RTL_LANGUAGES.includes(base) ? 'rtl' : 'ltr';
}

/** Short, translated phase name for the group headers. */
function usePhaseName(): (p: TracePhase) => string {
    const { t } = useTranslation();
    return (p: TracePhase) => {
        const [key, fallback] = PHASE_KEY[p] || PHASE_KEY.idle;
        return t(key, fallback);
    };
}

interface TimelineProps {
    /** A sealed trace, or a live one assembled from the steps arriving now. */
    trace: NeuralTrace;
    /** While true the last step is the one happening, not one that ended. */
    live?: boolean;
}

/**
 * PROPOSAL A — the timeline. Steps grouped into the phase that produced them,
 * each with the time it actually held the screen.
 */
export function TraceTimeline({ trace, live = false }: TimelineProps) {
    useTraceStyles();
    const { t } = useTranslation();
    const phaseName = usePhaseName();
    const sec = t('traceSecond', 's');
    const groups = useMemo(() => groupByPhase(trace), [trace]);
    const spans = useMemo(() => stepDurations(trace), [trace]);
    const lastIndex = trace.steps.length - 1;
    const dir = useUiDir();

    return (
        <div className="jt-timeline" dir={dir}>
            {groups.map((g, gi) => (
                <div
                    className="jt-group"
                    key={`${g.phase}-${g.startedAt}-${gi}`}
                    style={{ ['--jt-phase' as any]: PHASE_COLOR[g.phase] || PHASE_COLOR.idle }}
                >
                    <div className="jt-ghead">
                        <span>{phaseName(g.phase)}</span>
                        <span className="jt-gtime">{formatDuration(Math.max(0, g.endedAt - g.startedAt), sec)}</span>
                    </div>
                    {g.steps.map((step: TraceStep, si) => {
                        const idx = g.indices[si];
                        const isLast = idx === lastIndex;
                        const span = spans[idx];
                        return (
                            <div
                                className={`jt-step ${step.kind}${live && isLast ? ' now' : ''}`}
                                key={`${step.at}-${idx}`}
                            >
                                {/* dir="auto" per LINE — the whole card carrying one
                                    direction is what scrambled his mixed lines. */}
                                <span className="jt-text" dir="auto">{stripPictographs(step.text)}</span>
                                {(!live || !isLast) && span >= 1000 && (
                                    <span className="jt-ms">{formatDuration(span, sec)}</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

/** Time spent per phase, drawn to scale. Real proportions or nothing. */
export function PhaseRibbon({ trace }: { trace: NeuralTrace }) {
    useTraceStyles();
    const groups = useMemo(() => groupByPhase(trace), [trace]);
    const total = groups.reduce((n, g) => n + Math.max(0, g.endedAt - g.startedAt), 0);
    if (!total || groups.length < 2) return null;
    return (
        <div className="jt-ribbon" aria-hidden="true">
            {groups.map((g, i) => (
                <i
                    key={`${g.phase}-${i}`}
                    style={{
                        flexGrow: Math.max(1, g.endedAt - g.startedAt),
                        ['--seg' as any]: PHASE_COLOR[g.phase] || PHASE_COLOR.idle,
                    }}
                />
            ))}
        </div>
    );
}

/**
 * THE RECEIPT — one quiet line that stays in the chat forever:
 *
 *     فكّرتُ ونفّذت · ٩ خطوات · ١:١٢ · ▾ اعرض
 *
 * Collapsed by default so a long conversation stays readable; open it and the
 * full timeline he watched during the run unfolds underneath, unchanged.
 */
export function NeuralTraceReceipt({ trace, defaultOpen = false }: { trace: NeuralTrace; defaultOpen?: boolean }) {
    useTraceStyles();
    const { t } = useTranslation();
    const dir = useUiDir();
    const [open, setOpen] = useState(defaultOpen);
    const [copied, setCopied] = useState(false);
    const sec = t('traceSecond', 's');
    const accent = PHASE_COLOR[trace.steps[trace.steps.length - 1]?.phase] || PHASE_COLOR.analyzing;
    const bodyId = `jt-body-${trace.id}`;

    useEffect(() => {
        if (!copied) return;
        const id = setTimeout(() => setCopied(false), 1800);
        return () => clearTimeout(id);
    }, [copied]);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(traceToText(trace, sec));
            setCopied(true);
        } catch {
            // No clipboard permission — the button simply does not confirm.
        }
    };

    if (!trace.steps.length) return null;

    return (
        <div className="jt jt-receipt" dir={dir} style={{ ['--jt-accent' as any]: accent }}>
            <button
                type="button"
                className="jt-rbtn"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => setOpen(v => !v)}
            >
                <span className="lead"><Brain size={13} /></span>
                <span className="who">{t('traceDid', 'Thought and executed')}</span>
                <span className="jt-sep">·</span>
                <span className="jt-num">{t('traceSteps', '{{count}} steps', { count: trace.steps.length })}</span>
                <span className="jt-sep">·</span>
                <span className="jt-num">{formatDuration(traceDuration(trace), sec)}</span>
                <ChevronDown size={14} className="jt-chev" />
            </button>

            {open && (
                <div className="jt-body" id={bodyId}>
                    <TraceTimeline trace={trace} />
                    <PhaseRibbon trace={trace} />
                    <div className="jt-tools">
                        <button type="button" className="jt-copy" onClick={copy}>
                            {copied ? <Check size={12} /> : <Copy size={12} />}
                            {copied ? t('traceCopied', 'Copied') : t('traceCopy', 'Copy trace')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default NeuralTraceReceipt;
