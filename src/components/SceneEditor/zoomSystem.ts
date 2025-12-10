// Universal Zoom System for Scene Editor Timeline
// Provides pixel-perfect alignment between timeline ruler and clips

export type ZoomLevel = 'overview' | 'normal' | 'detail';

export interface ZoomSystem {
    level: ZoomLevel;
    pixelsPerSecond: number;
    getPixelFromTime: (seconds: number) => number;
    getTimeFromPixel: (pixel: number) => number;
    getKeyframeCount: (clipDuration: number) => number;
    getTimelineWidth: (totalDuration: number) => number;
}

// Core zoom scales optimized for short films (<30 minutes)
export const ZOOM_SCALES: Record<ZoomLevel, number> = {
    overview: 5,   // 30min film = 9,000px (see whole project) - decreased from 20
    normal: 60,    // 5min scene = 18,000px (comfortable editing)
    detail: 120    // 2min scene = 14,400px (precise timing)
};

// Zoom level metadata for UI
export const ZOOM_METADATA: Record<ZoomLevel, { label: string; description: string; icon: string }> = {
    overview: {
        label: 'Overview',
        description: 'See whole project structure',
        icon: '⤢'
    },
    normal: {
        label: 'Normal',
        description: 'Comfortable editing level',
        icon: '◐'
    },
    detail: {
        label: 'Detail',
        description: 'Precise timing work',
        icon: '⤡'
    }
};

/**
 * Create a zoom system instance for a specific zoom level
 */
export const createZoomSystem = (level: ZoomLevel): ZoomSystem => {
    const pixelsPerSecond = ZOOM_SCALES[level];

    return {
        level,
        pixelsPerSecond,

        getPixelFromTime: (seconds: number): number => {
            return seconds * pixelsPerSecond;
        },

        getTimeFromPixel: (pixel: number): number => {
            return pixel / pixelsPerSecond;
        },

        getKeyframeCount: (clipDuration: number): number => {
            // Use continuous zoom formula based on pixelsPerSecond
            // This matches the continuous zoom system behavior
            const baseCount = level === 'overview' ? 1 : level === 'normal' ? 3 : 5;
            const scale = pixelsPerSecond / ZOOM_SCALES[level];
            // Scale keyframe count based on clip duration and zoom level
            return Math.min(20, Math.max(1, Math.floor(baseCount * scale * Math.max(1, clipDuration / 3))));
        },

        getTimelineWidth: (totalDuration: number): number => {
            return totalDuration * pixelsPerSecond;
        }
    };
};

/**
 * Create a zoom system with custom pixels per second (for continuous zoom)
 * Maps pixelsPerSecond to the closest zoom level for metadata purposes
 */
export const createZoomSystemFromPixelsPerSecond = (pixelsPerSecond: number): ZoomSystem => {
    // Determine closest zoom level for metadata
    let level: ZoomLevel = 'normal';
    const overviewPPS = ZOOM_SCALES.overview;
    const normalPPS = ZOOM_SCALES.normal;
    const detailPPS = ZOOM_SCALES.detail;

    if (pixelsPerSecond <= (overviewPPS + normalPPS) / 2) {
        level = 'overview';
    } else if (pixelsPerSecond >= (normalPPS + detailPPS) / 2) {
        level = 'detail';
    } else {
        level = 'normal';
    }

    return {
        level,
        pixelsPerSecond,

        getPixelFromTime: (seconds: number): number => {
            return seconds * pixelsPerSecond;
        },

        getTimeFromPixel: (pixel: number): number => {
            return pixel / pixelsPerSecond;
        },

        getKeyframeCount: (clipDuration: number): number => {
            // Use level-based logic but scale based on actual pixelsPerSecond
            const baseCount = level === 'overview' ? 1 : level === 'normal' ? 3 : 5;
            const scale = pixelsPerSecond / ZOOM_SCALES[level];
            // Scale keyframe count based on clip duration and zoom level
            return Math.min(20, Math.max(1, Math.floor(baseCount * scale * Math.max(1, clipDuration / 3))));
        },

        getTimelineWidth: (totalDuration: number): number => {
            return totalDuration * pixelsPerSecond;
        }
    };
};

/**
 * Universal time-to-pixel conversion function
 * Used by both TimelineRuler and TimelineClip for perfect alignment
 */
export const timeToPixel = (seconds: number, zoomLevel: ZoomLevel): number => {
    return seconds * ZOOM_SCALES[zoomLevel];
};

/**
 * Universal pixel-to-time conversion function
 */
export const pixelToTime = (pixel: number, zoomLevel: ZoomLevel): number => {
    return pixel / ZOOM_SCALES[zoomLevel];
};

/**
 * Get appropriate time interval for ruler markers based on zoom level
 */
export const getTimeInterval = (zoomLevel: ZoomLevel, totalDuration: number): number => {
    switch (zoomLevel) {
        case 'overview':
            // For overview, show major intervals
            if (totalDuration <= 60) return 10;      // 10s for short clips
            if (totalDuration <= 300) return 30;     // 30s for 5min clips  
            if (totalDuration <= 1800) return 60;    // 1m for 30min clips
            return 300;                              // 5m for longer clips

        case 'normal':
            // For normal, show medium intervals
            if (totalDuration <= 30) return 5;       // 5s for very short
            if (totalDuration <= 120) return 10;     // 10s for 2min clips
            if (totalDuration <= 600) return 30;     // 30s for 10min clips
            return 60;                               // 1m for longer clips

        case 'detail':
            // For detail, show fine intervals
            if (totalDuration <= 10) return 1;       // 1s for very short
            if (totalDuration <= 60) return 5;       // 5s for 1min clips
            if (totalDuration <= 300) return 10;     // 10s for 5min clips
            return 30;                               // 30s for longer clips

        default:
            return 5;
    }
};

/**
 * Calculate optimal viewport scroll position to keep a time visible
 */
export const getScrollPositionForTime = (
    targetTime: number,
    zoomLevel: ZoomLevel,
    viewportWidth: number
): number => {
    const targetPixel = timeToPixel(targetTime, zoomLevel);
    return Math.max(0, targetPixel - viewportWidth / 2);
}; 