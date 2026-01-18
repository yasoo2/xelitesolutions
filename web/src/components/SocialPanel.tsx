
import { useState, useEffect } from 'react';
import { Heart, MessageCircle, Send, Camera, MoreHorizontal, Loader2, Image as ImageIcon } from 'lucide-react';
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
        <div className="flex flex-col h-full bg-black text-white overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-black/80 backdrop-blur z-10">
                <h2 className="font-bold text-xl italic font-serif">Social Feed</h2>
                <button
                    onClick={handleCreatePost}
                    disabled={uploading}
                    className="p-2 bg-blue-600 rounded-full hover:bg-blue-500 transition-colors"
                >
                    {uploading ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
                </button>
            </div>

            {/* Feed */}
            <div className="flex-1 overflow-y-auto pb-20">
                {loading && posts.length === 0 && (
                    <div className="flex justify-center p-10"><Loader2 className="animate-spin opacity-50" /></div>
                )}

                {!loading && posts.length === 0 && (
                    <div className="text-center py-20 opacity-50">
                        <Camera size={48} className="mx-auto mb-4 opacity-50" />
                        <p>No posts yet.<br />Be the first to share!</p>
                    </div>
                )}

                {posts.map(post => (
                    <div key={post.id} className="border-b border-white/10 pb-4 mb-4">
                        <div className="p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 to-purple-600 p-[2px]">
                                    <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-xs font-bold">
                                        {post.userId.substring(0, 2).toUpperCase()}
                                    </div>
                                </div>
                                <span className="font-semibold text-sm">{post.userId}</span>
                            </div>
                            <MoreHorizontal size={16} className="opacity-50" />
                        </div>

                        {post.imageHref ? (
                            <div className="aspect-square bg-white/5 relative overflow-hidden">
                                <img
                                    src={`${API_URL}${post.imageHref}`}
                                    alt={post.caption}
                                    className="w-full h-full object-cover"
                                    onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/400?text=Error+Loading+Image')}
                                />
                            </div>
                        ) : (
                            <div className="aspect-video bg-white/5 flex items-center justify-center text-white/20">
                                <ImageIcon size={48} />
                            </div>
                        )}

                        <div className="p-3">
                            <div className="flex items-center gap-4 mb-3">
                                <button onClick={() => handleLike(post.id)} className="hover:text-red-500 transition-colors">
                                    <Heart size={24} />
                                </button>
                                <button className="hover:text-blue-500 transition-colors">
                                    <MessageCircle size={24} />
                                </button>
                                <button className="hover:text-green-500 transition-colors ml-auto">
                                    <Send size={24} />
                                </button>
                            </div>

                            <div className="font-semibold text-sm mb-1">{post.likes} likes</div>

                            {post.caption && (
                                <div className="text-sm mb-2">
                                    <span className="font-semibold mr-2">{post.userId}</span>
                                    <span className="opacity-90">{post.caption}</span>
                                </div>
                            )}

                            {post.comments.length > 0 && (
                                <div className="space-y-1 mb-2">
                                    {post.comments.slice(-3).map((c, i) => (
                                        <div key={i} className="text-xs opacity-70">
                                            <span className="font-semibold mr-1">{c.userId}</span>
                                            {c.text}
                                        </div>
                                    ))}
                                    {post.comments.length > 3 && (
                                        <div className="text-xs opacity-50 cursor-pointer">View all {post.comments.length} comments</div>
                                    )}
                                </div>
                            )}

                            <div className="text-[10px] opacity-40 uppercase mb-3">
                                {new Date(post.ts).toLocaleDateString()}
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="Add a comment..."
                                    value={commentText[post.id] || ''}
                                    onChange={(e) => setCommentText({ ...commentText, [post.id]: e.target.value })}
                                    onKeyDown={(e) => e.key === 'Enter' && handleComment(post.id)}
                                    className="bg-transparent text-sm w-full focus:outline-none"
                                />
                                {commentText[post.id] && (
                                    <button
                                        onClick={() => handleComment(post.id)}
                                        className="text-blue-500 text-xs font-semibold"
                                    >
                                        Post
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
