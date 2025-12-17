import { useEffect, useRef } from 'react';

interface ArtifactPreviewProps {
  content: string;
  language: string;
}

export default function ArtifactPreview({ content, language }: ArtifactPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current) return;

    const doc = iframeRef.current.contentDocument;
    if (!doc) return;

    let htmlContent = '';

    if (language === 'html') {
      htmlContent = content;
    } else if (language === 'css') {
      htmlContent = `
        <html>
          <head>
            <style>${content}</style>
          </head>
          <body>
            <h1>CSS Preview</h1>
            <div class="preview-box">Element for testing styles</div>
          </body>
        </html>
      `;
    } else if (language === 'javascript' || language === 'js') {
      htmlContent = `
        <html>
          <body>
            <div id="app"></div>
            <script>
              const app = document.getElementById('app');
              const consoleLog = console.log;
              console.log = (...args) => {
                app.innerHTML += '<div>' + args.join(' ') + '</div>';
                consoleLog(...args);
              };
              try {
                ${content}
              } catch (e) {
                app.innerHTML += '<div style="color:red">' + e + '</div>';
              }
            </script>
          </body>
        </html>
      `;
    } else if (['react', 'jsx', 'tsx'].includes(language)) {
       // Simple React Playground
       htmlContent = `
        <html>
          <head>
             <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
             <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
             <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
             <style>body { font-family: sans-serif; padding: 16px; }</style>
          </head>
          <body>
            <div id="root"></div>
            <script type="text/babel">
              const { useState, useEffect, useRef } = React;
              try {
                ${content}
                
                // Try to find the component to render
                // Assuming the user defines a component named 'App' or 'Example' or exports default
                // Since we can't easily parse exports in this simple view, we rely on convention or simple execution
                
                // Heuristic: Check if 'App' is defined
                if (typeof App !== 'undefined') {
                   const root = ReactDOM.createRoot(document.getElementById('root'));
                   root.render(<App />);
                } else {
                   // If raw JSX is provided without a component wrapper, we might need to wrap it?
                   // For now, let's assume the user writes a component and calls render or we just eval.
                }
              } catch (err) {
                document.getElementById('root').innerHTML = '<div style="color:red">' + err.message + '</div>';
              }
            </script>
          </body>
        </html>
       `;
    }

    doc.open();
    doc.write(htmlContent);
    doc.close();
  }, [content, language]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <iframe 
        ref={iframeRef} 
        style={{ flex: 1, border: 'none', background: '#fff' }} 
        title="Artifact Preview"
      />
    </div>
  );
}
