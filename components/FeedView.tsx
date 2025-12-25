import React, { useState, useEffect, useCallback } from 'react';
import { execute } from '../lib/tidbClient';
import { useAuth } from '../contexts/AuthContext';
import { PostWithAuthorAndLikes, ViewState, ViewType, Comment } from '../types';
import { useStatus } from '../contexts/StatusContext';
import { HeartIcon, TrashIcon, BackIcon, CommentIcon, GlobeIcon } from './icons';
import PostView from './PostView'; // We might want to resuse components from PostView or refactor PostCard out.
// For now, I will duplicate PostCard to be safe and independent, or better yet, refactor PostCard to be exported from PostView.tsx 
// But viewing PostView.tsx shows PostCard is not exported. I should probably duplicate it for this specific task to avoid touching PostView logic too much and breaking things, 
// OR I can export it. Let's export it from PostView.tsx in a separate step or just copy it here. 
// Given the instructions, I'll copy the core logic or simplified version here for the Feed.
// Actually, I'll basically copy the PostCard logic.

// ... deciding to copy PostCard logic for stability ...

// Helper to organize comments into threads
const organizeComments = (comments: Comment[]) => {
    const map = new Map<string, Comment & { replies: Comment[] }>();
    const roots: (Comment & { replies: Comment[] })[] = [];

    // First pass: create nodes
    comments.forEach(c => {
        map.set(c.id, { ...c, replies: [] });
    });

    // Second pass: link children
    comments.forEach(c => {
        const node = map.get(c.id)!;
        if (c.parent_id && map.has(c.parent_id)) {
            map.get(c.parent_id)!.replies.push(node);
        } else {
            roots.push(node);
        }
    });

    return roots;
};

const CommentCard: React.FC<{ comment: Comment & { replies?: Comment[] }, onDelete: () => void, onReply: (id: string, username: string) => void, onDeleteComment: (id: string) => void, currentUserId: string | undefined, depth?: number }> = ({ comment, onDelete, onReply, onDeleteComment, currentUserId, depth = 0 }) => {
    const isOwner = comment.user_id === currentUserId;
    return (
        <div className={`transition-colors group animate-fade-in-right ${depth > 0 ? 'ml-3 md:ml-6 border-l-2 border-white/5 pl-3 md:pl-4' : 'border-t border-white/5 pt-4'}`}>
            <div className="flex justify-between items-start mb-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-bold text-xs text-indigo-300 tracking-wide font-mono">{comment.profiles.username}</span>
                    <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">:: {new Date(comment.created_at).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="flex items-center space-x-2">
                    <button onClick={() => onReply(comment.id, comment.profiles.username)} className="text-[10px] text-slate-500 hover:text-indigo-400 transition-colors uppercase font-bold tracking-wider opacity-0 group-hover:opacity-100">
                        Reply
                    </button>
                    {isOwner && (
                        <button onClick={onDelete} className="text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                            <TrashIcon className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed mb-2">{comment.content}</p>
            {/* Recursive Replies */}
            {comment.replies && comment.replies.length > 0 && (
                <div className="space-y-3 mt-3">
                    {comment.replies.map(reply => (
                        <CommentCard
                            key={reply.id}
                            comment={reply}
                            onDelete={() => onDeleteComment(reply.id)}
                            onReply={onReply}
                            onDeleteComment={onDeleteComment}
                            currentUserId={currentUserId}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const PostCard: React.FC<{ post: PostWithAuthorAndLikes; onToggleLike: () => void; onDelete: () => void; onComment: (content: string, parentId?: string) => Promise<void>; onDeleteComment: (commentId: string) => Promise<void>; currentUserId: string | undefined; onUserClick: (uid: string) => void; }> = ({ post, onToggleLike, onDelete, onComment, onDeleteComment, currentUserId, onUserClick }) => {
    const isOwner = post.user_id === currentUserId;
    const [commentContent, setCommentContent] = useState('');
    const [replyTo, setReplyTo] = useState<{ id: string, username: string } | null>(null);
    const [isCommenting, setIsCommenting] = useState(false);
    const [showComments, setShowComments] = useState(false);

    const handleCommentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!commentContent.trim()) return;
        setIsCommenting(true);
        await onComment(commentContent, replyTo?.id);
        setCommentContent('');
        setReplyTo(null);
        setIsCommenting(false);
    };

    const threadedComments = React.useMemo(() => organizeComments(post.comments), [post.comments]);

    return (
        <div className="relative group perspective-1000 mb-6 w-full max-w-2xl mx-auto">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-indigo-600 rounded-[20px] blur opacity-0 group-hover:opacity-20 transition duration-500"></div>
            <div className="relative glass-panel rounded-[20px] p-0 overflow-hidden border border-[var(--glass-border)] bg-[var(--glass-surface)] transition-all duration-300 group-hover:-translate-y-1">
                <div className="p-4 md:p-6">
                    <div className="flex justify-between items-start mb-3 md:mb-4">
                        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onUserClick(post.user_id)}>
                            <div className="relative">
                                <div className="w-10 h-10 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center text-white font-bold text-sm shadow-inner overflow-hidden">
                                    {post.profiles.photoURL ? (
                                        <img src={post.profiles.photoURL} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="relative z-10">{post.profiles.username.charAt(0).toUpperCase()}</span>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm text-[var(--text-color)] tracking-wide hover:text-[var(--primary-accent)] transition-colors truncate">{post.profiles.username}</p>
                                <div className="flex items-center space-x-2 flex-wrap">
                                    <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider truncate max-w-[100px]">{post.domain_id}</span>
                                    <span className="text-[10px] text-[var(--primary-accent)] font-mono uppercase tracking-wider opacity-60 whitespace-nowrap">• {new Date(post.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                            </div>
                        </div>
                        {isOwner && (
                            <button onClick={onDelete} className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-red-400 transition-colors opacity-50 group-hover:opacity-100">
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    <p className="text-[var(--text-color)] whitespace-pre-wrap leading-relaxed text-[15px] font-normal tracking-wide pl-1">{post.content}</p>

                    {post.imageURL && (
                        <div className="mt-4 rounded-xl overflow-hidden border border-white/10 max-h-96 w-full">
                            <img src={post.imageURL} alt="Post Attachment" className="w-full h-full object-cover" />
                        </div>
                    )}
                </div>

                <div className="px-4 py-2 md:px-6 md:py-3 bg-[var(--bg-color)]/20 border-t border-[var(--glass-border)] flex items-center space-x-6">
                    <button onClick={onToggleLike} className={`group/btn flex items-center space-x-2 transition-all ${post.is_liked_by_user ? 'text-pink-500' : 'text-slate-400 hover:text-white'}`}>
                        <div className={`p-1.5 rounded-full transition-colors ${post.is_liked_by_user ? 'text-pink-500' : 'group-hover/btn:bg-white/5'}`}>
                            <HeartIcon className={`w-4 h-4 transition-transform group-active/btn:scale-125 ${post.is_liked_by_user ? 'fill-current' : ''}`} />
                        </div>
                        <span className="font-mono text-xs font-bold">{post.like_count}</span>
                    </button>

                    <button onClick={() => setShowComments(!showComments)} className={`group/btn flex items-center space-x-2 transition-colors ${showComments ? 'text-indigo-400' : 'text-slate-400 hover:text-white'}`}>
                        <div className={`p-1.5 rounded-full transition-colors ${showComments ? 'bg-indigo-500/10' : 'group-hover/btn:bg-white/5'}`}>
                            <CommentIcon className="w-4 h-4" />
                        </div>
                        <span className="font-mono text-xs font-bold">{post.comment_count}</span>
                    </button>
                </div>

                {(showComments || post.comments.length > 0) && (
                    <div className="bg-[#020203]/50 p-6 border-t border-white/5 shadow-inner">
                        <div className="space-y-3 mb-6">
                            {threadedComments.map(comment => (
                                <CommentCard
                                    key={comment.id}
                                    comment={comment}
                                    onDelete={() => onDeleteComment(comment.id)}
                                    onReply={(id, username) => { setReplyTo({ id, username }); }}
                                    onDeleteComment={onDeleteComment}
                                    currentUserId={currentUserId}
                                />
                            ))}
                        </div>

                        {currentUserId && (
                            <form onSubmit={handleCommentSubmit} className="flex flex-col space-y-2">
                                {replyTo && (
                                    <div className="flex items-center justify-between px-2 text-xs text-indigo-400 mb-1 animate-fade-in-down">
                                        <span>Replying to @{replyTo.username}</span>
                                        <button type="button" onClick={() => setReplyTo(null)} className="hover:text-white">Cancel</button>
                                    </div>
                                )}
                                <div className="flex space-x-3 items-end">
                                    <div className={`flex-1 relative group/input transition-all duration-300 ${replyTo ? 'pl-2 border-l-2 border-indigo-500' : ''}`}>
                                        <input
                                            type="text"
                                            value={commentContent}
                                            onChange={(e) => setCommentContent(e.target.value)}
                                            placeholder={replyTo ? `Reply to @${replyTo.username}...` : "Transmit reply..."}
                                            className="relative w-full bg-[#0a0a10] border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all placeholder-slate-600"
                                            autoFocus={!!replyTo}
                                        />
                                    </div>
                                    <button type="submit" disabled={isCommenting || !commentContent.trim()} className="px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50 uppercase tracking-wider hover:text-indigo-300">
                                        {isCommenting ? '...' : 'Send'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

interface FeedViewProps {
    setCurrentView: React.Dispatch<React.SetStateAction<ViewState>>;
}

import TopicSelector from './TopicSelector';

// ... (other imports)

const FeedView: React.FC<FeedViewProps> = ({ setCurrentView }) => {
    const { user, profile } = useAuth();
    const [posts, setPosts] = useState<PostWithAuthorAndLikes[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [showTopicSelector, setShowTopicSelector] = useState(false);

    // Pull to refresh state
    const [pullStartPoint, setPullStartPoint] = useState<number>(0);
    const [pullChange, setPullChange] = useState<number>(0);
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
    const scrollContainerRef = React.useRef<HTMLDivElement>(null);

    const { setError } = useStatus();

    const fetchFeed = useCallback(async () => {
        if (!user) return;

        // Check for interests
        if (!profile?.interests) {
            setShowTopicSelector(true);
            setIsLoading(false);
            return;
        }

        setShowTopicSelector(false);
        setIsLoading(true);
        try {
            const interests = profile.interests.split(',').filter(Boolean);
            if (interests.length === 0) {
                setShowTopicSelector(true);
                setIsLoading(false);
                return;
            }

            // ... (rest of fetch logic)

            // Construct LIKE clauses for each interest
            // WHERE (LOWER(p.domain_id) LIKE '%topic1%' OR LOWER(p.domain_id) LIKE '%topic2%')
            const likeClauses = interests.map(() => `LOWER(p.domain_id) LIKE ?`).join(' OR ');
            const queryParams = interests.map(i => `%${i.toLowerCase()}%`);

            const sql = `
                SELECT 
                    p.*, 
                    u.username, 
                    u.photoURL,
                    (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
                    (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
                    EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = ?) as is_liked_by_user
                FROM posts p 
                LEFT JOIN profiles u ON p.user_id = u.id 
                WHERE ${likeClauses}
                ORDER BY like_count DESC, p.created_at DESC
                LIMIT 50
            `;

            const rawPosts = await execute(sql, [user.uid, ...queryParams]);

            const postsWithComments = await Promise.all(rawPosts.map(async (post: any) => {
                const commentsSql = `
                    SELECT c.*, u.username, u.photoURL 
                    FROM comments c
                    LEFT JOIN profiles u ON c.user_id = u.id
                    WHERE c.post_id = ?
                    ORDER BY c.created_at ASC
                `;
                const comments = await execute(commentsSql, [post.id]);

                return {
                    id: post.id,
                    content: post.content,
                    imageURL: post.imageURL,
                    created_at: post.created_at,
                    user_id: post.user_id,
                    domain_id: post.domain_id,
                    profiles: {
                        username: post.username || 'Unknown',
                        photoURL: post.photoURL
                    },
                    like_count: Number(post.like_count),
                    is_liked_by_user: Boolean(post.is_liked_by_user),
                    comment_count: Number(post.comment_count),
                    comments: comments.map((c: any) => ({
                        id: c.id,
                        user_id: c.user_id,
                        parent_id: c.parent_id,
                        content: c.content,
                        created_at: c.created_at,
                        profiles: {
                            username: c.username || 'Unknown',
                            photoURL: c.photoURL
                        }
                    }))
                };
            }));

            setPosts(postsWithComments);

        } catch (e) {
            console.error("Feed error", e);
            setLoadError(true);
            setError("Failed to load your sphere feed.");
        } finally {
            setIsLoading(false);
        }
    }, [user, profile, setError]);

    useEffect(() => {
        fetchFeed();
    }, [fetchFeed]);

    // Copy handlers from PostView... simplified
    const handleToggleLike = async (post: PostWithAuthorAndLikes) => {
        if (!user) return;
        setPosts(currentPosts => currentPosts.map(p =>
            p.id === post.id
                ? { ...p, is_liked_by_user: !p.is_liked_by_user, like_count: p.is_liked_by_user ? p.like_count - 1 : p.like_count + 1 }
                : p
        ));
        try {
            if (post.is_liked_by_user) await execute('DELETE FROM likes WHERE post_id = ? AND user_id = ?', [post.id, user.uid]);
            else await execute('INSERT INTO likes (id, post_id, user_id, created_at) VALUES (UUID(), ?, ?, ?)', [post.id, user.uid, new Date().toISOString()]);
        } catch (err: any) { }
    };

    const handleDeletePost = async (postId: string) => {
        try {
            await execute('DELETE FROM posts WHERE id = ?', [postId]);
            setPosts(p => p.filter(x => x.id !== postId));
        } catch (err: any) { setError("Failed to delete post."); }
    };

    const handleCreateComment = async (postId: string, content: string, parentId?: string) => {
        if (!content.trim() || !user) return;
        try {
            const newId = crypto.randomUUID();
            const now = new Date().toISOString();
            await execute('INSERT INTO comments (id, post_id, user_id, content, created_at, parent_id) VALUES (?, ?, ?, ?, ?, ?)', [newId, postId, user.uid, content.trim(), now, parentId || null]);
            // Ideally refetch or update local state complexly... for now just refetch for simplicity or simple local update
            fetchFeed(); // Lazy way to refresh comments
        } catch (err: any) { setError("Failed to post comment."); }
    };

    const handleDeleteComment = async (postId: string, commentId: string) => {
        try {
            await execute('DELETE FROM comments WHERE id = ?', [commentId]);
            fetchFeed();
        } catch (e) { setError("Failed to delete comment"); }
    };

    const onTouchStart = (e: React.TouchEvent) => {
        if (scrollContainerRef.current?.scrollTop === 0) {
            setPullStartPoint(e.targetTouches[0].clientY);
        }
    };

    const onTouchMove = (e: React.TouchEvent) => {
        if (pullStartPoint === 0) return;

        const currentY = e.targetTouches[0].clientY;
        const dy = currentY - pullStartPoint;

        if (dy > 0 && scrollContainerRef.current?.scrollTop === 0) {
            // Add resistance/dampening to the pull
            setPullChange(dy * 0.4);
        } else {
            setPullChange(0);
        }
    };

    const onTouchEnd = async () => {
        if (pullChange > 70) { // Threshold to trigger refresh
            setIsRefreshing(true);
            setPullChange(70); // Keep at loading height
            await fetchFeed();
            setIsRefreshing(false);
        }
        setPullStartPoint(0);
        setPullChange(0);
    };


    return (
        <div className="w-full h-full flex flex-col items-center relative bg-transparent overflow-hidden">
            {showTopicSelector ? (
                <div className="w-full h-full overflow-y-auto custom-scrollbar">
                    {/* Pass extra padding via props or handle in wrapper if needed, 
                    {/* Pass extra padding via props or handle in wrapper if needed,
                         but TopicSelector has its own padding.
                         We just need to ensure the container doesn't clip. */}
                    <div className="min-h-full flex items-center justify-center py-20">
                        <TopicSelector onComplete={() => { setShowTopicSelector(false); fetchFeed(); }} />
                    </div>
                </div>
            ) : (
                <div
                    ref={scrollContainerRef}
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                    className="w-full h-full max-w-4xl px-3 md:px-4 pt-20 md:pt-24 pb-20 md:pb-32 overflow-y-auto custom-scrollbar snap-y snap-mandatory md:snap-none"
                >
                    {/* Pull to Refresh Indicator */}
                    <div
                        style={{ height: `${pullChange}px`, opacity: Math.min(pullChange / 70, 1) }}
                        className="w-full flex items-center justify-center overflow-hidden transition-all duration-200 ease-out -mt-4 md:mt-0"
                    >
                        {isRefreshing ? (
                            <div className="flex flex-col items-center py-2">
                                <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                            </div>
                        ) : (
                            <div className={`transform transition-transform duration-300 ${pullChange > 70 ? 'rotate-180' : ''}`}>
                                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                </svg>
                            </div>
                        )}
                    </div>

                    {/* ... content ... */}
                    <div className="flex flex-col items-center mb-8 md:mb-8 snap-start shrink-0 min-h-[20vh] md:min-h-0 justify-center md:justify-start">
                        {/* Desktop Icon (Large) */}
                        <div className="hidden md:block p-4 bg-white/5 rounded-full mb-4 border border-white/10 animate-pulse-slow">
                            <GlobeIcon className="w-8 h-8 text-indigo-400" />
                        </div>

                        {/* Header Container */}
                        <div className="flex items-center justify-center space-x-3 mb-1 md:mb-0">
                            {/* Mobile Icon (Small & Inline) */}
                            <div className="md:hidden p-2 bg-white/5 rounded-full border border-white/10 animate-pulse-slow">
                                <GlobeIcon className="w-5 h-5 text-indigo-400" />
                            </div>

                            <div className="flex flex-col text-center md:block">
                                <h1 className="text-xl md:text-2xl font-black text-white tracking-tighter italic">Your Feed</h1>
                                <p className="text-slate-500 text-xs md:text-sm hidden md:block">Curated transmissions from your selected spheres.</p>
                            </div>
                        </div>

                        <button onClick={() => setShowTopicSelector(true)} className="mt-1 md:mt-2 text-[10px] md:text-xs text-indigo-400 hover:text-white transition-colors uppercase tracking-widest font-bold">Adjust Spheres</button>
                    </div>

                    {isLoading ? (
                        <div className="flex justify-center pt-20">
                            <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                        </div>
                    ) : loadError ? (
                        <div className="text-center py-20 opacity-70 flex flex-col items-center snap-start h-[80vh] justify-center">
                            <p className="text-red-400 mb-2 font-bold">Signal Interrupted</p>
                            <button
                                onClick={() => { setLoadError(false); fetchFeed(); }}
                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-bold uppercase tracking-wider transition-all"
                            >
                                Retry Connection
                            </button>
                        </div>
                    ) : posts.length === 0 ? (
                        <div className="text-center py-20 opacity-50 flex flex-col items-center snap-start h-[80vh] justify-center">
                            <p>No transmissions found in your spheres.</p>
                            <p className="text-xs mt-2 text-slate-400">Try expanding your interests.</p>
                            <button
                                onClick={() => setShowTopicSelector(true)}
                                className="mt-4 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-bold uppercase tracking-wider transition-all"
                            >
                                Select Interests
                            </button>
                        </div>
                    ) : (
                        posts.map((post) => (
                            <div key={post.id} className="snap-start flex items-center justify-center w-full min-h-[85vh] md:min-h-0 md:h-auto py-4 md:py-0">
                                <PostCard
                                    post={post}
                                    onToggleLike={() => handleToggleLike(post)}
                                    onDelete={() => handleDeletePost(post.id)}
                                    onComment={(content, parentId) => handleCreateComment(post.id, content, parentId)}
                                    onDeleteComment={(commentId) => handleDeleteComment(post.id, commentId)}
                                    currentUserId={user?.uid}
                                    onUserClick={(uid) => setCurrentView((prev) => ({ ...prev, overlayProfileId: uid }))}
                                />
                            </div>
                        ))
                    )}
                    {/* Snap-aligned Loading Trigger (Visual Only for now as pagination is implicit limit 50) */}
                    {posts.length > 0 && (
                        <div className="snap-start w-full min-h-[20vh] flex flex-col items-center justify-center py-10 opacity-50">
                            <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-3"></div>
                            <p className="text-[10px] uppercase tracking-widest text-slate-500">Synchronizing...</p>
                        </div>
                    )}
                </div>
            )}
        </div >
    );
};

export default FeedView;
