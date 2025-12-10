# Debugging Guide for App Hangs

## Potential Issues Found

### 1. **Infinite Loop in Zoom Sync (CRITICAL)**
**Location**: `TimelineArea.tsx` lines 134-175

**Problem**: 
- When zoom slider moves → VTM updates → TimelineArea sync effect fires → updates zoomLevel → update effect fires → updates VTM → loop continues

**Fix**: Add a ref to track if zoom change came from external source (slider) vs internal (TimelineControls)

### 2. **Multiple Timeline Change Subscriptions**
Multiple components subscribe to `onTimelineChange`:
- TimelineArea (line 144)
- TimelineCanvas (line 72)
- VideoPlaybackPanel (line 37)
- VideoPreviewArea (line 53)
- TimelinePlayhead (line 37)

**Risk**: If VTM calls `notifyTimelineChange()` frequently, all these fire simultaneously, causing cascading re-renders.

### 3. **Memory Leaks**
Check for:
- Unclosed subscriptions (onTimelineChange, onCurrentTimeChange, onVideoPlayerInstruction)
- Blob URLs not being revoked
- Event listeners not being removed
- Video elements not being cleaned up

## Debugging Steps

### Step 1: Add Performance Monitoring

Add this to your main component or create a debug hook:

```typescript
// Add to SceneEditor.tsx or create usePerformanceMonitor.ts
useEffect(() => {
  let renderCount = 0;
  const interval = setInterval(() => {
    renderCount++;
    if (renderCount > 100) {
      console.warn('⚠️ High render count detected:', renderCount);
    }
  }, 1000);

  return () => clearInterval(interval);
}, []);
```

### Step 2: Add Effect Execution Tracking

Add counters to track how often effects run:

```typescript
// In TimelineArea.tsx
useEffect(() => {
  console.log('🔄 TimelineArea: Zoom sync effect running');
  // ... existing code
}, [vtm, virtualTimelineManager, zoomLevel]);
```

### Step 3: Check Browser Performance Tab

1. Open Chrome DevTools → Performance tab
2. Click Record
3. Use the app until it hangs
4. Stop recording
5. Look for:
   - Long tasks (red bars)
   - Excessive function calls
   - Memory leaks (increasing heap)

### Step 4: Check React DevTools Profiler

1. Install React DevTools extension
2. Open Profiler tab
3. Record while using app
4. Look for components re-rendering excessively

### Step 5: Add Console Logging to Track Loops

Add logs to identify what's triggering updates:

```typescript
// In VirtualTimelineManager.ts updateZoomSystem
updateZoomSystem(newZoomSystem: ZoomSystem): void {
  console.log('🔍 VTM: Updating zoom system', {
    level: newZoomSystem.level,
    pps: newZoomSystem.pixelsPerSecond,
    stack: new Error().stack
  });
  // ... rest of code
}
```

### Step 6: Monitor Subscription Counts

Add logging to see how many subscriptions are active:

```typescript
// In VirtualTimelineManager.ts
private notifyTimelineChange(): void {
  console.log('📢 VTM: Notifying', this.timelineChangeCallbacks.length, 'subscribers');
  // ... rest of code
}
```

## Quick Fixes to Try

### Fix 1: Prevent Zoom Sync Loop

Add a ref to track zoom change source:

```typescript
const zoomChangeSourceRef = useRef<'internal' | 'external'>('internal');

// In sync effect, check source before updating
if (zoomChangeSourceRef.current === 'external') {
  // Don't update VTM, just sync local state
  zoomChangeSourceRef.current = 'internal';
  return;
}
```

### Fix 2: Throttle Timeline Change Notifications

In VirtualTimelineManager, throttle notifications:

```typescript
private notifyTimelineChangeThrottled = throttle(() => {
  this.notifyTimelineChange();
}, 16); // ~60fps
```

### Fix 3: Debounce Zoom Updates

Debounce zoom slider changes to prevent rapid updates:

```typescript
const debouncedZoomUpdate = useMemo(
  () => debounce((newZoomSystem: ZoomSystem) => {
    virtualTimeline.updateZoomSystem(newZoomSystem);
  }, 50),
  [virtualTimeline]
);
```

## Memory Leak Checks

### Check 1: Subscriptions
```typescript
// Add to component cleanup
useEffect(() => {
  return () => {
    console.log('🧹 Cleaning up subscriptions');
    // All subscriptions should be unsubscribed here
  };
}, []);
```

### Check 2: Blob URLs
```typescript
// Search for all URL.createObjectURL calls
// Ensure they're revoked when no longer needed
```

### Check 3: Event Listeners
```typescript
// Search for addEventListener
// Ensure removeEventListener in cleanup
```

## Tools to Use

1. **React DevTools Profiler** - See what's re-rendering
2. **Chrome Performance Tab** - Find blocking operations
3. **Chrome Memory Tab** - Detect memory leaks
4. **Console with stack traces** - Track update chains
5. **Why Did You Render** (npm package) - Debug unnecessary re-renders

## Most Likely Culprits

Based on code analysis:
1. **Zoom sync loop** (TimelineArea lines 134-175)
2. **Cascading timeline change notifications** (multiple subscribers)
3. **Video element not cleaning up** (VideoPreviewArea)
4. **Thumbnail loading loop** (SceneEditorInspector)

