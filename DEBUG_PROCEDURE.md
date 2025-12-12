# Debug Procedure for Clip Drop Hang

## Summary
The app hangs when dropping the first clip onto the timeline. This is a Heisenbug - it disappears when performance recording is active.

## Debug Logging Added
Strategic console.log statements have been added to trace the execution flow:

### Expected Sequence (Happy Path)
```
🔵 [DEBUG] TimelineCanvas.handleTrackDrop START
🔵 [DEBUG] AddSceneEditorCellOperation.execute START
🔵 [DEBUG] AddSceneEditorCellOperation.execute END - calling updateCanvas
🔵 [DEBUG] SimpleStateManager.updateCanvas
🔵 [DEBUG] SceneEditor.useEffect updateTimeline
🔵 [DEBUG] VTM.updateTimeline
🔵 [DEBUG] TimelineArea.useEffect updateTimelineState
🔵 [DEBUG] TimelineClip.useEffect generateKeyframes START
🔵 [DEBUG] TimelineClip: Cache miss, starting pre-extraction (if not cached)
🔵 [DEBUG] TimelineClip: Pre-extraction complete, re-triggering (when done)
```

## How to Debug

### Step 1: Open Browser Console
1. Start the app (`npm run dev`)
2. Open Chrome DevTools → Console tab
3. Filter to show only `[DEBUG]` messages

### Step 2: Drop a Clip
1. Upload a video file to the media library
2. Drag the video thumbnail onto the timeline
3. Watch the console output

### Step 3: Analyze Output

**If you see logs repeating infinitely:**
```
🔵 [DEBUG] VTM.updateTimeline { cellCount: 1 }
🔵 [DEBUG] VTM.updateTimeline { cellCount: 1 }
🔵 [DEBUG] VTM.updateTimeline { cellCount: 1 }
...
```
→ **INFINITE LOOP** detected. The repeating log tells you WHERE the loop is.

**If logs stop at a certain point:**
```
🔵 [DEBUG] TimelineCanvas.handleTrackDrop START
🔵 [DEBUG] AddSceneEditorCellOperation.execute START
(nothing after this)
```
→ **BLOCKING OPERATION** in `AddSceneEditorCellOperation.execute`

**If you see very rapid timestamp progression:**
```
🔵 [DEBUG] ... timestamp: 100.00
🔵 [DEBUG] ... timestamp: 100.01
🔵 [DEBUG] ... timestamp: 100.02
```
→ **Synchronous cascade** - many operations happening without yielding

## Common Patterns to Look For

### Pattern 1: Circular State Updates
```
SceneEditor.useEffect updateTimeline
→ VTM.updateTimeline
→ (VTM callback fires)
→ (Component state update)
→ SceneEditor.useEffect updateTimeline ← LOOP!
```

### Pattern 2: Keyframe Recursion
```
TimelineClip.useEffect generateKeyframes START
TimelineClip: Cache miss, starting pre-extraction
TimelineClip: Pre-extraction complete, re-triggering
TimelineClip.useEffect generateKeyframes START ← might repeat
```

### Pattern 3: Missing Cleanup
If same log appears but with different timestamps after each action,
the cleanup function might not be preventing duplicate operations.

## Fixes to Try Based on Findings

### For Infinite Loops:
1. Add `useRef` guards to prevent re-running effects
2. Check if effect dependencies are stable (not creating new objects/arrays)
3. Add explicit "already running" flags

### For Blocking Operations:
1. Move heavy sync work to `setTimeout(0, () => {...})`
2. Use `requestAnimationFrame` for visual updates
3. Split large operations into chunks

### For Rapid Cascades:
1. Debounce callbacks
2. Use `unstable_batchedUpdates` for multiple state updates
3. Memoize computed values

## Cleanup After Debugging
Remove all `🔵 [DEBUG]` console.log statements from:
- `src/contexts/TimelineContext.tsx`
- `src/components/SceneEditor/SceneEditor.tsx`
- `src/components/SceneEditor/TimelineArea.tsx`
- `src/components/SceneEditor/TimelineCanvas.tsx`
- `src/components/SceneEditor/TimelineClip.tsx`
- `src/components/SceneEditor/VirtualTimelineManager.ts`
- `src/operations/SceneEditorOperations.ts`

Also delete:
- `src/debug/clipDropDebugger.ts`
- `DEBUG_PROCEDURE.md`

