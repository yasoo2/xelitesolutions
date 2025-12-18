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
        <div className="h-full flex flex-col bg-gray-900 text-gray-100 p-6">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                    <Beaker className="w-8 h-8 text-purple-500" />
                    <h2 className="text-2xl font-bold">Smart Test Runner</h2>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => runTest()}
                        disabled={running}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg flex items-center gap-2 disabled:opacity-50"
                    >
                        {running ? <Loader2 className="animate-spin" /> : <Play size={16} />}
                        Run All Tests
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full min-h-0">
                {/* Left Panel: Test Files */}
                <div className="bg-gray-800 rounded-xl p-4 flex flex-col border border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase mb-4 flex justify-between items-center">
                        Test Files
                        <span className="bg-gray-700 px-2 py-0.5 rounded text-xs text-white">{files.length}</span>
                    </h3>
                    
                    <div className="flex-1 overflow-y-auto space-y-2">
                        {loading ? (
                            <div className="text-center py-4 text-gray-500">Loading tests...</div>
                        ) : (
                            files.map((file, idx) => (
                                <div 
                                    key={idx}
                                    className={`p-3 rounded-lg flex items-center justify-between group transition-all ${selectedFile === file.path ? 'bg-purple-900/30 border border-purple-500/50' : 'bg-gray-900/50 border border-gray-700 hover:border-gray-500'}`}
                                >
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <FileCode className="w-4 h-4 text-gray-400 shrink-0" />
                                        <div className="truncate text-sm font-medium" title={file.path}>
                                            {file.name}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => runTest(file.path)}
                                        className="p-1.5 rounded bg-gray-700 hover:bg-green-600 hover:text-white text-gray-400 transition-colors opacity-0 group-hover:opacity-100"
                                        title="Run this test"
                                    >
                                        <Play size={12} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Generator Section */}
                    <div className="mt-4 pt-4 border-t border-gray-700">
                        <h4 className="text-xs font-semibold text-gray-400 mb-2">Generate New Test</h4>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                placeholder="path/to/source.ts" 
                                value={targetFile}
                                onChange={e => setTargetFile(e.target.value)}
                                className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-purple-500 outline-none"
                            />
                            <button 
                                onClick={generateTest}
                                disabled={generating || !targetFile}
                                className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded text-white disabled:opacity-50"
                            >
                                {generating ? <Loader2 className="animate-spin w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Panel: Output */}
                <div className="lg:col-span-2 bg-gray-950 rounded-xl p-4 flex flex-col border border-gray-700 font-mono">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-gray-400">Console Output</h3>
                        {output && (
                            <button 
                                onClick={() => setOutput('')} 
                                className="text-xs text-gray-500 hover:text-white"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    <div className="flex-1 overflow-auto whitespace-pre-wrap text-sm text-gray-300 bg-gray-900/50 p-4 rounded-lg border border-gray-800">
                        {output || <span className="text-gray-600 italic">Ready to run tests...</span>}
                    </div>
                </div>
            </div>
        </div>
    );
}
