import React, { useState, useEffect, useCallback } from 'react';
import { Play, Pause, SkipForward, SkipBack } from 'lucide-react';
import { Button } from '../ui/button';
import { VirtualTimelineManager } from './VirtualTimelineManager';
import { createZoomSystemFromPixelsPerSecond, ZOOM_SCALES } from './zoomSystem';

interface VideoPlaybackPanelProps {
    virtualTimeline: VirtualTimelineManager;
    onTogglePlayback: () => void;
    onSkipPrevious: () => void;
    onSkipNext: () => void;
    exitButton?: React.ReactNode;
}

const VideoPlaybackPanel: React.FC<VideoPlaybackPanelProps> = ({
    virtualTimeline,
    onTogglePlayback,
    onSkipPrevious,
    onSkipNext,
    exitButton
}) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [globalTime, setGlobalTime] = useState(0);
    const [totalDuration, setTotalDuration] = useState(0);
    
    // Convert pixels per second to slider value (0-100) - defined early for initialization
    const pixelsPerSecondToSliderValue = useCallback((pps: number): number => {
        const minPPS = ZOOM_SCALES.overview; // 5
        const maxPPS = ZOOM_SCALES.detail;   // 120
        return ((pps - minPPS) / (maxPPS - minPPS)) * 100;
    }, []);

    // Zoom slider state - maps 0-100 to overview (5px/s) to detail (120px/s)
    // Initialize to 50 (normal zoom) - will be synced from VTM in useEffect
    const [zoomSliderValue, setZoomSliderValue] = useState(50);

    // Subscribe to VTM state changes
    useEffect(() => {
        if (!virtualTimeline) return;

        const unsubscribeTime = virtualTimeline.onCurrentTimeChange((time) => {
            setGlobalTime(time);
        });

        const unsubscribeState = virtualTimeline.onTimelineChange((state) => {
            setIsPlaying(state.isPlaying);
            setTotalDuration(state.totalDuration);
        });

        // Get initial state
        const initialState = virtualTimeline.getTimelineState();
        setGlobalTime(initialState.currentTime);
        setIsPlaying(initialState.isPlaying);
        setTotalDuration(initialState.totalDuration);

        // Initialize zoom slider from VTM's current zoom system
        try {
            const currentZoomSystem = virtualTimeline.getZoomSystem();
            const initialSliderValue = pixelsPerSecondToSliderValue(currentZoomSystem.pixelsPerSecond);
            setZoomSliderValue(initialSliderValue);
        } catch (error) {
            // If getZoomSystem doesn't exist yet, default to middle (normal zoom)
            console.warn('Could not get zoom system from VTM, using default:', error);
            setZoomSliderValue(50);
        }

        return () => {
            unsubscribeTime();
            unsubscribeState();
        };
    }, [virtualTimeline, pixelsPerSecondToSliderValue]);

    // Convert slider value (0-100) to pixels per second (5-120)
    const sliderValueToPixelsPerSecond = useCallback((value: number): number => {
        // Map 0 -> 5 (overview), 50 -> 60 (normal), 100 -> 120 (detail)
        const minPPS = ZOOM_SCALES.overview; // 5
        const maxPPS = ZOOM_SCALES.detail;   // 120
        return minPPS + (value / 100) * (maxPPS - minPPS);
    }, []);

    // Handle zoom slider change
    const handleZoomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseFloat(e.target.value);
        setZoomSliderValue(value);
        
        // Convert slider value to pixels per second
        const pixelsPerSecond = sliderValueToPixelsPerSecond(value);
        
        // Create zoom system with custom pixels per second
        const newZoomSystem = createZoomSystemFromPixelsPerSecond(pixelsPerSecond);
        
        // Update VTM with new zoom system
        virtualTimeline.updateZoomSystem(newZoomSystem);
    }, [virtualTimeline, sliderValueToPixelsPerSecond]);


    return (
        <div className="video-playback-panel">
            {/* Zoom Slider - Left aligned */}
            <div className="zoom-slider-container">
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={zoomSliderValue}
                    onChange={handleZoomChange}
                    className="zoom-slider"
                />
            </div>

            {/* Playback Controls - Center */}
            <div className="flex items-center gap-6">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onSkipPrevious}
                    disabled={globalTime <= 0}
                    className="text-filmforge-text hover:bg-transparent"
                >
                    <SkipBack className="w-4 h-4" fill="currentColor" />
                </Button>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onTogglePlayback}
                    className="text-filmforge-text hover:bg-transparent"
                >
                    {isPlaying ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4" fill="currentColor" />}
                </Button>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onSkipNext}
                    disabled={globalTime >= totalDuration}
                    className="text-filmforge-text hover:bg-transparent"
                >
                    <SkipForward className="w-4 h-4" fill="currentColor" />
                </Button>
            </div>
            
            {/* Time Display */}
            <div className="flex items-center gap-2 text-sm text-filmforge-text-secondary">
                <span>{globalTime.toFixed(1)}s</span>
                <span>/</span>
                <span>{totalDuration.toFixed(1)}s</span>
                {exitButton && (
                    <div className="ml-4">
                        {exitButton}
                    </div>
                )}
            </div>
        </div>
    );
};

export default VideoPlaybackPanel;
