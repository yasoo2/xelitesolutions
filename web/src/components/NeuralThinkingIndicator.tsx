/**
 * NeuralThinkingIndicator
 * A calm, modern "Joe is thinking" indicator with an optional reasoning log.
 * Visibility is driven ENTIRELY by the `visible` prop (which the parent computes
 * per active session), so it never leaks from one session into another.
 */

import React, { useEffect, useState, useRef } from 'react';
import { SocketService } from '../services/socket';

interface NeuralThinkingIndicatorProps {
  phase?: 'analyzing' | 'synthesizing' | 'executing' | 'idle';
  visible: boolean;
  variant?: 'inline' | 'bubble';
  sessionId?: string;
}

const phaseLabels: Record<string, { text: string; textAr: string; color: string }> = {
  analyzing: { text: 'Analyzing', textAr: 'جو يفكّر', color: '#34c48b' },
  synthesizing: { text: 'Planning', textAr: 'جو يخطّط', color: '#3bb2f6' },
  executing: { text: 'Executing', textAr: 'جو ينفّذ', color: '#f0a83b' },
  idle: { text: '', textAr: 'جو يفكّر', color: '#34c48b' },
};

export default function NeuralThinkingIndicator({ phase = 'analyzing', visible, variant = 'inline', sessionId }: NeuralThinkingIndicatorProps) {
  const [currentPhase, setCurrentPhase] = useState(phase);
  const [status, setStatus] = useState('');
  const [details, setDetails] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeSessionRef = useRef(sessionId);
  useEffect(() => { activeSessionRef.current = sessionId; }, [sessionId]);

  useEffect(() => {
    const unsubDetails = SocketService.subscribeThinkingDetails((newDetails) => setDetails(newDetails));
    const unsubPhase = SocketService.subscribeThinkingPhase((p: any, evSid?: string) => {
      if (evSid && activeSessionRef.current && evSid !== activeSessionRef.current) return;
      setCurrentPhase(p);
    });
    const unsubStatus = SocketService.subscribeThinkingStatus((s: string) => setStatus(s));
    return () => { unsubDetails(); unsubPhase(); unsubStatus(); };
  }, []);

  // Clear all reasoning state the moment the active session changes, so the
  // previous session's thinking never shows in the new one.
  useEffect(() => {
    setDetails([]);
    setStatus('');
    setCurrentPhase('idle');
  }, [sessionId]);

  useEffect(() => {
    if (visible && details.length > 0) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [details, visible]);

  // Single source of truth: the parent decides (per session) when to show us.
  if (!visible) return null;

  const current = phaseLabels[currentPhase] || phaseLabels.analyzing;
  const hasLog = details.length > 0;

  return (
    <div className={`neural-card ${variant} ${hasLog ? 'has-log' : ''}`} dir="rtl">
      <style>{`
        .neural-card {
          --nc: ${current.color};
          display: flex; flex-direction: column; gap: 0;
          border-radius: 14px;
          border: 1px solid color-mix(in srgb, var(--nc) 22%, transparent);
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--nc) 8%, transparent), transparent),
            var(--joe-bg-panel, rgba(22,26,30,0.85));
          padding: 9px 13px;
          backdrop-filter: blur(10px);
          overflow: hidden;
          max-width: 100%;
          margin-bottom: 8px;
          box-shadow: 0 6px 22px -12px color-mix(in srgb, var(--nc) 60%, transparent);
          animation: nc-in .35s cubic-bezier(0.22,1,0.36,1);
        }
        .neural-card.bubble { margin-bottom: 0; }
        @keyframes nc-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

        .neural-head { display: flex; align-items: center; gap: 10px; }

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
          font-size: 13px; font-weight: 700; color: var(--nc);
          letter-spacing: .2px; display: inline-flex; align-items: baseline; gap: 2px;
        }
        .nc-status { color: var(--joe-text-secondary, #9aa8a2); font-weight: 500; font-size: 12px; }
        .nc-dots i { animation: nc-blink 1.4s infinite both; }
        .nc-dots i:nth-child(2){ animation-delay: .2s; } .nc-dots i:nth-child(3){ animation-delay: .4s; }
        @keyframes nc-blink { 0%,80%,100% { opacity: .2; } 40% { opacity: 1; } }

        /* thin animated progress shimmer under the header */
        .nc-track { height: 2px; border-radius: 2px; margin-top: 8px; overflow: hidden; background: color-mix(in srgb, var(--nc) 14%, transparent); }
        .nc-track > i { display: block; height: 100%; width: 40%; border-radius: 2px;
          background: linear-gradient(90deg, transparent, var(--nc), transparent);
          animation: nc-sweep 1.5s ease-in-out infinite; }
        @keyframes nc-sweep { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } }

        .nc-log {
          margin-top: 9px; padding-top: 8px; display: flex; flex-direction: column; gap: 3px;
          max-height: 140px; overflow-y: auto; scrollbar-width: thin;
          border-top: 1px solid color-mix(in srgb, var(--nc) 14%, transparent);
        }
        .nc-log::-webkit-scrollbar { width: 3px; }
        .nc-log::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--nc) 30%, transparent); border-radius: 4px; }
        .nc-log .ln {
          font-size: 11.5px; line-height: 1.5; color: var(--joe-text-secondary, #9aa8a2);
          white-space: pre-wrap; word-break: break-word; opacity: 0; animation: nc-fade .3s ease-out forwards;
          padding-inline-start: 12px; position: relative;
        }
        .nc-log .ln::before { content: ""; position: absolute; inset-inline-start: 0; top: .55em; width: 5px; height: 5px; border-radius: 50%; background: color-mix(in srgb, var(--nc) 40%, transparent); }
        .nc-log .ln:last-child { color: var(--joe-text-primary, #e9eeeb); font-weight: 600; }
        .nc-log .ln:last-child::before { background: var(--nc); box-shadow: 0 0 6px var(--nc); }
        @keyframes nc-fade { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { .nc-orb .core, .nc-orb::after, .nc-track > i, .nc-dots i { animation: none !important; } }
      `}</style>

      <div className="neural-head">
        <span className="nc-orb"><span className="core" /></span>
        <span className="nc-label">
          {status || current.textAr}
          <span className="nc-dots"><i>.</i><i>.</i><i>.</i></span>
        </span>
      </div>

      {!hasLog && <div className="nc-track"><i /></div>}

      {hasLog && (
        <div className="nc-log">
          {details.map((line, i) => (<div key={i} className="ln">{line}</div>))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
