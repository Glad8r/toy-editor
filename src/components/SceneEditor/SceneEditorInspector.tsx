import React, { useState, useRef, useEffect } from 'react';
import { useCanvas } from '../../contexts/TimelineContext';
import { Upload, Film, Image as ImageIcon } from 'lucide-react';
import { NodeType, MediaNode } from '../../types/timeline';
import mediaService from '../../services/mediaService';

/**
 * SceneEditorInspector - Media Library Panel
 * 
 * Displays uploaded media as thumbnails that can be dragged and dropped onto the timeline.
 * When media is uploaded, it's added to the media library (nodes) but NOT automatically
 * added to the timeline. Users must drag thumbnails to the timeline to add them.
 */

const SceneEditorInspector: React.FC = () => {
    const [activeTab, setActiveTab] = useState('Media');
    const { addMediaFromFile, nodes } = useCanvas();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [thumbnailUrls, setThumbnailUrls] = useState<Map<string, string>>(new Map());
    const loadedNodeIdsRef = useRef<Set<string>>(new Set()); // Track which nodes have been loaded

    /**
     * Handle file upload - adds media to library but NOT to timeline
     * Users must drag thumbnails to timeline to add them
     */
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        // Upload files and add to media library (nodes)
        // Note: We do NOT automatically add to timeline - user must drag to add
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            await addMediaFromFile(file);
        }

        // Reset input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    /**
     * Load thumbnail URLs for all media nodes
     * This creates blob URLs for display in the inspector
     * 
     * PERFORMANCE FIX: Only load thumbnails for nodes that don't already have them loaded
     * Uses a ref to track loaded nodes to prevent re-loading and infinite loops
     */
    useEffect(() => {
        let isCancelled = false;
        
        const loadThumbnails = async () => {
            // Only process nodes that don't already have thumbnails loaded
            const nodesToLoad = nodes.filter(node => {
                if (node.type !== NodeType.IMAGE && node.type !== NodeType.VIDEO) return false;
                const mediaNode = node as MediaNode;
                return mediaNode.data.url && !loadedNodeIdsRef.current.has(node.id);
            });

            if (nodesToLoad.length === 0) return;

            console.log(`📸 Loading ${nodesToLoad.length} thumbnails...`);
            const startTime = performance.now();
            
            // Load thumbnails asynchronously with small delays to prevent blocking
            for (const node of nodesToLoad) {
                if (isCancelled) break;
                
                const mediaNode = node as MediaNode;
                if (mediaNode.data.url) {
                    try {
                        const url = await mediaService.getMediaUrl(mediaNode.data.url);
                        if (!isCancelled) {
                            // Mark as loaded
                            loadedNodeIdsRef.current.add(node.id);
                            
                            // Update state with new thumbnail incrementally
                            setThumbnailUrls(prev => {
                                const updated = new Map(prev);
                                updated.set(node.id, url);
                                return updated;
                            });
                        }
                    } catch (error) {
                        console.error('Error loading thumbnail for node:', node.id, error);
                    }
                }
                
                // Small delay to prevent blocking the main thread
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            
            if (!isCancelled) {
                const endTime = performance.now();
                console.log(`✅ Loaded thumbnails in ${(endTime - startTime).toFixed(2)}ms`);
            }
        };

        loadThumbnails();

        // Cleanup: cancel loading if component unmounts or nodes change
        return () => {
            isCancelled = true;
        };
    }, [nodes]); // Only depend on nodes to avoid infinite loops

    /**
     * Handle drag start for media thumbnails
     * Sets up data transfer with media node ID so timeline can accept the drop
     */
    const handleDragStart = (e: React.DragEvent, mediaNodeId: string) => {
        // Set drag data in the format expected by timeline drop handlers
        // Timeline cells check for 'application/media-node' data transfer type
        e.dataTransfer.setData('application/media-node', JSON.stringify({ nodeId: mediaNodeId }));
        e.dataTransfer.effectAllowed = 'copy';
        
        // Optional: Set drag image for better visual feedback
        const target = e.currentTarget as HTMLElement;
        if (target) {
            e.dataTransfer.setDragImage(target, 0, 0);
        }
    };

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Header with Tabs */}
            <div className="p-4 border-b border-filmforge-border-light">
                <div className="flex gap-1">
                    <button
                        onClick={() => setActiveTab('Media')}
                        className={`px-3 py-2 text-sm rounded hover:bg-gray-100 transition-colors ${
                            activeTab === 'Media' ? 'bg-gray-100 text-filmforge-text' : 'text-filmforge-text-secondary'
                        }`}
                    >
                        Media
                    </button>
                    <button
                        onClick={() => setActiveTab('Audio')}
                        className={`px-3 py-2 text-sm rounded hover:bg-gray-100 transition-colors ${
                            activeTab === 'Audio' ? 'bg-gray-100 text-filmforge-text' : 'text-filmforge-text-secondary'
                        }`}
                    >
                        Audio
                    </button>
                    <button
                        onClick={() => setActiveTab('Text')}
                        className={`px-3 py-2 text-sm rounded hover:bg-gray-100 transition-colors ${
                            activeTab === 'Text' ? 'bg-gray-100 text-filmforge-text' : 'text-filmforge-text-secondary'
                        }`}
                    >
                        Text
                    </button>
                </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto">
                {activeTab === 'Media' ? (
                    <div className="space-y-4">
                        {/* Upload Section */}
                        <div className="space-y-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="video/*,image/*"
                                multiple
                                onChange={handleFileSelect}
                                className="hidden"
                                id="media-upload"
                            />
                            <label
                                htmlFor="media-upload"
                                className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-filmforge-text cursor-pointer transition-colors border border-filmforge-border-light rounded"
                            >
                                <Upload className="w-4 h-4" />
                                <span className="text-sm font-medium">Upload Media</span>
                            </label>
                            <p className="text-xs text-filmforge-text-muted text-center">
                                Supports MP4, MOV, JPG, PNG
                            </p>
                        </div>

                        {/* Media Thumbnails Grid */}
                        {/* Display all uploaded media nodes as draggable thumbnails */}
                        {nodes.length > 0 ? (
                            <div className="space-y-2">
                                <h3 className="text-xs font-semibold text-filmforge-text-secondary uppercase tracking-wide">
                                    Media Library
                                </h3>
                                <div className="grid grid-cols-2 gap-2">
                                    {nodes
                                        .filter(node => node.type === NodeType.IMAGE || node.type === NodeType.VIDEO)
                                        .map((node) => {
                                            const mediaNode = node as MediaNode;
                                            const thumbnailUrl = thumbnailUrls.get(node.id);
                                            
                                            return (
                                                <div
                                                    key={node.id}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, node.id)}
                                                    className="relative group cursor-grab active:cursor-grabbing bg-gray-100 rounded-md overflow-hidden border border-filmforge-border-light hover:border-filmforge-primary transition-colors"
                                                    style={{ aspectRatio: '16/9' }}
                                                    title={`Drag to timeline: ${node.label}`}
                                                >
                                                    {/* Thumbnail Image/Video */}
                                                    {thumbnailUrl ? (
                                                        mediaNode.type === NodeType.VIDEO ? (
                                                            <video
                                                                src={thumbnailUrl}
                                                                className="w-full h-full object-cover"
                                                                muted
                                                                loop
                                                                onMouseEnter={(e) => e.currentTarget.play()}
                                                                onMouseLeave={(e) => {
                                                                    e.currentTarget.pause();
                                                                    e.currentTarget.currentTime = 0;
                                                                }}
                                                            />
                                                        ) : (
                                                            <img
                                                                src={thumbnailUrl}
                                                                alt={node.label}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        )
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center bg-gray-200">
                                                            <span className="text-xs text-filmforge-text-secondary">Loading...</span>
                                                        </div>
                                                    )}
                                                    
                                                    {/* Video indicator icon */}
                                                    {mediaNode.type === NodeType.VIDEO && (
                                                        <div className="absolute top-1 left-1 bg-black/60 text-white p-1 rounded">
                                                            <Film className="w-3 h-3" />
                                                        </div>
                                                    )}
                                                    
                                                    {/* Image indicator icon */}
                                                    {mediaNode.type === NodeType.IMAGE && (
                                                        <div className="absolute top-1 left-1 bg-black/60 text-white p-1 rounded">
                                                            <ImageIcon className="w-3 h-3" />
                                                        </div>
                                                    )}
                                                    
                                                    {/* Label overlay on hover */}
                                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <p className="text-xs text-white truncate">{node.label}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center text-filmforge-text-secondary mt-8">
                                <p className="text-xs opacity-60">
                                    Upload media to see thumbnails here
                                </p>
                                <p className="text-xs opacity-40 mt-2">
                                    Drag thumbnails to timeline to add them
                                </p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center text-filmforge-text-secondary mt-8">
                        <p className="text-xs opacity-60">
                            {activeTab} tools will appear here
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SceneEditorInspector;
