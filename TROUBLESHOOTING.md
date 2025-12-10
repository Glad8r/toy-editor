# Troubleshooting Performance Issues

## Quick Debugging Steps

### 1. Check Browser DevTools Performance Tab
- Open Chrome DevTools → Performance tab
- Click Record
- Reproduce the hang
- Stop recording
- Look for:
  - Long tasks (red bars)
  - Memory leaks (increasing heap size)
  - Excessive re-renders

### 2. Check Memory Usage
```javascript
// In Chrome DevTools Console, run:
performance.memory
// Check heapUsedLimit - if it's growing, you have a memory leak
```

### 3. Add Performance Logging
Add this to your component to track re-renders:
```javascript
useEffect(() => {
  console.log('Component rendered', new Date().toISOString());
  console.log('Nodes count:', nodes.length);
  console.log('Memory:', performance.memory?.usedJSHeapSize);
});
```

### 4. Check for Infinite Loops
Look for useEffect hooks with missing dependencies or circular dependencies:
- Check all `useEffect` hooks
- Ensure cleanup functions are properly defined
- Watch for state updates that trigger the same effect

### 5. Monitor Network Tab
- Check if there are pending requests
- Look for failed requests that might be retrying

### 6. Check Console for Warnings
- React warnings about missing keys
- Memory warnings
- Performance warnings

## Common Issues to Check

1. **Blob URL Memory Leaks**: Blob URLs not being revoked
2. **Infinite Re-renders**: useEffect dependencies causing loops
3. **Heavy Computations**: Video processing blocking main thread
4. **Event Listeners**: Not being cleaned up
5. **Large State Updates**: Causing cascading re-renders

