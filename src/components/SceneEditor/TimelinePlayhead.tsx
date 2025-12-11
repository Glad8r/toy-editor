import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { VirtualTimelineManager } from './VirtualTimelineManager';
import { ZoomSystem } from './zoomSystem';

interface TimelinePlayheadProps {
    virtualTimeline: VirtualTimelineManager;
    zoomSystem: ZoomSystem;
    totalDuration: number;
    timelineWidth: number;
    containerHeight?: number | string; // Made optional with default
}

const TimelinePlayhead: React.FC<TimelinePlayheadProps> = ({
    virtualTimeline,
    zoomSystem,
    totalDuration,
    timelineWidth,
    containerHeight = '100%' // Default to full timeline canvas height
}) => {
    const [currentTime, setCurrentTime] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [forceRender, setForceRender] = useState(0); // Force re-render on zoom changes
    const playheadRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Track zoom changes to handle playhead repositioning
    const prevZoomPPSRef = useRef(zoomSystem.pixelsPerSecond);

    // Subscribe to VTM current time changes
    useEffect(() => {
        const unsubscribeTime = virtualTimeline.onCurrentTimeChange((time) => {
            setCurrentTime(time);
        });

        const unsubscribeState = virtualTimeline.onTimelineChange((state) => {
            setIsPlaying(state.isPlaying);
            // Also update current time from timeline state to ensure sync
            setCurrentTime(state.currentTime);
        });

        // Get initial state
        setCurrentTime(virtualTimeline.getCurrentTime());
        setIsPlaying(virtualTimeline.isPlaying());

        return () => {
            unsubscribeTime();
            unsubscribeState();
        };
    }, [virtualTimeline]);

    // Handle zoom changes - force immediate playhead repositioning
    useEffect(() => {
        if (prevZoomPPSRef.current !== zoomSystem.pixelsPerSecond) {
            prevZoomPPSRef.current = zoomSystem.pixelsPerSecond;

            // Force a re-render to ensure playhead position updates immediately when zoom changes
            setForceRender(prev => prev + 1);
        }
    }, [zoomSystem.pixelsPerSecond]);

    // Calculate playhead position using VTM's pixel conversion
    // Include forceRender in the calculation to ensure re-calculation on zoom changes
    const playheadPosition = useMemo(() => {
        return virtualTimeline.getPlayheadPixelPosition(currentTime);
    }, [virtualTimeline, currentTime, forceRender]);

    // Handle mouse down to start dragging
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        console.log('🎯 Playhead drag start');
        setIsDragging(true);

        // Create fresh event handlers for this drag session
        const currentHandleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current) return;

            const rect = containerRef.current.getBoundingClientRect();
            const pixelX = e.clientX - rect.left;

            // Convert pixel position to time using VTM
            const newTime = virtualTimeline.getTimeFromPixelClick(pixelX);

            // Clamp to valid timeline range
            const clampedTime = Math.max(0, Math.min(newTime, totalDuration));

            // Update VTM with new time (this will trigger all subscribers)
            virtualTimeline.setCurrentTime(clampedTime);
        };

        const currentHandleMouseUp = () => {
            console.log('🎯 Playhead drag end');
            setIsDragging(false);

            // Remove global mouse listeners
            document.removeEventListener('mousemove', currentHandleMouseMove, true);
            document.removeEventListener('mouseup', currentHandleMouseUp, true);

            // Force a re-render to ensure transitions are re-enabled
            setTimeout(() => {
                // This ensures the component re-renders after dragging state is cleared
            }, 0);
        };

        // Use capture phase to ensure these events are handled first
        document.addEventListener('mousemove', currentHandleMouseMove, true);
        document.addEventListener('mouseup', currentHandleMouseUp, true);
    }, [virtualTimeline, totalDuration]);

    // Note: Mouse move and mouse up handlers are now created fresh in handleMouseDown
    // to avoid conflicts with other timeline dragging operations

    // Handle direct click on playhead area (not dragging)
    const handleClick = useCallback((e: React.MouseEvent) => {
        if (!containerRef.current) return;

        e.preventDefault();
        e.stopPropagation();

        const rect = containerRef.current.getBoundingClientRect();
        const pixelX = e.clientX - rect.left;

        // Convert pixel position to time using VTM
        const newTime = virtualTimeline.getTimeFromPixelClick(pixelX);

        // Clamp to valid timeline range
        const clampedTime = Math.max(0, Math.min(newTime, totalDuration));

        // Update VTM with new time
        virtualTimeline.setCurrentTime(clampedTime);
    }, [virtualTimeline, totalDuration]);

    // Handle hover states
    const handleMouseEnter = () => setIsHovering(true);
    const handleMouseLeave = () => {
        if (!isDragging) {
            setIsHovering(false);
        }
    };

    // Note: Global event listeners are now managed per-drag session in handleMouseDown
    // No cleanup needed since each drag creates and removes its own handlers

    // Format time for tooltip
    const formatTime = (seconds: number): string => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        const milliseconds = Math.floor((seconds % 1) * 100);
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
    };

    return (
        <div
            ref={containerRef}
            className="timeline-playhead-container"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${timelineWidth}px`,
                height: typeof containerHeight === 'number' ? `${containerHeight}px` : containerHeight,
                pointerEvents: 'none', // Allow clicks to pass through to timeline elements
                zIndex: 50 // Higher than timeline elements but below modal overlays
            }}
            onClick={handleClick}
        >
            {/* Playhead Line - Visual Only (No Interaction) */}
            <div
                ref={playheadRef}
                className={`timeline-playhead-line ${isDragging ? 'dragging' : ''} ${isHovering ? 'hovering' : ''}`}
                style={{
                    position: 'absolute',
                    left: `${playheadPosition}px`,
                    top: 0,
                    width: '2px',
                    height: '100%',
                    pointerEvents: 'none', // NO interaction - visual only
                    transform: 'translateX(-1px)', // Center the line on the exact pixel
                    transition: (isDragging || isPlaying) ? 'none' : 'left 0.1s ease-out' // No transition during playback/dragging
                }}
            >
                {/* Main Vertical Line */}
                <div
                    className="timeline-playhead-body"
                    style={{
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'var(--timeline-playhead-color)',
                        boxShadow: isDragging ? '0 0 8px rgba(59, 130, 246, 0.6)' : '0 0 4px rgba(59, 130, 246, 0.4)'
                    }}
                />

                {/* Bottom Arrow Indicator - Visual Only */}
                <div
                    className="timeline-playhead-arrow timeline-playhead-arrow-bottom"
                    style={{
                        position: 'absolute',
                        bottom: '-2px',
                        left: '-6px',
                        width: 0,
                        height: 0,
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderBottom: '8px solid var(--timeline-playhead-color)',
                        transform: 'translateY(100%)'
                    }}
                />

                {/* Time Tooltip */}
                {(isHovering || isDragging) && (
                    <div
                        className="timeline-playhead-tooltip"
                        style={{
                            position: 'absolute',
                            top: '-40px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontFamily: 'Jost, sans-serif',
                            whiteSpace: 'nowrap',
                            pointerEvents: 'none',
                            zIndex: 60,
                            // boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
                        }}
                    >
                        {formatTime(currentTime)}
                        {/* Tooltip arrow */}
                        <div
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                width: 0,
                                height: 0,
                                borderLeft: '4px solid transparent',
                                borderRight: '4px solid transparent',
                                borderTop: '4px solid rgba(0, 0, 0, 0.8)'
                            }}
                        />
                    </div>
                )}
            </div>

            {/* Draggable Triangle Handle - Only in Ruler Area (Top 15%) */}
            <div
                className={`timeline-playhead-handle ${isDragging ? 'dragging' : ''} ${isHovering ? 'hovering' : ''}`}
                style={{
                    position: 'absolute',
                    left: `${playheadPosition}px`,
                    top: '0px', // Position in ruler area
                    width: '16px',
                    height: '15%', // Only covers ruler area (top 15%)
                    pointerEvents: 'auto',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    transform: 'translateX(-8px)', // Center the 16px handle on the playhead line
                    zIndex: 55, // Higher than the visual line
                    transition: (isDragging || isPlaying) ? 'none' : 'left 0.1s ease-out',
                    // Ensure container stays invisible - no background, border, or shadow
                    backgroundColor: 'transparent',
                    border: 'none',
                    boxShadow: 'none',
                    background: 'none'
                }}
                onMouseDown={handleMouseDown}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {/* Downward Triangle Handle - Visible at Top of Ruler */}
                <div
                    className="timeline-playhead-triangle-handle"
                    style={{
                        position: 'absolute',
                        top: '0px', // Position just inside the ruler area
                        left: '50%',
                        width: 0,
                        height: 0,
                        borderLeft: '8px solid transparent',
                        borderRight: '8px solid transparent',
                        borderTop: '12px solid var(--timeline-playhead-color)', // Downward pointing triangle
                        transform: 'translateX(-50%)',
                        filter: isDragging ? 'brightness(1.3)' : isHovering ? 'brightness(1.15)' : 'none',
                        transition: 'filter 0.2s ease, box-shadow 0.2s ease'
                    }}
                />

                {/* Larger invisible interaction area for easier grabbing */}
                <div
                    style={{
                        position: 'absolute',
                        top: '0px',
                        left: '50%',
                        width: '24px', // Wider for easier interaction
                        height: '20px', // Taller to cover triangle + some area
                        transform: 'translateX(-50%)',
                        backgroundColor: 'transparent',
                        // Debug: Uncomment to see interaction area
                        // backgroundColor: 'rgba(255, 0, 0, 0.2)'
                    }}
                />
            </div>
        </div>
    );
};

export default TimelinePlayhead; 