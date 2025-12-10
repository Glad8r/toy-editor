# Step-by-Step Debugging Guide for App Hangs

## Immediate Actions

### 1. Add Performance Monitoring

Add this to `SceneEditor.tsx`:

```typescript
import { performanceMonitor } from '../utils/performanceMonitor';

// In SceneEditor component, add:
useEffect(() => {
  // Log stats every 5 seconds
  const interval = setInterval(() => {
    performanceMonitor.logTopOffenders();
  }, 5000);
  
  return () => clearInterval(interval);
}, []);
```

### 2. Add Effect Tracking to Suspect Components

In `TimelineArea.tsx`, add at the start of each useEffect:

```typescript
import { usePerformanceMonitor } from '../../utils/performanceMonitor';

const TimelineArea: React.FC<TimelineAreaProps> = ({ virtualTimelineManager }) => {
  const { trackEffect } = usePerformanceMonitor('TimelineArea');
  
  useEffect(() => {
    trackEffect('zoom-sync');
    // ... rest of effect
  }, [vtm, virtualTimelineManager]);
}
```

### 3. Check Browser Performance Tab

1. Open Chrome DevTools (F12)
2. Go to **Performance** tab
3. Click **Record** (circle icon)
4. Use the app until it hangs
5. Click **Stop**
6. Look for:
   - **Long tasks** (red bars > 50ms)
   - **Excessive function calls** (tall stacks)
   - **Memory growth** (increasing heap size)

### 4. Check React DevTools Profiler

1. Install React DevTools extension
2. Open **Profiler** tab
3. Click **Record**
4. Use the app
5. Click **Stop**
6. Look for components with:
   - High render count
   - Long render times
   - Frequent re-renders

### 5. Monitor Console for Patterns

Watch for:
- Repeated log messages (indicates loops)
- Increasing numbers in logs
- Memory warnings
- Stack traces showing the same functions

### 6. Check Memory Tab

1. Chrome DevTools → **Memory** tab
2. Take heap snapshot
3. Use app for a while
4. Take another snapshot
5. Compare - look for:
   - Growing object counts
   - Detached DOM nodes
   - Event listeners not being cleaned up

## Most Likely Issues (Based on Code Analysis)

### Issue 1: Zoom Sync Loop (FIXED)
**Status**: Fixed with ref-based source tracking
**Location**: `TimelineArea.tsx` lines 134-176

### Issue 2: Cascading Timeline Change Notifications
**Risk**: High
**Problem**: When VTM calls `notifyTimelineChange()`, 5+ components all fire simultaneously
**Fix**: Throttle notifications in VTM

### Issue 3: Video Element Not Cleaning Up
**Risk**: Medium
**Location**: `VideoPreviewArea.tsx`
**Check**: Are video elements being properly disposed?

### Issue 4: Thumbnail Loading Loop
**Risk**: Medium  
**Location**: `SceneEditorInspector.tsx`
**Check**: Is `loadedNodeIdsRef` preventing re-loads correctly?

## Quick Test: Isolate the Problem

### Test 1: Disable Zoom Slider
Comment out the zoom slider in `VideoPlaybackPanel.tsx` and see if hangs stop.

### Test 2: Disable Timeline Sync
Comment out the sync effect in `TimelineArea.tsx` (lines 150-176) and see if hangs stop.

### Test 3: Disable Video Playback
Comment out video playback logic in `VideoPreviewArea.tsx` and see if hangs stop.

### Test 4: Check One Component at a Time
Temporarily return `null` from components one by one to isolate which component causes hangs.

## Emergency Fixes to Try

### Fix 1: Throttle VTM Notifications
In `VirtualTimelineManager.ts`, add throttling:

```typescript
private notifyTimelineChangeThrottled = (() => {
  let lastCall = 0;
  return () => {
    const now = Date.now();
    if (now - lastCall < 16) return; // ~60fps max
    lastCall = now;
    this.notifyTimelineChange();
  };
})();
```

### Fix 2: Debounce Zoom Updates
In `VideoPlaybackPanel.tsx`, debounce slider changes:

```typescript
const debouncedUpdate = useMemo(
  () => debounce((newZoomSystem: ZoomSystem) => {
    virtualTimeline.updateZoomSystem(newZoomSystem);
  }, 100),
  [virtualTimeline]
);
```

### Fix 3: Add Circuit Breaker
Add a max update count to prevent infinite loops:

```typescript
let updateCount = 0;
const MAX_UPDATES = 10;

if (updateCount++ > MAX_UPDATES) {
  console.error('🚨 Circuit breaker: Too many updates, stopping');
  return;
}
```

## What to Look For

1. **Infinite Loops**: Same function called repeatedly
2. **Memory Leaks**: Memory growing continuously
3. **Blocking Operations**: Long-running synchronous code
4. **Too Many Re-renders**: Component rendering 100+ times
5. **Event Listener Buildup**: Subscriptions not being cleaned up

## Reporting the Issue

When reporting, include:
1. Performance tab screenshot
2. Console logs (especially repeated ones)
3. React Profiler output
4. Memory snapshot comparison
5. Steps to reproduce
6. When it happens (on zoom? on playback? on drag?)

