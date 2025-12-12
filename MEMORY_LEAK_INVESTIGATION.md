# Memory Leak Investigation

## Immediate Actions

### 1. Cancel the Snapshot
- **Force close the snapshot dialog** (click Cancel or X)
- If that doesn't work, **force close DevTools** (F12 or close tab)
- If still stuck, **force close browser** (Task Manager → End Process)

### 2. Don't Take Another Snapshot
- Taking snapshots of huge memory can hang the browser
- Use alternative debugging methods instead

---

## Why Snapshot is Stuck

A snapshot taking 5+ minutes indicates:
1. **Massive memory growth** - possibly gigabytes (should be ~36MB)
2. **Event loop blocked** - snapshot process can't complete
3. **Memory corruption** - heap structure is broken
4. **Infinite allocation** - memory being allocated faster than snapshot can process

---

## Potential Memory Leak Sources

### 1. **Blob URL Leaks**
- Blob URLs created but never revoked
- Each video/image creates a blob URL
- If not cleaned up, they accumulate

### 2. **Video Element Leaks**
- Video elements created but not removed from DOM
- Event listeners attached but never removed
- Video sources not cleared

### 3. **Event Listener Leaks**
- Subscriptions to VTM callbacks never unsubscribed
- React event listeners accumulating
- Video event listeners (timeupdate, canplay, etc.)

### 4. **Canvas/ImageData Leaks**
- Canvas elements created for keyframes
- ImageData objects not released
- Video frames extracted but not cleaned up

### 5. **React State Accumulation**
- State updates creating new objects/arrays
- Old state not garbage collected
- Refs holding onto large objects

### 6. **Infinite Loop Creating Objects**
- Loop creating new objects continuously
- Each iteration allocates memory
- Never stops, memory grows infinitely

---

## Alternative Debugging Methods

### 1. **Task Manager (Lightweight)**
Chrome → Menu → More tools → Task Manager
- Watch memory usage in real-time
- Identify which tab/process is consuming memory
- Works even when DevTools is stuck

### 2. **Console Memory API**
```javascript
// In browser console (if accessible)
performance.memory.usedJSHeapSize / 1024 / 1024 // MB
performance.memory.totalJSHeapSize / 1024 / 1024 // MB
```

### 3. **Network Tab**
- Check for repeated network requests
- Look for blob URLs being created repeatedly
- Check if video/image loading is stuck in a loop

### 4. **Console Logging**
Add simple counters to track allocations:
```typescript
let blobUrlCount = 0;
let videoElementCount = 0;
// Log these periodically
```

---

## Code Patterns to Check

### Blob URL Creation
- Search for `URL.createObjectURL`
- Ensure every creation has a corresponding `URL.revokeObjectURL`
- Check cleanup functions in useEffect

### Video Element Creation
- Search for `document.createElement('video')`
- Ensure elements are removed from DOM
- Check that event listeners are removed

### VTM Subscriptions
- Check `onTimelineChange` subscriptions
- Ensure all subscriptions are unsubscribed
- Look for subscriptions in loops

### Keyframe Extraction
- Check if keyframe extraction is running infinitely
- Look for recursive calls in keyframe cache
- Verify canvas cleanup

---

## Quick Fixes to Try

1. **Disable keyframe generation** temporarily
2. **Disable video playback** temporarily
3. **Limit number of clips** that can be added
4. **Add memory limits** - prevent adding more clips if memory is high

