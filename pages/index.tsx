import React, { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ViewState, ViewType, Domain, PostWithAuthorAndLikes } from '../types';
import { initDB } from '../lib/tidbClient';
import StatusDisplay from '../components/StatusDisplay';
import SplashScreen from '../components/SplashScreen';
import Sidebar from '../components/Sidebar';
import CreatePostModal from '../components/CreatePostModal'; // Import Modal
import { useAuth } from '../contexts/AuthContext';

// Dynamic imports
import ExploreView from '../components/ExploreView';
import PostView from '../components/PostView';
import ProfileView from '../components/ProfileView';
import ChatView from '../components/ChatView';
import InboxView from '../components/InboxView';
import NotificationsView from '../components/NotificationsView';
import AuthView from '../components/AuthView';
import SearchView from '../components/SearchView';
import SettingsView from '../components/SettingsView';
import FeedView from '../components/FeedView';
import { MobileTopBar, MobileBottomNav } from '../components/MobileNav';

const Home: React.FC = () => {
    // Main Entry Point
    const { user, profile, isLoading } = useAuth(); // Helper to check auth state for sidebar
    const [currentView, setCurrentView] = useState<ViewState>({ type: ViewType.Explore });
    const [domainTree, setDomainTree] = useState<Domain | null>(null);
    const [showSplash, setShowSplash] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [postToEdit, setPostToEdit] = useState<PostWithAuthorAndLikes | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const handleOpenCreateModal = (post?: PostWithAuthorAndLikes) => {
        setPostToEdit(post || null);
        setIsCreateModalOpen(true);
    };

    const handlePostActionSuccess = () => {
        setRefreshKey(prev => prev + 1);
    };

    useEffect(() => {
        initDB().catch(err => console.warn("System Init:", err));
    }, []);

    // PWA & Notifications Logic
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showInstallBanner, setShowInstallBanner] = useState(false);

    useEffect(() => {
        const handler = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
            const hasSeen = localStorage.getItem('hyle_install_prompt_seen');
            if (!hasSeen) {
                setShowInstallBanner(true);
            }
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleDismissInstall = () => {
        setShowInstallBanner(false);
        localStorage.setItem('hyle_install_prompt_seen', 'true');
    };

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        // Mark as seen immediately when they click install, regardless of outcome
        localStorage.setItem('hyle_install_prompt_seen', 'true');

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setDeferredPrompt(null);
            setShowInstallBanner(false);
        }
        // If dismissed, we still hide our banner because we marked it as seen
        setShowInstallBanner(false);
    };

    const handleNotificationRequest = async () => {
        if (!("Notification" in window)) return;
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            // Use a service worker if available, otherwise just log
            console.log("Notification permission granted.");
            // Ideally register sw here if not already
        }
    };

    // Ask for notification permission after a short delay if logged in
    useEffect(() => {
        if (user && !isLoading) {
            const timer = setTimeout(() => {
                if (Notification.permission === 'default') {
                    handleNotificationRequest();
                }
            }, 3000); // Ask 3 seconds after login
            return () => clearTimeout(timer);
        }
    }, [user, isLoading]);

    // Onboarding Redirect
    useEffect(() => {
        if (user && profile && !profile.username && currentView.type !== ViewType.Profile) {
            setCurrentView({ type: ViewType.Profile });
        }
    }, [user, profile, currentView]);

    const renderView = useCallback(() => {
        switch (currentView.type) {
            case ViewType.Explore:
                return <ExploreView key="explore" setCurrentView={setCurrentView} initialPath={currentView.initialPath} domainTree={domainTree} setDomainTree={setDomainTree} />;
            case ViewType.Post:
                return (
                    <PostView
                        key={`post-${currentView.domainId}`}
                        domainId={currentView.domainId}
                        domainName={currentView.domainName}
                        setCurrentView={setCurrentView}
                        focusedPostId={currentView.focusedPostId}
                        onEditPost={handleOpenCreateModal}
                        refreshKey={refreshKey}
                    />
                );
            case ViewType.Profile:
                return <ProfileView key={`profile-${refreshKey}`} setCurrentView={setCurrentView} initialTab={currentView.initialTab} targetUserId={currentView.userId} onEditPost={handleOpenCreateModal} />;
            case ViewType.Chat:
                if (currentView.chatId && currentView.otherUserId) {
                    return (
                        <ChatView
                            key={`chat-${currentView.chatId}`}
                            chatId={currentView.chatId}
                            otherUserId={currentView.otherUserId}
                            setCurrentView={setCurrentView}
                        />
                    );
                }
                return <ExploreView setCurrentView={setCurrentView} domainTree={domainTree} setDomainTree={setDomainTree} />;
            case ViewType.Inbox:
                return <InboxView setCurrentView={setCurrentView} />;
            case ViewType.Notifications:
                return <NotificationsView setCurrentView={setCurrentView} />;
            case ViewType.Search:
                return <SearchView domainTree={domainTree} setCurrentView={setCurrentView} />;
            case ViewType.Settings:
                return <SettingsView setCurrentView={setCurrentView} />;
            case ViewType.Feed:
                return <FeedView setCurrentView={setCurrentView} />;

            case ViewType.Auth:
                return <div className="flex-1 flex items-center justify-center"><AuthView /></div>;
            default:
                return <ExploreView setCurrentView={setCurrentView} domainTree={domainTree} setDomainTree={setDomainTree} />;
        }
    }, [currentView, domainTree, refreshKey]); // Added domainTree dependency

    const handleCloseOverlay = () => {
        setCurrentView((prev) => ({ ...prev, overlayProfileId: undefined }));
    };

    // --- AUTH GATE ---
    // If we are past the splash screen, check if user is authenticated.
    // If loading, show nothing (or keep splash).
    // If not authenticated, show ONLY AuthView.

    if (isLoading) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-[var(--bg-color)]">
                <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!showSplash && !user) {
        return (
            <div className="h-screen w-screen flex flex-col font-sans overflow-hidden bg-[var(--bg-color)] items-center justify-center">
                <StatusDisplay showUplink={false} />
                <section className="flex-1 w-full max-w-4xl mx-auto px-6 md:px-0 pb-32">
                    <AuthView />
                </section>
                <div className="bg-mesh opacity-50"></div>
            </div>
        );
    }

    return (
        <>
            {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
            <div className={`h-screen w-screen flex flex-col md:flex-row font-sans overflow-hidden bg-[var(--bg-color)] transition-opacity duration-1000 ${showSplash ? 'opacity-0' : 'opacity-100'}`}>

                {/* Mobile Top Bar - Hide in Chat or when Profile Overlay is active */}
                {currentView.type !== ViewType.Chat && !currentView.overlayProfileId && (
                    <MobileTopBar setCurrentView={setCurrentView} currentViewType={currentView.type} />
                )}

                {/* Global Sidebar - Hidden on mobile initially, visible on desktop */}
                <Sidebar
                    setCurrentView={setCurrentView}
                    currentViewType={currentView.type}
                    onOpenCreatePostModal={() => handleOpenCreateModal()}
                />

                <main className={`flex-1 flex w-full min-w-0 relative flex-col overflow-hidden md:pt-0 md:pb-0 ${currentView.type === ViewType.Chat ? 'pt-0 pb-0' : 'pt-14 pb-20'}`}>
                    {renderView()}

                    {currentView.overlayProfileId && (
                        <ProfileView
                            key={`overlay-${currentView.overlayProfileId}`}
                            setCurrentView={setCurrentView}
                            targetUserId={currentView.overlayProfileId}
                            isOverlay={true}
                            onClose={handleCloseOverlay}
                            onEditPost={handleOpenCreateModal}
                            refreshKey={refreshKey}
                        />
                    )}

                    <CreatePostModal
                        isOpen={isCreateModalOpen}
                        onClose={() => {
                            setIsCreateModalOpen(false);
                            setPostToEdit(null);
                            handlePostActionSuccess();
                        }}
                        domainTree={domainTree}
                        setCurrentView={setCurrentView}
                        initialPost={postToEdit}
                    />
                </main>

                {/* Mobile Bottom Nav - Hide in Chat or when Profile Overlay is active */}
                {currentView.type !== ViewType.Chat && !currentView.overlayProfileId && (
                    <MobileBottomNav
                        setCurrentView={setCurrentView}
                        currentViewType={currentView.type}
                        onOpenCreatePostModal={() => handleOpenCreateModal()}
                    />
                )}

                <StatusDisplay showUplink={currentView.type !== ViewType.Chat} />

                {/* PWA Install Badge */}
                {showInstallBanner && (
                    <div className="absolute bottom-24 right-4 z-[100]">
                        <div className="flex items-center bg-indigo-600/90 hover:bg-indigo-600 text-white rounded-full shadow-lg border border-indigo-400/30 backdrop-blur-md p-1 pr-4">
                            <button
                                onClick={handleDismissInstall}
                                className="p-1.5 mr-1 hover:bg-white/20 rounded-full transition-colors"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                            <button
                                onClick={handleInstallClick}
                                className="flex items-center space-x-2"
                            >
                                <span className="text-[10px] font-bold uppercase tracking-widest">Install App</span>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            </button>
                        </div>
                    </div>
                )}

                {/* DEV ONLY: Debug PWA State */}
                {/* <div className="absolute top-20 left-4 z-50 text-[10px] text-red-500 bg-black/50 p-2 pointer-events-none">
                    PWA Debug: {deferredPrompt ? 'Ready' : 'Not Ready'} | Installed: {typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches ? 'Yes' : 'No'}
                </div> */}
            </div>
        </>
    );
};

export default Home;
