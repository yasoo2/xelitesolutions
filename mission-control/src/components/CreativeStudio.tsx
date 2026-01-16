
import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, Sparkles, Loader, Download } from 'lucide-react';
import { useAgent } from '../hooks/useAgent';

export const CreativeStudio = () => {
    const { messages, status, sendMessage } = useAgent();
    const [prompt, setPrompt] = useState('');
    const [gallery, setGallery] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);

    // Watch for new image URLs in messages
    useEffect(() => {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
            // Regex to find image urls (http/https ... .png/jpg/webp or from markdown)
            // Or just check if the message contains a URL and we just requested generation.

            // Allow loose matching for now
            const urlMatch = lastMsg.content.match(/https?:\/\/[^\s)]+/);
            if (urlMatch) {
                const url = urlMatch[0];
                // Avoid duplicates
                setGallery(prev => prev.includes(url) ? prev : [url, ...prev]);
                setIsGenerating(false);
            } else if (status === 'idle' && isGenerating) {
                // Agent finished but maybe didn't return a URL?
                setIsGenerating(false);
            }
        }
    }, [messages, status]);

    const handleGenerate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        setIsGenerating(true);
        // Explicit instruction to use the tool
        sendMessage(`Generate a high-quality futuristic image based on this prompt: "${prompt}". Return just the URL.`);
    };

    return (
        <div className="glass-panel p-6 col-span-1 row-span-2 flex flex-col">
            <div className="flex items-center gap-2 mb-6">
                <ImageIcon className="text-pink-400" />
                <h2 className="font-bold text-lg neon-text text-pink-300">CREATIVE STUDIO</h2>
            </div>

            {/* Generator Input */}
            <form onSubmit={handleGenerate} className="mb-8">
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Prompt Engineering</label>
                <div className="relative">
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe the asset..."
                        className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-sm focus:border-pink-500/50 outline-none resize-none h-24"
                    />
                    <button
                        type="submit"
                        disabled={isGenerating || !prompt.trim()}
                        className="absolute bottom-2 right-2 bg-pink-600 hover:bg-pink-500 text-white p-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {isGenerating ? <Loader className="animate-spin" size={16} /> : <Sparkles size={16} />}
                    </button>
                </div>
            </form>

            {/* Gallery / Preview */}
            <div className="flex-1 overflow-y-auto pr-2">
                <h3 className="text-xs text-gray-400 uppercase tracking-wider mb-4">Recent Assets</h3>
                <div className="grid grid-cols-1 gap-4">
                    {gallery.length === 0 && !isGenerating && (
                        <div className="border border-dashed border-white/10 rounded-xl h-32 flex items-center justify-center text-gray-600 text-xs">
                            NO ASSETS GENERATED
                        </div>
                    )}

                    {gallery.map((url, idx) => (
                        <div key={idx} className="group relative rounded-xl overflow-hidden border border-white/10 aspect-video bg-black/50">
                            <img src={url} alt={`Generated ${idx}`} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <a href={url} target="_blank" rel="noopener noreferrer" className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white">
                                    <Download size={16} />
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
