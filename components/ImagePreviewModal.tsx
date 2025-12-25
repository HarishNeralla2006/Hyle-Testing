import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Domain } from '../types';
import { CloseIcon, BookmarkIcon, RefreshIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';
import { generateDomainDescription } from '../services/pollinationsService';
import { useAuth } from '../contexts/AuthContext';
import { useStatus } from '../contexts/StatusContext';
import { execute } from '../lib/tidbClient';

interface ImagePreviewModalProps {
  domain: Domain | null;
  domainPath: string[] | null;
  onClose: () => void;
  onSeePosts: (domain: Domain) => void;
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ domain, domainPath, onClose, onSeePosts }) => {
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { error, setError } = useStatus();
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [savedDocId, setSavedDocId] = useState<string | null>(null);
  const [userImages, setUserImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const slideInterval = useRef<NodeJS.Timeout | null>(null);
  const [isCheckingImages, setIsCheckingImages] = useState(true);

  const fetchDescription = useCallback(async () => {
    if (!domain) return;
    setIsLoading(true);
    setError(null);
    setDescription('');
    setImageLoaded(false);
    try {
      const desc = await generateDomainDescription(domain.name, domainPath || []);
      setDescription(desc);
    } catch (err: any) {
      console.error("Failed to generate description:", err.message);
      setError('Could not load description. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [domain, domainPath, setError]);

  useEffect(() => {
    if (domain) {
      fetchDescription();

      // Fetch user images for this domain
      const fetchUserImages = async () => {
        setIsCheckingImages(true);
        try {
          const res = await execute(
            `SELECT imageURL FROM posts WHERE domain_id = ? AND imageURL IS NOT NULL AND imageURL != '' ORDER BY created_at DESC LIMIT 10`,
            [domain.id]
          );
          const images = res.map((r: any) => r.imageURL);
          if (images.length > 0) {
            setUserImages(images);
            setCurrentImageIndex(0);
          } else {
            setUserImages([]);
          }
        } catch (e) {
          console.error("Failed to fetch domain images", e);
        } finally {
          setIsCheckingImages(false);
        }
      };
      fetchUserImages();

      if (user) {
        const checkSavedStatus = async () => {
          try {
            const result = await execute(
              'SELECT id FROM saved_domains WHERE user_id = ? AND domain_id = ?',
              [user.uid, domain.id]
            );

            if (result.length > 0) {
              setIsSaved(true);
              setSavedDocId(result[0].id);
            } else {
              setIsSaved(false);
              setSavedDocId(null);
            }
          } catch (error) {
            console.error("Error checking saved status", error);
          }
        };
        checkSavedStatus();
      } else {
        setIsSaved(false);
        setSavedDocId(null);
      }
    }
  }, [domain, user, fetchDescription]);

  // Auto-slide effect
  useEffect(() => {
    if (userImages.length > 1) {
      slideInterval.current = setInterval(() => {
        setCurrentImageIndex(prev => (prev + 1) % userImages.length);
      }, 3000); // 3 seconds
    }
    return () => {
      if (slideInterval.current) clearInterval(slideInterval.current);
    };
  }, [userImages]);

  const nextImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (slideInterval.current) clearInterval(slideInterval.current); // Pause auto-slide on interaction
    setCurrentImageIndex(prev => (prev + 1) % userImages.length);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (slideInterval.current) clearInterval(slideInterval.current);
    setCurrentImageIndex(prev => (prev - 1 + userImages.length) % userImages.length);
  };

  if (!domain) return null;

  const handleToggleSave = async () => {
    if (!user || !domain) return;
    setIsSaving(true);

    try {
      if (isSaved && savedDocId) {
        await execute('DELETE FROM saved_domains WHERE id = ?', [savedDocId]);
        setIsSaved(false);
        setSavedDocId(null);
      } else {
        const newId = crypto.randomUUID();
        await execute(
          'INSERT INTO saved_domains (id, user_id, domain_id, domain_name, saved_at) VALUES (?, ?, ?, ?, ?)',
          [newId, user.uid, domain.id, domain.name, new Date().toISOString()]
        );
        setIsSaved(true);
        setSavedDocId(newId);
      }
    } catch (e: any) {
      console.error("Failed to save domain:", e);
      setError("Failed to update saved status. Check your connection.");
    } finally {
      setIsSaving(false);
    }
  };

  const searchQuery = `${domain.name} aesthetic cinematic`;
  const imageUrl = `https://tse2.mm.bing.net/th?q=${encodeURIComponent(searchQuery)}&w=800&h=450&c=7&rs=1&p=0&dpr=2&pid=1.7&mkt=en-US&adlt=moderate`;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 transition-opacity"
      onClick={onClose}
      style={{ animation: 'fadeIn 0.4s ease-out' }}
    >
      <div
        className="glass-panel rounded-[40px] shadow-2xl w-full max-w-md m-4 p-8 text-[var(--text-color)] relative border border-[var(--glass-border)] animate-spring"
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--glass-surface)' }}
      >
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--text-color)] leading-tight pr-4">{domain.name}</h2>
          <button onClick={onClose} className="p-2 -mr-2 -mt-2 rounded-full text-slate-400 hover:bg-white/10 hover:text-[var(--text-color)] transition-colors">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="aspect-video bg-black/40 rounded-2xl flex items-center justify-center mb-6 border border-white/10 shadow-inner overflow-hidden relative group">
          {(isCheckingImages || !imageLoaded) && (
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <span className="text-5xl opacity-50 filter drop-shadow-lg animate-pulse">✨</span>
            </div>
          )}

          {!isCheckingImages && (
            <img
              src={userImages.length > 0 ? userImages[currentImageIndex] : imageUrl}
              alt={domain.name}
              className={`w-full h-full object-cover transition-opacity duration-700 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImageLoaded(true)}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                setImageLoaded(true);
              }}
            />
          )}

          {/* Navigation Buttons for User Images */}
          {userImages.length > 1 && (
            <>
              <button
                onClick={prevImage}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors backdrop-blur-md border border-white/10 z-10"
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
              <button
                onClick={nextImage}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors backdrop-blur-md border border-white/10 z-10"
              >
                <ChevronRightIcon className="w-5 h-5" />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex space-x-1.5 z-10">
                {userImages.map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${idx === currentImageIndex ? 'bg-white scale-125' : 'bg-white/40'}`}
                  />
                ))}
              </div>
            </>
          )}

          {/* Subtle overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 pointer-events-none"></div>
        </div>

        <div className="text-[var(--text-color)] text-[15px] mb-8 min-h-[5rem] max-h-48 overflow-y-auto transition-opacity duration-300 whitespace-pre-wrap leading-relaxed description-scrollbar pr-2 font-light">
          {isLoading && (
            <div className="flex items-center space-x-2 h-full justify-center opacity-60">
              <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '-0.3s' }}></div>
              <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '-0.15s' }}></div>
              <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
            </div>
          )}
          {error && !isLoading && (
            <div className="text-center text-red-300">
              <p>{error}</p>
              <button onClick={fetchDescription} className="mt-3 px-5 py-2 bg-white/5 hover:bg-white/10 rounded-full text-white text-xs transition-colors flex items-center justify-center mx-auto space-x-2 border border-white/5">
                <RefreshIcon className="w-3 h-3" />
                <span>Retry</span>
              </button>
            </div>
          )}
          {!isLoading && !error && description}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => onSeePosts(domain)} className="py-3.5 px-4 bg-[var(--primary-accent)] hover:bg-indigo-500 rounded-2xl text-white font-semibold transition-all shadow-lg shadow-indigo-500/20 active:scale-95">Enter Topic</button>
          <button
            onClick={handleToggleSave}
            disabled={!user || isSaving}
            className="py-3.5 px-4 glass-button rounded-2xl text-[var(--text-color)] font-semibold flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            <BookmarkIcon className={`w-5 h-5 mr-2 ${isSaved ? 'fill-[var(--primary-accent)] text-[var(--primary-accent)]' : ''}`} />
            {isSaved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .description-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .description-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .description-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        .description-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
};

export default ImagePreviewModal;
