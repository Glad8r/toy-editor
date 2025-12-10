import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useCanvas } from '../../contexts/TimelineContext';
import { NodeType, MediaNode } from '../../types/timeline';
import { Play, Pause, SkipForward, SkipBack, Minimize2, Camera, Upload } from 'lucide-react';
import { Button } from '../ui/button';
import mediaService from '../../services/mediaService';
import { VirtualTimelineManager, VideoPlayerInstruction, TimelineState } from './VirtualTimelineManager';
import { VideoFrameExtractOperation } from '../../operations/VideoFrameExtractOperation';
import { toast } from 'sonner';

interface VideoPreviewAreaProps {
    virtualTimeline?: VirtualTimelineManager;
    onToggleVideoPreview?: () => void;
}

const VideoPreviewArea: React.FC<VideoPreviewAreaProps> = ({ virtualTimeline, onToggleVideoPreview }) => {
    const { nodes, stateManager, addMediaFromFile } = useCanvas();

    // Simplified state - only what's needed for display
    const [currentInstruction, setCurrentInstruction] = useState<VideoPlayerInstruction | null>(null);
    const [mediaUrl, setMediaUrl] = useState<string>('');
    const [isPlaying, setIsPlaying] = useState(false);
    const [globalTime, setGlobalTime] = useState(0);
    const [isVideoLoading, setIsVideoLoading] = useState(false);
    const [isExtractingFrame, setIsExtractingFrame] = useState(false);

    // Single video ref - no complex state management
    const videoRef = useRef<HTMLVideoElement>(null);
    const lastClipIdRef = useRef<string>('');
    const currentInstructionRef = useRef<VideoPlayerInstruction | null>(null);
    
    // Keep ref in sync with state for timeupdate handler
    useEffect(() => {
        currentInstructionRef.current = currentInstruction;
    }, [currentInstruction]);

    // Get the scene editor data
    const sceneEditor = stateManager.getSceneEditor();

    // Single VTM subscription - drives all behavior (NEW ARCHITECTURE)
    useEffect(() => {
        if (!virtualTimeline) return;

        // Subscribe to VTM state changes
        const unsubscribeInstruction = virtualTimeline.onVideoPlayerInstruction((instruction) => {
            setCurrentInstruction(instruction);
        });

        const unsubscribeTime = virtualTimeline.onCurrentTimeChange((time) => {
            setGlobalTime(time);
        });

        const unsubscribeState = virtualTimeline.onTimelineChange((state) => {
            setIsPlaying(state.isPlaying);
        });

        // Get initial state
        const initialState = virtualTimeline.getTimelineState();
        setGlobalTime(initialState.currentTime);
        setIsPlaying(initialState.isPlaying);
        setCurrentInstruction({
            clip: initialState.currentClip?.clip || null,
            seekTime: initialState.currentClip?.clipTime || 0
        });

        return () => {
            unsubscribeInstruction();
            unsubscribeTime();
            unsubscribeState();
        };
    }, [virtualTimeline]);

    // Load media URL when instruction changes
    // FIX: Use useMemo to get the node to avoid including nodes in dependencies
    const currentMediaNodeForUrl = useMemo(() => {
        if (!currentInstruction?.clip?.mediaNodeId) return null;
        const node = nodes.find(node => node.id === currentInstruction.clip.mediaNodeId);
        return (node && (node.type === NodeType.IMAGE || node.type === NodeType.VIDEO)) 
            ? node as MediaNode 
            : null;
    }, [currentInstruction?.clip?.mediaNodeId, nodes]);

    useEffect(() => {
        let isCancelled = false;
        
        const loadMediaUrl = async () => {
            if (!currentInstruction?.clip || !currentMediaNodeForUrl) {
                setMediaUrl('');
                return;
            }

            if (currentMediaNodeForUrl.data.url) {
                try {
                    const url = await mediaService.getMediaUrl(currentMediaNodeForUrl.data.url);
                    if (!isCancelled) {
                        setMediaUrl(url);
                    }
                } catch (error) {
                    console.error('🎬 Error loading media URL:', error);
                    if (!isCancelled) {
                        setMediaUrl('');
                    }
                }
            } else {
                if (!isCancelled) {
                    setMediaUrl('');
                }
            }
        };

        loadMediaUrl();

        // FIX: Don't revoke blob URLs in cleanup - they're stored in node data and should persist
        // Blob URLs should only be revoked when nodes are deleted, not on component re-render
        return () => {
            isCancelled = true;
        };
    }, [currentInstruction?.clip?.id, currentMediaNodeForUrl?.data.url]); // Only depend on clip ID and media node URL

    // Get the current media node
    const getCurrentMediaNode = () => {
        if (!currentInstruction?.clip) return null;

        const node = nodes.find(node => node.id === currentInstruction.clip.mediaNodeId);
        if (node && (node.type === NodeType.IMAGE || node.type === NodeType.VIDEO)) {
            return node as MediaNode;
        }

        return null;
    };

    /**
     * OPTION C: Hybrid approach - Reactive video seeking
     * - During playback: Let video play naturally, sync master clock to video
     * - During pause: Use master clock, seek video to match
     * - On clip change: Always seek to new position
     */
    useEffect(() => {
        if (!currentInstruction?.clip || !videoRef.current) return;

        const currentMediaNode = getCurrentMediaNode();
        if (currentMediaNode?.type !== NodeType.VIDEO || !mediaUrl) return;

        const video = videoRef.current;
        const clipId = currentInstruction.clip.id;
        const seekTime = currentInstruction.seekTime + (currentInstruction.clip.trimStart || 0);

        // Handle clip changes - always seek on clip change
        if (lastClipIdRef.current !== clipId) {
            console.log('🎬 Clip change detected:', { from: lastClipIdRef.current, to: clipId, isPlaying });
            
            // Pause current video before changing source
            if (!video.paused) {
                video.pause();
            }
            
            video.src = mediaUrl;
            lastClipIdRef.current = clipId;
            setIsVideoLoading(true);

            const handleCanPlay = () => {
                console.log('🎬 Video canplay, seeking to:', seekTime);
                // Video is ready to play at the seeked position
                video.currentTime = seekTime;
                setIsVideoLoading(false);

                // If we should be playing, ensure video starts
                // Don't wait - play immediately after seek
                if (isPlaying) {
                    video.play().catch(err => {
                        if (err.name !== 'AbortError') {
                            console.warn('Failed to play video after clip change:', err);
                        }
                    });
                }
            };

            const handleCanPlayThrough = () => {
                // Video is fully loaded and ready to play
                console.log('🎬 Video canplaythrough');
                setIsVideoLoading(false);
                // If playing and paused, start playback
                if (isPlaying && video.paused) {
                    video.play().catch(err => {
                        if (err.name !== 'AbortError') {
                            console.warn('Failed to play video after canplaythrough:', err);
                        }
                    });
                }
            };

            const handleError = () => {
                console.error('Failed to load video:', mediaUrl);
                setIsVideoLoading(false);
            };

            // Use both 'canplay' and 'canplaythrough' for better reliability
            video.addEventListener('canplay', handleCanPlay, { once: true });
            video.addEventListener('canplaythrough', handleCanPlayThrough, { once: true });
            video.addEventListener('error', handleError, { once: true });

            return () => {
                video.removeEventListener('canplay', handleCanPlay);
                video.removeEventListener('canplaythrough', handleCanPlayThrough);
                video.removeEventListener('error', handleError);
            };
        } else {
            // Same clip - only seek when paused (not during playback)
            // During playback, video plays naturally and we sync master clock to it
            if (!isPlaying && video.readyState >= 2) {
                // When paused, seek video to match master clock time
                const timeDifference = Math.abs(video.currentTime - seekTime);
                if (timeDifference > 0.05) { // Only seek if difference > 50ms
                    video.currentTime = seekTime;
                }
            }
            // When playing, we don't seek - video plays naturally and timeupdate listener syncs master clock
        }
    }, [currentInstruction?.clip?.id, currentInstruction?.seekTime, mediaUrl, isPlaying]);

    // Play/pause control - separate from timeupdate listener
    useEffect(() => {
        const currentMediaNode = getCurrentMediaNode();

        if (!videoRef.current || currentMediaNode?.type !== NodeType.VIDEO) return;
        if (!currentInstruction?.clip || !virtualTimeline) return;

        const video = videoRef.current;

        // Play/pause control - be more aggressive about playing
        if (isPlaying) {
            // Wait for video to be ready, but don't wait too long
            const attemptPlay = async () => {
                if (video.readyState >= 1) { // HAVE_METADATA is enough to start
                    try {
                        await video.play();
                        console.log('✅ Video playing successfully, paused:', video.paused);
                        
                        // Verify video actually started playing
                        // Sometimes play() succeeds but video doesn't actually start
                        if (video.paused) {
                            console.warn('⚠️ Video play() succeeded but video is still paused, retrying...');
                            setTimeout(() => {
                                video.play().catch(e => {
                                    console.error('❌ Retry play failed:', e);
                                });
                            }, 100);
                        }
                    } catch (err: any) {
                        if (err.name !== 'AbortError') {
                            console.error('❌ Failed to play video:', err);
                            // Try again after a short delay
                            setTimeout(() => {
                                video.play().catch(e => {
                                    console.error('❌ Retry play also failed:', e);
                                });
                            }, 100);
                        }
                    }
                } else {
                    console.warn('⚠️ Video not ready, readyState:', video.readyState);
                }
            };

            // Try immediately if ready
            if (video.readyState >= 1) {
                attemptPlay();
            } else {
                // Wait for metadata at least
                const handleLoadedMetadata = () => {
                    attemptPlay();
                };
                video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
                
                return () => {
                    video.removeEventListener('loadedmetadata', handleLoadedMetadata);
                };
            }
        } else {
            // Pause video when not playing
            if (!video.paused) {
                video.pause();
            }
        }
    }, [isPlaying, currentInstruction?.clip?.id]);

    // Timeupdate listener - always active when video is ready, regardless of isPlaying
    // This ensures we can sync master clock even during brief pauses
    useEffect(() => {
        const currentMediaNode = getCurrentMediaNode();

        if (!videoRef.current || currentMediaNode?.type !== NodeType.VIDEO) return;
        if (!currentInstruction?.clip || !virtualTimeline) return;

        const video = videoRef.current;

        // Only add timeupdate listener when video is ready and we're on the correct clip
        if (video.readyState >= 1) {
            const handleTimeUpdate = () => {
                // Only sync if video is actually playing (not just isPlaying state)
                // This ensures we sync even if there's a mismatch between state and reality
                if (!isPlaying || video.paused) return;

                // Use ref to get latest instruction (avoids stale closure)
                const instruction = currentInstructionRef.current;
                if (!instruction?.clip || !virtualTimeline) return;

                // Get current clip position from VTM
                const currentClip = virtualTimeline.getCurrentClip();
                if (!currentClip) return;

                // If clip has changed, don't sync - let the clip change handler take over
                if (currentClip.clip.id !== instruction.clip.id) {
                    return;
                }

                // Calculate clip-local time from video's currentTime
                // video.currentTime is the time in the video file (includes trimStart offset)
                // clipLocalTime is the time within the effective clip (after trimming)
                const trimStart = instruction.clip.trimStart || 0;
                const trimEnd = instruction.clip.trimEnd || 0;
                const clipDuration = instruction.clip.duration || 0;
                const effectiveDuration = Math.max(0.1, clipDuration - trimStart - trimEnd);
                
                const videoFileTime = video.currentTime;
                const clipLocalTime = videoFileTime - trimStart;

                // Check if video has reached the end of the effective clip duration
                // If so, let VTM handle the transition to next clip
                if (clipLocalTime >= effectiveDuration) {
                    // Video has reached end of clip - move to next clip
                    virtualTimeline.setCurrentTime(currentClip.clipEndTime);
                    return;
                }

                // Sync master clock to video's time (only if within clip bounds)
                if (clipLocalTime >= 0 && clipLocalTime < effectiveDuration) {
                    virtualTimeline.syncTimeFromVideo(
                        currentClip.clipIndex,
                        clipLocalTime
                    );
                }
            };

            // Throttle timeupdate to avoid too frequent updates (every ~100ms)
            let lastUpdateTime = 0;
            const throttledTimeUpdate = () => {
                const now = performance.now();
                if (now - lastUpdateTime > 100) { // Update max 10 times per second
                    lastUpdateTime = now;
                    handleTimeUpdate();
                }
            };

            video.addEventListener('timeupdate', throttledTimeUpdate);

            return () => {
                video.removeEventListener('timeupdate', throttledTimeUpdate);
            };
        }
    }, [isPlaying, currentInstruction?.clip?.id, virtualTimeline]);

    // Control handlers - only update VTM, no direct timing logic
    const togglePlayback = () => {
        if (virtualTimeline) {
            virtualTimeline.setPlaying(!isPlaying);
        }
    };

    const skipNext = () => {
        if (!virtualTimeline) return;

        const currentClip = virtualTimeline.getCurrentClip();
        if (currentClip) {
            const nextTime = currentClip.clipEndTime;
            virtualTimeline.setCurrentTime(nextTime);
        }
    };

    const skipPrevious = () => {
        if (!virtualTimeline) return;

        const currentClip = virtualTimeline.getCurrentClip();
        if (currentClip) {
            if (currentClip.clipTime > 2) {
                virtualTimeline.setCurrentTime(currentClip.clipStartTime);
            } else {
                const prevTime = Math.max(0, currentClip.clipStartTime - 0.1);
                virtualTimeline.setCurrentTime(prevTime);
            }
        }
    };

    // Handle Extract Frame from timeline
    const handleExtractCurrentFrame = async () => {
        if (!videoRef.current || !currentInstruction?.clip || !stateManager) return;

        // Only works for videos
        const currentMediaNode = getCurrentMediaNode();
        if (currentMediaNode?.type !== NodeType.VIDEO) {
            toast.error('Frame extraction only works with video clips');
            return;
        }

        // Prevent multiple simultaneous extractions
        if (isExtractingFrame) return;

        try {
            setIsExtractingFrame(true);

            const timestamp = videoRef.current.currentTime;
            const videoNodeId = currentInstruction.clip.mediaNodeId;

            // Format time for display
            const formatTime = (time: number) => {
                const minutes = Math.floor(time / 60);
                const seconds = Math.floor(time % 60);
                return `${minutes}:${seconds.toString().padStart(2, '0')}`;
            };

            toast.info(`Extracting frame at ${formatTime(timestamp)} as image node on canvas...`);

            // Get video node for positioning
            const videoNode = nodes.find(n => n.id === videoNodeId);
            if (!videoNode) {
                toast.error('Video node not found');
                setIsExtractingFrame(false);
                return;
            }

            // Position new node to the right of video (like grid split)
            const gap = 50;
            const videoNodeWidth = 400;

            // Check if there are existing children to stack vertically
            const videoMediaNode = videoNode as MediaNode;
            const childrenCount = videoMediaNode.data?.childrenIds?.length || 0;
            const verticalOffset = childrenCount * 300; // Approximate height + gap

            const position = {
                x: videoNode.position.x + videoNodeWidth + gap,
                y: videoNode.position.y + verticalOffset
            };

            // Create and execute operation
            const operation = new VideoFrameExtractOperation(
                videoNodeId,
                timestamp,
                position
            );

            await stateManager.getOperationManager().executeWithContext(
                operation,
                stateManager
            );

            toast.success(`Frame extracted at ${formatTime(timestamp)} - Check canvas for new image node!`);
            setIsExtractingFrame(false);

            // Timeline stays open for continued editing

        } catch (error) {
            console.error('Frame extraction failed:', error);
            toast.error('Failed to extract frame');
            setIsExtractingFrame(false);
        }
    };

    const currentMediaNode = getCurrentMediaNode();

    // File input ref for upload
    const fileInputRef = useRef<HTMLInputElement>(null);

    /**
     * Handle file upload - adds media to library but NOT to timeline
     * Media will appear in SceneEditorInspector as thumbnails that can be dragged to timeline
     */
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        // Upload files and add to media library (nodes)
        // Note: We do NOT automatically add to timeline - user must drag from inspector to add
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            await addMediaFromFile(file);
        }

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Show empty state if no VTM or no clips
    if (!virtualTimeline || !sceneEditor?.cells.length) {
        return (
            <div className="video-preview-area">
                <div className="text-center text-filmforge-text-light">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*,image/*"
                        multiple
                        onChange={handleFileUpload}
                        className="hidden"
                        id="video-preview-upload"
                    />
                    <Upload className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg mb-4">Add media to timeline to start editing</p>
                    <label
                        htmlFor="video-preview-upload"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-black hover:bg-gray-800 text-white cursor-pointer transition-colors rounded-md font-medium"
                    >
                        <Upload className="w-5 h-5" />
                        Upload Videos & Images
                    </label>
                    <p className="text-sm mt-4 opacity-60">Supports MP4, MOV, JPG, PNG</p>
                </div>
            </div>
        );
    }

    const totalDuration = virtualTimeline.getTotalDuration();
    const currentClip = virtualTimeline.getCurrentClip();

    return (
        <div className="video-preview-area relative">
            {/* Top-right controls */}
            <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                {/* Extract Frame button - only show for video clips */}
                {currentMediaNode?.type === NodeType.VIDEO && (
                    <button
                        onClick={handleExtractCurrentFrame}
                        disabled={isExtractingFrame}
                        className="bg-transparent hover:bg-white/10 text-white flex items-center gap-2 px-3 py-2 rounded-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Camera className="w-4 h-4 text-white" />
                        <span className="text-white text-sm">
                            {isExtractingFrame ? 'Extracting...' : 'Extract Frame'}
                        </span>
                    </button>
                )}
            </div>

            <div className="relative w-full h-full flex items-center justify-center">
                {mediaUrl && currentInstruction?.clip ? (
                    currentMediaNode?.type === NodeType.VIDEO ? (
                        <video
                            ref={videoRef}
                            src={mediaUrl}
                            className="max-w-full max-h-full object-contain scene-editor-video-preview"
                            muted
                            preload="auto"
                            playsInline
                        />
                    ) : (
                        <img
                            src={mediaUrl}
                            alt="Preview"
                            className="max-w-full max-h-full object-contain scene-editor-video-preview"
                        />
                    )
                ) : isVideoLoading ? (
                    <div className="text-center text-white">
                        <div className="flex items-center justify-center mb-2">
                            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        </div>
                        <p className="text-sm">Loading...</p>
                    </div>
                ) : (
                    <div className="text-center text-white">
                        <p className="text-sm">Loading media...</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VideoPreviewArea;