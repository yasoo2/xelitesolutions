import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { SocketService } from '../services/socket';

interface XTermWrapperProps {
  id: string;
  isActive: boolean;
  onData?: (data: string) => void;
}

export default function XTermWrapper({ id, isActive }: XTermWrapperProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const isInitialized = useRef(false);

  useEffect(() => {
    if (!divRef.current || isInitialized.current) return;
    isInitialized.current = true;

    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        selectionBackground: 'rgba(255, 255, 255, 0.3)',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      convertEol: true, // Important for proper newline handling
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(divRef.current);
    
    // Initial fit
    setTimeout(() => fitAddon.fit(), 50);

    // Handle input
    term.onData(data => {
      SocketService.send({ type: 'terminal:input', id, data });
    });

    // Subscribe to output
    const unsubscribe = SocketService.subscribe((payload) => {
      if (payload.type === 'terminal:data' && payload.id === id) {
        term.write(payload.data);
      }
    });

    // Create terminal session on backend
    SocketService.send({ type: 'terminal:create', id });

    termRef.current = term;
    fitRef.current = fitAddon;

    // Handle resize
    const handleResize = () => {
      if (isActive && fitRef.current) {
          fitRef.current.fit();
          // Optional: Send resize to backend if supported
          // SocketService.send({ type: 'terminal:resize', id, cols: term.cols, rows: term.rows });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      unsubscribe();
      window.removeEventListener('resize', handleResize);
      SocketService.send({ type: 'terminal:kill', id });
      term.dispose();
      termRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isActive && fitRef.current && termRef.current) {
        // Refit when tab becomes active
        setTimeout(() => {
            fitRef.current?.fit();
            termRef.current?.focus();
        }, 100);
    }
  }, [isActive]);

  return <div ref={divRef} style={{ width: '100%', height: '100%' }} />;
}
