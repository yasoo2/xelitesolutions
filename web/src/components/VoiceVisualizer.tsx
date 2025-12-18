import { useEffect, useRef, useState } from 'react';
import { Volume2, X } from 'lucide-react';

export default function VoiceVisualizer({ isSpeaking, onStop }: { isSpeaking: boolean; onStop: () => void }) {
  const [bars, setBars] = useState<number[]>(new Array(10).fill(10));
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!isSpeaking) {
      setBars(new Array(10).fill(5));
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const animate = () => {
      setBars(prev => prev.map(() => 5 + Math.random() * 25)); // Random height 5-30px
      rafRef.current = requestAnimationFrame(animate);
    };
    
    // Slower animation update to look more like voice
    const interval = setInterval(() => {
        animate();
    }, 50);

    return () => {
      clearInterval(interval);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isSpeaking]);

  if (!isSpeaking) return null;

  return (
    <div className="voice-visualizer-overlay" style={{
      position: 'fixed',
      bottom: 100,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(12px)',
      padding: '12px 24px',
      borderRadius: 50,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      zIndex: 9999,
      border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 40 }}>
        {bars.map((h, i) => (
          <div key={i} style={{
            width: 4,
            height: h,
            background: 'var(--primary-color, #eab308)',
            borderRadius: 2,
            transition: 'height 0.1s ease'
          }} />
        ))}
      </div>
      <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>
        Joe is speaking...
      </div>
      <button 
        onClick={onStop}
        style={{
          background: 'rgba(255,255,255,0.1)',
          border: 'none',
          borderRadius: '50%',
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          cursor: 'pointer',
          marginLeft: 8
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
