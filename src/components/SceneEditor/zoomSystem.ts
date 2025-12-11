// Continuous Zoom System for Scene Editor Timeline
// Uses pixelsPerSecond as the single zoom value (no discrete levels)

export interface ZoomSystem {
    pixelsPerSecond: number;
    getPixelFromTime: (seconds: number) => number;
    getTimeFromPixel: (pixel: number) => number;
    getKeyframeCount: (clipDuration: number) => number;
    getTimelineWidth: (totalDuration: number) => number;
}

// Min/max zoom bounds
export const MIN_PIXELS_PER_SECOND = 5;    // Overview: 30min = 9,000px
export const MAX_PIXELS_PER_SECOND = 120;  // Detail: precise timing
export const DEFAULT_PIXELS_PER_SECOND = 60; // Normal: comfortable editing

/**
 * Create a zoom system with the given pixels per second value
 */
export const createZoomSystem = (pixelsPerSecond: number = DEFAULT_PIXELS_PER_SECOND): ZoomSystem => {
    // Clamp to valid range
    const pps = Math.max(MIN_PIXELS_PER_SECOND, Math.min(MAX_PIXELS_PER_SECOND, pixelsPerSecond));

    return {
        pixelsPerSecond: pps,

        getPixelFromTime: (seconds: number): number => {
            return seconds * pps;
        },

        getTimeFromPixel: (pixel: number): number => {
            return pixel / pps;
        },

        getKeyframeCount: (clipDuration: number): number => {
            // Scale keyframes based on zoom level and clip duration
            // More zoomed in = more keyframes
            const zoomFactor = pps / DEFAULT_PIXELS_PER_SECOND;
            const durationFactor = Math.max(1, clipDuration / 3);
            const baseCount = pps < 30 ? 1 : pps < 90 ? 3 : 5;
            return Math.min(20, Math.max(1, Math.floor(baseCount * zoomFactor * durationFactor)));
        },

        getTimelineWidth: (totalDuration: number): number => {
            return totalDuration * pps;
        }
    };
};

/**
 * Universal time-to-pixel conversion function
 */
export const timeToPixel = (seconds: number, pixelsPerSecond: number): number => {
    return seconds * pixelsPerSecond;
};

/**
 * Universal pixel-to-time conversion function
 */
export const pixelToTime = (pixel: number, pixelsPerSecond: number): number => {
    return pixel / pixelsPerSecond;
};

/**
 * Get appropriate time interval for ruler markers based on zoom and duration
 */
export const getTimeInterval = (pixelsPerSecond: number, totalDuration: number): number => {
    // Calculate based on how many pixels per second we have
    // Higher zoom = smaller intervals
    if (pixelsPerSecond < 20) {
        // Overview range
        if (totalDuration <= 60) return 10;
        if (totalDuration <= 300) return 30;
        if (totalDuration <= 1800) return 60;
        return 300;
    } else if (pixelsPerSecond < 90) {
        // Normal range
        if (totalDuration <= 30) return 5;
        if (totalDuration <= 120) return 10;
        if (totalDuration <= 600) return 30;
        return 60;
    } else {
        // Detail range
        if (totalDuration <= 10) return 1;
        if (totalDuration <= 60) return 5;
        if (totalDuration <= 300) return 10;
        return 30;
    }
};

/**
 * Calculate optimal viewport scroll position to keep a time visible
 */
export const getScrollPositionForTime = (
    targetTime: number,
    pixelsPerSecond: number,
    viewportWidth: number
): number => {
    const targetPixel = timeToPixel(targetTime, pixelsPerSecond);
    return Math.max(0, targetPixel - viewportWidth / 2);
};
