/**
 * NeuralThinkingIndicator - Wakil 5.3
 * A lightweight animated indicator showing agent thinking phases.
 */

import React from 'react';

interface NeuralThinkingIndicatorProps {
    phase?: 'analyzing' | 'synthesizing' | 'executing' | 'idle';
    visible: boolean;
}

const phaseLabels: Record<string, { emoji: string; text: string; textAr: string }> = {
    analyzing: { emoji: '🧠', text: 'Analyzing', textAr: 'يحلل' },
    synthesizing: { emoji: '⚙️', text: 'Synthesizing', textAr: 'يجمّع' },
    executing: { emoji: '🚀', text: 'Executing', textAr: 'ينفذ' },
    idle: { emoji: '✨', text: 'Ready', textAr: 'جاهز' },
};

export default function NeuralThinkingIndicator({ phase = 'analyzing', visible }: NeuralThinkingIndicatorProps) {
    if (!visible) return null;

    const current = phaseLabels[phase] || phaseLabels.analyzing;

    return (
        <div className="neural-thinking-indicator">
            <style>{`
        .neural-thinking-indicator {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 18px;
          background: linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,165,0,0.1));
          border: 1px solid rgba(255,215,0,0.3);
          border-radius: 12px;
          backdrop-filter: blur(8px);
          animation: neural-glow 2s ease-in-out infinite;
        }

        @keyframes neural-glow {
          0%, 100% { box-shadow: 0 0 8px rgba(255,215,0,0.2); }
          50% { box-shadow: 0 0 20px rgba(255,215,0,0.4); }
        }

        .neural-dots {
          display: flex;
          gap: 4px;
        }

        .neural-dot {
          width: 8px;
          height: 8px;
          background: linear-gradient(135deg, #ffd700, #ff8c00);
          border-radius: 50%;
          animation: neural-pulse 1.4s ease-in-out infinite;
        }

        .neural-dot:nth-child(2) { animation-delay: 0.2s; }
        .neural-dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes neural-pulse {
          0%, 100% { transform: scale(0.8); opacity: 0.4; }
          50% { transform: scale(1.2); opacity: 1; }
        }

        .neural-text {
          font-size: 13px;
          font-weight: 500;
          color: var(--joe-gold-primary, #ffd700);
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .neural-emoji {
          font-size: 16px;
        }

        .neural-phase {
          opacity: 0.9;
        }
      `}</style>

            <div className="neural-dots">
                <div className="neural-dot" />
                <div className="neural-dot" />
                <div className="neural-dot" />
            </div>

            <div className="neural-text">
                <span className="neural-emoji">{current.emoji}</span>
                <span className="neural-phase">{current.textAr}...</span>
            </div>
        </div>
    );
}
