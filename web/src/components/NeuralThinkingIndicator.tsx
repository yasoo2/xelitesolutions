/**
 * NeuralThinkingIndicator
 * Joe at work, shown live. Visibility is driven ENTIRELY by the `visible` prop
 * (which the parent computes per active session), so it never leaks from one
 * session into another.
 *
 * Two shapes, chosen by how much there is to show:
 *   · a single morphing line for a short answer, with a «6 steps ▾» chip that
 *     opens the rest on demand — the chat stays a conversation;
 *   · the full phase timeline for a build, because when Joe works for a minute
 *     and a half the interesting question is what he spent it on.
 *
 * The steps themselves now arrive with their timestamps (SocketService keeps
 * them as structure, not strings) and are sealed into the session's history
 * when the run ends — so this card disappearing no longer destroys the record.
 */

import { stripPictographs } from '../lib/plainText';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SocketService } from '../services/socket';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import type { NeuralTrace, TraceStep } from '../lib/neuralTrace';
import { formatDuration } from '../lib/neuralTrace';
import { TraceTimeline, useTraceStyles, useUiDir } from './NeuralTraceView';

interface NeuralThinkingIndicatorProps {
  phase?: 'analyzing' | 'synthesizing' | 'executing' | 'idle';
  visible: boolean;
  variant?: 'inline' | 'bubble';
  sessionId?: string;
}

// The label is resolved through i18n at render time. It used to be a hardcoded
// { text, textAr } pair of which only the Arabic half was ever rendered, so this
// indicator stayed Arabic in every language.
const phaseLabels: Record<string, { key: string; color: string }> = {
  // Muted, office-calm phase family — matches NeuralTraceView's PHASE_COLOR.
  analyzing: { key: 'thinkingAnalyzing', color: '#5c7f74' },
  synthesizing: { key: 'thinkingPlanning', color: '#5c6f88' },
  executing: { key: 'thinkingExecuting', color: '#87775c' },
  idle: { key: 'thinkingAnalyzing', color: '#5c7f74' },
};

/**
 * OPEN, NOT SHUT.
 *
 * «القائمة مغلقة ويجب أن تكون مفتوحة لنرى التفاصيل داخلها» — and he is right:
 * the whole reason this card exists is the steps inside it. It used to stay a
 * single line until FOUR of them had arrived, so a run showing «3 steps ▾»
 * hid everything it had. One step is enough to be worth seeing; the chip is
 * still there to fold it away when he wants the conversation back.
 */
const TIMELINE_THRESHOLD = 1;

export default function NeuralThinkingIndicator({ phase = 'analyzing', visible, variant = 'inline', sessionId }: NeuralThinkingIndicatorProps) {
  const { t } = useTranslation();
  useTraceStyles();
  const uiDir = useUiDir();
  const [currentPhase, setCurrentPhase] = useState(phase);
  const [status, setStatus] = useState('');
  const [steps, setSteps] = useState<TraceStep[]>([]);
  /** null = follow the step count; true/false = he decided. */
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeSessionRef = useRef(sessionId);
  useEffect(() => { activeSessionRef.current = sessionId; }, [sessionId]);

  useEffect(() => {
    const unsubSteps = SocketService.subscribeThinkingSteps((s) => setSteps(s), sessionId);
    const unsubPhase = SocketService.subscribeThinkingPhase((p: any, evSid?: string) => {
      if (evSid && activeSessionRef.current && evSid !== activeSessionRef.current) return;
      setCurrentPhase(p);
    }, sessionId);
    const unsubStatus = SocketService.subscribeThinkingStatus((s: string) => setStatus(s), sessionId);
    return () => { unsubSteps(); unsubPhase(); unsubStatus(); };
  }, [sessionId]);

  // Clear all reasoning state the moment the active session changes, so the
  // previous session's thinking never shows in the new one.
  useEffect(() => {
    setSteps([]);
    setStatus('');
    setCurrentPhase('idle');
    setExpanded(null);
  }, [sessionId]);

  // The elapsed counter has to tick on its own — no event arrives just because
  // a second passed.
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [visible]);

  const showTimeline = expanded === null ? steps.length >= TIMELINE_THRESHOLD : expanded;

  useEffect(() => {
    if (visible && showTimeline && steps.length > 0) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [steps, visible, showTimeline]);

  // A live trace: the same object a sealed one is, ending "now".
  const liveTrace: NeuralTrace | null = useMemo(() => {
    if (!steps.length) return null;
    return {
      id: 'live',
      sessionId: sessionId || 'live',
      startedAt: SocketService.getRunStartedAt(sessionId) || steps[0].at,
      endedAt: Math.max(now, steps[steps.length - 1].at),
      steps,
    };
  }, [steps, now, sessionId]);

  // Single source of truth: the parent decides (per session) when to show us.
  if (!visible) return null;

  const current = phaseLabels[currentPhase] || phaseLabels.analyzing;
  const sec = t('traceSecond', 's');
  const elapsed = liveTrace ? Math.max(0, liveTrace.endedAt - liveTrace.startedAt) : 0;
  // The single line shows the newest thing Joe said, whichever stream said it.
  const headline = stripPictographs(status || (steps.length ? steps[steps.length - 1].text : '')) || t(current.key);
  const canExpand = steps.length > 0;

  return (
    <div
      className={`jt neural-card ${variant} ${showTimeline ? 'has-log' : ''}`}
      dir={uiDir}
      style={{ ['--jt-accent' as any]: current.color }}
    >
      <style>{`
        .neural-card {
          --nc: ${current.color};
          display: flex; flex-direction: column; gap: 0;
          border-radius: 14px;
          border: 1px solid color-mix(in srgb, var(--nc) 22%, transparent);
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--nc) 8%, transparent), transparent),
            var(--joe-bg-panel, rgba(22,26,30,0.85));
          padding: 8px 11px;
          /* It lives INSIDE a chat bubble: it takes the width it is given and
             not one pixel more. Without box-sizing the padding pushed it past
             its container's border — visible in his screenshot as a card
             overlapping the frame on both sides. */
          box-sizing: border-box;
          width: 100%;
          backdrop-filter: blur(10px);
          overflow: hidden;
          max-width: 100%;
          min-width: 0;
          margin-bottom: 8px;
          /* A softer, tighter shadow: the old one bled 22px past the card and
             read as a glow crossing the chat's own border. */
          box-shadow: 0 3px 12px -8px color-mix(in srgb, var(--nc) 45%, transparent);
          animation: nc-in .35s cubic-bezier(0.22,1,0.36,1);
        }
        .neural-card.bubble { margin-bottom: 0; }
        @keyframes nc-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

        /* min-width:0 all the way down, or a long goal line («Initializing
           Autonomous Brain for goal: Build a world-class e-commerce pl…»)
           refuses to shrink and stretches the card past the chat. */
        .neural-head { display: flex; align-items: center; gap: 8px; min-width: 0; }

        /* soft breathing orb */
        .nc-orb { position: relative; width: 16px; height: 16px; flex: none; }
        .nc-orb::before, .nc-orb::after {
          content: ""; position: absolute; inset: 0; border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, color-mix(in srgb, var(--nc) 95%, white), var(--nc));
        }
        .nc-orb::after { animation: nc-halo 1.8s ease-out infinite; opacity: .5; }
        @keyframes nc-halo { 0% { transform: scale(1); opacity: .5; } 70%,100% { transform: scale(2.1); opacity: 0; } }
        .nc-orb .core { position: absolute; inset: 3px; border-radius: 50%; background: var(--nc); animation: nc-breathe 1.6s ease-in-out infinite; }
        @keyframes nc-breathe { 0%,100% { transform: scale(.82); } 50% { transform: scale(1.05); } }

        .nc-label {
          font-size: 12px; font-weight: 700; color: var(--nc);
          letter-spacing: .2px; min-width: 0; flex: 1 1 auto;
          display: flex; align-items: baseline; gap: 6px;
        }
        /* The headline is REPLACED as Joe moves on; a cross-fade makes that a
           transition rather than a flicker. */
        .nc-line {
          min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          animation: nc-swap .28s ease-out;
        }
        @keyframes nc-swap { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: none; } }
        .nc-dots i { animation: nc-blink 1.4s infinite both; }
        .nc-dots i:nth-child(2){ animation-delay: .2s; } .nc-dots i:nth-child(3){ animation-delay: .4s; }
        @keyframes nc-blink { 0%,80%,100% { opacity: .2; } 40% { opacity: 1; } }

        .nc-elapsed {
          flex: none; font-size: 10.5px; font-weight: 600; font-variant-numeric: tabular-nums;
          color: var(--joe-text-muted, #6e7178);
        }
        /* «6 steps ▾» — the whole log, one keystroke away, never in the way. */
        .nc-chip {
          flex: none; display: inline-flex; align-items: center; gap: 4px;
          font: inherit; font-size: 10.5px; font-weight: 600;
          color: var(--nc); background: color-mix(in srgb, var(--nc) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--nc) 22%, transparent);
          border-radius: 999px; padding: 2px 8px; cursor: pointer;
          font-variant-numeric: tabular-nums; transition: background .18s ease;
        }
        .nc-chip:hover { background: color-mix(in srgb, var(--nc) 20%, transparent); }
        .nc-chip:focus-visible { outline: 2px solid var(--nc); outline-offset: 2px; }
        .nc-chip svg { transition: transform .22s cubic-bezier(.22,1,.36,1); }
        .nc-chip[aria-expanded="true"] svg { transform: rotate(180deg); }

        /* thin animated progress shimmer under the header */
        .nc-track { height: 2px; border-radius: 2px; margin-top: 8px; overflow: hidden; background: color-mix(in srgb, var(--nc) 14%, transparent); }
        .nc-track > i { display: block; height: 100%; width: 40%; border-radius: 2px;
          background: linear-gradient(90deg, transparent, var(--nc), transparent);
          animation: nc-sweep 1.5s ease-in-out infinite; }
        @keyframes nc-sweep { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } }

        /* The log used to live in a 140px box behind a 3px scrollbar. It now gets
           room to be read, and still cannot swallow the conversation. */
        .nc-log {
          margin-top: 9px; padding-top: 8px;
          max-height: min(34vh, 300px); overflow-y: auto; overscroll-behavior: contain;
          scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--nc) 40%, transparent) transparent;
          border-top: 1px solid color-mix(in srgb, var(--nc) 14%, transparent);
        }
        .nc-log::-webkit-scrollbar { width: 7px; }
        .nc-log::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--nc) 30%, transparent); border-radius: 8px; }
        .nc-log::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--nc) 55%, transparent); }

        @media (prefers-reduced-motion: reduce) {
          .nc-orb .core, .nc-orb::after, .nc-track > i, .nc-dots i, .nc-line, .neural-card { animation: none !important; }
          .nc-chip svg { transition: none !important; }
        }
      `}</style>

      <div className="neural-head">
        <span className="nc-orb"><span className="core" /></span>
        <span className="nc-label">
          {/* dir="auto" on the LINE, not on the card: a headline like
              «جاري تنفيذ: react project» mixes scripts and used to reorder. */}
          <span className="nc-line" dir="auto" key={headline}>{headline}</span>
          {!showTimeline && <span className="nc-dots"><i>.</i><i>.</i><i>.</i></span>}
        </span>
        {elapsed >= 1000 && <span className="nc-elapsed">{formatDuration(elapsed, sec)}</span>}
        {canExpand && (
          <button
            type="button"
            className="nc-chip"
            aria-expanded={showTimeline}
            onClick={() => setExpanded(!showTimeline)}
          >
            {t('traceSteps', '{{count}} steps', { count: steps.length })}
            <ChevronDown size={11} />
          </button>
        )}
      </div>

      {!showTimeline && <div className="nc-track"><i /></div>}

      {showTimeline && liveTrace && (
        <div className="nc-log">
          <TraceTimeline trace={liveTrace} live />
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
