import React, { useState, useEffect } from 'react';
import { execute } from '../lib/tidbClient';
import { useAuth } from '../contexts/AuthContext';
import { ViewState, ViewType, ChatSession } from '../types';
import { ProfileIcon, SearchIcon, PlusCircleIcon, CloseIcon } from './icons';

interface InboxViewProps {
    setCurrentView: React.Dispatch<React.SetStateAction<ViewState>>;
}

const InboxView: React.FC<InboxViewProps> = ({ setCurrentView }) => {
    const { user } = useAuth();
    const [chats, setChats] = useState<ChatSession[]>([]);
    const [requests, setRequests] = useState<ChatSession[]>([]);
    const [activeTab, setActiveTab] = useState<'primary' | 'requests'>('primary');
    const [loading, setLoading] = useState(true);
    const [showNewChat, setShowNewChat] = useState(false);
    const [followList, setFollowList] = useState<any[]>([]);

    useEffect(() => {
        if (showNewChat && user) {
            execute(`
                SELECT p.* FROM profiles p 
                JOIN follows f ON(f.following_id = p.id AND f.follower_id = ?)
OR(f.follower_id = p.id AND f.following_id = ?)
                GROUP BY p.id
            `, [user.uid, user.uid]).then(res => setFollowList(res));
        }
    }, [showNewChat, user]);

    useEffect(() => {
        if (!user) return;

        const fetchChats = async () => {
            try {
                // Fetch chats where I am a participant
                const myChatsRes = await execute(
                    `SELECT c.id, c.lastMessage, c.updatedAt, cp.status 
                     FROM chats c
                     JOIN chat_participants cp ON c.id = cp.chat_id
                     WHERE cp.user_id = ?
    ORDER BY c.updatedAt DESC`,
                    [user.uid]
                );

                const primaryList: ChatSession[] = [];
                const requestList: ChatSession[] = [];

                await Promise.all(myChatsRes.map(async (chat: any) => {
                    // Fetch other participant
                    const participantsRes = await execute(
                        `SELECT p.id, p.username, p.photoURL 
                         FROM profiles p
                         JOIN chat_participants cp ON p.id = cp.user_id
                         WHERE cp.chat_id = ? AND p.id != ? `,
                        [chat.id, user.uid]
                    );

                    const otherProfile = participantsRes[0] || { username: 'Unknown' };

                    const session: ChatSession = {
                        id: chat.id,
                        lastMessage: chat.lastMessage,
                        updatedAt: chat.updatedAt,
                        participants: [], // Not needed for list
                        participantProfile: otherProfile
                    };

                    if (chat.status === 'pending') {
                        requestList.push(session);
                    } else if (chat.status === 'accepted') {
                        primaryList.push(session);
                    }
                }));

                setChats(primaryList);
                setRequests(requestList);
            } catch (e) {
                console.error("Failed to load inbox", e);
            } finally {
                setLoading(false);
            }
        };

        fetchChats();
    }, [user]);

    const handleChatClick = (chat: ChatSession) => {
        setCurrentView({
            type: ViewType.Chat,
            chatId: chat.id,
            otherUserId: chat.participantProfile?.id
        });
    };

    const startNewChat = async (targetId: string) => {
        if (!user) return;
        try {
            const { getOrCreateChat } = await import('../services/chatService');
            const chatId = await getOrCreateChat(user.uid, targetId);
            setCurrentView({ type: ViewType.Chat, chatId, otherUserId: targetId });
            setShowNewChat(false);
        } catch (e) {
            console.error(e);
        }
    };

    if (loading) return <div className="p-10 flex justify-center"><div className="w-6 h-6 border-2 border-indigo-500 rounded-full animate-spin"></div></div>;

    return (
        <div className="flex flex-col h-full bg-[var(--bg-color)] text-[var(--text-color)]">
            <div className="p-4 pb-2 md:p-6 md:pb-2">
                <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Messages</h1>
                <div className="flex space-x-6 border-b border-[var(--glass-border)]">
                    <button
                        onClick={() => setActiveTab('primary')}
                        className={`pb - 3 font - medium text - sm transition - colors relative ${activeTab === 'primary' ? 'text-white' : 'text-slate-500 hover:text-slate-300'} `}
                    >
                        Primary
                        {activeTab === 'primary' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[var(--primary-accent)] rounded-full"></div>}
                    </button>
                    <button
                        onClick={() => setActiveTab('requests')}
                        className={`pb - 3 font - medium text - sm transition - colors relative ${activeTab === 'requests' ? 'text-white' : 'text-slate-500 hover:text-slate-300'} `}
                    >
                        Requests
                        {requests.length > 0 && <span className="ml-2 px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded-full">{requests.length}</span>}
                        {activeTab === 'requests' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[var(--primary-accent)] rounded-full"></div>}
                    </button>
                </div>

                <button
                    onClick={() => setShowNewChat(true)}
                    className="fixed bottom-[calc(74px+env(safe-area-inset-bottom))] right-6 p-4 rounded-full bg-[var(--primary-accent)] text-black shadow-[0_0_20px_rgba(255,215,0,0.3)] hover:scale-110 transition-transform z-20"
                >
                    <PlusCircleIcon className="w-6 h-6" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 pb-32">
                {(activeTab === 'primary' ? chats : requests).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                            <SearchIcon className="w-5 h-5 opacity-50" />
                        </div>
                        <p className="text-sm">No conversations yet</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {(activeTab === 'primary' ? chats : requests).map(chat => (
                            <div
                                key={chat.id}
                                onClick={() => handleChatClick(chat)}
                                className="flex items-center p-3 rounded-xl hover:bg-[var(--glass-surface)] cursor-pointer transition-colors group"
                            >
                                <div className="w-14 h-14 rounded-full bg-slate-800 shrink-0 mr-4 overflow-hidden ring-2 ring-transparent group-hover:ring-[var(--primary-accent)]/30 transition-all">
                                    {chat.participantProfile?.photoURL ? (
                                        <img src={chat.participantProfile.photoURL} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white font-bold bg-[var(--primary-accent)]">
                                            {chat.participantProfile?.username?.[0]}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-sm truncate text-[var(--text-color)]">{chat.participantProfile?.username || 'Unknown User'}</h4>
                                    <p className="text-sm text-slate-400 truncate pr-4">
                                        {activeTab === 'requests' ?
                                            <span className="text-[var(--primary-accent)] italic">Has requested to message you</span> :
                                            (chat.lastMessage || <span className="italic opacity-50">Start a conversation</span>)
                                        }
                                    </p>
                                </div>
                                <div className="text-[10px] text-slate-600 font-mono whitespace-nowrap">
                                    {chat.updatedAt ? new Date(chat.updatedAt).toLocaleDateString() : ''}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>



            {/* New Chat Modal */}
            {
                showNewChat && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setShowNewChat(false)}>
                        <div className="bg-[#111] border border-white/10 w-full max-w-sm rounded-2xl shadow-2xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                            <div className="p-4 border-b border-white/10 flex justify-between items-center">
                                <h3 className="font-bold text-white">New Message</h3>
                                <button onClick={() => setShowNewChat(false)}><CloseIcon className="w-5 h-5 text-slate-400" /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                                {followList.length === 0 ? (
                                    <div className="p-4 text-center text-slate-500 text-sm">
                                        No connections found.<br />Follow someone to message them!
                                    </div>
                                ) : (
                                    followList.map(u => (
                                        <div key={u.id} onClick={() => startNewChat(u.id)} className="flex items-center p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-colors">
                                            <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden mr-3">
                                                {u.photoURL ? <img src={u.photoURL} className="w-full h-full object-cover" /> : null}
                                            </div>
                                            <span className="font-bold text-white">{u.username}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default InboxView;
