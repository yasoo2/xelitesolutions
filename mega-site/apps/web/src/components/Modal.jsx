import React, { useEffect, useRef } from 'react';

export default function Modal({ open, onClose, title, children }) {
  const dialogRef = useRef(null);
  const lastActiveRef = useRef(null);
  useEffect(() => {
    if (open) {
      lastActiveRef.current = document.activeElement;
      document.body.style.overflow = 'hidden';
      setTimeout(() => {
        const el = dialogRef.current;
        if (!el) return;
        const nodes = el.querySelectorAll(
          'a[href],area[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])'
        );
        const first = nodes[0];
        if (first && typeof first.focus === 'function') first.focus();
        else el.focus();
      }, 0);
    } else {
      document.body.style.overflow = '';
      const prev = lastActiveRef.current;
      if (prev && typeof prev.focus === 'function') setTimeout(() => prev.focus(), 0);
    }
  }, [open]);
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (typeof onClose === 'function') onClose();
      return;
    }
    if (e.key === 'Tab') {
      const el = dialogRef.current;
      if (!el) return;
      const nodes = Array.from(
        el.querySelectorAll(
          'a[href],area[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      ).filter((n) => {
        const r = n.getBoundingClientRect();
        return r && r.width > 0 && r.height > 0;
      });
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal animate-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {title ? <h2 id="modal-title" className="text-xl font-semibold mb-3">{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}
