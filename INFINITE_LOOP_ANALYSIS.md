# Infinite Loop Analysis

## Problem: Event Loop Blocked (Not Memory Leak)

**Symptoms:**
- Memory stays at 406KB (very small - NOT a memory leak)
- Tab hangs completely
- Heap snapshot stuck (can't serialize because event loop blocked)
- CPU likely at 100%

**Root Cause:** Infinite loop in React effects causing synchronous callback storms

---

## The Loop Chain

### SceneEditor.tsx → TimelineArea.tsx → VirtualTimelineManager → SceneEditor.tsx

1. **SceneEditor.tsx line 40:**
   ```typescript
   const virtualTimelineManager = useMemo(() => {
       // Depends on migratedSceneEditor?.cells
       return createVirtualTimelineManager(zoomSystem, migratedSceneEditor.cells);
   }, [migratedSceneEditor?.cells]);
   ```

2. **TimelineArea.tsx line 110:**
   ```typescript
   const vtm = useMemo(() => {
       // Creates VTM from sceneEditor?.cells
       return createVirtualTimelineManager(zoomSystem, initialCells);
   }, [virtualTimelineManager, zoomSystem, sceneEditor?.cells?.length]);
   ```

3. **TimelineArea.tsx line 116:**
   ```typescript
   useEffect(() => {
       const updated = updateTimelineState(sceneEditor, nodes);
       setMigratedSceneEditor(updated); // ← Updates migratedSceneEditor
       vtm.updateTimeline(updated.cells); // ← Triggers callbacks
   }, [sceneEditor, nodes]);
   ```

4. **VirtualTimelineManager.ts line 253:**
   ```typescript
   updateTimeline(cells: SceneEditorCell[]): void {
       // ...
       this.notifyTimelineChange(); // ← Triggers callbacks
   }
   ```

5. **SceneEditor.tsx line 45:**
   ```typescript
   useEffect(() => {
       const unsubscribe = virtualTimelineManager.onTimelineChange(() => {
           currentZoomSystemRef.current = virtualTimelineManager.getZoomSystem();
       });
   }, [virtualTimelineManager]);
   ```

6. **Back to step 1** - `migratedSceneEditor` changed → `virtualTimelineManager` recreated → loop continues

---

## Additional Issues

### 1. `updateTimelineState` is Synchronous and Heavy
- Calls `migrateToTimeBasedLayout` which calls `calculateStartTime` for each cell
- Has console.logs in hot path
- If many cells, this blocks the event loop

### 2. `setMigratedSceneEditor` Triggers Multiple Re-renders
- Updates state
- Causes `virtualTimelineManager` to be recreated
- Causes `vtm` to be recreated
- Causes effects to re-run

### 3. VTM Callbacks Execute Synchronously (Even with Debounce)
- Debounce helps, but if loop is fast enough, callbacks still execute
- Each callback might trigger state updates
- State updates trigger more effects

---

## Solutions

### Solution 1: Break the Circular Dependency
- Don't let `SceneEditor` depend on `migratedSceneEditor`
- Don't let `TimelineArea` update `migratedSceneEditor` if it came from `SceneEditor`

### Solution 2: Prevent State Updates During Updates
- Use refs to track if update is in progress
- Skip updates if already updating

### Solution 3: Make `updateTimelineState` Truly Async
- Use `requestIdleCallback` or longer `setTimeout` delays
- Break up work into smaller chunks

### Solution 4: Disable Callbacks During Updates
- Add a flag to VTM to disable notifications during bulk updates
- Re-enable after update completes

