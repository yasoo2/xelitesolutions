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
  // Keep the newest action at the bottom of the stream. This reads like a
  // conversation in motion: history above, the live thought last.
  const liveSteps = steps.slice(-4, -1);
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
            const stage = workStageFor(step.phase, step.text);
            return (
              <div className="nc-stream-line" key={`${step.at}-${index}`}>
                <span className="nc-line-marker" aria-hidden="true" />
                <span className="nc-line-content" dir="auto">
                  <span className="nc-line-stage">{t(`neuralStage${stage[0].toUpperCase()}${stage.slice(1)}`)}</span>
                  <span className="nc-line-text" title={text}>{text}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {detail && (
        <div className="nc-current-line" aria-live="polite">
          <span className="nc-current-kicker">{t('neuralCurrentAction', 'Right now')}</span>
          <span className="nc-current-text" dir="auto">{(() => {
            const key = traceDisplayKey(detail);
            const cleaned = cleanTraceText(detail);
            return key ? t(key) : (uiDir === 'rtl' && /[A-Za-z]/u.test(cleaned) ? t('neuralDetailAction', 'Performing the current action') : cleaned);
          })()}</span>
          <span className="nc-now">{uiDir === 'rtl' ? 'الآن' : t('neuralLiveNow', 'now')}</span>
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
