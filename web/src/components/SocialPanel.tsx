
import { useState, useEffect } from 'react';
import { Heart, MessageCircle, Send, Camera, MoreHorizontal, Loader2, Image as ImageIcon, Share2 } from 'lucide-react';
import { API_URL } from '../config';

interface Comment {
    userId: string;
    text: string;
    ts: number;
}

interface Post {
    id: string;
    userId: string;
    caption?: string;
    imageHref?: string;
    likes: number;
    comments: Comment[];
    ts: number;
}

export default function SocialPanel() {
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [commentText, setCommentText] = useState<Record<string, string>>({});

    const loadFeed = async () => {
        setLoading(true);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/insta/feed?limit=50`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setPosts(data.posts || []);
            }
        } catch { }
        setLoading(false);
    };

    useEffect(() => {
        loadFeed();
    }, []);

    const handleCreatePost = async () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const caption = prompt('Write a caption...');
            if (caption === null) return;

            setUploading(true);
            const formData = new FormData();
            formData.append('image', file);
            formData.append('caption', caption);

            const token = localStorage.getItem('token');
            try {
                await fetch(`${API_URL}/insta/post`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData
                });
                loadFeed();
            } catch {
                alert('Failed to upload');
            }
            setUploading(false);
        };
        fileInput.click();
    };

    const handleLike = async (postId: string) => {
        const token = localStorage.getItem('token');
        try {
            await fetch(`${API_URL}/insta/like`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ postId })
            });
            // Optimistic update
            setPosts(posts.map(p => p.id === postId ? { ...p, likes: p.likes + 1 } : p));
        } catch { }
    };

    const handleComment = async (postId: string) => {
        const text = commentText[postId]?.trim();
        if (!text) return;

        const token = localStorage.getItem('token');
        try {
            await fetch(`${API_URL}/insta/comment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ postId, text })
            });
            loadFeed();
            setCommentText(prev => ({ ...prev, [postId]: '' }));
        } catch { }
    };

    return (
        <div className="flex flex-col h-full bg-[#0f1117] text-white overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#0f1117]/80 backdrop-blur z-10 glass-panel border-r-0">
                <h2 className="font-bold text-xl tracking-tight bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">InstaJoe</h2>
                <button
                    onClick={handleCreatePost}
                    disabled={uploading}
                    className="premium-btn"
                >
                    {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                    <span className="text-sm">New Post</span>
                </button>
            </div>

            {/* Feed */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {loading && posts.length === 0 && (
                    <div className="flex justify-center p-10"><Loader2 className="animate-spin opacity-50 text-pink-500" size={32} /></div>
                )}

                {!loading && posts.length === 0 && (
                    <div className="text-center py-20 opacity-50">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Camera size={24} className="opacity-50" />
                        </div>
                        <p>No posts yet.<br />Be the first to share!</p>
                    </div>
                )}

                {posts.map(post => (
                    <div key={post.id} className="social-card">
                        <div className="p-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px]">
                                    <div className="w-full h-full rounded-full bg-[#0f1117] flex items-center justify-center text-sm font-bold border border-white/10">
                                        {post.userId.substring(0, 2).toUpperCase()}
                                    </div>
                                </div>
                                <div>
                                    <div className="font-semibold text-sm">{post.userId}</div>
                                    <div className="text-[10px] opacity-40">{new Date(post.ts).toLocaleDateString()}</div>
                                </div>
                            </div>
                            <button className="text-white/30 hover:text-white transition-colors">
                                <MoreHorizontal size={20} />
                            </button>
                        </div>

                        {post.imageHref ? (
                            <div className="aspect-square bg-white/5 relative overflow-hidden group">
                                <img
                                    src={`${API_URL}${post.imageHref}`}
                                    alt={post.caption}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/400?text=Error+Loading+Image')}
                                />
                            </div>
                        ) : (
                            <div className="aspect-video bg-white/5 flex items-center justify-center text-white/20">
                                <ImageIcon size={48} />
                            </div>
                        )}

                        <div className="p-4">
                            <div className="flex items-center gap-4 mb-4">
                                <button onClick={() => handleLike(post.id)} className="social-action-btn hover:text-pink-500 hover:bg-pink-500/10">
                                    <Heart size={22} className={post.likes > 0 ? "fill-pink-500 text-pink-500" : ""} />
                                    {post.likes > 0 && <span className="text-sm font-semibold">{post.likes}</span>}
                                </button>
                                <button className="social-action-btn hover:text-blue-500 hover:bg-blue-500/10">
                                    <MessageCircle size={22} />
                                    <span className="text-sm font-semibold">{post.comments.length}</span>
                                </button>
                                <button className="social-action-btn hover:text-green-500 hover:bg-green-500/10 ml-auto">
                                    <Share2 size={22} />
                                </button>
                            </div>

                            {post.caption && (
                                <div className="text-sm mb-3">
                                    <span className="font-semibold mr-2">{post.userId}</span>
                                    <span className="opacity-80 leading-relaxed">{post.caption}</span>
                                </div>
                            )}

                            {post.comments.length > 0 && (
                                <div className="space-y-2 mb-4 pl-3 border-l-2 border-white/10">
                                    {post.comments.slice(-3).map((c, i) => (
                                        <div key={i} className="text-xs opacity-70">
                                            <span className="font-semibold mr-2 text-white/90">{c.userId}</span>
                                            {c.text}
                                        </div>
                                    ))}
                                    {post.comments.length > 3 && (
                                        <div className="text-xs opacity-50 cursor-pointer hover:opacity-100 mt-1">
                                            View all {post.comments.length} comments
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex items-center gap-2 mt-4">
                                <div className="flex-1 relative">
                                    <input
                                        type="text"
                                        placeholder="Add a comment..."
                                        value={commentText[post.id] || ''}
                                        onChange={(e) => setCommentText({ ...commentText, [post.id]: e.target.value })}
                                        onKeyDown={(e) => e.key === 'Enter' && handleComment(post.id)}
                                        className="w-full bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-white/30 transition-colors placeholder:text-white/20"
                                    />
                                    <button
                                        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all ${commentText[post.id] ? 'text-blue-500 bg-blue-500/10 hover:bg-blue-500/20' : 'text-white/10'}`}
                                        onClick={() => handleComment(post.id)}
                                        disabled={!commentText[post.id]}
                                    >
                                        <Send size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
