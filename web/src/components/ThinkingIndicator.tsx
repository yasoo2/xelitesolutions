import React from 'react';
import { motion } from 'framer-motion';

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
