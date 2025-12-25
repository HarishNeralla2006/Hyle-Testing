
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Domain, ViewState, ViewType } from '../types';
import ImagePreviewModal from './ImagePreviewModal';
import CreatePostModal from './CreatePostModal';
import { generateDomains as generateAIDomains, ROOT_DOMAINS } from '../services/pollinationsService';
import { MenuIcon, SettingsIcon, HomeIcon, SearchIcon, ProfileIcon, RefreshSimpleIcon, ZoomInIcon, ZoomOutIcon, BackIcon, EditIcon, InfoIcon, HelpIcon, CloseIcon, GlobeIcon, GridIcon, PlusCircleIcon } from './icons';
import DomainSphere, { calculateSphereSize } from './DomainSphere';
import ConstructingDomainsView from './ConstructingDomainsView';
import Navbar from './Navbar';
import { useStatus } from '../contexts/StatusContext';

interface ExploreViewProps {
    setCurrentView: (view: ViewState) => void;
    initialPath?: string[];
    domainTree: Domain | null;
    setDomainTree: React.Dispatch<React.SetStateAction<Domain | null>> | ((tree: Domain | null) => void);
}

const ButtonLoadingSpinner: React.FC<{ className?: string }> = ({ className = 'h-5 w-5' }) => (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);


const findNodeByPath = (root: Domain, path: string[]): Domain | null => {
    if (path.length === 0) return root;
    let currentNode: Domain | null = root;
    for (const name of path) {
        const nextNode = currentNode?.children?.find(child => child.name === name);
        if (!nextNode) return null;
        currentNode = nextNode;
    }
    return currentNode;
};

const cloneDomainTree = (node: Domain): Domain => {
    const newNode: Domain = {
        id: node.id,
        name: node.name,
        children: null,
        source: node.source,
    };

    if (node.position) {
        newNode.position = { x: node.position.x, y: node.position.y };
    }

    if (Array.isArray(node.children)) {
        newNode.children = node.children.map(cloneDomainTree);
    }

    return newNode;
};

const updateNodeByPath = (root: Domain, path: string[], newChildren: Domain[]): Domain => {
    const newRoot = cloneDomainTree(root);

    let currentNode: Domain | null = newRoot;
    if (path.length > 0) {
        for (const name of path) {
            const nextNode = currentNode!.children?.find((child: Domain) => child.name === name);
            if (!nextNode) return newRoot;
            currentNode = nextNode;
        }
    }

    if (currentNode) {
        // Preserve existing positions of children if they match by ID
        const existingChildrenMap = new Map(currentNode.children?.map(c => [c.id, c]));

        currentNode.children = newChildren.map(newChild => {
            const existing = existingChildrenMap.get(newChild.id);
            if (existing && existing.position) {
                return { ...newChild, position: existing.position };
            }
            return newChild;
        });
    }
    return newRoot;
};

const calculateChaoticLayout = (
    domains: Domain[] | null,
    containerSize: number,
    centerNodeName: string
): Domain[] => {
    if (!domains) return [];

    const centerNodeSize = calculateSphereSize(centerNodeName);
    const centerRadius = centerNodeSize * 0.56;

    const nodes = domains.map(domain => {
        const existingX = domain.position?.x;
        const existingY = domain.position?.y;

        const size = calculateSphereSize(domain.name);
        const radius = size * 0.56;

        const startX = 50 + (Math.random() - 0.5) * 30;
        const startY = 50 + (Math.random() - 0.5) * 30;

        return {
            ...domain,
            radius: radius,
            x: existingX ?? startX,
            y: existingY ?? startY,
        };
    });

    const iterations = 300;

    for (let i = 0; i < iterations; i++) {
        for (let j = 0; j < nodes.length; j++) {
            for (let k = j + 1; k < nodes.length; k++) {
                const node1 = nodes[j];
                const node2 = nodes[k];
                const dx = node2.x - node1.x;
                const dy = node2.y - node1.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const minDistance = node1.radius + node2.radius + 2;

                if (distance < minDistance && distance > 0) {
                    const overlap = minDistance - distance;
                    const angle = Math.atan2(dy, dx);
                    const pushX = (overlap / 2) * Math.cos(angle);
                    const pushY = (overlap / 2) * Math.sin(angle);

                    node1.x -= pushX;
                    node1.y -= pushY;
                    node2.x += pushX;
                    node2.y += pushY;
                }
            }
        }

        for (const node of nodes) {
            const dxToCenter = 50 - node.x;
            const dyToCenter = 50 - node.y;

            const pullForce = 0.015;

            node.x += dxToCenter * pullForce;
            node.y += dyToCenter * pullForce;

            const distanceFromCenter = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
            const minDistanceFromCenter = centerRadius + node.radius + 4;

            if (distanceFromCenter < minDistanceFromCenter && distanceFromCenter > 0) {
                const overlap = minDistanceFromCenter - distanceFromCenter;
                const angle = Math.atan2(dyToCenter, dxToCenter);
                node.x -= overlap * Math.cos(angle);
                node.y -= overlap * Math.sin(angle);
            }
        }
    }

    return nodes.map(node => ({
        ...node,
        position: { x: node.x, y: node.y },
    }));
};

const ExploreView: React.FC<ExploreViewProps> = ({ setCurrentView, initialPath, domainTree, setDomainTree }) => {
    // const [domainTree, setDomainTree] = useState<Domain | null>(null); // REMOVED
    const [currentPath, setCurrentPath] = useState<string[]>(initialPath || []);
    const [modalDomain, setModalDomain] = useState<Domain | null>(null);
    const [modalDomainPath, setModalDomainPath] = useState<string[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isMoreLoading, setIsMoreLoading] = useState(false);
    const { error, setError } = useStatus();
    const [containerSize, setContainerSize] = useState(500);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [isNavOpen, setIsNavOpen] = useState(false);
    const [isCreatePostModalOpen, setCreatePostModalOpen] = useState(false);
    const [isSearchVisible, setIsSearchVisible] = useState(false);
    const [isGuideOpen, setGuideOpen] = useState(false);

    const [zoomLevel, setZoomLevel] = useState(1);
    const [loadMoreVariant, setLoadMoreVariant] = useState(0);
    const [isPinchEnabled, setPinchEnabled] = useState(false); // Default off as requested

    // Panning & Pinching State
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const isDragging = useRef(false);
    const lastPanPosition = useRef({ x: 0, y: 0 });
    const dragStartPos = useRef({ x: 0, y: 0 }); // Track start for threshold
    const startDragTime = useRef(0);
    const lastPointerType = useRef<string>('touch'); // Track pointer type
    // Pinch Refs
    const activePointers = useRef<Map<number, { x: number, y: number }>>(new Map());
    const initialPinchDistance = useRef<number | null>(null);
    const initialZoomLevel = useRef<number>(1);

    const containerRef = useCallback((node: HTMLDivElement) => {
        if (node !== null) {
            setContainerSize(Math.min(node.offsetWidth, node.offsetHeight));
        }
    }, []);

    const breadcrumbRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setLoadMoreVariant(0);
        setZoomLevel(1);
        setPan({ x: 0, y: 0 }); // Reset pan on navigation

        // Auto-scroll breadcrumbs to right
        if (breadcrumbRef.current) {
            setTimeout(() => {
                if (breadcrumbRef.current) {
                    breadcrumbRef.current.scrollTo({ left: breadcrumbRef.current.scrollWidth, behavior: 'smooth' });
                }
            }, 100);
        }
    }, [currentPath]);

    const fetchInitialDomains = useCallback(async () => {
        try {
            setIsLoading(true);
            const rootDomains = ROOT_DOMAINS;
            const children = rootDomains.map((name) => ({
                id: name,
                name,
                children: null,
                source: 'ai' as const
            }));
            setDomainTree({ id: 'root', name: 'SparkSphere', children });
        } catch (e: any) {
            setError('Failed to fetch initial domains.');
        } finally {
            setIsLoading(false);
        }
    }, [setError]);

    useEffect(() => {
        if (!initialPath?.length && !domainTree) {
            fetchInitialDomains();
        }
    }, [fetchInitialDomains, initialPath, domainTree]);

    const currentNode = useMemo(() => domainTree ? findNodeByPath(domainTree, currentPath) : null, [domainTree, currentPath]);

    const orbitingChildren = useMemo(() => {
        const centerNodeName = currentPath.length > 0 ? currentPath[currentPath.length - 1] : (domainTree?.name || "SparkSphere");
        return calculateChaoticLayout(currentNode?.children || null, containerSize, centerNodeName);
    }, [currentNode?.children, containerSize, currentPath, domainTree?.name]);

    const filteredOrbitingChildren = useMemo(() => {
        if (!searchQuery.trim()) return orbitingChildren;
        return orbitingChildren.filter(domain =>
            domain.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
        );
    }, [orbitingChildren, searchQuery]);


    useEffect(() => {
        const fetchChildrenIfNeeded = async () => {
            if (currentNode && currentNode.children === null) {
                setIsLoading(true);
                setError(null);

                try {
                    const fullContextPath = [domainTree!.name, ...currentPath];
                    const aiNames = await generateAIDomains(currentNode.name, fullContextPath, 0);

                    const aiChildren: Domain[] = aiNames.map(name => ({
                        id: name,
                        name,
                        children: null,
                        source: 'ai'
                    }));

                    if (domainTree) {
                        const treeWithNew = updateNodeByPath(domainTree, currentPath, aiChildren);
                        setDomainTree(treeWithNew);
                    }
                } catch (e: any) {
                    console.warn("Fetch failed", e);
                    setError("Failed to load domains.");
                } finally {
                    setIsLoading(false);
                }
            } else if (currentNode && currentNode.children !== null) {
                // If data exists, ensure loading is off
                setIsLoading(false);
            } else if (!domainTree && !initialPath?.length) {
                // Waiting for initial fetch
                // fetchInitialDomains will handle filtering
            }
        };

        fetchChildrenIfNeeded();
    }, [currentNode, currentPath, domainTree, setError]);


    const handleSelectDomain = (domainName: string) => {
        // Explicitly rely on pointer events for navigation now
        // This function is kept for non-pointer interactions if any
        setSearchQuery('');
        setCurrentPath(prev => [...prev, domainName]);
    };

    const handleNavigate = (pathIndex: number) => {
        setCurrentPath(prev => prev.slice(0, pathIndex + 1));
    };

    const handleGoHome = () => {
        setCurrentPath([]);
        if (domainTree?.name !== 'SparkSphere') {
            fetchInitialDomains();
        }
    }

    const handleBack = () => {
        if (currentPath.length > 0) {
            setCurrentPath(prev => prev.slice(0, prev.length - 1));
        }
    };

    const handleInfoClick = (domain: Domain, isCenter: boolean = false) => {
        setModalDomain(domain);
        const relativePath = isCenter ? currentPath : [...currentPath, domain.name];
        const fullPath = [domainTree!.name, ...relativePath];
        setModalDomainPath(fullPath);
    };

    const handleLoadMore = useCallback(async () => {
        if (!currentNode) return;
        setIsMoreLoading(true);
        try {
            const fullContextPath = [domainTree!.name, ...currentPath];
            const nextVariant = loadMoreVariant + 1;

            const newNames = await generateAIDomains(currentNode.name, fullContextPath, nextVariant);
            setLoadMoreVariant(nextVariant);

            if (newNames.length > 0) {
                if (!domainTree) return;

                const freshParent = findNodeByPath(domainTree, currentPath);
                if (!freshParent) return;

                const existing = freshParent.children || [];
                const existingSet = new Set(existing.map(c => c.name.toLowerCase()));

                const uniqueNew = newNames.filter(n => !existingSet.has(n.toLowerCase()));

                const newDomains: Domain[] = uniqueNew.map(name => ({
                    id: name,
                    name,
                    children: null,
                    source: 'ai'
                }));

                const newTree = updateNodeByPath(domainTree, currentPath, [...existing, ...newDomains]);
                setDomainTree(newTree);
            }
        } catch (e) {
            setError("Failed to load more.");
        } finally {
            setIsMoreLoading(false);
        }
    }, [currentPath, currentNode, domainTree, setError, loadMoreVariant]);

    const executeSearch = async (searchTerm: string) => {
        try {
            setIsSearching(true);
            setIsLoading(true);
            setCurrentPath([]);

            setSearchQuery('');
            setIsSearchVisible(false);
            searchInputRef.current?.blur();

            const aiNames = await generateAIDomains(searchTerm, [searchTerm], 0);

            const children = aiNames.map((name) => ({
                id: name,
                name,
                children: null,
                source: 'ai' as const
            }));

            setDomainTree({ id: searchTerm, name: searchTerm, children });
        } catch (err: any) {
            setError("Search failed.");
        } finally {
            setIsSearching(false);
            setIsLoading(false);
        }
    };

    const handleContextSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!searchQuery.trim()) return;

        // Capitalize
        const term = searchQuery.trim().charAt(0).toUpperCase() + searchQuery.trim().slice(1);

        if (!domainTree) {
            executeSearch(term);
            return;
        }

        const node = findNodeByPath(domainTree, currentPath);
        if (!node) return;

        const newChild: Domain = {
            id: term,
            name: term,
            children: null,
            source: 'ai'
        };

        const currentChildren = node.children || [];
        // Avoid duplicates (insensitive)
        if (!currentChildren.find(c => c.name.toLowerCase() === term.toLowerCase())) {
            const newTree = updateNodeByPath(domainTree, currentPath, [...currentChildren, newChild]);
            setDomainTree(newTree);
        }

        setSearchQuery('');
        setIsSearchVisible(false);
        searchInputRef.current?.blur();
    };

    const handleSearchSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        // Capitalize first letter strictly without AI
        const formattedQuery = searchQuery.trim().charAt(0).toUpperCase() + searchQuery.trim().slice(1);
        await executeSearch(formattedQuery);
    };

    const handleRefreshClick = () => handleLoadMore();
    const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.2, 2.0));
    const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.2, 0.6));

    // --- Pan Handlers ---
    // --- Pan & Pinch Handlers ---
    const getDistance = (p1: { x: number, y: number }, p2: { x: number, y: number }) => {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    };

    const onPointerDown = (e: React.PointerEvent) => {
        activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);

        if (activePointers.current.size === 2 && isPinchEnabled) {
            const points = Array.from(activePointers.current.values());
            initialPinchDistance.current = getDistance(points[0], points[1]);
            initialZoomLevel.current = zoomLevel;
            isDragging.current = false; // Disable pan while pinching
        } else if (activePointers.current.size === 1) {
            isDragging.current = false; // Start as false, wait for move threshold
            lastPanPosition.current = { x: e.clientX, y: e.clientY };
            dragStartPos.current = { x: e.clientX, y: e.clientY };
            startDragTime.current = Date.now();
            lastPointerType.current = e.pointerType;
        }
    };

    const onPointerMove = (e: React.PointerEvent) => {
        // Fix: Do not track mouse movement unless it was registered in onPointerDown (clicked)
        if (!activePointers.current.has(e.pointerId)) return;

        activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activePointers.current.size === 2 && isPinchEnabled && initialPinchDistance.current) {
            const points = Array.from(activePointers.current.values());
            const currentDistance = getDistance(points[0], points[1]);
            const ratio = currentDistance / initialPinchDistance.current;
            const newZoom = Math.min(Math.max(initialZoomLevel.current * ratio, 0.6), 2.5);
            setZoomLevel(newZoom);
            return;
        }

        if (activePointers.current.size !== 1) return;

        // Threshold check for drag
        if (!isDragging.current) {
            // For mouse: Start dragging immediately (restore old feel)
            // For touch: Use threshold to distinguish tap vs drag
            if (e.pointerType === 'mouse') {
                isDragging.current = true;
            } else {
                const dist = getDistance(dragStartPos.current, { x: e.clientX, y: e.clientY });
                if (dist > 10) {
                    isDragging.current = true;
                } else {
                    return; // Suppress pan if under threshold
                }
            }
        }

        const dx = e.clientX - lastPanPosition.current.x;
        const dy = e.clientY - lastPanPosition.current.y;

        setPan(p => ({ x: p.x + dx, y: p.y + dy }));
        lastPanPosition.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: React.PointerEvent) => {
        activePointers.current.delete(e.pointerId);

        // Calculate total interaction duration and rough movement
        const duration = Date.now() - startDragTime.current;
        const totalDist = getDistance(lastPanPosition.current, { x: e.clientX, y: e.clientY }); // Approximate final move

        if (activePointers.current.size < 2) {
            initialPinchDistance.current = null;
        }

        if (activePointers.current.size === 0) {
            // TAP DETECTION

            // Mouse Jitter Fix:
            // If dragging started (isDragging=true) but total movement was tiny,
            // treat it as a click (reset isDragging to false) so onClick can fire.
            const dist = getDistance(dragStartPos.current, { x: e.clientX, y: e.clientY });
            if (e.pointerType === 'mouse' && dist < 5) {
                isDragging.current = false;
            }

            // Do not clear isDragging here immediately for other cases to allow onClick to check it.
            // onPointerDown resets it next time.

        } else if (activePointers.current.size === 1) {
            // Re-engage panning if one finger remains
            const remaining = activePointers.current.values().next().value;
            lastPanPosition.current = remaining;
            isDragging.current = true;
        }
    };

    // Helper to control domain selection based on drag state
    const handleDomainClickRequest = (domainName: string) => {
        if (isDragging.current) return; // Ignore if currently dragging

        // Duration check: Tap must be short (< 150ms) to distinguish from "Hold to Explore"
        // User requested "slightly reduce" / "sooner"
        // BYPASS this check for MOUSE to restore "old" desktop control feel
        if (lastPointerType.current !== 'mouse' && Date.now() - startDragTime.current > 150) return;

        handleSelectDomain(domainName);
    };

    const renderBreadcrumb = () => (
        <div
            ref={breadcrumbRef}
            className="flex items-center space-x-1 text-sm text-slate-400 overflow-x-auto whitespace-nowrap px-2 font-medium h-full w-full custom-scrollbar"
        >
            <button onClick={handleGoHome} className="hover:text-white transition-colors flex-shrink-0 px-2 py-1">Home</button>
            {(domainTree?.name !== 'SparkSphere') && (
                <>
                    <span className="flex-shrink-0 opacity-40 mx-1">/</span>
                    <button
                        onClick={() => setCurrentPath([])}
                        className={`${currentPath.length === 0 ? 'text-white font-semibold' : 'hover:text-white'} transition-colors flex-shrink-0 px-2 py-1`}
                    >
                        {domainTree?.name}
                    </button>
                </>
            )}
            {currentPath.map((name, index) => (
                <React.Fragment key={`${name}-${index}`}>
                    <span className="flex-shrink-0 opacity-40 mx-1">/</span>
                    <button
                        onClick={() => handleNavigate(index)}
                        className={`${index === currentPath.length - 1 ? 'text-white font-semibold' : 'hover:text-white'} transition-colors flex-shrink-0 px-2 py-1`}
                    >
                        {name}
                    </button>
                </React.Fragment>
            ))}
            {/* Spacer to ensure last item isn't masked */}
            <div className="w-8 flex-shrink-0"></div>
        </div>
    );

    const renderContent = () => {
        if (isSearching || (isLoading && !currentNode?.children)) {
            return <ConstructingDomainsView />;
        }

        if (currentNode) {
            const centerNodeName = currentPath.length > 0 ? currentPath[currentPath.length - 1] : (domainTree?.name || "SparkSphere");

            return (
                <div
                    className="absolute inset-0 overflow-hidden cursor-move touch-none"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerLeave={onPointerUp}
                >
                    {/* Dynamic Grid Background that moves with Pan */}
                    <div
                        className="absolute inset-[-100%] w-[300%] h-[300%] pointer-events-none opacity-30"
                        style={{
                            transform: `translate(${pan.x * 0.5}px, ${pan.y * 0.5}px)`,
                            backgroundImage: `radial-gradient(var(--grid-dot-color) 1.5px, transparent 1.5px)`,
                            backgroundSize: '32px 32px',
                            maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 80%)'
                        }}
                    />

                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div
                            ref={containerRef}
                            className="relative w-[90vmin] h-[90vmin] transition-transform duration-100 ease-linear"
                            style={{
                                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`
                            }}
                        >
                            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ transform: 'translateZ(0)' }}>
                                {filteredOrbitingChildren.map((domain) => (
                                    domain.position && (
                                        <line
                                            key={`line-${domain.id}`}
                                            x1="50%"
                                            y1="50%"
                                            x2={`${domain.position.x}%`}
                                            y2={`${domain.position.y}%`}
                                            stroke="var(--grid-dot-color)"
                                            strokeWidth="1"
                                            strokeDasharray="3 4"
                                            opacity="0.4"
                                        />
                                    )
                                ))}
                            </svg>

                            <div className="pointer-events-auto">
                                <DomainSphere
                                    domain={currentNode}
                                    onSelect={() => { }}
                                    onInfo={(domain) => handleInfoClick(domain, true)}
                                    isCenter={true}
                                />

                                {filteredOrbitingChildren.map((domain, index) => (
                                    <DomainSphere
                                        key={domain.id}
                                        domain={domain}
                                        onSelect={() => handleDomainClickRequest(domain.name)}
                                        onInfo={(domain) => handleInfoClick(domain)}
                                        index={index}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
        return <div className="flex-1 flex items-center justify-center text-slate-500 font-light tracking-wide">Empty Void</div>;
    }

    return (
        <div className="w-full h-full flex flex-col relative font-sans text-slate-200 overflow-hidden bg-transparent">
            <div className="noise-overlay" />

            <Navbar
                isOpen={isNavOpen}
                onClose={() => setIsNavOpen(false)}
                setCurrentView={setCurrentView}
                onOpenCreatePostModal={() => setCreatePostModalOpen(true)}
            />

            {/* Floating Dynamic Island Header */}
            <header className="absolute top-1 md:top-4 left-1/2 -translate-x-1/2 z-20 w-[96%] max-w-4xl px-2">
                <div className="glass-panel rounded-full p-2 flex items-center justify-between shadow-2xl transition-all duration-300 backdrop-blur-3xl bg-opacity-80">
                    {/* Left: Menu & Back & Breadcrumbs */}
                    <div className="flex items-center flex-1 min-w-0 mr-2 h-10">
                        {/* Dedicated Back Button */}
                        {currentPath.length > 0 && (
                            <button
                                onClick={handleBack}
                                className="p-2.5 ml-1 rounded-full hover:bg-white/10 transition-colors flex-shrink-0 text-slate-300 hover:text-white relative z-10 animate-fade-in"
                                title="Slide Back"
                            >
                                <BackIcon className="w-5 h-5" />
                            </button>
                        )}

                        {/* Scrollable Breadcrumb Container with fade masks */}
                        <div className="flex-1 min-w-0 mx-2 h-full relative overflow-hidden flex items-center">
                            {renderBreadcrumb()}
                        </div>
                    </div>

                    {/* Right: Search & Help */}
                    <div className="flex items-center space-x-1 flex-shrink-0 pl-3 border-l border-white/10 pr-1 h-8">
                        <button
                            onClick={() => setIsSearchVisible(!isSearchVisible)}
                            className={`p-2 rounded-full transition-colors flex-shrink-0 ${isSearchVisible ? 'bg-white/10 text-white' : 'hover:bg-white/10 text-slate-300'}`}
                        >
                            <SearchIcon className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setGuideOpen(true)}
                            className="p-2 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-colors flex-shrink-0"
                            title="Guide"
                        >
                            <HelpIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Dropdown Search Bar */}
                <div
                    className={`absolute top-full mt-3 left-4 right-4 overflow-hidden transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${isSearchVisible ? 'max-h-24 opacity-100 translate-y-0' : 'max-h-0 opacity-0 -translate-y-4'}`}
                >
                    <div className="glass-panel rounded-[24px] p-1.5 flex items-center shadow-lg border border-white/10">
                        <button
                            onClick={handleSearchSubmit}
                            className="p-3 text-slate-400 hover:text-white transition-colors"
                            title="Global Search (Reset View)"
                        >
                            <SearchIcon className="w-5 h-5" />
                        </button>
                        <form onSubmit={handleSearchSubmit} className="flex-1">
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder="Jump to topic..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-transparent text-white placeholder-slate-500 focus:outline-none text-base py-3 font-medium px-1"
                            />
                        </form>
                        <div className="w-px h-6 bg-white/10 mx-2"></div>
                        <button
                            onClick={handleContextSearchSubmit}
                            className="p-3 text-[var(--primary-accent)] hover:text-white transition-colors flex items-center space-x-2"
                            title="Context Aware Search (Add to View)"
                        >
                            <span className="text-xs font-bold uppercase tracking-wider hidden md:block">Add Context</span>
                            <PlusCircleIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>


            </header>

            <main className="flex-1 flex items-center justify-center relative overflow-hidden">
                {renderContent()}
            </main>


            {/* Persistent Interaction Hint - Non-intrusive */}
            <div className="pointer-events-none absolute bottom-24 left-0 right-0 text-center z-0 opacity-40 text-[10px] md:text-xs font-mono tracking-widest uppercase text-slate-500 select-none animate-fade-in delay-1000">
                <span className="hidden md:inline">Hover to Highlight • Click to Navigate</span>
                <span className="md:hidden">Tap to Navigate • Hold to Explore</span>
            </div>

            {/* Guide Overlay - Moved to root to avoid clipping */}
            {isGuideOpen && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setGuideOpen(false)}>
                    <div className="glass-panel w-full max-w-sm p-6 rounded-3xl shadow-2xl border border-white/10 relative" onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setGuideOpen(false)}
                            className="absolute top-4 right-4 p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white"
                        >
                            <CloseIcon className="w-5 h-5" />
                        </button>

                        <div className="flex items-center space-x-3 mb-6">
                            <div className="p-3 bg-[var(--primary-accent)]/20 rounded-full text-[var(--primary-accent)]">
                                <HelpIcon className="w-6 h-6" />
                            </div>
                            <h2 className="text-xl font-bold text-white">Navigation</h2>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-start space-x-3">
                                <div className="p-2 bg-white/5 rounded-lg mt-0.5">
                                    <GlobeIcon className="w-5 h-5 text-[var(--primary-accent)]" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-slate-200">Explore</h3>
                                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                                        <span className="md:hidden">Tap</span><span className="hidden md:inline">Click</span> bubbles to dive deeper relative to the center topic.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start space-x-3">
                                <div className="p-2 bg-white/5 rounded-lg mt-0.5">
                                    <GridIcon className="w-5 h-5 text-indigo-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-slate-200">Pan & Zoom</h3>
                                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                                        <span className="md:hidden">Drag to move. Pinch to zoom.</span>
                                        <span className="hidden md:inline">Drag to move. Scroll to zoom.</span>
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start space-x-3">
                                <div className="p-2 bg-white/5 rounded-lg mt-0.5">
                                    <InfoIcon className="w-5 h-5 text-white" />
                                    {/* Mobile Hold Hint */}
                                    <span className="md:hidden ml-2 text-[10px] text-slate-500 bg-white/10 px-1.5 py-0.5 rounded uppercase tracking-wider">Hold</span>
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-slate-200">Inspect</h3>
                                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                                        Use the <InfoIcon className="w-3 h-3 inline mx-0.5" /> icon <span className="md:hidden">or Hold</span> to view details without moving.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => setGuideOpen(false)}
                            className="w-full mt-6 py-3 bg-[var(--primary-accent)] rounded-xl text-black font-bold text-sm uppercase tracking-wider hover:bg-[#ffe140] transition-colors shadow-lg shadow-[var(--primary-accent)]/20"
                        >
                            Got it
                        </button>
                    </div>
                </div>
            )}

            {/* Mobile Refresh Button - Bottom Center */}
            {/* New: Create Post (Mobile Sphere Post Option) - Bottom Left */}
            <button
                onClick={() => setCreatePostModalOpen(true)}
                className="md:hidden absolute bottom-[80px] left-4 z-10 p-4 glass-dock rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-all active:scale-95 shadow-xl border border-white/10 group backdrop-blur-md bg-black/40"
                title="Post to Sphere"
            >
                <EditIcon className="w-6 h-6" />
            </button>

            <button
                onClick={handleRefreshClick}
                disabled={isMoreLoading || isLoading}
                className="md:hidden absolute bottom-[80px] left-1/2 -translate-x-1/2 z-10 p-4 glass-dock rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-all active:scale-95 shadow-xl border border-white/10 group backdrop-blur-md bg-black/40 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Load More Topics"
            >
                {(isMoreLoading || isLoading) ? (
                    <ButtonLoadingSpinner className="w-6 h-6" />
                ) : (
                    <RefreshSimpleIcon className="w-6 h-6 group-active:rotate-180 transition-transform duration-500" />
                )}
            </button>

            {/* Floating Zoom Controls - Visible on Mobile now but smaller */}
            <div className="flex absolute bottom-[80px] right-4 md:bottom-32 md:right-6 flex-col space-y-3 z-10 scale-90 md:scale-100 origin-bottom-right">
                {/* Pinch Toggle (Mobile Only) */}
                <button
                    onClick={() => setPinchEnabled(!isPinchEnabled)}
                    className={`md:hidden p-3 glass-dock rounded-full transition-all active:scale-95 shadow-xl border group backdrop-blur-md ${isPinchEnabled ? 'bg-[var(--primary-accent)]/80 border-[var(--primary-accent)] !text-white' : 'bg-black/40 border-white/10 text-slate-400'}`}
                    title={isPinchEnabled ? "Disable Pinch Zoom" : "Enable Pinch Zoom"}
                >
                    <div className="w-5 h-5 flex items-center justify-center font-bold text-xs">
                        {isPinchEnabled ? '✋' : '🔒'}
                    </div>
                </button>

                <button onClick={handleZoomIn} className="p-3 glass-dock rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-all active:scale-95 shadow-xl border border-white/10 group backdrop-blur-md bg-black/40">
                    <ZoomInIcon className="w-5 h-5 group-active:scale-110 transition-transform" />
                </button>
                <button onClick={handleZoomOut} className="p-3 glass-dock rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-all active:scale-95 shadow-xl border border-white/10 group backdrop-blur-md bg-black/40">
                    <ZoomOutIcon className="w-5 h-5 group-active:scale-90 transition-transform" />
                </button>
            </div>

            {/* Floating Glass Dock */}
            <footer className="hidden md:block absolute bottom-8 left-1/2 -translate-x-1/2 z-20">
                <div className="glass-dock rounded-[32px] p-2.5 flex items-center space-x-3 shadow-2xl transition-transform hover:scale-105 duration-300 border border-white/10 bg-opacity-80">
                    <button
                        onClick={handleGoHome}
                        className="p-4 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-all active:scale-90"
                        title="Home"
                    >
                        <HomeIcon className="w-6 h-6" />
                    </button>

                    <div className="w-px h-6 bg-white/10"></div>

                    <button
                        onClick={handleRefreshClick}
                        disabled={isMoreLoading || isLoading}
                        className="p-4 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-all active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Load More Topics"
                    >
                        {(isMoreLoading || isLoading) ? (
                            <ButtonLoadingSpinner className="w-6 h-6" />
                        ) : (
                            <RefreshSimpleIcon className="w-6 h-6" />
                        )}
                    </button>

                    <div className="w-px h-6 bg-white/10"></div>

                    <button
                        onClick={() => setCurrentView({ type: ViewType.Profile, initialTab: 'posts' })}
                        className="p-4 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-all active:scale-90"
                        title="My Profile"
                    >
                        <ProfileIcon className="w-6 h-6" />
                    </button>
                </div>
            </footer>

            <ImagePreviewModal
                domain={modalDomain}
                domainPath={modalDomainPath}
                onClose={() => {
                    setModalDomain(null);
                    setModalDomainPath(null);
                }}
                onSeePosts={(domain) => setCurrentView({ type: ViewType.Post, domainId: domain.id, domainName: domain.name })}
            />
            <CreatePostModal
                isOpen={isCreatePostModalOpen}
                onClose={() => setCreatePostModalOpen(false)}
                domainTree={domainTree}
                setCurrentView={setCurrentView}
                initialDomain={currentNode}
            />
            <style>{`
        .mask-sides-fade {
            mask-image: linear-gradient(to right, transparent 0%, black 20px, black calc(100% - 20px), transparent 100%);
            -webkit-mask-image: linear-gradient(to right, transparent 0%, black 20px, black calc(100% - 20px), transparent 100%);
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes fade-in {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
            animation: fade-in 0.3s ease-out forwards;
        }
`}</style>
        </div>
    );
};

export default ExploreView;
