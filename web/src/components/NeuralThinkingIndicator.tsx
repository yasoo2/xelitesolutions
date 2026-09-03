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
import { TraceTimeline, WorkStageRail, useTraceStyles, useUiDir } from './NeuralTraceView';
import { type WorkStage, workStageFor, traceDisplayKey, cleanTraceText } from '../lib/neuralTrace';

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

/** Details are opt-in. The live surface stays one readable sentence. */

export default function NeuralThinkingIndicator({ phase = 'analyzing', visible, variant = 'inline', sessionId }: NeuralThinkingIndicatorProps) {
  const { t } = useTranslation();
  useTraceStyles();
  const uiDir = useUiDir();
  const [currentPhase, setCurrentPhase] = useState(phase);
  const [status, setStatus] = useState('');
  const [steps, setSteps] = useState<TraceStep[]>([]);
  /** null = compact live line; true/false = the user chose the detail view. */
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeSessionRef = useRef(sessionId);
  //  The detail line that is on its way out. Held in a ref and written in
  //  an effect — never in the render body, because React can render twice
  //  before it commits and the second pass would set the outgoing line to
  //  the incoming one, rolling the same words up against themselves.
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

  const showTimeline = expanded === true;

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

  /**
   *  TWO FACTS ON THE LINE, NOT ONE.
   *
   *  «وقت التفكير يكون جو يفكر وقت التخطيط جو يخطط» — his words, and the
   *  card did not do it. The phase was shown only until the first step
   *  arrived; after that the step text took the line for the rest of the
   *  run, so a minute and a half could pass with nothing on screen naming
   *  the phase he was in.
   *
   *  Now the phase holds its own place and stays. It is `t(phaseNow.key)`,
   *  which resolves through i18n — «جو يخطّط», «Joe is planning», and the
   *  four other languages already in i18n.ts. Not one string in this
   *  component is written in a single language.
   *
   *  Computed above the early return, with its effect, because a hook
   *  placed after `if (!visible) return null` is a hook that sometimes
   *  does not run.
   */
  const phaseNow = phaseLabels[currentPhase] || phaseLabels.analyzing;
  const phaseText = t(phaseNow.key);
  const detail = stripPictographs(status || (steps.length ? steps[steps.length - 1].text : '')) || '';
  // Single source of truth: the parent decides (per session) when to show us.
  if (!visible) return null;

  const current = phaseNow;
  const canExpand = steps.length > 0;
  const currentStage: WorkStage = workStageFor(currentPhase, detail);
  const liveSteps = steps.slice(-4);
  const displayStep = (step: TraceStep): string => {
    const key = traceDisplayKey(step.text);
    const cleaned = cleanTraceText(stripPictographs(step.text));
    return key ? t(key) : (uiDir === 'rtl' && /[A-Za-z]/u.test(cleaned) ? '' : cleaned);
  };

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
          border: 0;
          background: transparent;
          padding: 8px 0 5px;
          /* It lives INSIDE a chat bubble: it takes the width it is given and
             not one pixel more. Without box-sizing the padding pushed it past
             its container's border — visible in his screenshot as a card
             overlapping the frame on both sides. */
          box-sizing: border-box;
          width: 100%;
          backdrop-filter: none;
          overflow: hidden;
          max-width: 100%;
          min-width: 0;
          margin-bottom: 8px;
          box-shadow: none;
          animation: nc-in .28s cubic-bezier(0.22,1,0.36,1);
        }
        .neural-card.bubble { margin-bottom: 0; }
        @keyframes nc-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

        /* min-width:0 all the way down, or a long goal line («Initializing
           Autonomous Brain for goal: Build a world-class e-commerce pl…»)
           refuses to shrink and stretches the card past the chat. */
        .neural-head { display: flex; align-items: center; gap: 8px; min-width: 0; margin-bottom: 7px; }

        /* A quiet status mark is enough. The old morphing orb made the
           thinking surface feel like a decorative card instead of a precise
           live signal. Motion now communicates only "active" and can disappear
           completely for reduced-motion users. */
        .nc-orb { position: relative; width: 7px; height: 7px; flex: none; border-radius: 50%; background: var(--nc); box-shadow: 0 0 0 4px color-mix(in srgb, var(--nc) 14%, transparent); animation: nc-pulse 1.8s ease-in-out infinite; }
        .nc-orb .skin { display: none; }
        @keyframes nc-pulse { 0%,100% { opacity: .55; transform: scale(.9); } 50% { opacity: 1; transform: scale(1); } }

        .nc-label { font-size: 12px; letter-spacing: 0; min-width: 0; flex: 1 1 auto; display: flex; align-items: baseline; gap: 7px; }
        .nc-phase { flex: none; font-weight: 650; color: var(--joe-text-primary, #eceef0); white-space: nowrap; }
        .nc-stage { flex: none; max-width: 35%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--joe-text-muted, #8b9198); font-size: 11px; font-weight: 500; }
        .nc-sep { flex: none; color: var(--joe-text-muted, #8b9198); font-size: 11px; }
        .nc-detail { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--joe-text-secondary, #c4c9cf); font-size: 11.5px; }

        /* Live activity is a short, real event stream. It is deliberately not
           a card or a fake progress list: older lines recede and the last
           event remains the only active line. */
        .nc-stream { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding-inline-start: 15px; border-inline-start: 1px solid color-mix(in srgb, var(--nc) 24%, transparent); }
        .nc-stream-line { display: flex; align-items: baseline; gap: 7px; min-width: 0; color: var(--joe-text-muted, #858b93); font-size: 11.5px; line-height: 1.45; opacity: .62; transition: opacity .2s ease, color .2s ease; }
        .nc-stream-line.is-current { color: var(--joe-text-primary, #eceef0); opacity: 1; }
        .nc-line-marker { width: 5px; height: 5px; flex: none; border-radius: 50%; background: currentColor; margin-inline-start: -18px; }
        .nc-stream-line.is-current .nc-line-marker { width: 7px; height: 7px; background: var(--nc); box-shadow: 0 0 0 3px color-mix(in srgb, var(--nc) 15%, transparent); }
        .nc-line-content { display: flex; gap: 7px; min-width: 0; flex: 1 1 auto; }
        .nc-line-stage { flex: none; color: color-mix(in srgb, var(--nc) 80%, var(--joe-text-secondary, #c4c9cf)); font-size: 10px; font-weight: 650; white-space: nowrap; }
        .nc-line-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nc-now { flex: none; color: var(--nc); font-size: 9px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }

        /* Details are available, but visually subordinate to the sentence. */
        .nc-chip {
          flex: none; display: inline-flex; align-items: center; gap: 4px;
          font: inherit; font-size: 10.5px; font-weight: 600;
          color: var(--joe-text-muted, #8b9198); background: transparent;
          border: 0; border-bottom: 1px solid color-mix(in srgb, var(--joe-text-muted, #8b9198) 35%, transparent);
          border-radius: 0; padding: 1px 0; cursor: pointer;
          font-variant-numeric: tabular-nums; transition: background .18s ease;
        }
        .nc-chip:hover { color: var(--joe-text-primary, #eceef0); border-bottom-color: currentColor; }
        .nc-chip:focus-visible { outline: 2px solid var(--nc); outline-offset: 2px; }
        .nc-chip svg { transition: transform .22s cubic-bezier(.22,1,.36,1); }
        .nc-chip[aria-expanded="true"] svg { transform: rotate(180deg); }

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
              .nc-orb, .neural-card { animation: none !important; }
          .nc-chip svg { transition: none !important; }
        }
        @media (max-width: 560px) {
              .neural-head { align-items: center; }
              .nc-label { gap: 5px; }
              .nc-stage { max-width: 32%; }
        }
      `}</style>

      <div className="neural-head nc-line">
        <span className="nc-orb" aria-hidden="true"><span className="skin" /></span>
        <span className="nc-label">
          <span className="nc-phase">{t('neuralWorking', phaseText)}</span>
          <span className="nc-sep" aria-hidden="true" />
          <span className="nc-stage">{t(`neuralStage${currentStage[0].toUpperCase()}${currentStage.slice(1)}`)}</span>
        </span>
        {canExpand && (
          <button
            type="button"
            className="nc-chip"
            aria-expanded={showTimeline}
            onClick={() => setExpanded(!showTimeline)}
          >
            {t(showTimeline ? 'neuralHideDetails' : 'neuralShowDetails', '{{count}} details', { count: steps.length })}
            <ChevronDown size={11} />
          </button>
        )}
      </div>

      {liveSteps.length > 0 && (
        <div className="nc-stream" aria-live="polite" aria-label={t('neuralLiveActivity', 'Live activity')}>
          {liveSteps.map((step, index) => {
            const text = displayStep(step);
            if (!text) return null;
            const isCurrent = index === liveSteps.length - 1;
            const stage = workStageFor(step.phase, step.text);
            return (
              <div className={`nc-stream-line ${isCurrent ? 'is-current' : ''}`} key={`${step.at}-${index}`}>
                <span className="nc-line-marker" aria-hidden="true" />
                <span className="nc-line-content" dir="auto">
                  <span className="nc-line-stage">{t(`neuralStage${stage[0].toUpperCase()}${stage.slice(1)}`)}</span>
                  <span className="nc-line-text" title={text}>{text}</span>
                </span>
                {isCurrent && <span className="nc-now">{uiDir === 'rtl' ? 'الآن' : t('neuralLiveNow', 'now')}</span>}
              </div>
            );
          })}
        </div>
      )}

      {showTimeline && liveTrace && (
        <div className="nc-log">
          <WorkStageRail trace={liveTrace} live />
          <TraceTimeline trace={liveTrace} live />
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
