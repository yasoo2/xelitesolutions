import React from 'react';
import Editor, { loader } from '@monaco-editor/react';

// Configure loader to use local files or CDN properly if needed
// For now default CDN is fine

interface CodeEditorProps {
  code: string;
  language?: string;
  onChange?: (value: string | undefined) => void;
  readOnly?: boolean;
  theme?: 'vs-dark' | 'light';
}

export default function CodeEditor({ code, language = 'javascript', onChange, readOnly = false, theme = 'vs-dark' }: CodeEditorProps) {
  
  const handleEditorDidMount = (editor: any, monaco: any) => {
    // Optional: Configure editor settings here
    editor.updateOptions({
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, "Courier New", monospace',
      wordWrap: 'on',
      padding: { top: 16, bottom: 16 }
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
        }}
        loading={<div style={{ color: '#888', padding: 20 }}>Loading Editor...</div>}
      />
    </div>
  );
}
