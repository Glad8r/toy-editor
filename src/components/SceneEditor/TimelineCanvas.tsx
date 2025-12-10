import React, { useState, useEffect } from 'react';
import { useCanvas } from '../../contexts/TimelineContext';
import { SceneEditorCell as SceneEditorCellType } from '../../types/timeline';
import { NodeType } from '../../types/timeline';
import TimelineRuler from './TimelineRuler';
import TimelineClip from './TimelineClip';
import TimelinePlayhead from './TimelinePlayhead';
import { ZoomLevel, createZoomSystem, ZoomSystem } from './zoomSystem';
import { VirtualTimelineManager } from './VirtualTimelineManager';
import { MoveTimelineClipOperation, MoveSceneEditorCellOperation, AddSceneEditorCellOperation } from '../../operations/SceneEditorOperations';
import { TimelineMode, useTimelineMode } from './TimelineModeContext';
import { useRearrangeDragHandler } from './RearrangeDragHandler';
import RearrangeIndicators from './RearrangeIndicators';

interface TimelineCanvasProps {
    totalDuration: number;
    zoomLevel: ZoomLevel;
    migratedCells?: SceneEditorCellType[];
    virtualTimeline?: VirtualTimelineManager;
    timelineMode: TimelineMode;
    // Phase 2: Ripple preview support
    ripplePreview?: {
        isActive: boolean;
        clipId: string;
        trimStart: number;
        trimEnd: number;
        originalTrimStart: number;
        originalTrimEnd: number;
        ripplePositions?: Array<{
            clipId: string;
            originalStartTime: number;
            newStartTime: number;
            left: number;
        }>;
    } | null;
    // Phase 2: Trim event handlers for ripple preview
    onTrimUpdate?: (clipId: string, trimStart: number, trimEnd: number) => void;
    onTrimEnd?: () => void;
    // Phase 2.5: Enhanced trim handler with playhead sync
    onTrimUpdateWithPlayhead?: (clipId: string, trimStart: number, trimEnd: number, handle: 'left' | 'right') => void;
}

const TimelineCanvas: React.FC<TimelineCanvasProps> = ({
    totalDuration,
    zoomLevel,
    migratedCells,
    virtualTimeline,
    timelineMode,
    ripplePreview,
    onTrimUpdate,
    onTrimEnd,
    onTrimUpdateWithPlayhead
}) => {
    const { stateManager, nodes } = useCanvas();
    const { exitRearrangeMode, mode: hookTimelineMode } = useTimelineMode();
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
    // Note: dropIndicatorPosition, proposedDropIndex, and mousePosition moved to dragState for batched updates

    // Get the scene editor data
    const sceneEditor = stateManager.getSceneEditor();

    // Track VTM zoom system changes to force re-renders
    const [vtmZoomSystem, setVtmZoomSystem] = useState<ZoomSystem | null>(null);

    // Subscribe to VTM timeline changes to detect zoom system updates
    useEffect(() => {
        if (!virtualTimeline) {
            setVtmZoomSystem(null);
            return;
        }

        const unsubscribe = virtualTimeline.onTimelineChange(() => {
            // When timeline changes (including zoom changes), update zoom system
            const currentZoomSystem = virtualTimeline.getZoomSystem();
            setVtmZoomSystem(currentZoomSystem);
        });

        // Initialize
        setVtmZoomSystem(virtualTimeline.getZoomSystem());

        return () => unsubscribe();
    }, [virtualTimeline]);

    // Get zoom system from VTM if available, otherwise create from zoomLevel prop
    // This ensures we use the actual zoom system from VTM (which may have custom pixelsPerSecond)
    const zoomSystem = virtualTimeline && vtmZoomSystem
        ? vtmZoomSystem
        : createZoomSystem(zoomLevel);

    // Use migrated cells if available, otherwise fall back to original cells
    const cellsToRender = migratedCells || sceneEditor?.cells || [];

    // Calculate timeline width for the container
    const timelineWidth = zoomSystem.getTimelineWidth(totalDuration);

    // Rearrange drag handler for spaced layout
    const rearrangeDragHandler = useRearrangeDragHandler({
        cells: cellsToRender,
        zoomSystem,
        onDragStart: () => {
            console.log('🎯 Rearrange drag started');
        },
        onDragEnd: () => {
            console.log('🎯 Rearrange drag ended - about to exit rearrange mode');
            // Exit rearrange mode after successful rearrange
            console.log('🎯 Calling exitRearrangeMode()...');
            exitRearrangeMode();
            console.log('🎯 exitRearrangeMode() called');
        }
        // onInsertionChange, onStateCleanup, onMouseMove removed - all state now in dragState
    });

    // Handle clip drag start - only for rearrange mode
    const handleClipDragStart = (clipId: string, dragStartTime: number, forcedMode?: 'rearrange') => {
        console.log('🎬 Timeline drag start:', clipId, 'from time:', dragStartTime);
        console.log('🎬 Mode from prop:', timelineMode, '| Mode from hook:', hookTimelineMode, '| Forced mode:', forcedMode);

        // Only handle rearrange mode drags - trim mode should not have drag functionality
        if (forcedMode === 'rearrange' || hookTimelineMode === 'rearrange') {
            console.log('🎬 Delegating to RearrangeDragHandler');
            rearrangeDragHandler.startRearrangeDrag(clipId, 0, 0); // clientX/Y not needed for our implementation
            return;
        }

        // Trim mode should not have drag functionality - only trim handles should work
        console.log('🎬 Trim mode - drag not supported, use trim handles instead');
    };

    // Handle clip drag end - only for rearrange mode
    const handleClipDragEnd = () => {
        console.log('🎬 Timeline drag end - RearrangeDragHandler handles this');
        // RearrangeDragHandler handles all drag end logic
    };

    // Find media node for dragged clip (for drag ghost)
    const draggedMediaNode = rearrangeDragHandler.dragState.draggedClipData ? nodes.find(node =>
        node.id === rearrangeDragHandler.dragState.draggedClipData!.mediaNodeId &&
        (node.type === NodeType.IMAGE || node.type === NodeType.VIDEO)
    ) : null;

    /**
     * Handle drag over on timeline track - allows dropping media nodes on empty space
     * This enables dragging media thumbnails from inspector directly onto the timeline
     */
    const handleTrackDragOver = (e: React.DragEvent) => {
        // Only allow drops if we're not in the middle of a rearrange drag
        if (rearrangeDragHandler.dragState.isDragging) {
            return;
        }

        // Check if this is a media node being dragged (from inspector)
        const hasMediaNodeData = e.dataTransfer.types.includes('application/media-node');
        if (hasMediaNodeData) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
        }
    };

    /**
     * Handle drop on timeline track - adds media node to timeline at drop position
     * Calculates the insertion position based on the X coordinate of the drop
     */
    const handleTrackDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // Check if this is a media node being dropped (from inspector)
        const mediaNodeData = e.dataTransfer.getData('application/media-node');
        if (!mediaNodeData) {
            return; // Not a media node drop, ignore
        }

        try {
            const { nodeId } = JSON.parse(mediaNodeData);
            
            // Calculate drop position based on X coordinate
            const rect = e.currentTarget.getBoundingClientRect();
            const dropX = e.clientX - rect.left;
            
            // Convert pixel position to time using zoom system
            const dropTime = virtualTimeline 
                ? virtualTimeline.getTimeFromPixelClick(dropX)
                : zoomSystem.getTimeFromPixel(dropX);
            
            // Find the appropriate insertion position based on time
            // Insert after the last clip that starts before the drop time
            let insertPosition = cellsToRender.length;
            for (let i = 0; i < cellsToRender.length; i++) {
                const cell = cellsToRender[i];
                const cellStartTime = cell.startTime || 0;
                if (dropTime < cellStartTime) {
                    insertPosition = i;
                    break;
                }
            }
            
            // Add the media node to the timeline at the calculated position
            const operation = new AddSceneEditorCellOperation(nodeId, insertPosition);
            stateManager.getOperationManager().executeWithContext(operation, stateManager);
            
            console.log('📥 Media node dropped on timeline at position', insertPosition, 'time:', dropTime.toFixed(2));
        } catch (error) {
            console.error('Error parsing media node data on timeline drop:', error);
        }
    };

    return (
        <div className={`timeline-canvas ${timelineMode}-mode`}>
            {/* Shared scroll container for ruler and clips */}
            <div className="timeline-scroll-container">
                {/* Timeline Ruler - Sticky at top */}
                <div className="timeline-ruler-container">
                    <TimelineRuler
                        totalDuration={totalDuration}
                        zoomLevel={zoomLevel}
                        virtualTimeline={virtualTimeline}
                        timelineMode={timelineMode}
                    />
                </div>

                {/* Clips Track */}
                <div className="timeline-track-container">
                <div
                    className={`timeline-clips-track ${rearrangeDragHandler.dragState.isDragging ? 'timeline-track-drag-active' : ''}`}
                    style={{
                        position: 'relative',
                        width: `${Math.max(timelineWidth, window.innerWidth * 0.9)}px`,
                        height: '80px',
                        overflow: 'visible'
                    }}
                    onDragOver={handleTrackDragOver}
                    onDrop={handleTrackDrop}
                >
                    {/* Render clips with absolute positioning */}
                    {cellsToRender.map((cell) => {
                        // Get spaced position for rearrange mode
                        const spacedPosition = timelineMode === 'rearrange'
                            ? rearrangeDragHandler.getClipSpacedPosition(cell.id)
                            : null;

                        // Check if this clip is being dragged in rearrange mode
                        const isBeingDraggedInRearrange = timelineMode === 'rearrange' &&
                            rearrangeDragHandler.dragState.isDragging &&
                            rearrangeDragHandler.dragState.draggedClipId === cell.id;

                        // Phase 2: Check if this clip should show ripple preview
                        const shouldShowRipplePreview = ripplePreview?.isActive &&
                            ripplePreview.clipId !== cell.id &&
                            ripplePreview.ripplePositions?.some(rp => rp.clipId === cell.id);

                        const ripplePosition = shouldShowRipplePreview
                            ? ripplePreview.ripplePositions?.find(rp => rp.clipId === cell.id)
                            : null;

                        return (
                            <TimelineClip
                                key={cell.id}
                                cell={cell}
                                zoomSystem={zoomSystem}
                                onSelect={setSelectedClipId}
                                isSelected={selectedClipId === cell.id}
                                onDragStart={handleClipDragStart}
                                onDragEnd={timelineMode === 'trim' ? handleClipDragEnd : undefined}
                                timelineMode={timelineMode}
                                spacedPosition={spacedPosition}
                                isBeingDragged={isBeingDraggedInRearrange}
                                // Phase 2: Ripple preview support
                                ripplePreview={ripplePosition ? {
                                    isActive: true,
                                    newLeft: ripplePosition.left,
                                    originalLeft: zoomSystem.getPixelFromTime(ripplePosition.originalStartTime)
                                } : null}
                                // Phase 2: Pass trim handlers for ripple preview
                                onTrimUpdate={onTrimUpdate}
                                onTrimEnd={onTrimEnd}
                                // Phase 2.5: Pass enhanced trim handler with playhead sync
                                onTrimUpdateWithPlayhead={onTrimUpdateWithPlayhead}
                            />
                        );
                    })}

                    {/* Drop indicator line */}
                    {rearrangeDragHandler.dragState.isDragging && rearrangeDragHandler.dragState.insertionPixelPosition !== null && (
                        <div
                            className="timeline-drop-indicator"
                            style={{
                                position: 'absolute',
                                left: `${rearrangeDragHandler.dragState.insertionPixelPosition}px`,
                                top: '0',
                                bottom: '0',
                                width: '4px',
                                background: 'linear-gradient(to bottom, #10b981, #059669)',
                                borderRadius: '2px',
                                boxShadow: '0 0 12px rgba(16, 185, 129, 0.8)',
                                zIndex: 500,
                                opacity: 1,
                                animation: 'pulseDropIndicator 1.2s ease-in-out infinite',
                                transform: 'translateX(-2px)' // Center the line
                            }}
                        >
                            {/* Position indicator label with smart text */}
                            <div
                                style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '12px',
                                    transform: 'translateY(-50%)',
                                    background: '#10b981',
                                    color: 'white',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: '600',
                                    whiteSpace: 'nowrap',
                                    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.4)',
                                    border: '1px solid rgba(255, 255, 255, 0.2)'
                                }}
                            >
                                {(() => {
                                    const position = rearrangeDragHandler.dragState.insertionIndex || 0;
                                    const totalClips = cellsToRender.length;

                                    if (position === 0) {
                                        return 'Move to start';
                                    } else if (position >= totalClips) {
                                        return 'Move to end';
                                    } else {
                                        return `Position ${position + 1}`;
                                    }
                                })()}
                            </div>
                        </div>
                    )}

                    {/* TODO: Add "Add Clip" functionality back in future phase */}
                </div>

                {/* Drag ghost - follows cursor */}
                {rearrangeDragHandler.dragState.isDragging && rearrangeDragHandler.dragState.draggedClipData && (
                    <div
                        className="timeline-drag-ghost"
                        style={{
                            position: 'fixed',
                            left: `${rearrangeDragHandler.dragState.mousePosition.x - 60}px`, // Offset to center on cursor
                            top: `${rearrangeDragHandler.dragState.mousePosition.y - 40}px`,
                            width: '120px', // Fixed width for ghost
                            height: '80px',
                            background: 'var(--card)',
                            border: '2px solid var(--primary)',
                            borderRadius: '4px',
                            boxShadow: '0 8px 25px rgba(0, 0, 0, 0.3)',
                            opacity: 0.9,
                            zIndex: 9999,
                            pointerEvents: 'none',
                            transform: 'rotate(5deg)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            color: 'var(--primary)',
                            fontWeight: '600'
                        }}
                    >
                        🎬 {draggedMediaNode?.type === NodeType.VIDEO ? 'Video' : 'Image'}
                        <br />
                        {Math.round((rearrangeDragHandler.dragState.draggedClipData?.duration || 0) * 10) / 10}s
                    </div>
                )}
                </div>

                {/* Timeline Playhead - Inside scroll container so it scrolls with content */}
                {virtualTimeline && (
                    <TimelinePlayhead
                        virtualTimeline={virtualTimeline}
                        zoomLevel={zoomLevel}
                        totalDuration={totalDuration}
                        timelineWidth={timelineWidth} // Use actual content width, not screen-based width
                    />
                )}
            </div>
        </div>
    );
};

export default TimelineCanvas; 