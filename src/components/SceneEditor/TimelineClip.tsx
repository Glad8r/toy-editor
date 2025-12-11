import React, { useState, useEffect, useRef } from 'react';
import { useCanvas } from '../../contexts/TimelineContext';
import { SceneEditorCell, NodeType, MediaNode } from '../../types/timeline';
import { ZoomSystem } from './zoomSystem';
import { getClipDuration } from './timelineUtils';
// Premiere-style: Only extract first and last frame thumbnails
import { extractVideoFrame } from './videoFrameExtractor';
import mediaService from '../../services/mediaService';
import { X } from 'lucide-react';
import { RemoveSceneEditorCellOperation, MoveTimelineClipOperation, TrimSceneEditorCellOperation } from '../../operations/SceneEditorOperations';
import TrimHandles from './TrimHandles';
import { TimelineMode, useTimelineMode } from './TimelineModeContext';

interface TimelineClipProps {
    cell: SceneEditorCell;
    zoomSystem: ZoomSystem;
    onSelect?: (clipId: string) => void;
    isSelected?: boolean;
    onDragStart?: (cellId: string, dragStartTime: number, forcedMode?: 'rearrange') => void;
    onDragEnd?: () => void;
    onTrimStart?: (clipId: string, handle: 'left' | 'right') => void;
    onTrimUpdate?: (clipId: string, trimStart: number, trimEnd: number) => void;
    onTrimEnd?: () => void;
    timelineMode?: TimelineMode; // Add mode prop for conditional rendering
    spacedPosition?: { left: number; width: number } | null; // Position for rearrange mode
    isBeingDragged?: boolean; // New prop for drag visual feedback
    // Phase 2: Ripple preview support
    ripplePreview?: {
        isActive: boolean;
        newLeft: number;
        originalLeft: number;
    } | null;
    // Phase 2.5: Enhanced trim handler with playhead sync
    onTrimUpdateWithPlayhead?: (clipId: string, trimStart: number, trimEnd: number, handle: 'left' | 'right') => void;
}

const TimelineClip: React.FC<TimelineClipProps> = ({
    cell,
    zoomSystem,
    onSelect,
    isSelected = false,
    onDragStart,
    onDragEnd,
    onTrimStart,
    onTrimUpdate,
    onTrimEnd,
    timelineMode = 'trim', // Default to trim mode
    spacedPosition,
    isBeingDragged = false,
    ripplePreview,
    onTrimUpdateWithPlayhead
}) => {
    const { nodes, stateManager } = useCanvas();
    const { enterRearrangeMode, exitRearrangeMode } = useTimelineMode();
    
    // Premiere-style: Only first and last frame thumbnails
    const [firstFrameUrl, setFirstFrameUrl] = useState<string | null>(null);
    const [lastFrameUrl, setLastFrameUrl] = useState<string | null>(null);
    const [thumbnailsLoading, setThumbnailsLoading] = useState(true);
    
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [showTrimHandles, setShowTrimHandles] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    // Trim state
    const [currentTrimStart, setCurrentTrimStart] = useState(cell.trimStart || 0);
    const [currentTrimEnd, setCurrentTrimEnd] = useState(cell.trimEnd || 0);
    const [isTrimming, setIsTrimming] = useState(false);

    // Store the latest trim values during drag (for immediate dispatch)
    const latestTrimValues = useRef({ trimStart: cell.trimStart || 0, trimEnd: cell.trimEnd || 0 });

    // Phase 2: Real-time visual feedback state
    const [previewTrimStart, setPreviewTrimStart] = useState(cell.trimStart || 0);
    const [previewTrimEnd, setPreviewTrimEnd] = useState(cell.trimEnd || 0);
    const [isPreviewing, setIsPreviewing] = useState(false);

    // Update trim state when cell changes
    useEffect(() => {
        setCurrentTrimStart(cell.trimStart || 0);
        setCurrentTrimEnd(cell.trimEnd || 0);
    }, [cell.trimStart, cell.trimEnd]);

    // Reset drag state when exiting rearrange mode or changing timeline mode
    useEffect(() => {
        if (timelineMode === 'trim') {
            // Clean up any lingering drag state when returning to trim mode
            setIsDragging(false);
            setDragOffset({ x: 0, y: 0 });
        }
    }, [timelineMode]);

    // Find the media node for this clip
    const mediaNode = nodes.find(node =>
        node.id === cell.mediaNodeId &&
        (node.type === NodeType.IMAGE || node.type === NodeType.VIDEO)
    ) as MediaNode | undefined;

    // Helper function to calculate effective duration (visible duration after trimming)
    const getEffectiveDuration = (cell: SceneEditorCell): number => {
        const originalDuration = cell.duration || getClipDuration(cell, nodes);
        const trimStart = cell.trimStart || 0;
        const trimEnd = cell.trimEnd || 0;
        return Math.max(0.1, originalDuration - trimStart - trimEnd);
    };

    // Calculate clip dimensions and position
    const clipDuration = cell.duration || getClipDuration(cell, nodes);

    // Phase 2: Use preview values for real-time visual feedback during trim
    const effectiveDuration = isPreviewing
        ? Math.max(0.1, clipDuration - previewTrimStart - previewTrimEnd)
        : getEffectiveDuration(cell);

    const clipStartTime = cell.startTime || 0;

    // Use spaced position in rearrange mode, normal position in trim mode
    let clipWidth, clipLeft;
    if (timelineMode === 'rearrange' && spacedPosition) {
        clipWidth = spacedPosition.width;
        clipLeft = spacedPosition.left;
        console.debug('🎯 TimelineClip using SPACED position for', cell.id, 'width:', clipWidth, 'left:', clipLeft);
    } else {
        clipWidth = zoomSystem.getPixelFromTime(effectiveDuration); // Use effective duration for width

        // Phase 2.5: Fix left trim behavior - left edge should move with cursor
        if (isPreviewing && previewTrimStart > 0) {
            // Left trim: adjust left position to show left edge moving
            const originalLeft = zoomSystem.getPixelFromTime(clipStartTime);
            const trimStartPixels = zoomSystem.getPixelFromTime(previewTrimStart);
            clipLeft = originalLeft + trimStartPixels; // Move left edge right
        } else {
            clipLeft = zoomSystem.getPixelFromTime(clipStartTime);
        }

        console.debug('🎯 TimelineClip using NORMAL position for', cell.id, 'width:', clipWidth, 'left:', clipLeft, 'mode:', timelineMode, 'hasSpacedPos:', !!spacedPosition);
    }
    // Premiere-style: Extract only first and last frame thumbnails
    // Runs once per clip (not affected by zoom changes)
    useEffect(() => {
        if (!mediaNode || mediaNode.type !== NodeType.VIDEO) {
            setThumbnailsLoading(false);
            return;
        }
        
        let isCancelled = false;
        
        const extractThumbnails = async () => {
            try {
                const videoUrl = await mediaService.getMediaUrl(mediaNode.data.url);
                const duration = mediaNode.data.duration || clipDuration;
                const trimStart = cell.trimStart || 0;
                const trimEnd = cell.trimEnd || 0;
                
                // First frame: at trimStart (or 0.1s to avoid black frames)
                const firstFrameTime = Math.max(0.1, trimStart);
                // Last frame: at end minus trimEnd (or 0.1s before end)
                const lastFrameTime = Math.max(0, duration - trimEnd - 0.1);
                
                // Extract first frame - 16:9 aspect ratio (160x90)
                const firstUrl = await extractVideoFrame(videoUrl, firstFrameTime, {
                    width: 160,
                    height: 90,
                    quality: 0.8
                });
                
                if (isCancelled) return;
                setFirstFrameUrl(firstUrl);
                
                // Extract last frame (only if clip is long enough) - 16:9 aspect ratio
                if (lastFrameTime > firstFrameTime + 1) {
                    const lastUrl = await extractVideoFrame(videoUrl, lastFrameTime, {
                        width: 160,
                        height: 90,
                        quality: 0.8
                    });
                    
                    if (isCancelled) return;
                    setLastFrameUrl(lastUrl);
                }
                
                setThumbnailsLoading(false);
            } catch (error) {
                console.warn('Failed to extract clip thumbnails:', error);
                if (!isCancelled) {
                    setThumbnailsLoading(false);
                }
            }
        };
        
        extractThumbnails();
        
        return () => {
            isCancelled = true;
        };
    }, [cell.id, mediaNode?.data.url]); // Only re-run if clip ID or video URL changes

    // Handle clip deletion
    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault(); // Prevent mousedown from triggering rearrange mode
        console.log('🗑️ Deleting clip:', cell.id);
        const operation = new RemoveSceneEditorCellOperation(cell.id);
        stateManager.getOperationManager().executeWithContext(operation, stateManager);
    };

    // Handle clip selection and click-to-seek
    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();

        // Select the clip
        onSelect?.(cell.id);

        // If we have access to VTM, implement click-to-seek within the clip
        // For now, just jump to the start of the clip when clicked
        // TODO: Add fine-grained click-to-seek within clips in future iteration
    };

    // REARRANGE MODE: Clip body drag implementation (only active in rearrange mode)
    const handleRearrangeMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only left mouse button
        if (timelineMode !== 'rearrange') return; // Only in rearrange mode

        console.log('🔄 Starting rearrange drag for clip:', cell.id);

        // Only notify parent of drag start - RearrangeDragHandler handles the actual drag
        onDragStart?.(cell.id, clipStartTime);

        // Prevent text selection during drag and stop event propagation
        e.preventDefault();
        e.stopPropagation();
    };

    // TRIM MODE: Handle clip body click and hold to transition to rearrange mode
    const handleTrimModeMouseDown = (e: React.MouseEvent) => {
        if (timelineMode !== 'trim') return;
        if (e.button !== 0) return; // Only left mouse button

        console.log('🔄 Clip body mousedown in trim mode - starting hold timer');

        // Capture initial position for distance threshold
        const startX = e.clientX;
        const startY = e.clientY;
        let hasMoved = false;

        // Start hold timer
        const holdTimer = setTimeout(() => {
            if (!hasMoved) {
                console.log('🔄 Hold threshold reached - transitioning to rearrange mode');

                // Transition from trim mode to rearrange mode
                enterRearrangeMode(cell.id);

                // Start rearrange drag with forced mode
                onDragStart?.(cell.id, clipStartTime, 'rearrange');

                // Prevent event from propagating
                e.preventDefault();
                e.stopPropagation();
            }
        }, 300); // 300ms hold threshold

        // Track mouse movement
        const handleMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = Math.abs(moveEvent.clientX - startX);
            const deltaY = Math.abs(moveEvent.clientY - startY);

            if (deltaX > 5 || deltaY > 5) { // 5px movement threshold
                hasMoved = true;
                clearTimeout(holdTimer);

                // If mouse moved significantly, immediately enter rearrange mode
                console.log('🔄 Mouse moved significantly - transitioning to rearrange mode');
                enterRearrangeMode(cell.id);
                onDragStart?.(cell.id, clipStartTime, 'rearrange');

                document.removeEventListener('mousemove', handleMouseMove);
            }
        };

        // Track mouse up to cancel timer
        const handleMouseUp = () => {
            clearTimeout(holdTimer);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    // Trim-related handlers
    const handleClipMouseEnter = () => {
        console.debug(`🎯 Mouse enter clip ${cell.id} in ${timelineMode} mode`);
        setIsHovered(true);

        // Only show trim handles in trim mode
        if (timelineMode === 'trim') {
            setShowTrimHandles(true);
        }
    };

    const handleClipMouseLeave = () => {
        console.debug(`🎯 Mouse leave clip ${cell.id} in ${timelineMode} mode`);
        setIsHovered(false);
        setShowTrimHandles(false);
    };

    const handleTrimStart = (handle: 'left' | 'right', initialValue: number) => {
        setIsTrimming(true);
        onTrimStart?.(cell.id, handle);
    };

    const handleTrimUpdate = (trimStart: number, trimEnd: number) => {
        // Phase 2: Update preview state for real-time visual feedback
        setPreviewTrimStart(trimStart);
        setPreviewTrimEnd(trimEnd);
        setIsPreviewing(true);

        // Update both state and ref with latest values
        setCurrentTrimStart(trimStart);
        setCurrentTrimEnd(trimEnd);
        latestTrimValues.current = { trimStart, trimEnd };

        // Phase 2.5: Enhanced handler is now called directly from TrimHandles
        // This function is kept for backward compatibility
        onTrimUpdate?.(cell.id, trimStart, trimEnd);
    };

    const handleTrimEnd = () => {
        // Use the latest trim values from ref (not state which might be stale)
        const finalTrimStart = latestTrimValues.current.trimStart;
        const finalTrimEnd = latestTrimValues.current.trimEnd;

        // Only dispatch operation if trim values actually changed
        const originalTrimStart = cell.trimStart || 0;
        const originalTrimEnd = cell.trimEnd || 0;

        if (finalTrimStart !== originalTrimStart || finalTrimEnd !== originalTrimEnd) {
            // Get the actual duration from the media node
            const clipDurationFromNode = getClipDuration(cell, nodes);

            // Pre-patch the canvas to ensure the cell has the correct duration
            // This ensures the operation can validate properly
            const currentCanvas = stateManager.getCanvas();
            if (currentCanvas.sceneEditor?.cells) {
                const updatedCells = currentCanvas.sceneEditor.cells.map(c =>
                    c.id === cell.id ? { ...c, duration: clipDurationFromNode } : c
                );
                const patchedCanvas = {
                    ...currentCanvas,
                    sceneEditor: {
                        ...currentCanvas.sceneEditor,
                        cells: updatedCells
                    }
                };
                stateManager.updateCanvas(patchedCanvas);
            }

            const operation = new TrimSceneEditorCellOperation(
                cell.id,
                finalTrimStart,
                finalTrimEnd
            );

            // Dispatch the operation through the operation manager
            stateManager.getOperationManager().executeWithContext(operation, stateManager);
        }

        setIsTrimming(false);

        // Phase 2: Reset preview state when trim operation ends
        setIsPreviewing(false);
        setPreviewTrimStart(cell.trimStart || 0);
        setPreviewTrimEnd(cell.trimEnd || 0);

        onTrimEnd?.();
    };

    if (!mediaNode) {
        return null;
    }

    return (
        <div
            className={`timeline-clip ${timelineMode}-mode ${isSelected ? 'timeline-clip-selected' : ''} ${isDragging ? 'timeline-clip-dragging' : ''} ${isBeingDragged ? 'timeline-clip-being-dragged' : ''}`}
            data-cell-id={cell.id}
            style={{
                position: 'absolute',
                left: `${clipLeft}px`,
                width: `${clipWidth}px`,
                height: '50px', // Fixed height for clips
                minWidth: '40px', // Minimum width for visibility
                cursor: isDragging ? 'grabbing' : 'grab',
                opacity: isBeingDragged ? 0.4 : (isDragging ? 0.3 : 1), // Semi-transparent when being dragged
                zIndex: isDragging ? 1000 : 1,
                userSelect: 'none', // Prevent text selection
                // Add dotted border when being dragged
                border: isBeingDragged ? '2px dashed var(--primary)' : 'none',
                background: isBeingDragged ? '#10b981' : 'transparent',
                // Force remove any shadow effects
                boxShadow: 'none !important',
                filter: 'none !important',
                transform: 'none !important'
            }}
            onMouseDown={timelineMode === 'rearrange' ? handleRearrangeMouseDown : handleTrimModeMouseDown}
            onClick={handleClick}
            onMouseEnter={handleClipMouseEnter}
            onMouseLeave={handleClipMouseLeave}
        >
            {/* Clip background */}
            <div 
                className="timeline-clip-background"
                style={{
                    boxShadow: 'none !important',
                    filter: 'none !important'
                }}
            >
                {/* Premiere-style: First and last frame thumbnails at edges */}
                <div className="timeline-clip-thumbnails" style={{ 
                    display: 'flex',
                    width: '100%',
                    height: '100%',
                    position: 'relative',
                    overflow: 'hidden',
                    background: '#406a94' /* Bluish background for entire clip */
                }}>
                    {/* First frame thumbnail - left edge, full 16:9 image */}
                    {firstFrameUrl && (
                        <img 
                            src={firstFrameUrl} 
                            alt="First frame"
                            style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                height: '100%',
                                width: 'auto' /* Let width be determined by aspect ratio */
                            }}
                            draggable={false}
                        />
                    )}
                    
                    {/* Last frame thumbnail - right edge, full 16:9 image */}
                    {lastFrameUrl && (
                        <img 
                            src={lastFrameUrl} 
                            alt="Last frame"
                            style={{
                                position: 'absolute',
                                right: 0,
                                top: 0,
                                height: '100%',
                                width: 'auto' /* Let width be determined by aspect ratio */
                            }}
                            draggable={false}
                        />
                    )}
                    
                    {/* Loading indicator */}
                    {thumbnailsLoading && (
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(64, 106, 148, 0.8)' /* Bluish with opacity */
                        }}>
                            <div className="loading-spinner" style={{ width: 16, height: 16 }} />
                        </div>
                    )}
                </div>

                {/* Phase 2.5: Gap indicator removed - was showing in wrong location */}

                {/* Clip info overlay */}
                <div 
                    className="timeline-clip-overlay"
                    style={{
                        boxShadow: 'none !important',
                        filter: 'none !important'
                    }}
                >
                    <div className="clip-info">
                        <span className="clip-duration">
                            {/* Phase 2: Show live duration updates during trim */}
                            {isPreviewing
                                ? `${Math.round(effectiveDuration * 10) / 10}s (trimming)`
                                : `${Math.round(effectiveDuration * 10) / 10}s`
                            }
                        </span>
                    </div>

                    {/* Delete button */}
                    <button
                        className="clip-delete-button"
                        onClick={handleDelete}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                        }}
                        title="Delete clip"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>

                {/* Selection border */}
                {isSelected && (
                    <div className="timeline-clip-selection-border" />
                )}

                {/* Phase 2: Ripple preview overlay - shows where clip will move */}
                {ripplePreview?.isActive && (
                    <div
                        className="ripple-preview-overlay"
                        style={{
                            position: 'absolute',
                            left: `${ripplePreview.originalLeft}px`,
                            top: '0',
                            width: `${clipWidth}px`,
                            height: '100%',
                            background: 'rgba(59, 130, 246, 0.2)',
                            border: '2px dashed #3b82f6',
                            borderRadius: '4px',
                            pointerEvents: 'none',
                            zIndex: 15,
                            opacity: 0.7,
                            animation: 'ripplePreview 0.3s ease-out'
                        }}
                    >
                        <div className="ripple-preview-label">
                            <span>Moving to: {Math.round(ripplePreview.newLeft)}px</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Trim handles - Only show in trim mode */}
            {timelineMode === 'trim' && (
                <TrimHandles
                    cell={cell}
                    clipWidth={clipWidth}
                    clipHeight={60} // Match the fixed clip height
                    zoomSystem={zoomSystem}
                    onTrimStart={handleTrimStart}
                    onTrimUpdate={handleTrimUpdate}
                    onTrimEnd={handleTrimEnd}
                    isVisible={showTrimHandles && !isDragging} // Hide during clip drag
                    showTooltip={true} // Step 1B.4: Enable tooltip during drag
                    // Phase 2.5: Pass enhanced trim update with handle information
                    onTrimUpdateWithHandle={onTrimUpdateWithPlayhead ?
                        (trimStart: number, trimEnd: number, handle: 'left' | 'right') => {
                            // Call enhanced handler for playhead sync
                            onTrimUpdateWithPlayhead(cell.id, trimStart, trimEnd, handle);
                            // ALSO call the original handler to maintain trim functionality
                            handleTrimUpdate(trimStart, trimEnd);
                        } : undefined
                    }
                />
            )}
        </div>
    );
};

export default TimelineClip; 