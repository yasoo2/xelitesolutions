import { useState, useEffect } from 'react';
import { Play, FileCode, CheckCircle2, XCircle, Plus, Loader2, Beaker } from 'lucide-react';
import { API_URL } from '../config';

interface TestFile {
    path: string;
    name: string;
}

export function TestRunner() {
    const [files, setFiles] = useState<TestFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [running, setRunning] = useState(false);
    const [output, setOutput] = useState<string>('');
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);
    const [targetFile, setTargetFile] = useState('');

    useEffect(() => {
        fetchTests();
    }, []);

    const fetchTests = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/tests/files`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            const data = await res.json();
            setFiles(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const runTest = async (file?: string) => {
        setRunning(true);
        setOutput('');
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/tests/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ testFile: file })
            });

            const reader = res.body?.getReader();
            const decoder = new TextDecoder();

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    setOutput(prev => prev + decoder.decode(value));
                }
            }
        } catch (e) {
            setOutput(prev => prev + `\nError: ${e}`);
        } finally {
            setRunning(false);
        }
    };

    const generateTest = async () => {
        if (!targetFile) return;
        setGenerating(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/tests/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ filePath: targetFile })
            });
            const data = await res.json();
            if (data.success) {
                alert(`Test generated at: ${data.testFilePath}`);
                fetchTests();
            } else {
                alert(`Error: ${data.error}`);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-[var(--bg-dark)] text-[var(--text-primary)] p-6">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                    <Beaker className="w-6 h-6 text-[var(--accent-primary)]" />
                    <h2 className="text-xl font-bold">Test Runner</h2>
                </div>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        placeholder="Path to file..." 
                        value={targetFile}
                        onChange={(e) => setTargetFile(e.target.value)}
                        className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded px-3 py-1 text-sm text-[var(--text-primary)]"
                    />
                    <button 
                        onClick={generateTest}
                        disabled={generating}
                        className="px-3 py-1 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white rounded flex items-center gap-2 text-sm disabled:opacity-50"
                    >
                        {generating ? <Loader2 className="animate-spin w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        Generate
                    </button>
                </div>
            </div>

            <div className="flex flex-1 gap-6 overflow-hidden">
                <div className="w-1/3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] flex flex-col">
                    <div className="p-4 border-b border-[var(--border-color)] font-semibold text-[var(--text-secondary)]">
                        Test Files
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {loading && <div className="text-center p-4 text-[var(--text-muted)]">Scanning...</div>}
                        {files.map(f => (
                            <div 
                                key={f.path}
                                onClick={() => setSelectedFile(f.path)}
                                className={`p-3 rounded-lg cursor-pointer flex items-center gap-3 transition-colors ${
                                    selectedFile === f.path 
                                    ? 'bg-[var(--bg-hover)] text-[var(--accent-primary)]' 
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                                }`}
                            >
                                <FileCode size={16} />
                                <span className="text-sm truncate" title={f.path}>{f.name}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex-1 flex flex-col bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] overflow-hidden">
                    <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-secondary)]">
                        <span className="font-mono text-sm text-[var(--text-muted)]">{selectedFile || 'No file selected'}</span>
                        <button 
                            onClick={() => runTest(selectedFile || undefined)}
                            disabled={running || (!selectedFile && !targetFile)}
                            className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2 text-sm disabled:opacity-50 font-medium"
                        >
                            {running ? <Loader2 className="animate-spin w-4 h-4" /> : <Play className="w-4 h-4" />}
                            Run Test
                        </button>
                    </div>
                    <div className="flex-1 bg-[var(--bg-code)] p-4 font-mono text-sm overflow-auto whitespace-pre-wrap text-green-700 dark:text-green-400">
                        {output || '// Test output will appear here...'}
                    </div>
                </div>
            </div>
        </div>
    );
}
