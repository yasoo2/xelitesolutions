import React, { useEffect, useRef, useState } from 'react';
import { Send, MessageCircle } from 'lucide-react';
import Modal from './components/Modal';
export default function App() {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const srcRef = useRef(null);
  const listRef = useRef(null);
  const [openModal, setOpenModal] = useState(false);
  const handleCommand = (raw) => {
    const s = String(raw || '').trim().toLowerCase();
    if (!s.startsWith('/')) return false;
    if (s === '/settings' || s === '/modal open' || s === '/settings open' || s === '/open') {
      setOpenModal(true);
      return true;
    }
    if (s === '/close' || s === '/modal close' || s === '/settings close') {
      setOpenModal(false);
      return true;
    }
    return false;
  };
  useEffect(() => {
    const proto = window.location.protocol;
    const host = 'localhost:4000';
    const url = `${proto}//${host}/chat/sse`;
    const src = new window.EventSource(url);
    srcRef.current = src;
    src.onopen = () => setConnected(true);
    src.onerror = () => setConnected(false);
    src.onmessage = (e) => {
      let msg = null;
      try { msg = JSON.parse(e.data); } catch { msg = null; }
      if (msg && msg.type === 'history' && Array.isArray(msg.items)) {
        setMessages(msg.items);
      } else if (msg && msg.type === 'message' && msg.item) {
        setMessages((prev) => [...prev, msg.item]);
      }
    };
    return () => {
      src.close();
      srcRef.current = null;
    };
  }, []);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);
  const send = () => {
    const t = text.trim();
    if (!t) return;
    window.fetch('http://localhost:4000/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: t, from: 'me' })
    }).then(() => setText('')).catch(() => {});
  };
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="w-full max-w-md p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-semibold">Chat</h1>
          </div>
          <div className="text-xs">{connected ? 'Online' : 'Offline'}</div>
        </div>
        <div ref={listRef} className="bg-card rounded-2xl p-3 h-72 overflow-auto mb-3 border border-muted/40 shadow scroll-smooth">
          {messages.map((m, i) => {
            const mine = m.from === 'me';
            return (
              <div key={i} className={`mb-2 ${mine ? 'text-right' : 'text-left'} fade-in`}>
                <div className={`inline-block px-3 py-2 rounded-2xl shadow transition-all duration-150 ${mine ? 'bg-primary text-white hover:shadow-lg' : 'bg-muted/20 hover:bg-muted/30'}`}>
                  <div className="text-sm">{m.text}</div>
                  <div className="text-[10px] opacity-70">{new Date(m.ts).toLocaleTimeString()}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { if (!handleCommand(text)) send(); } }}
            className="flex-1 px-3 py-2 rounded-lg bg-card border border-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="Type a message"
          />
        </div>
      </div>
      <Modal open={openModal} onClose={() => setOpenModal(false)} title="إعدادات">
        <div className="space-y-3">
          <span className="badge">مثال</span>
          <input className="input" placeholder="اسم العرض" />
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={() => setOpenModal(false)}>حفظ</button>
            <button className="btn" onClick={() => setOpenModal(false)}>إلغاء</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
