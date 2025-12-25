
import React, { useState, useEffect, useRef } from 'react';
import { execute } from '../lib/tidbClient';
import { useAuth } from '../contexts/AuthContext';
import { ViewState, ViewType, ChatMessage, Profile } from '../types';
import { BackIcon, SendIcon } from './icons';
import { useStatus } from '../contexts/StatusContext';

interface ChatViewProps {
    chatId: string;
    otherUserId: string;
    setCurrentView: (view: ViewState) => void;
}

const ChatView: React.FC<ChatViewProps> = ({ chatId, otherUserId, setCurrentView }) => {
    const { user } = useAuth();
    const [status, setStatus] = useState<'accepted' | 'pending' | 'blocked' | null>(null);
    const { setError } = useStatus();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [otherProfile, setOtherProfile] = useState<Profile | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Fetch other user profile and my status
        const fetchContext = async () => {
            try {
                const profileRes = await execute('SELECT * FROM profiles WHERE id = ?', [otherUserId]);
                if (profileRes.length > 0) {
                    setOtherProfile(profileRes[0] as Profile);
                } else {
                    setOtherProfile({ id: otherUserId, username: 'Unknown', email: '' });
                }

                // Fetch my participant status
                if (user) {
                    const statusRes = await execute('SELECT status FROM chat_participants WHERE chat_id = ? AND user_id = ?', [chatId, user.uid]);
                    if (statusRes.length > 0) {
                        setStatus(statusRes[0].status);
                    } else {
                        // If no entry, strange, maybe new chat? assume accepted if we are here?
                        // Or maybe we are not a participant yet?
                        setStatus('accepted');
                    }
                }
            } catch (e) {
                console.error("Failed to fetch chat context", e);
            }
        }
        fetchContext();

        // Poll for messages
        const fetchMessages = async () => {
            if (!user) return;
            try {
                console.log('Fetching messages for chat:', chatId);
                // Determine if we can see messages. 
                // If pending, we can see them (requests).
                const result = await execute(
                    'SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC',
                    [chatId]
                );
                console.log('Raw DB result:', result);

                // Fix potential casing issue with query result if DB returns lowercase keys or camelCase
                // Tidbit: SQL usually returns lowercase. Our type expects camelCase for createdAt?
                // The DB schema says `created_at DATETIME`. The type says `createdAt`.
                // We need to map it.
                const mapped = result.map((m: any) => ({
                    ...m,
                    createdAt: m.created_at || m.createdAt,
                    senderId: m.sender_id || m.senderId
                }));
                console.log('Mapped messages:', mapped);
                setMessages(mapped as ChatMessage[]);
            } catch (e) {
                console.error("Failed to fetch messages", e);
            }
        };

        fetchMessages();
        const interval = setInterval(fetchMessages, 3000); // Poll every 3 seconds

        return () => clearInterval(interval);
    }, [chatId, otherUserId, user]);

    // Auto-scroll on new messages using robust scrollTop
    useEffect(() => {
        if (bottomRef.current) {
            const parent = bottomRef.current.parentElement;
            if (parent) {
                parent.scrollTop = parent.scrollHeight;
            }
        }
    }, [messages.length]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !user) return;

        const text = newMessage.trim();
        setNewMessage('');
        const newId = crypto.randomUUID();
        const now = new Date().toISOString();

        // Optimistic UI update
        setMessages(prev => [...prev, {
            id: newId,
            senderId: user.uid,
            text: text,
            createdAt: now,
            chat_id: chatId
        } as ChatMessage]);

        try {
            // Ensure chat exists (redundant if created in ProfileView, but safety net)
            // await execute('INSERT IGNORE INTO chats ...'); 

            await execute(
                'INSERT INTO messages (id, chat_id, sender_id, text, created_at) VALUES (?, ?, ?, ?, ?)',
                [newId, chatId, user.uid, text, now]
            );

            await execute(
                'UPDATE chats SET lastMessage = ?, updatedAt = ? WHERE id = ?',
                [text, now, chatId]
            );
        } catch (e) {
            console.error("Failed to send", e);
            setError("Failed to deliver transmission.");
        }
    };

    const handleAccept = async () => {
        if (!user) return;
        try {
            await execute('UPDATE chat_participants SET status = ? WHERE chat_id = ? AND user_id = ?', ['accepted', chatId, user.uid]);
            setStatus('accepted');
        } catch (e) { setError("Failed to accept."); }
    };

    const handleBlock = async () => {
        if (!user) return;
        try {
            await execute('UPDATE chat_participants SET status = ? WHERE chat_id = ? AND user_id = ?', ['blocked', chatId, user.uid]);
            setCurrentView({ type: ViewType.Explore }); // Exit
        } catch (e) { setError("Failed to block."); }
    };

    return (
        <div className="w-full h-full flex flex-col bg-[var(--bg-color)] relative z-0">
            {/* Header */}
            {/* Header - FIXED FULL WIDTH */}
            <header className="fixed top-0 right-0 left-0 h-20 bg-[var(--glass-surface)] z-[60] border-b border-white/10 flex items-center justify-between px-6 md:pl-32 shadow-sm">
                <div className="flex items-center">
                    <button
                        onClick={() => setCurrentView({ type: ViewType.Explore })}
                        className="mr-4 p-2.5 rounded-full hover:bg-white/10 transition-colors text-slate-200 hover:text-white"
                        aria-label="Back"
                    >
                        <BackIcon className="w-5 h-5" />
                    </button>

                    {otherProfile ? (
                        <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => setCurrentView({ type: ViewType.Chat, chatId, otherUserId, overlayProfileId: otherUserId })}>
                            <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden ring-2 ring-white/10 group-hover:ring-[var(--primary-accent)]/50 transition-all">
                                {otherProfile.photoURL ? (
                                    <img src={otherProfile.photoURL} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white bg-[var(--primary-accent)]">
                                        {otherProfile.username?.[0]?.toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <div>
                                <span className="font-bold text-slate-100 block text-base leading-tight group-hover:text-[var(--primary-accent)] transition-colors">
                                    {otherProfile.username}
                                </span>
                                <span className="text-[10px] text-green-400 font-mono tracking-wider block mt-0.5">
                                    {status === 'pending' ? 'CONNECTION REQUEST' : 'ENCRYPTED UPLINK'}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-slate-800 animate-pulse" />
                            <div className="h-4 w-24 bg-slate-800 rounded animate-pulse" />
                        </div>
                    )}
                </div>
            </header>

            {/* Messages Area - Added top padding and min-h-0 for flex correctness */}
            <main className="flex-1 overflow-y-auto p-4 pt-24 space-y-4 custom-scrollbar relative w-full min-h-0">

                {status === 'pending' && (
                    <div className="absolute inset-0 bg-[var(--bg-color)]/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
                        <div className="w-16 h-16 rounded-full overflow-hidden mb-4 ring-4 ring-[var(--glass-border)] shadow-2xl">
                            {otherProfile?.photoURL ? (
                                <img src={otherProfile.photoURL} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-[var(--primary-accent)] flex items-center justify-center text-2xl font-bold text-white">{otherProfile?.username?.[0]}</div>
                            )}
                        </div>

                        {/* Logic to distinguish SENDER vs RECEIVER of the request */}
                        {/* We don't have a direct 'isSender' flag from DB here easily without joining, 
                            BUT valid assumptions: 
                            If I am 'pending', I am the receiver (waiting to accept).
                            If I am 'accepted' but the OTHER is 'pending', I am the sender.
                            The current code fetched MY status into `status`.
                            If `status` is 'pending', then *I* need to accept.
                            
                            Wait, if I started the chat, my status is 'accepted' (from chatService).
                            The other person is 'pending'. 
                            So this block only shows if *I* am pending. 
                            
                            We need a block for when *I* am accepted but *They* are pending.
                         */}

                        <h2 className="text-[var(--text-color)] text-xl font-bold mb-2">{otherProfile?.username} wants to chat</h2>
                        <p className="text-[var(--text-color)]/60 text-sm mb-8 max-w-xs">Accepting this request will allow them to send you messages and see your status.</p>

                        <div className="flex space-x-4 w-full max-w-xs">
                            <button onClick={handleBlock} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-red-500/20 text-red-400 hover:text-red-300 font-bold transition-all border border-white/5 hover:border-red-500/30">
                                Ignore
                            </button>
                            <button onClick={handleAccept} className="flex-1 py-3 rounded-xl bg-[var(--primary-accent)] hover:opacity-90 text-white font-bold shadow-lg shadow-[var(--primary-accent)]/20 transition-all">
                                Accept
                            </button>
                        </div>
                    </div>
                )}

                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-600 mb-4 animate-[spin_10s_linear_infinite]"></div>
                        <p className="text-sm font-mono uppercase tracking-widest text-slate-500">No transmissions recorded</p>
                    </div>
                )}
                {messages.map((msg, idx) => {
                    const isMe = msg.senderId === user?.uid;
                    const showAvatar = !isMe && (idx === 0 || messages[idx - 1].senderId !== msg.senderId);

                    return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group animate-slide-in`}>
                            <div className={`flex max-w-[80%] items-end ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                {!isMe && (
                                    <div className="w-6 h-6 rounded-full bg-slate-700 overflow-hidden mr-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {otherProfile?.photoURL ? <img src={otherProfile.photoURL} className="w-full h-full object-cover" /> : <div className="text-[8px] flex items-center justify-center h-full text-white bg-[var(--primary-accent)]">{otherProfile?.username?.[0]}</div>}
                                    </div>
                                )}
                                <div>
                                    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${isMe
                                        ? 'bg-[var(--primary-accent)] text-white rounded-tr-sm'
                                        : 'bg-[var(--glass-surface)] text-[var(--text-color)] rounded-tl-sm border border-[var(--glass-border)]'
                                        }`}>
                                        {msg.text}
                                    </div>
                                    <div className={`mt-1 text-[9px] text-slate-500 font-mono px-1 opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? 'text-right' : 'text-left'}`}>
                                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
                <div ref={bottomRef} className="h-4" />
            </main>

            {/* Input Area */}
            {status !== 'pending' && status !== 'blocked' && (
                <form onSubmit={handleSend} className="p-4 border-t border-[var(--glass-border)] bg-[var(--glass-surface)] backdrop-blur-xl z-20 shrink-0 w-full">
                    <div className="flex items-center space-x-2 bg-white/5 border border-white/10 rounded-full px-2 py-1 focus-within:border-[var(--primary-accent)]/50 focus-within:bg-white/10 transition-colors">
                        <input
                            type="text"
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            placeholder="Type a message..."
                            className="flex-1 bg-transparent border-none px-4 py-3 text-[var(--text-color)] placeholder-slate-500 focus:outline-none text-sm"
                        />
                        <button
                            type="submit"
                            disabled={!newMessage.trim()}
                            className="p-2.5 bg-[var(--primary-accent)] hover:opacity-90 rounded-full text-white disabled:opacity-50 disabled:bg-slate-700 transition-all active:scale-95 flex items-center justify-center w-10 h-10 shrink-0"
                        >
                            <SendIcon className="w-4 h-4" />
                        </button>
                    </div>
                </form>
            )}
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 4px; }
                @keyframes slide-in {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-slide-in {
                    animation: slide-in 0.3s ease-out forwards;
                }
             `}</style>
        </div>
    );
};

export default ChatView;
