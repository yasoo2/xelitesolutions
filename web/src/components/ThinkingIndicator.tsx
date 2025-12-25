import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export const ThinkingIndicator: React.FC<{ label?: string; stepName?: string }> = ({ label, stepName }) => {
  return (
    <div className="flex items-center gap-2 p-4 rounded-2xl bg-[var(--surface-2)] w-fit backdrop-blur-md border border-[var(--border-light)] shadow-sm">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-[var(--accent-primary)]"
            animate={{
              y: [0, -5, 0],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut"
            }}
          />
        ))}
      </div>
      <span className="text-xs text-[var(--text-secondary)] font-medium">
        {label || (stepName ? `Joe is working on: ${stepName}` : 'Joe is thinking...')}
      </span>
    </div>
  );
};

export function ThinkingWithTools({
  status,
  activeToolName,
}: {
  status: 'idle' | 'thinking' | 'answering';
  activeToolName: string | null;
}) {
  const show = status === 'thinking';

  return (
    <div className="px-3 py-2">
      <AnimatePresence mode="wait">
        {show && (
          <motion.div
            key="thinking"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="space-y-1"
          >
            <div className="text-sm font-medium text-zinc-200/90">Joe is thinking…</div>

            <AnimatePresence mode="wait">
              {activeToolName && (
                <motion.div
                  key={activeToolName}
                  initial={{ opacity: 0, y: 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -2 }}
                  transition={{ duration: 0.15 }}
                  className="text-[12px] leading-4 font-normal text-zinc-400/70"
                >
                  Running: <span className="font-normal">{activeToolName}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
