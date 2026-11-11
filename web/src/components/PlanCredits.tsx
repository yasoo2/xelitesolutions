/**
 * PlanCredits — Joe's plan inside his reply, rolling like a film's credits.
 *
 * Live (inside the reply Joe is still working on): a small window over the
 * plan. The step in progress holds a fixed line; finished steps roll up
 * above it and fade; the next step waits below. When a step finishes, its
 * mark turns into a check and the whole list moves up one line.
 *
 * Final (on the reply that finished): one quiet line, «8/8 steps done»,
 * that opens the whole list. The plan is sealed with the run's trace
 * (services/socket.ts), so it is still there after a reload.
 *
 * It replaces the «Agent Tasks» box that floated over the composer and hid
 * what the user was typing (the owner, 2026-11-02).
 */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ChevronDown, Circle, Loader2, XCircle } from 'lucide-react';
import { SocketService } from '../services/socket';
import { useUiDir } from './NeuralTraceView';
import { creditsWindow, normalizePlan, rowFade, WINDOW_ROWS, type PlanItem, type PlanStatus } from '../lib/planCredits';

const ROW_PX = 28;
const STYLE_ID = 'joe-plan-credits-css';
const CSS = `
.pc{margin:10px 0 2px;font-size:12.5px;color:var(--joe-text-primary,#eceef0)}
.pc-head{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;color:var(--joe-text-muted,#8a8f98);margin-bottom:4px}
.pc-count{margin-inline-start:auto;font-variant-numeric:tabular-nums;font-weight:600}
.pc-window{position:relative;overflow:hidden}
.pc-window.has-above{-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 30%);mask-image:linear-gradient(to bottom,transparent 0,#000 30%)}
.pc-reel{transition:transform .75s cubic-bezier(.22,.8,.28,1);will-change:transform}
.pc-row{display:flex;align-items:center;gap:8px;white-space:nowrap;transition:opacity .6s ease,color .4s ease}
.pc-row .pc-text{overflow:hidden;text-overflow:ellipsis;min-width:0}
.pc-row.is-current{font-weight:600}
.pc-row.completed .pc-text{color:var(--joe-text-secondary,#a2a5ad)}
.pc-row.cancelled .pc-text{color:var(--joe-text-muted,#6e7178);text-decoration:line-through}
.pc-row.enter{animation:pc-in .55s ease both}
.pc-row.just-done .pc-mark{animation:pc-pop .5s ease}
.pc-mark{flex:none;display:inline-flex;width:16px;justify-content:center}
.pc-ok{color:var(--joe-gold-primary,#34c48b)}
.pc-off{color:var(--joe-text-muted,#6e7178)}
.pc-run{color:var(--joe-blue-primary,#60a5fa);animation:pc-spin 1.1s linear infinite}
.pc-wait{color:var(--joe-text-muted,#6e7178)}
.pc-row.is-current .pc-wait{color:var(--joe-blue-primary,#60a5fa);animation:pc-breathe 1.6s ease-in-out infinite}
.pc-final{margin:2px 0 8px}
.pc-summary{display:inline-flex;align-items:center;gap:6px;background:none;border:1px solid var(--joe-border,rgba(255,255,255,.08));border-radius:999px;padding:3px 10px;color:var(--joe-text-secondary,#a2a5ad);font-size:12px;cursor:pointer;font-family:inherit}
.pc-summary:hover{color:var(--joe-text-primary,#eceef0)}
.pc-chev{transition:transform .2s}.pc-chev.open{transform:rotate(180deg)}
.pc-list{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:3px}
.pc-li{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;line-height:1.5}
.pc-li .pc-mark{margin-top:2px}
.pc-li.cancelled span[dir]{text-decoration:line-through;color:var(--joe-text-muted,#6e7178)}
@keyframes pc-in{from{opacity:0;transform:translateY(12px)}}
@keyframes pc-pop{0%{transform:scale(.55)}60%{transform:scale(1.3)}100%{transform:scale(1)}}
@keyframes pc-spin{to{transform:rotate(360deg)}}
@keyframes pc-breathe{0%,100%{opacity:.45}50%{opacity:1}}
@media (prefers-reduced-motion: reduce){.pc-reel,.pc-row{transition:none}.pc-row.enter,.pc-row.just-done .pc-mark,.pc-run,.pc-row.is-current .pc-wait{animation:none}}
`;

function useCreditsStyles() {
    useEffect(() => {
        if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
    }, []);
}

function Mark({ status, final = false }: { status: PlanStatus; final?: boolean }) {
    if (status === 'completed') return <CheckCircle2 size={14} className="pc-ok" />;
    if (status === 'cancelled') return <XCircle size={14} className="pc-off" />;
    //  On a finished reply nothing is still running: a step left open stays an open circle.
    if (status === 'in_progress' && !final) return <Loader2 size={14} className="pc-run" />;
    return <Circle size={12} className={final ? 'pc-off' : 'pc-wait'} />;
}

interface PlanCreditsProps {
    /** Live: follow this session's plan as it changes. */
    sessionId?: string;
    /** Final: the plan sealed with a finished run. */
    plan?: PlanItem[];
    mode?: 'live' | 'final';
}

export default function PlanCredits({ sessionId, plan: sealed, mode = 'live' }: PlanCreditsProps) {
    const { t } = useTranslation();
    const dir = useUiDir();
    useCreditsStyles();
    const [live, setLive] = useState<PlanItem[]>([]);
    const [open, setOpen] = useState(false);

    //  The plan belongs to its conversation: another session's plan never shows here.
    const activeSessionRef = useRef(sessionId);
    useEffect(() => { activeSessionRef.current = sessionId; }, [sessionId]);
    useEffect(() => {
        if (mode !== 'live') return;
        setLive([]);
        return SocketService.subscribeTaskTracker((tasks: unknown, evSid?: string) => {
            if (evSid && activeSessionRef.current && evSid !== activeSessionRef.current) return;
            setLive(normalizePlan(tasks));
        }, sessionId);
    }, [sessionId, mode]);

    const plan = mode === 'live' ? live : (sealed || []);

    //  What changed since the last drawing: a new step slides in, a step just
    //  finished pops its check. Read here, written after the commit, so a
    //  second render pass reads the same thing.
    const previous = useRef<Map<string, PlanStatus>>(new Map());
    useEffect(() => { previous.current = new Map(plan.map(p => [p.id, p.status])); }, [plan]);

    if (!plan.length) return null;
    const win = creditsWindow(plan);

    if (mode === 'final') {
        return (
            <div className="pc pc-final" dir={dir}>
                <button type="button" className="pc-summary" aria-expanded={open} onClick={() => setOpen(!open)}>
                    <CheckCircle2 size={14} className={win.allDone ? 'pc-ok' : 'pc-off'} />
                    <span>{win.allDone ? t('planCreditsAllDone', { total: win.total }) : t('planCreditsProgress', { done: win.done, total: win.total })}</span>
                    <ChevronDown size={12} className={`pc-chev${open ? ' open' : ''}`} />
                </button>
                {open && (
                    <ol className="pc-list">
                        {plan.map(p => (
                            <li key={p.id} className={`pc-li ${p.status}`}>
                                <span className="pc-mark"><Mark status={p.status} final /></span>
                                <span dir="auto">{p.text}</span>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        );
    }

    const rows = Math.min(WINDOW_ROWS, plan.length);
    return (
        <div className={`pc pc-live${win.allDone ? ' all-done' : ''}`} dir={dir}>
            <div className="pc-head">
                <span>{t('planCreditsTitle')}</span>
                <span className="pc-count">{win.done}/{win.total}</span>
            </div>
            <div className={`pc-window${win.offset > 0 ? ' has-above' : ''}`} style={{ height: rows * ROW_PX }} role="list" aria-live="polite">
                <div className="pc-reel" style={{ transform: `translateY(${-win.offset * ROW_PX}px)` }}>
                    {plan.map((p, i) => {
                        const before = previous.current.get(p.id);
                        const enter = previous.current.size > 0 && before === undefined;
                        const justDone = before !== undefined && before !== 'completed' && p.status === 'completed';
                        return (
                            <div
                                key={p.id}
                                role="listitem"
                                className={`pc-row ${p.status}${i === win.current ? ' is-current' : ''}${enter ? ' enter' : ''}${justDone ? ' just-done' : ''}`}
                                style={{ height: ROW_PX, opacity: rowFade(i, win) }}
                            >
                                <span className="pc-mark"><Mark status={p.status} /></span>
                                <span className="pc-text" dir="auto" title={p.text}>{p.text}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
