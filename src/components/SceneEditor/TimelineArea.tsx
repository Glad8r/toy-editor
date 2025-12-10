import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useCanvas } from '../../contexts/TimelineContext';
import TimelineControls from './TimelineControls';
import TimelineCanvas from './TimelineCanvas';
import { updateTimelineState, validateTimelineIntegrity } from './timelineUtils';
import { ZoomLevel, createZoomSystem, ZoomSystem } from './zoomSystem';
import { createVirtualTimelineManager, VirtualTimelineManager } from './VirtualTimelineManager';
import { useTimelineMode } from './TimelineModeContext';

interface TimelineAreaProps {
    virtualTimelineManager?: VirtualTimelineManager;
}

const TimelineArea: React.FC<TimelineAreaProps> = ({ virtualTimelineManager }) => {
    const { stateManager, nodes } = useCanvas();
    const { mode, isRearrangeMode, isTrimMode, isTransitioning, activeRearrangeClipId, exitRearrangeMode } = useTimelineMode();

    // Timeline state for Phase 2A/2B
    const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('normal');

    // Phase 2: Ripple preview state for trim operations
    const [ripplePreview, setRipplePreview] = useState<{
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
    } | null>(null);

    // Phase 2: Handle trim updates to show ripple preview
    const handleTrimUpdate = (clipId: string, trimStart: number, trimEnd: number) => {
        const preview = calculateRipplePreview(clipId, trimStart, trimEnd);
        setRipplePreview(preview);
    };

    // Phase 2.5: Store reference to TimelineClip's trim update handler
    const [timelineClipTrimHandlers, setTimelineClipTrimHandlers] = useState<Map<string, (trimStart: number, trimEnd: number) => void>>(new Map());

    // Phase 2.5: Handle trim updates to sync playhead position
    const handleTrimUpdateWithPlayhead = (clipId: string, trimStart: number, trimEnd: number, handle: 'left' | 'right') => {
        // Calculate ripple preview
        const preview = calculateRipplePreview(clipId, trimStart, trimEnd);
        setRipplePreview(preview);

        // Phase 2.5: Update playhead to follow trim edge
        if (migratedSceneEditor?.cells) {
            const trimmingCell = migratedSceneEditor.cells.find(c => c.id === clipId);
            if (trimmingCell) {
                let playheadTime: number;

                if (handle === 'left') {
                    // Left trim: playhead shows new clip start position
                    playheadTime = (trimmingCell.startTime || 0) + trimStart;
                } else {
                    // Right trim: playhead shows new clip end position
                    const originalDuration = trimmingCell.duration || 0;
                    const originalStartTime = trimmingCell.startTime || 0;
                    const originalEndTime = originalStartTime + originalDuration;
                    playheadTime = originalEndTime - trimEnd;
                }

                // Update VTM playhead position
                vtm.setCurrentTime(playheadTime);
            }
        }
    };

    // Phase 2: Handle trim end to hide ripple preview
    const handleTrimEnd = () => {
        setRipplePreview(null);
    };

    // Get the scene editor data
    const sceneEditor = stateManager.getSceneEditor();

    // Phase 2B: Update timeline state with migration
    const [migratedSceneEditor, setMigratedSceneEditor] = useState(sceneEditor);

    // Get zoom system from VTM if available, otherwise create from zoomLevel
    // This ensures we use the actual zoom system from VTM (which may have custom pixelsPerSecond)
    // Use a state to track VTM's zoom system so we can force updates when it changes
    const [vtmZoomSystem, setVtmZoomSystem] = useState<ZoomSystem | null>(null);
    
    const zoomSystem = useMemo(() => {
        if (virtualTimelineManager) {
            // Always get the latest zoom system from VTM
            return virtualTimelineManager.getZoomSystem();
        }
        return createZoomSystem(zoomLevel);
    }, [virtualTimelineManager, zoomLevel, vtmZoomSystem]);

    // Create Virtual Timeline Manager if not provided
    const vtm = useMemo(() => {
        if (virtualTimelineManager) {
            return virtualTimelineManager;
        }

        // Create new VTM instance
        return createVirtualTimelineManager(zoomSystem, migratedSceneEditor?.cells || []);
    }, [virtualTimelineManager, zoomSystem, migratedSceneEditor?.cells]);

    // Migrate and update timeline state when scene editor changes
    useEffect(() => {
        if (sceneEditor) {
            const updated = updateTimelineState(sceneEditor, nodes);
            setMigratedSceneEditor(updated);

            // Update VTM with new timeline data
            vtm.updateTimeline(updated.cells);

            // Validate timeline integrity
            const validation = validateTimelineIntegrity(updated.cells, nodes);
            if (!validation.isValid) {
                console.warn('Timeline integrity issues:', validation.errors);
                console.log('🔍 Debug: Cells causing issues:', updated.cells.map((cell: any) => ({
                    id: cell.id,
                    position: cell.position,
                    startTime: cell.startTime,
                    duration: cell.duration,
                    trimStart: cell.trimStart,
                    trimEnd: cell.trimEnd
                })));
            }
        }
    }, [sceneEditor, nodes, vtm]);

    // Track if zoom change came from external source (slider) to prevent loops
    const zoomChangeSourceRef = useRef<'internal' | 'external'>('internal');
    const isSyncingFromVtmRef = useRef(false);

    // Update VTM when zoom level changes (from TimelineControls only)
    useEffect(() => {
        // Skip if this change came from VTM sync (external source)
        if (zoomChangeSourceRef.current === 'external' || isSyncingFromVtmRef.current) {
            zoomChangeSourceRef.current = 'internal'; // Reset flag
            return;
        }

        // Only update VTM if zoom change came from internal source (TimelineControls)
        vtm.updateZoomSystem(zoomSystem);
    }, [zoomLevel, zoomSystem, vtm]);

    // Sync zoom system from VTM when it changes externally (e.g., from zoom slider)
    useEffect(() => {
        if (!virtualTimelineManager) return; // Only sync if VTM is provided externally

        const unsubscribe = vtm.onTimelineChange(() => {
            // When timeline changes (including zoom changes), get current zoom from VTM
            const currentZoomSystem = vtm.getZoomSystem();
            
            // Check if zoom actually changed to avoid unnecessary updates
            const currentPixelsPerSecond = currentZoomSystem.pixelsPerSecond;
            const currentZoomSystemPPS = vtmZoomSystem?.pixelsPerSecond;
            
            // Only update if zoom actually changed
            if (currentZoomSystemPPS !== undefined && Math.abs(currentPixelsPerSecond - currentZoomSystemPPS) < 0.1) {
                return; // Zoom hasn't changed significantly, skip update
            }
            
            // Mark that we're syncing from VTM to prevent update loop
            isSyncingFromVtmRef.current = true;
            
            // Force update by setting state - this will trigger zoomSystem useMemo to recalculate
            setVtmZoomSystem(currentZoomSystem);
            
            // Also update local zoom level for UI display purposes
            const overviewPPS = 5;   // Updated from 20 to match ZOOM_SCALES.overview
            const normalPPS = 60;
            const detailPPS = 120;
            
            let newZoomLevel: ZoomLevel = 'normal';
            if (currentPixelsPerSecond <= (overviewPPS + normalPPS) / 2) {
                newZoomLevel = 'overview';
            } else if (currentPixelsPerSecond >= (normalPPS + detailPPS) / 2) {
                newZoomLevel = 'detail';
            } else {
                newZoomLevel = 'normal';
            }
            
            // Update local zoom level if it changed (mark as external source to prevent loop)
            if (newZoomLevel !== zoomLevel) {
                zoomChangeSourceRef.current = 'external';
                setZoomLevel(newZoomLevel);
            }
            
            // Reset sync flag after a brief delay to allow state updates to complete
            setTimeout(() => {
                isSyncingFromVtmRef.current = false;
            }, 0);
        });

        // Initialize VTM zoom system state
        setVtmZoomSystem(vtm.getZoomSystem());

        return () => unsubscribe();
    }, [vtm, virtualTimelineManager]); // Removed zoomLevel from dependencies to prevent loop

    // Escape key handling for rearrange mode
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isRearrangeMode) {
                console.log('🔄 Escape pressed - exiting rearrange mode');
                exitRearrangeMode();
                e.preventDefault();
                e.stopPropagation();
            }
        };

        // Add global keydown listener
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isRearrangeMode, exitRearrangeMode]);

    // Get timeline data from VTM
    const timelineState = vtm.getTimelineState();
    const totalDuration = timelineState.totalDuration;
    const currentTime = timelineState.currentTime;

    // Phase 2: Calculate ripple preview positions for adjacent clips
    const calculateRipplePreview = (trimmingClipId: string, newTrimStart: number, newTrimEnd: number) => {
        if (!migratedSceneEditor?.cells) return null;

        const cells = [...migratedSceneEditor.cells];
        const trimmingCell = cells.find(c => c.id === trimmingClipId);
        if (!trimmingCell) return null;

        const originalTrimStart = trimmingCell.trimStart || 0;
        const originalTrimEnd = trimmingCell.trimEnd || 0;

        // Phase 2.5: Handle left vs right trim differently for proper ripple behavior
        let subsequentClipAdjustment = 0;

        if (newTrimStart > originalTrimStart) {
            // Left trim: subsequent clips move left to close the gap
            subsequentClipAdjustment = -(newTrimStart - originalTrimStart);
        } else if (newTrimEnd > originalTrimEnd) {
            // Right trim: subsequent clips move right to close the gap  
            subsequentClipAdjustment = -(newTrimEnd - originalTrimEnd);
        }

        // Find clips that come after the trimming clip
        const subsequentCells = cells
            .filter(c => c.position > trimmingCell.position)
            .sort((a, b) => a.position - b.position);

        // Calculate new positions for subsequent clips
        const ripplePositions = subsequentCells.map(cell => {
            const originalStartTime = cell.startTime || 0;
            // Phase 2.5: Apply the appropriate adjustment for left vs right trim
            const newStartTime = originalStartTime + subsequentClipAdjustment;

            return {
                clipId: cell.id,
                originalStartTime,
                newStartTime,
                left: zoomSystem.getPixelFromTime(newStartTime)
            };
        });

        return {
            isActive: true,
            clipId: trimmingClipId,
            trimStart: newTrimStart,
            trimEnd: newTrimEnd,
            originalTrimStart,
            originalTrimEnd,
            ripplePositions
        };
    };

    return (
        <div className={`timeline-area ${mode}-mode ${isTransitioning ? 'transitioning' : ''}`}>
            {/* Escape hint for rearrange mode */}
            {isRearrangeMode && !isTransitioning && (
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    background: 'rgba(0, 0, 0, 0.7)',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    zIndex: 1000,
                    opacity: 0.8,
                    pointerEvents: 'none'
                }}>
                    Press ESC to exit rearrange mode
                </div>
            )}

            {/* Phase 2A: New 10/90 Split Layout */}

            {/* Left Controls Panel - 10% */}
            <TimelineControls />

            {/* Right Timeline Canvas - 90% */}
            <TimelineCanvas
                totalDuration={totalDuration}
                zoomLevel={zoomLevel}
                migratedCells={migratedSceneEditor?.cells}
                virtualTimeline={vtm}
                timelineMode={mode} // Pass mode to TimelineCanvas
                // Phase 2: Pass ripple preview data
                ripplePreview={ripplePreview}
                // Phase 2: Pass trim handlers for ripple preview
                onTrimUpdate={handleTrimUpdate}
                onTrimEnd={handleTrimEnd}
                // Phase 2.5: Pass enhanced trim handler with playhead sync
                onTrimUpdateWithPlayhead={handleTrimUpdateWithPlayhead}
            />
        </div>
    );
};

export default TimelineArea; 