import React from 'react';
import { SceneEditorCell } from '../../types/timeline';
import { ZoomSystem } from './zoomSystem';
import { VirtualTimelineManager } from './VirtualTimelineManager';
import TimelineClip from './TimelineClip';
import { TimelineMode } from './TimelineModeContext';

interface TimelineTrackProps {
    trackId: string;
    cells: SceneEditorCell[];
    zoomSystem: ZoomSystem;
    virtualTimeline?: VirtualTimelineManager;
    timelineMode: TimelineMode;
    timelineWidth: number;
    // Clip selection
    selectedClipId: string | null;
    onSelectClip: (clipId: string) => void;
    // Drag handlers
    onClipDragStart: (cellId: string, dragStartTime: number, forcedMode?: 'rearrange') => void;
    onClipDragEnd?: () => void;
    // Track drag handlers
    onTrackDragOver: (e: React.DragEvent) => void;
    onTrackDrop: (e: React.DragEvent) => void;
    // Rearrange mode
    getClipSpacedPosition: (clipId: string) => { left: number; width: number } | null;
    isClipBeingDragged: (clipId: string) => boolean;
    // Ripple preview
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
    // Trim handlers
    onTrimUpdate?: (clipId: string, trimStart: number, trimEnd: number) => void;
    onTrimEnd?: () => void;
    onTrimUpdateWithPlayhead?: (clipId: string, trimStart: number, trimEnd: number, handle: 'left' | 'right') => void;
    // Drop indicator
    showDropIndicator: boolean;
    dropIndicatorPosition: number | null;
    insertionIndex?: number | null; // For drop indicator label
    totalClips?: number; // For drop indicator label
    // Drag state
    isDragging: boolean;
}

const TimelineTrack: React.FC<TimelineTrackProps> = ({
    trackId,
    cells,
    zoomSystem,
    virtualTimeline: _virtualTimeline, // Reserved for future use
    timelineMode,
    timelineWidth,
    selectedClipId,
    onSelectClip,
    onClipDragStart,
    onClipDragEnd,
    onTrackDragOver,
    onTrackDrop,
    getClipSpacedPosition,
    isClipBeingDragged,
    ripplePreview,
    onTrimUpdate,
    onTrimEnd,
    onTrimUpdateWithPlayhead,
    showDropIndicator,
    dropIndicatorPosition,
    insertionIndex,
    totalClips,
    isDragging
}) => {
    return (
        <div
            className={`timeline-track ${isDragging ? 'timeline-track-drag-active' : ''}`}
            style={{
                position: 'relative',
                width: `${Math.max(timelineWidth, window.innerWidth * 0.9)}px`,
                height: '80px',
                overflow: 'visible'
            }}
            onDragOver={onTrackDragOver}
            onDrop={onTrackDrop}
        >
            {/* Render clips with absolute positioning */}
            {cells.map((cell) => {
                // Get spaced position for rearrange mode
                const spacedPosition = timelineMode === 'rearrange'
                    ? getClipSpacedPosition(cell.id)
                    : null;

                // Check if this clip is being dragged in rearrange mode
                const isBeingDraggedInRearrange = isClipBeingDragged(cell.id);

                // Check if this clip should show ripple preview
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
                        onSelect={onSelectClip}
                        isSelected={selectedClipId === cell.id}
                        onDragStart={onClipDragStart}
                        onDragEnd={timelineMode === 'trim' ? onClipDragEnd : undefined}
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
            {showDropIndicator && dropIndicatorPosition !== null && (
                <div
                    className="timeline-drop-indicator"
                    style={{
                        position: 'absolute',
                        left: `${dropIndicatorPosition}px`,
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
                    {insertionIndex !== undefined && totalClips !== undefined && (
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
                                const position = insertionIndex || 0;
                                if (position === 0) {
                                    return 'Move to start';
                                } else if (position >= totalClips) {
                                    return 'Move to end';
                                } else {
                                    return `Position ${position + 1}`;
                                }
                            })()}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TimelineTrack;

