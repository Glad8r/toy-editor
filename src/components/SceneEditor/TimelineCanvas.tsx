import React, { useState, useEffect, useRef } from 'react';
import { useCanvas } from '../../contexts/TimelineContext';
import { useClipSelection } from '../../contexts/ClipSelectionContext';
import { SceneEditorCell as SceneEditorCellType } from '../../types/timeline';
import { NodeType } from '../../types/timeline';
import TimelineRuler from './TimelineRuler';
import TimelineTrack from './TimelineTrack';
import TimelinePlayhead from './TimelinePlayhead';
import { createZoomSystem, ZoomSystem } from './zoomSystem';
import { VirtualTimelineManager } from './VirtualTimelineManager';
import { MoveTimelineClipOperation, MoveSceneEditorCellOperation, AddSceneEditorCellOperation } from '../../operations/SceneEditorOperations';
import { TimelineMode, useTimelineMode } from './TimelineModeContext';
import { useRearrangeDragHandler } from './RearrangeDragHandler';
import RearrangeIndicators from './RearrangeIndicators';

interface TimelineCanvasProps {
    totalDuration: number;
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
    const { selectedClipId, setSelectedClipId } = useClipSelection();
    // Note: dropIndicatorPosition, proposedDropIndex, and mousePosition moved to dragState for batched updates

    // Get the scene editor data
    const sceneEditor = stateManager.getSceneEditor();

    // Track VTM zoom system changes to force re-renders
    const [vtmZoomSystem, setVtmZoomSystem] = useState<ZoomSystem | null>(null);
    // Use ref to track last known zoom to prevent unnecessary state updates
    const lastKnownZoomPPSRef = useRef<number | null>(null);

    // Subscribe to VTM timeline changes to detect zoom system updates
    useEffect(() => {
        if (!virtualTimeline) {
            setVtmZoomSystem(null);
            lastKnownZoomPPSRef.current = null;
            return;
        }

        // Initialize
        const initialZoomSystem = virtualTimeline.getZoomSystem();
        setVtmZoomSystem(initialZoomSystem);
        lastKnownZoomPPSRef.current = initialZoomSystem.pixelsPerSecond;

        const unsubscribe = virtualTimeline.onTimelineChange(() => {
            // CRITICAL FIX: Only update state if zoom actually changed
            const currentZoomSystem = virtualTimeline.getZoomSystem();
            const currentPPS = currentZoomSystem.pixelsPerSecond;
            
            if (lastKnownZoomPPSRef.current !== null && 
                Math.abs(currentPPS - lastKnownZoomPPSRef.current) < 0.1) {
                return; // Zoom hasn't changed, skip state update
            }
            
            lastKnownZoomPPSRef.current = currentPPS;
            setVtmZoomSystem(currentZoomSystem);
        });

        return () => unsubscribe();
    }, [virtualTimeline]);

    // Get zoom system from VTM - always use VTM's zoom system
    const zoomSystem = vtmZoomSystem || (virtualTimeline ? virtualTimeline.getZoomSystem() : createZoomSystem());

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
                        zoomSystem={zoomSystem}
                        virtualTimeline={virtualTimeline}
                        timelineMode={timelineMode}
                    />
                </div>

                {/* Timeline Tracks */}
                <div className="timeline-track-container" style={{ position: 'relative', minHeight: '160px' }}>
                    {/* ============================================ */}
                    {/* TRACK 1 - ACTIVE TRACK */}
                    {/* ============================================ */}
                    
                    {/* Top horizontal line - Track 1 top border */}
                    <div
                        className="timeline-track-border-top"
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '1px',
                            backgroundColor: '#e5e7eb', // gray-200
                            zIndex: 1,
                            pointerEvents: 'none'
                        }}
                    />
                    
                    {/* Bottom horizontal line - Track 1 bottom border (80px from top) */}
                    <div
                        className="timeline-track-border-bottom"
                        style={{
                            position: 'absolute',
                            top: '80px', // Position at bottom of track 1 (track height is 80px)
                            left: 0,
                            right: 0,
                            height: '1px',
                            backgroundColor: '#e5e7eb', // gray-200
                            zIndex: 1,
                            pointerEvents: 'none'
                        }}
                    />
                    
                    {/* Active Track 1 - renders all clips */}
                    <TimelineTrack
                        trackId="track-1"
                        cells={cellsToRender}
                        zoomSystem={zoomSystem}
                        virtualTimeline={virtualTimeline}
                        timelineMode={timelineMode}
                        timelineWidth={timelineWidth}
                        selectedClipId={selectedClipId}
                        onSelectClip={setSelectedClipId}
                        onClipDragStart={handleClipDragStart}
                        onClipDragEnd={timelineMode === 'trim' ? handleClipDragEnd : undefined}
                        onTrackDragOver={handleTrackDragOver}
                        onTrackDrop={handleTrackDrop}
                        getClipSpacedPosition={(clipId) => rearrangeDragHandler.getClipSpacedPosition(clipId)}
                        isClipBeingDragged={(clipId) => 
                            timelineMode === 'rearrange' &&
                            rearrangeDragHandler.dragState.isDragging &&
                            rearrangeDragHandler.dragState.draggedClipId === clipId
                        }
                        ripplePreview={ripplePreview}
                        onTrimUpdate={onTrimUpdate}
                        onTrimEnd={onTrimEnd}
                        onTrimUpdateWithPlayhead={onTrimUpdateWithPlayhead}
                        showDropIndicator={rearrangeDragHandler.dragState.isDragging && rearrangeDragHandler.dragState.insertionPixelPosition !== null}
                        dropIndicatorPosition={rearrangeDragHandler.dragState.insertionPixelPosition}
                        insertionIndex={rearrangeDragHandler.dragState.insertionIndex}
                        totalClips={cellsToRender.length}
                        isDragging={rearrangeDragHandler.dragState.isDragging}
                    />
                    
                    {/* ============================================ */}
                    {/* TRACK 2 - TEMPORARY MOCKUP (INACTIVE) */}
                    {/* ============================================ */}
                    {/* 
                        ⚠️ WARNING: This is a TEMPORARY VISUAL MOCKUP only!
                        
                        - Track 2 is completely INACTIVE - no functionality
                        - No drag/drop support
                        - No clip rendering
                        - No interaction whatsoever
                        - This is purely visual to show where track 2 will be
                        
                        TODO: Remove this mockup when implementing actual multi-track support
                    */}
                    
                    {/* Top horizontal line - Track 2 top border (80px from top) */}
                    <div
                        className="timeline-track-border-top-mockup"
                        style={{
                            position: 'absolute',
                            top: '80px', // Position at top of track 2 (below track 1)
                            left: 0,
                            right: 0,
                            height: '1px',
                            backgroundColor: '#d1d5db', // gray-300 (slightly different to indicate mockup)
                            zIndex: 1,
                            pointerEvents: 'none', // Completely inactive
                            opacity: 0.6 // Slightly faded to indicate it's a mockup
                        }}
                    />
                    
                    {/* Bottom horizontal line - Track 2 bottom border (160px from top) */}
                    <div
                        className="timeline-track-border-bottom-mockup"
                        style={{
                            position: 'absolute',
                            top: '160px', // Position at bottom of track 2 (80px + 80px)
                            left: 0,
                            right: 0,
                            height: '1px',
                            backgroundColor: '#d1d5db', // gray-300 (slightly different to indicate mockup)
                            zIndex: 1,
                            pointerEvents: 'none', // Completely inactive
                            opacity: 0.6 // Slightly faded to indicate it's a mockup
                        }}
                    />
                </div>

                {/* Timeline Playhead - Inside scroll container so it scrolls with content */}
                {virtualTimeline && (
                    <TimelinePlayhead
                        virtualTimeline={virtualTimeline}
                        zoomSystem={zoomSystem}
                        totalDuration={totalDuration}
                        timelineWidth={timelineWidth} // Use actual content width, not screen-based width
                    />
                )}
            </div>

            {/* Drag ghost - follows cursor (outside scroll container, fixed position) */}
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
    );
};

export default TimelineCanvas; 