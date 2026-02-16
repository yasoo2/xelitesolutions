/**
 * NeuralThinkingIndicator - Wakil 6.0
 * A deep reasoning visualization with Matrix-style logs.
 */

import React, { useEffect, useState, useRef } from 'react';
import { SocketService } from '../services/socket';
import MatrixRain from './MatrixRain';

interface NeuralThinkingIndicatorProps {
  phase?: 'analyzing' | 'synthesizing' | 'executing' | 'idle';
  visible: boolean;
  variant?: 'inline' | 'bubble';
}

const phaseLabels: Record<string, { emoji: string; text: string; textAr: string; color: string }> = {
  analyzing: { emoji: '🧠', text: 'Analyzing', textAr: 'تحليل عميق', color: '#00d2ff' }, // Cyan
  synthesizing: { emoji: '⚙️', text: 'Synthesizing', textAr: 'تخطيط', color: '#b0fb5d' }, // Matrix Green
  executing: { emoji: '🚀', text: 'Executing', textAr: 'تنفيذ', color: '#ffd700' }, // Gold
  idle: { emoji: '', text: '', textAr: '', color: '#aab3c5' },
};

export default function NeuralThinkingIndicator({ phase = 'analyzing', visible, variant = 'inline' }: NeuralThinkingIndicatorProps) {
  const [currentPhase, setCurrentPhase] = useState(phase);
  const [details, setDetails] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubDetails = SocketService.subscribeThinkingDetails((newDetails) => {
      setDetails(newDetails);
    });
    const unsubPhase = SocketService.subscribeThinkingPhase((p: any) => {
      setCurrentPhase(p);
    });
    return () => {
      unsubDetails();
      unsubPhase();
    };
  }, []);

  useEffect(() => {
    if (visible && details.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [details, visible]);

  if (!visible && details.length === 0) return null;
  if (phase === 'idle' && details.length === 0) return null; // [Wakil 6.1] Absolute clean when idle

  const current = phaseLabels[currentPhase] || phaseLabels.analyzing;
  const isMatrixMode = details.length > 0;

  return (
    <div className={`neural-container ${isMatrixMode ? 'expanded' : ''} ${variant}`}>
      <MatrixRain active={currentPhase !== 'idle' || isMatrixMode} color={current.color} />
      <style>{`
        .neural-container {
          display: flex;
          position: relative;
          flex-direction: column;
          gap: 0;
          background: var(--joe-thinking-bg);
          border: 1px solid var(--joe-thinking-border);
          border-radius: 16px;
          backdrop-filter: blur(12px);
          overflow: hidden;
          transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
          margin-bottom: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.2);
          max-width: 100%;
          z-index: 10;
        }

        .neural-container.bubble {
          border-radius: 4px 16px 16px 16px;
          margin-bottom: 0px;
          border-left: 2px solid var(--joe-gold-primary);
        }

        .neural-container.expanded {
          border-color: rgba(0, 210, 255, 0.3);
          box-shadow: 0 8px 32px rgba(0, 210, 255, 0.15);
        }

        .neural-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          cursor: default;
        }

        .neural-dots {
          display: flex;
          gap: 5px;
        }

        .neural-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: ${current.color};
          animation: neural-pulse 1.4s ease-in-out infinite;
          box-shadow: 0 0 8px ${current.color}66;
        }

        .neural-dot:nth-child(2) { animation-delay: 0.2s; }
        .neural-dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes neural-pulse {
          0%, 100% { transform: scale(0.8); opacity: 0.3; }
          50% { transform: scale(1.1); opacity: 1; }
        }

        .neural-label {
          font-size: 11px;
          font-weight: 700;
          color: ${current.color};
          display: flex;
          align-items: center;
          gap: 6px;
          letter-spacing: 1px;
          text-transform: uppercase;
          text-shadow: 0 0 10px ${current.color}44;
        }

        .neural-log-window {
          padding: 0 16px 14px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: 150px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.1) transparent;
          border-top: 1px solid var(--joe-thinking-border);
          margin-top: 4px;
          padding-top: 10px;
        }

        .neural-log-window::-webkit-scrollbar { width: 3px; }
        .neural-log-window::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.2);
          border-radius: 4px;
        }

        .log-line {
          font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
          font-size: 10px;
          line-height: 1.4;
          color: var(--joe-thinking-text);
          white-space: pre-wrap;
          word-break: break-word;
          opacity: 0;
          animation: fade-in-up 0.3s ease-out forwards;
          border-left: 2px solid transparent;
          padding-left: 8px;
        }

        .log-line:last-child {
          color: ${current.color};
          border-left-color: ${current.color};
          font-weight: 600;
        }

        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="neural-header">
        <div className="neural-dots">
          <div className="neural-dot" />
          <div className="neural-dot" />
          <div className="neural-dot" />
        </div>
        <div className="neural-label">
          <span>{current.emoji}</span>
          <span>{current.textAr}</span>
        </div>
      </div>

      {isMatrixMode && (
        <div className="neural-log-window">
          {details.map((line, i) => (
            <div key={i} className="log-line">
              {line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
