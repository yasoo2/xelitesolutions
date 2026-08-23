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
  //  The detail line that is on its way out. Held in a ref and written in
  //  an effect — never in the render body, because React can render twice
  //  before it commits and the second pass would set the outgoing line to
  //  the incoming one, rolling the same words up against themselves.
  const leavingRef = useRef('');
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
  const rollText = detail && detail !== phaseText ? detail : '';
  useEffect(() => { leavingRef.current = rollText; }, [rollText]);

  // Single source of truth: the parent decides (per session) when to show us.
  if (!visible) return null;

  const current = phaseNow;
  const sec = t('traceSecond', 's');
  const elapsed = liveTrace ? Math.max(0, liveTrace.endedAt - liveTrace.startedAt) : 0;
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
        .nc-orb { position: relative; width: 18px; height: 18px; flex: none; }
        .nc-orb::before {
          content: ""; position: absolute; inset: -3px; border-radius: 50%;
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
          font-size: 12px; letter-spacing: .2px; min-width: 0; flex: 1 1 auto;
          display: flex; align-items: center; gap: 7px;
        }
        /* The phase, in the phase's own colour, and it does not leave. */
        .nc-phase { flex: none; font-weight: 700; color: var(--nc); white-space: nowrap; }
        .nc-sep { flex: none; width: 3px; height: 3px; border-radius: 50%; background: color-mix(in srgb, var(--nc) 45%, transparent); }

        /* ── the departures board ──────────────────────────────────────────
           A step does not blink out while the next blinks in — the line
           rides up and its successor arrives from below, the way a board
           at a station changes.

           The clip and the mover are two elements deliberately: putting
           overflow: hidden on the element that is translated makes the
           clip travel with it and clip nothing.

           The mover RESTS at -1.4em — showing the second line — and the
           keyframes run from 0 up to there. So when React remounts it on a
           new key the roll plays and then the new text is simply where it
           belongs, with no fill-mode to remember or forget.
         */
        .nc-roll { display: block; height: 1.4em; overflow: hidden; min-width: 0; flex: 1 1 auto; }
        .nc-roll .mover { display: block; transform: translateY(-1.4em); animation: nc-roll .5s cubic-bezier(.65,0,.35,1); }
        .nc-roll .ln {
          display: block; height: 1.4em; line-height: 1.4em; font-weight: 500;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          color: color-mix(in srgb, var(--nc) 70%, var(--joe-text, #2a2f2d));
        }
        .nc-roll .ln.leaving { opacity: .4; }
        @keyframes nc-roll { from { transform: translateY(0); } to { transform: translateY(-1.4em); } }

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
          .nc-orb .skin, .nc-orb::before, .nc-track > i, .nc-roll .mover, .neural-card { animation: none !important; }
          /* And still a sphere when it cannot move: a blob frozen halfway
             through the morph is worse than no motion at all. */
          .nc-orb .skin { border-radius: 50%; transform: none; }
          .nc-chip svg { transition: none !important; }
        }
      `}</style>

      <div className="neural-head">
        <span className="nc-orb" aria-hidden="true"><span className="skin" /></span>
        <span className="nc-label">
          <span className="nc-phase">{phaseText}</span>
          {rollText && <span className="nc-sep" aria-hidden="true" />}
          {rollText && (
            /* dir="auto" on the LINE, not on the card: a step like
               «جاري تنفيذ: react project» mixes scripts and used to reorder. */
            <span className="nc-roll" key={rollText} dir="auto">
              <span className="mover">
                <span className="ln leaving">{leavingRef.current}</span>
                <span className="ln">{rollText}</span>
              </span>
            </span>
          )}
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
