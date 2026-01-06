/**
 * Improved UI Components for JOE
 * ==============================
 * 
 * مكونات واجهة محسنة وجميلة
 * مع تصاميم احترافية وانيميشنات سلسة
 */

import { motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle,
  Info,
  Zap,
  Loader,
  X,
  ChevronDown,
} from 'lucide-react';
import React from 'react';

// ============================================
// 1. Improved Alert Component
// ============================================

interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  onClose?: () => void;
  autoClose?: number;
}

export const ImprovedAlert: React.FC<AlertProps> = ({
  type,
  title,
  message,
  onClose,
  autoClose = 5000,
}) => {
  const [isVisible, setIsVisible] = React.useState(true);

  React.useEffect(() => {
    if (autoClose) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onClose?.();
      }, autoClose);
      return () => clearTimeout(timer);
    }
  }, [autoClose, onClose]);

  const colors = {
    success: {
      bg: 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20',
      border: 'border-emerald-500/50',
      icon: 'text-emerald-400',
      title: 'text-emerald-100',
    },
    error: {
      bg: 'bg-gradient-to-r from-red-500/20 to-pink-500/20',
      border: 'border-red-500/50',
      icon: 'text-red-400',
      title: 'text-red-100',
    },
    warning: {
      bg: 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20',
      border: 'border-yellow-500/50',
      icon: 'text-yellow-400',
      title: 'text-yellow-100',
    },
    info: {
      bg: 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20',
      border: 'border-blue-500/50',
      icon: 'text-blue-400',
      title: 'text-blue-100',
    },
  };

  const icons = {
    success: <CheckCircle className="w-5 h-5" />,
    error: <AlertCircle className="w-5 h-5" />,
    warning: <AlertCircle className="w-5 h-5" />,
    info: <Info className="w-5 h-5" />,
  };

  const color = colors[type];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          className={`${color.bg} border ${color.border} rounded-xl p-4 backdrop-blur-sm`}
        >
          <div className="flex items-start gap-3">
            <div className={color.icon}>{icons[type]}</div>
            <div className="flex-1">
              <h3 className={`font-semibold ${color.title}`}>{title}</h3>
              <p className="text-sm text-slate-300 mt-1">{message}</p>
            </div>
            {onClose && (
              <button
                onClick={() => {
                  setIsVisible(false);
                  onClose();
                }}
                className="p-1 hover:bg-white/10 rounded transition-all duration-200"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ============================================
// 2. Improved Loading Spinner
// ============================================

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

export const ImprovedLoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  message,
}) => {
  const sizes = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        className={`${sizes[size]} border-3 border-slate-600 border-t-blue-500 rounded-full`}
      />
      {message && <p className="text-slate-300 text-sm">{message}</p>}
    </div>
  );
};

// ============================================
// 3. Improved Button Component
// ============================================

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const ImprovedButton: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading,
  icon,
  children,
  disabled,
  ...props
}) => {
  const variants = {
    primary: 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-white',
    danger: 'bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white',
    ghost: 'bg-transparent hover:bg-slate-700 text-slate-300',
  };

  const sizes_map = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      disabled={disabled || isLoading}
      className={`${variants[variant]} ${sizes_map[size]} rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg`}
      {...props}
    >
      {isLoading ? (
        <Loader className="w-4 h-4 animate-spin" />
      ) : (
        icon
      )}
      {children}
    </motion.button>
  );
};

// ============================================
// 4. Improved Card Component
// ============================================

interface CardProps {
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  hover?: boolean;
}

export const ImprovedCard: React.FC<CardProps> = ({
  title,
  children,
  footer,
  hover = true,
}) => {
  return (
    <motion.div
      whileHover={hover ? { y: -4 } : {}}
      className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-shadow duration-300"
    >
      {title && (
        <div className="px-6 py-4 border-b border-slate-700 bg-gradient-to-r from-blue-600/10 to-purple-600/10">
          <h3 className="font-semibold text-white">{title}</h3>
        </div>
      )}
      <div className="p-6">{children}</div>
      {footer && (
        <div className="px-6 py-4 border-t border-slate-700 bg-slate-800/50">
          {footer}
        </div>
      )}
    </motion.div>
  );
};

// ============================================
// 5. Improved Progress Bar
// ============================================

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
}

export const ImprovedProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  label,
  showPercentage = true,
}) => {
  const percentage = (value / max) * 100;

  return (
    <div className="space-y-2">
      {(label || showPercentage) && (
        <div className="flex justify-between items-center text-sm">
          {label && <span className="text-slate-300">{label}</span>}
          {showPercentage && (
            <span className="text-slate-400">{percentage.toFixed(0)}%</span>
          )}
        </div>
      )}
      <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
        />
      </div>
    </div>
  );
};

// ============================================
// 6. Improved Dropdown Component
// ============================================

interface DropdownItem {
  label: string;
  value: string;
  icon?: React.ReactNode;
}

interface DropdownProps {
  items: DropdownItem[];
  label?: string;
  onSelect: (value: string) => void;
  defaultValue?: string;
}

export const ImprovedDropdown: React.FC<DropdownProps> = ({
  items,
  label,
  onSelect,
  defaultValue,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [selected, setSelected] = React.useState(
    defaultValue || items[0]?.value
  );

  const selectedItem = items.find(item => item.value === selected);

  return (
    <div className="relative">
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-left flex items-center justify-between hover:bg-slate-600 transition-all duration-200"
      >
        <div className="flex items-center gap-2">
          {selectedItem?.icon}
          <span>{selectedItem?.label}</span>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50"
          >
            {items.map((item) => (
              <button
                key={item.value}
                onClick={() => {
                  setSelected(item.value);
                  onSelect(item.value);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-2 text-left flex items-center gap-2 transition-all duration-200 ${
                  selected === item.value
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-slate-700 text-slate-300'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ============================================
// 7. Improved Badge Component
// ============================================

interface BadgeProps {
  label: string;
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md';
}

export const ImprovedBadge: React.FC<BadgeProps> = ({
  label,
  variant = 'primary',
  size = 'md',
}) => {
  const variants = {
    primary: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
    success: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
    warning: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
    error: 'bg-red-500/20 text-red-300 border-red-500/50',
    info: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50',
  };

  const sizes = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
  };

  return (
    <span
      className={`${variants[variant]} ${sizes[size]} border rounded-full font-medium inline-block`}
    >
      {label}
    </span>
  );
};

// ============================================
// 8. Improved Tooltip Component
// ============================================

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const ImprovedTooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
}) => {
  const [isVisible, setIsVisible] = React.useState(false);

  const positions = {
    top: '-top-10 left-1/2 -translate-x-1/2',
    bottom: 'top-10 left-1/2 -translate-x-1/2',
    left: 'top-1/2 -left-10 -translate-y-1/2',
    right: 'top-1/2 -right-10 -translate-y-1/2',
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className={`absolute ${positions[position]} px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-300 whitespace-nowrap z-50`}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ============================================
// Helper for AnimatePresence
// ============================================

const AnimatePresence = motion.AnimatePresence;
