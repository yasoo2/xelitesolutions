import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Eye, Code, Check } from 'lucide-react';
import ArtifactPreview from './ArtifactPreview';

interface CodeWithPreviewProps {
  language: string;
  code: string;
  [key: string]: any;
}

export default function CodeWithPreview({ language, code, ...props }: CodeWithPreviewProps) {
  const [view, setView] = useState<'code' | 'preview'>('code');
  const [copied, setCopied] = useState(false);

  const isPreviewable = ['html', 'javascript', 'js', 'react', 'jsx', 'tsx', 'css'].includes(language.toLowerCase());

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-wrapper" style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)', margin: '8px 0' }}>
      <div className="code-block-header" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '8px 12px', 
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
           {isPreviewable && (
             <div className="code-tabs" style={{ display: 'flex', background: 'var(--bg-tertiary)', padding: 2, borderRadius: 6 }}>
               <button 
                 onClick={() => setView('code')}
                 style={{
                   border: 'none',
                   background: view === 'code' ? 'var(--bg-primary)' : 'transparent',
                   color: view === 'code' ? 'var(--text-primary)' : 'var(--text-muted)',
                   padding: '4px 12px',
                   borderRadius: 4,
                   cursor: 'pointer',
                   fontSize: 12,
                   fontWeight: 500,
                   display: 'flex',
                   alignItems: 'center',
                   gap: 6
                 }}
               >
                 <Code size={14} /> Code
               </button>
               <button 
                 onClick={() => setView('preview')}
                 style={{
                   border: 'none',
                   background: view === 'preview' ? 'var(--bg-primary)' : 'transparent',
                   color: view === 'preview' ? 'var(--text-primary)' : 'var(--text-muted)',
                   padding: '4px 12px',
                   borderRadius: 4,
                   cursor: 'pointer',
                   fontSize: 12,
                   fontWeight: 500,
                   display: 'flex',
                   alignItems: 'center',
                   gap: 6
                 }}
               >
                 <Eye size={14} /> Preview
               </button>
             </div>
           )}
           {!isPreviewable && (
             <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{language}</span>
           )}
        </div>

        <button 
          onClick={handleCopy}
          style={{ 
            background: 'transparent', 
            border: 'none', 
            color: 'var(--text-muted)', 
            cursor: 'pointer',
            display: 'flex', 
            alignItems: 'center',
            gap: 4,
            fontSize: 12
          }}
        >
          {copied ? <Check size={14} /> : <Code size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="code-block-content" style={{ position: 'relative' }}>
        {view === 'code' ? (
          <SyntaxHighlighter
            style={vscDarkPlus}
            language={language}
            PreTag="div"
            customStyle={{ margin: 0, borderRadius: 0 }}
            {...props}
          >
            {code}
          </SyntaxHighlighter>
        ) : (
          <div style={{ height: 400, background: '#fff' }}>
            <ArtifactPreview content={code} language={language} />
          </div>
        )}
      </div>
    </div>
  );
}
