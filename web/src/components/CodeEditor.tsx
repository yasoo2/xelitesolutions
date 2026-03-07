import React, { useEffect, useState } from 'react';
import Editor, { loader } from '@monaco-editor/react';

// Configure loader to use local files or CDN properly if needed
// For now default CDN is fine

interface CodeEditorProps {
  code: string;
  language?: string;
  onChange?: (value: string | undefined) => void;
  readOnly?: boolean;
  theme?: 'vs-dark' | 'light';
  showMinimap?: boolean;
}

export default function CodeEditor({ code, language = 'javascript', onChange, readOnly = false, theme: initialTheme = 'vs-dark', showMinimap = true }: CodeEditorProps) {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    const updateTheme = () => {
      const current = document.documentElement.getAttribute('data-theme');
      setTheme(current === 'light' ? 'light' : 'vs-dark');
    };

    updateTheme(); // Initial check

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          updateTheme();
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => observer.disconnect();
  }, []);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    // Configure editor settings
    editor.updateOptions({
      minimap: { enabled: showMinimap, scale: 1, showSlider: 'mouseover' },
      scrollBeyondLastLine: false,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, "Courier New", monospace',
      wordWrap: 'on',
      padding: { top: 16, bottom: 16 },
      // Enhanced features
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      renderLineHighlight: 'all',
      roundedSelection: true,
    });
  };

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <Editor
        height="100%"
        defaultLanguage={language}
        language={language}
        value={code}
        theme={theme}
        onChange={onChange}
        onMount={handleEditorDidMount}
        options={{
          readOnly,
          automaticLayout: true,
          minimap: { enabled: showMinimap, scale: 1, showSlider: 'mouseover' },
        }}
        loading={<div style={{ color: 'var(--text-muted)', padding: 20 }}>Loading Editor...</div>}
      />
    </div>
  );
}
