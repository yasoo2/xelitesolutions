
import { useState } from 'react';
import { Wand2, Download, Image as ImageIcon, Loader2 } from 'lucide-react';
import { API_URL } from '../config';

export default function ArtStudio() {
    const [prompt, setPrompt] = useState('');
    const [image, setImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleGenerate = async () => {
        if (!prompt.trim()) return;
        setLoading(true);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/art/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ prompt })
            });
            const data = await res.json();
            if (data.ok && data.output?.url) {
                setImage(data.output.url);
            } else {
                alert('Generation failed: ' + (data.error || 'Unknown error'));
            }
        } catch {
            alert('Network error');
        }
        setLoading(false);
    };

    return (
        <div className="flex flex-col h-full bg-[#1a0b2e] text-white overflow-hidden">
            <div className="p-4 border-b border-white/10 bg-[#1a0b2e]/90 flex items-center gap-3">
                <div className="p-2 bg-purple-600 rounded-lg"><Wand2 size={20} /></div>
                <div>
                    <h2 className="font-bold text-lg">AI Art Studio</h2>
                    <p className="text-xs text-purple-300">Powered by DALL·E 3</p>
                </div>
            </div>

            <div className="flex-1 p-6 flex flex-col items-center justify-center overflow-auto">
                {image ? (
                    <div className="relative group max-w-full max-h-full">
                        <img src={image} alt={prompt} className="rounded-xl shadow-2xl max-h-[60vh] object-contain border border-white/10" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 rounded-xl">
                            <a href={image} target="_blank" download className="p-3 bg-white text-black rounded-full hover:bg-gray-200 transition-colors">
                                <Download size={24} />
                            </a>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center opacity-30">
                        <ImageIcon size={64} className="mb-4" />
                        <p>Your masterpiece awaits.</p>
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-white/10 bg-[#150a25]">
                <div className="flex gap-2 max-w-3xl mx-auto">
                    <input
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                        placeholder="Describe what you want to see (e.g., 'A cyberpunk city with neon rain')..."
                        className="flex-1 bg-white/5 border border-purple-500/30 rounded-xl px-4 py-3 focus:border-purple-500 outline-none transition-colors"
                        disabled={loading}
                    />
                    <button
                        onClick={handleGenerate}
                        disabled={loading || !prompt.trim()}
                        className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg hover:shadow-purple-500/20"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <Wand2 />}
                        Generate
                    </button>
                </div>
            </div>
        </div>
    );
}
