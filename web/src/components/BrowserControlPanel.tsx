type Props = {
  open: boolean;
  onClose: () => void;
  showBoxes: boolean;
  onToggleBoxes: () => void;
};

export default function BrowserControlPanel({ open, onClose, showBoxes, onToggleBoxes }: Props) {
  if (!open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div
        onClick={() => onClose()}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: 'min(420px, 92vw)',
          height: '100%',
          background: 'var(--bg-secondary)',
          borderLeft: '1px solid var(--border-color)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          padding: 14,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>السيطرة</div>
          <button
            onClick={() => onClose()}
            style={{
              height: 30,
              padding: '0 10px',
              borderRadius: 10,
              border: '1px solid var(--border-color)',
              background: 'rgba(255,255,255,0.03)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            إغلاق
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>Vision & Grounding</div>
          <button
            onClick={() => onToggleBoxes()}
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: 12,
              border: '1px solid var(--border-color)',
              background: showBoxes ? 'rgba(239,68,68,0.22)' : 'rgba(255,255,255,0.03)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 12,
              textAlign: 'left',
            }}
          >
            {showBoxes ? 'إخفاء bounding boxes' : 'إظهار bounding boxes'}
          </button>
        </div>

        <div style={{ marginTop: 'auto', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
          سيتم توسيع لوحة السيطرة تدريجيًا (Run/Safety/Debug) بدون كسر التدفقات الحالية.
        </div>
      </div>
    </div>
  );
}

