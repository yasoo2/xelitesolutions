import { useEffect, useMemo, useState } from 'react';
import { API_URL } from '../config';
import { ChevronLeft, ChevronRight, RotateCcw, Settings, Plus, X } from 'lucide-react';

type Props = {
  sessionId: string;
  onToggleControl: () => void;
  onToggleBoxes: () => void;
  showBoxes: boolean;
};

export default function BrowserChrome({ sessionId, onToggleControl, onToggleBoxes, showBoxes }: Props) {
  const [url, setUrl] = useState('');
  const token = useMemo(() => {
    try {
      return localStorage.getItem('token') || '';
    } catch {
      return '';
    }
  }, []);
  const call = async (path: string, body: any) => {
    try {
      await fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch {}
  };
  useEffect(() => {
    const update = (ev: Event) => {
      const data = (ev as CustomEvent)?.detail || {};
      const u = typeof data?.url === 'string' ? data.url : '';
      if (u) setUrl(u);
    };
    window.addEventListener('browser:session_status', update as any);
    return () => window.removeEventListener('browser:session_status', update as any);
  }, []);
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 52, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', zIndex: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => call('/api/browser/nav/back', { sessionId })} style={{ width: 30, height: 30, borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)' }} aria-label="Back"><ChevronLeft size={16} /></button>
        <button onClick={() => call('/api/browser/nav/forward', { sessionId })} style={{ width: 30, height: 30, borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)' }} aria-label="Forward"><ChevronRight size={16} /></button>
        <button onClick={() => call('/api/browser/nav/refresh', { sessionId })} style={{ width: 30, height: 30, borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)' }} aria-label="Refresh"><RotateCcw size={16} /></button>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { const raw = String(url || '').trim(); if (!raw) return; let u = raw; if (!/^[a-z]+:\/\//i.test(u)) u = `https://${u}`; call('/api/browser/nav/goto', { sessionId, url: u, allowCrossSite: true }); } }} placeholder="أدخل رابط..." style={{ flex: 1, height: 32, borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', padding: '0 10px', fontSize: 13 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => onToggleBoxes()} style={{ height: 30, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: showBoxes ? 'rgba(239,68,68,0.22)' : 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', fontSize: 12 }}>المربعات</button>
        <button onClick={() => onToggleControl()} style={{ height: 30, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Settings size={16} /> السيطرة</button>
      </div>
    </div>
  );
}
