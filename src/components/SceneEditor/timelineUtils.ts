import { SceneEditorCell, MediaNode, NodeType } from '../../types/timeline';

// Default duration for images in seconds
export const DEFAULT_IMAGE_DURATION = 3;

/**
 * Calculate effective duration of a cell after trimming
 * This is the visible duration that should be used for timeline calculations
 */
export const getEffectiveDuration = (cell: SceneEditorCell): number => {
    const originalDuration = cell.duration || 0;
    const trimStart = cell.trimStart || 0;
    const trimEnd = cell.trimEnd || 0;
    return Math.max(0.1, originalDuration - trimStart - trimEnd);
};

/**
 * Calculate total duration of timeline from all clips
 */
export const calculateTotalDuration = (
    cells: SceneEditorCell[],
    nodes: any[]
): number => {
    if (!cells.length) return 0;

    let totalDuration = 0;

    cells.forEach(cell => {
        const node = nodes.find(n => n.id === cell.mediaNodeId);
        if (!node) return;

        // Use effective duration (accounting for trimming) instead of raw duration
        const effectiveDuration = getEffectiveDuration(cell);
        totalDuration += effectiveDuration;
    });

    return totalDuration;
};

/**
 * Get clip duration based on media type
 */
export const getClipDuration = (cell: SceneEditorCell, nodes: any[]): number => {
    // If cell has explicit duration, use it
    if (cell.duration !== undefined) {
        return cell.duration;
    }

    const node = nodes.find(n => n.id === cell.mediaNodeId);
    if (!node) {
        console.warn(`🔍 getClipDuration: Media node not found for cell ${cell.id}, mediaNodeId: ${cell.mediaNodeId}`);
        console.log('🔍 Available nodes:', nodes.map(n => ({ id: n.id, type: n.type })));
        return DEFAULT_IMAGE_DURATION;
    }

    if (node.type === NodeType.IMAGE) {
        return DEFAULT_IMAGE_DURATION;
    } else if (node.type === NodeType.VIDEO && node.data.duration) {
        return node.data.duration;
    } else {
        return DEFAULT_IMAGE_DURATION;
    }
};

/**
 * Get effective clip duration (visible duration after trimming)
 */
export const getEffectiveClipDuration = (cell: SceneEditorCell, nodes: any[]): number => {
    const originalDuration = getClipDuration(cell, nodes);
    return getEffectiveDuration(cell);
};

/**
 * Calculate start time for a cell based on its position and previous cells
 * Legacy function - kept for reference but migrateToTimeBasedLayout uses optimized approach
 */
export const calculateStartTime = (
    cell: SceneEditorCell,
    allCells: SceneEditorCell[],
    nodes: any[]
): number => {
    // ALWAYS recalculate startTime based on position and previous cells
    // This ensures no white space appears when opening scene editor with existing cells
    let startTime = 0;

    // Get all cells before this one (by position)
    const previousCells = allCells
        .filter(c => c.position < cell.position)
        .sort((a, b) => a.position - b.position);

    // Sum up effective durations of previous cells (accounting for trimming)
    previousCells.forEach(prevCell => {
        const effectiveDuration = getEffectiveDuration(prevCell);
        startTime += effectiveDuration;
    });

    return startTime;
};

/**
 * Migrate position-based cells to time-based layout
 * ALWAYS recalculates startTime to prevent white space bugs
 * Optimized to O(n) instead of O(n^2)
 */
export const migrateToTimeBasedLayout = (
    cells: SceneEditorCell[],
    nodes: any[]
): SceneEditorCell[] => {
    // Sort cells by position first to enable O(n) calculation
    const sortedCells = [...cells].sort((a, b) => a.position - b.position);
    
    let cumulativeTime = 0;
    
    return sortedCells.map(cell => {
        const duration = getClipDuration(cell, nodes);
        const startTime = cumulativeTime;
        
        // Update cumulative time for next cell
        const effectiveDuration = getEffectiveDuration({ ...cell, duration });
        cumulativeTime += effectiveDuration;

        return {
            ...cell,
            startTime,
            duration,
            // Keep position for backward compatibility
            position: cell.position
        };
    });
};

/**
 * Update timeline state with calculated values
 */
export const updateTimelineState = (
    sceneEditor: any,
    nodes: any[]
): any => {
    if (!sceneEditor?.cells) return sceneEditor;

    // Migrate cells to time-based layout
    const migratedCells = migrateToTimeBasedLayout(sceneEditor.cells, nodes);

    // Calculate total duration
    const totalDuration = calculateTotalDuration(migratedCells, nodes);

    return {
        ...sceneEditor,
        cells: migratedCells,
        totalDuration,
        currentTime: sceneEditor.currentTime || 0,
        zoom: sceneEditor.zoom || 1.0
    };
};

/**
 * Format time as MM:SS
 */
export const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Calculate appropriate time interval for ruler based on duration and zoom
 */
export const calculateTimeInterval = (duration: number, zoom: number = 1.0): number => {
    const scaledDuration = duration / zoom;

    if (scaledDuration <= 30) return 5;      // 5s intervals for short timelines
    if (scaledDuration <= 60) return 10;     // 10s intervals 
    if (scaledDuration <= 300) return 30;    // 30s intervals
    if (scaledDuration <= 600) return 60;    // 1m intervals
    return 120; // 2m intervals for very long timelines
};

/**
 * Validate timeline integrity
 */
export const validateTimelineIntegrity = (
    cells: SceneEditorCell[],
    nodes: any[]
): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];

    // Check for overlapping clips using effective duration (accounting for trimming)
    const sortedCells = [...cells].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));

    for (let i = 0; i < sortedCells.length - 1; i++) {
        const current = sortedCells[i];
        const next = sortedCells[i + 1];

        const currentEnd = (current.startTime || 0) + getEffectiveDuration(current); // ✅ Use effective duration
        const nextStart = next.startTime || 0;

        if (currentEnd > nextStart) {
            errors.push(`Clip ${current.id} overlaps with ${next.id}`);
        }
    }

    // Check for negative effective durations
    cells.forEach(cell => {
        const effectiveDuration = getEffectiveDuration(cell);
        if (effectiveDuration < 0) {
            errors.push(`Clip ${cell.id} has negative effective duration: ${effectiveDuration}s`);
        }
    });

    return {
        isValid: errors.length === 0,
        errors
    };
}; 