/**
 * TEMPORARY DEBUG: Clip Drop Debugger
 * 
 * This file contains strategic logging to identify where hangs occur during clip drops.
 * Add these logs to trace the execution flow and identify infinite loops or blocking operations.
 * 
 * REMOVE AFTER DEBUGGING
 */

// Global counter to detect infinite loops
let callCounter = 0;
const MAX_CALLS_BEFORE_BREAK = 100;

export const debugLog = (location: string, data?: any) => {
    callCounter++;
    
    // CRITICAL: Break out if we're in an infinite loop
    if (callCounter > MAX_CALLS_BEFORE_BREAK) {
        console.error(`🚨 INFINITE LOOP DETECTED at ${location}! Call count: ${callCounter}`);
        // Reset counter after warning
        if (callCounter > MAX_CALLS_BEFORE_BREAK * 2) {
            callCounter = 0;
            throw new Error(`INFINITE LOOP BREAK at ${location}`);
        }
    }
    
    const timestamp = performance.now().toFixed(2);
    console.log(`[${timestamp}ms] 📍 ${location}`, data !== undefined ? data : '');
};

export const resetCallCounter = () => {
    callCounter = 0;
};

/**
 * DEBUG POINTS TO ADD:
 * 
 * 1. TimelineCanvas.handleTrackDrop - Entry point
 *    Add: debugLog('TimelineCanvas.handleTrackDrop START', { nodeId, insertPosition });
 * 
 * 2. AddSceneEditorCellOperation.execute - Operation execution
 *    Add: debugLog('AddSceneEditorCellOperation.execute START', { cellId, position });
 *    Add: debugLog('AddSceneEditorCellOperation.execute END - calling updateCanvas');
 * 
 * 3. SimpleStateManager.updateCanvas - State update trigger
 *    Add: debugLog('SimpleStateManager.updateCanvas', { cellCount: newCanvas.sceneEditor?.cells?.length });
 * 
 * 4. SceneEditor component render - Top-level render
 *    Add: debugLog('SceneEditor RENDER');
 * 
 * 5. TimelineArea component render
 *    Add: debugLog('TimelineArea RENDER', { cellCount: migratedSceneEditor?.cells?.length });
 * 
 * 6. TimelineArea.useEffect (updateTimelineState)
 *    Add: debugLog('TimelineArea.useEffect updateTimelineState');
 * 
 * 7. TimelineCanvas component render
 *    Add: debugLog('TimelineCanvas RENDER', { cellCount: cellsToRender?.length });
 * 
 * 8. TimelineCanvas.onTimelineChange callback
 *    Add: debugLog('TimelineCanvas.onTimelineChange callback');
 * 
 * 9. TimelineClip component render
 *    Add: debugLog('TimelineClip RENDER', { cellId: cell.id });
 * 
 * 10. TimelineClip.useEffect (generateKeyframes)
 *     Add: debugLog('TimelineClip.useEffect generateKeyframes START', { cellId });
 *     Add: debugLog('TimelineClip.useEffect generateKeyframes END', { frameCount: frames.length });
 * 
 * 11. VTM.updateCells
 *     Add: debugLog('VTM.updateCells', { cellCount: cells.length });
 * 
 * 12. VTM.notifyTimelineChange
 *     Add: debugLog('VTM.notifyTimelineChange', { callbackCount: this.timelineChangeCallbacks.size });
 * 
 * EXPECTED FLOW:
 * 1. handleTrackDrop START
 * 2. AddSceneEditorCellOperation.execute START
 * 3. AddSceneEditorCellOperation.execute END
 * 4. SimpleStateManager.updateCanvas
 * 5. SceneEditor RENDER
 * 6. TimelineArea RENDER
 * 7. TimelineArea.useEffect updateTimelineState
 * 8. TimelineCanvas RENDER
 * 9. TimelineClip RENDER (for each clip)
 * 10. TimelineClip.useEffect generateKeyframes START
 * 11. VTM callbacks...
 * 12. TimelineClip.useEffect generateKeyframes END
 * 
 * IF YOU SEE:
 * - Same log repeated many times → INFINITE LOOP in that location
 * - Logs stop at certain point → BLOCKING OPERATION there
 * - VTM callbacks firing repeatedly → VTM callback cascade
 */

// Export a simple wrapper to wrap async functions with timing
export const debugAsync = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    debugLog(`${name} ASYNC START`);
    const start = performance.now();
    try {
        const result = await fn();
        debugLog(`${name} ASYNC END`, { duration: (performance.now() - start).toFixed(2) + 'ms' });
        return result;
    } catch (error) {
        debugLog(`${name} ASYNC ERROR`, error);
        throw error;
    }
};

