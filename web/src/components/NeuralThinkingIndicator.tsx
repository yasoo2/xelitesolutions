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
  const displayKey = traceDisplayKey(detail);
  const cleanedDetail = cleanTraceText(detail);
  // Never leak an internal English tool name into the Arabic live sentence.
  // Known events use translated copy; unknown machine-only events stay in Logs.
  const displayDetail = displayKey
    ? t(displayKey)
    : (uiDir === 'rtl' && /[A-Za-z]/u.test(cleanedDetail) ? '' : cleanedDetail);

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
          padding: 4px 0;
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
        .neural-head { display: flex; align-items: center; gap: 8px; min-width: 0; }

        /* ── a drop of water that settles into a cube and lets go ─────────
           «والكره يجب ان تكون كره مائيه تتحرك تعمل اشكال مكعب وكره بشكل
            منسق ومرتب»

           One element carries the whole thing. nc-morph owns the shape
           and the turn; nc-surface owns the highlight sliding across it.
           They touch different properties on purpose — a second animation
           writing transform is how a morph like this usually dies
           silently, with the last declaration winning and the rest doing
           nothing.

           The cycle is slow and ORDERLY, as he asked: liquid sphere, a
           wobble, a quarter turn tightening into a cube, held there long
           enough to be read as a cube, then released back to water.

           No colour is written here. It is var(--nc) — the phase colour
           the rest of Joe already uses, sage while he thinks, slate while
           he plans, ochre while he builds.
         */
        .nc-orb { position: relative; width: 14px; height: 14px; flex: none; }
        .nc-orb::before {
          content: ""; position: absolute; inset: -4px; border-radius: 50%;
          background: rgba(47,134,214,.3);
          filter: blur(4px); animation: nc-halo 2.8s ease-in-out infinite;
        }
        @keyframes nc-halo { 0%,100% { opacity: .3; transform: scale(.9); } 50% { opacity: .68; transform: scale(1.1); } }
        /*  WATER IS BLUE, IN EVERY PHASE AND AT EVERY MOMENT.

            «يجب ان تكون الكره المائيه ازرق كالماء في جميع الحالات والاوقات»

            The first version tinted the drop with var(--nc) so it changed
            colour with the phase. That made it a status light, not water —
            and a status light beside a phase name already written in the
            phase colour says the same thing twice.

            So the drop keeps its own palette and the SENTENCE carries the
            phase. Two signals, two jobs.  */
        .nc-orb { --water: #2f86d6; --water-deep: #0f4f8f; --water-pale: #b6e3ff; }
        .nc-orb .skin {
          position: absolute; inset: 0;
          background:
            radial-gradient(circle at 50% 30%, rgba(255,255,255,.95), rgba(255,255,255,0) 42%),
            radial-gradient(circle at 72% 78%, var(--water-pale), rgba(182,227,255,0) 55%),
            linear-gradient(158deg, var(--water-pale) 2%, var(--water) 46%, var(--water-deep) 100%);
          background-size: 170% 170%, 150% 150%, 100% 100%;
          background-position: 32% 18%, 70% 76%, 0 0;
          box-shadow: inset 0 -2px 3px rgba(9,48,89,.55), inset 0 2px 2px rgba(255,255,255,.35);
          animation: nc-morph 7.6s ease-in-out infinite, nc-surface 3.4s ease-in-out infinite;
        }
        @keyframes nc-morph {
          0%   { border-radius: 50% 50% 50% 50% / 50% 50% 50% 50%; transform: rotate(0deg)   scale(1);    }
          14%  { border-radius: 58% 42% 46% 54% / 44% 56% 44% 56%; transform: rotate(6deg)   scale(1.03); }
          28%  { border-radius: 43% 57% 56% 44% / 57% 43% 57% 43%; transform: rotate(-5deg)  scale(.98);  }
          44%  { border-radius: 22%;                               transform: rotate(45deg)  scale(.9);   }
          58%  { border-radius: 14%;                               transform: rotate(45deg)  scale(.9);   }
          72%  { border-radius: 32%;                               transform: rotate(22deg)  scale(.95);  }
          88%  { border-radius: 53% 47% 45% 55% / 47% 53% 47% 53%; transform: rotate(4deg)   scale(1.02); }
          100% { border-radius: 50% 50% 50% 50% / 50% 50% 50% 50%; transform: rotate(0deg)   scale(1);    }
        }
        @keyframes nc-surface {
          0%,100% { background-position: 32% 18%, 70% 76%, 0 0; }
          50%     { background-position: 62% 34%, 40% 62%, 0 0; }
        }

        .nc-label {
          font-size: 12px; letter-spacing: 0; min-width: 0; flex: 1 1 auto;
          display: flex; align-items: baseline; gap: 6px;
        }
        /* The live sentence is the product surface; phase is a quiet prefix. */
        .nc-phase { flex: none; font-weight: 600; color: var(--joe-text-primary, #eceef0); white-space: nowrap; }
        .nc-stage {
          flex: none; max-width: 35%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          color: var(--joe-text-muted, #8b9198); font-size: 11px; font-weight: 500;
        }
        .nc-sep { flex: none; color: var(--joe-text-muted, #8b9198); font-size: 11px; }
        .nc-detail { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--joe-text-secondary, #c4c9cf); font-size: 11.5px; }

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
              .nc-orb .skin, .nc-orb::before, .neural-card { animation: none !important; }
          /* And still a sphere when it cannot move: a blob frozen halfway
             through the morph is worse than no motion at all. */
          .nc-orb .skin { border-radius: 50%; transform: none; }
          .nc-chip svg { transition: none !important; }
        }
        @media (max-width: 560px) {
              .neural-head { align-items: flex-start; }
              .nc-label { flex-wrap: wrap; row-gap: 2px; }
              .nc-detail { flex-basis: 100%; }
              .nc-stage { max-width: 36%; }
        }
      `}</style>

      <div className="neural-head">
        <span className="nc-orb" aria-hidden="true"><span className="skin" /></span>
        <span className="nc-label">
          <span className="nc-phase">{t('neuralWorking', phaseText)}</span>
          <span className="nc-sep" aria-hidden="true" />
          <span className="nc-stage">{t(`neuralStage${currentStage[0].toUpperCase()}${currentStage.slice(1)}`)}</span>
          {displayDetail && <span className="nc-detail" key={displayDetail} dir="auto">{displayDetail}</span>}
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
