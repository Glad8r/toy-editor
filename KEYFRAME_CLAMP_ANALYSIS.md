# Analysis: Removing Keyframe Count Clamp

## Current Behavior
- Maximum keyframes: **10** (clamped by `Math.min(10, ...)`)
- Formula: `baseCount * scale * Math.max(1, clipDuration / 3)`

## Example: 72-second video at 120px/s
- **With clamp**: 10 keyframes
- **Without clamp**: 120 keyframes (5 * 1 * 24 = 120)

---

## Potential Issues

### 1. **Memory & Storage Issues** ⚠️ CRITICAL

**Per Keyframe:**
- Size: ~10-20KB per thumbnail (160x90px, quality 0.7, data URL)
- Storage: Stored in localStorage cache

**Impact:**
- 120 keyframes = **1.2-2.4MB** per video
- With 10 videos: **12-24MB** (exceeds typical localStorage limit of 5-10MB)
- Browser memory: Each `<img>` element holds decoded image data in memory
- 120 images × ~50KB decoded = **6MB per clip** in browser memory

**Risk Level**: 🔴 **HIGH** - Can cause localStorage quota exceeded errors

---

### 2. **DOM Performance** ⚠️ HIGH

**Current Rendering:**
- Each keyframe = 1 `<div>` + 1 `<img>` element
- 120 keyframes = **240 DOM elements per clip**

**Impact:**
- With 10 clips: **2,400 DOM elements** just for keyframes
- Browser must:
  - Layout 2,400+ elements
  - Paint 2,400+ images
  - Handle scroll/zoom updates for all elements
- **Result**: Laggy scrolling, slow zoom, UI freezes

**Risk Level**: 🔴 **HIGH** - Significant performance degradation

---

### 3. **Extraction Time** ⚠️ MEDIUM

**Process:**
- Each keyframe requires:
  1. Video seek to timestamp
  2. Canvas draw operation
  3. Canvas.toDataURL() conversion
  4. Memory allocation

**Impact:**
- 10 keyframes: ~2-5 seconds extraction
- 120 keyframes: **24-60 seconds** extraction time
- Blocks UI during extraction (if not properly async)
- User waits longer for timeline to be usable

**Risk Level**: 🟡 **MEDIUM** - Poor UX but manageable with async

---

### 4. **UI/UX Clutter** ⚠️ MEDIUM

**Visual Issues:**
- At high zoom, keyframes become very narrow
- 120 keyframes in a 72s clip at 120px/s = **8,640px wide**
- Each keyframe = **72px wide** (if evenly distributed)
- But at normal viewport (1920px), clip might be 200-500px wide
- **Result**: Each keyframe = **1.6-4px wide** - too small to see detail

**Impact:**
- Thumbnails become unreadable
- Visual noise instead of useful preview
- Defeats the purpose of keyframes (visual timeline navigation)

**Risk Level**: 🟡 **MEDIUM** - Degrades UX but not breaking

---

### 5. **Cache Management** ⚠️ MEDIUM

**Current Cache:**
- Stores keyframes for 3 zoom levels (overview, normal, detail)
- With clamp: 3 × 10 = **30 keyframes max per video**
- Without clamp: 3 × 120 = **360 keyframes per video**

**Impact:**
- Cache size grows 12×
- Cache clearing becomes more critical
- More cache misses if storage is full
- Cache invalidation more expensive

**Risk Level**: 🟡 **MEDIUM** - Manageable with better cache strategy

---

### 6. **Network/Initial Load** ⚠️ LOW

**If keyframes loaded from URLs:**
- 120 HTTP requests per video (if not cached)
- Network overhead
- But: Currently uses data URLs (blob URLs), so this is less relevant

**Risk Level**: 🟢 **LOW** - Not a major concern with current implementation

---

## Recommendations

### Option 1: **Keep Clamp, Increase Limit** ✅ RECOMMENDED
```typescript
return Math.min(20, Math.max(1, Math.floor(...))); // Increase to 20
```
- Balances detail with performance
- Still manageable memory/DOM footprint
- Better visual preview for long clips

### Option 2: **Dynamic Clamp Based on Clip Width** ✅ GOOD
```typescript
const clipWidth = zoomSystem.getPixelFromTime(clipDuration);
const maxKeyframes = Math.min(20, Math.max(1, Math.floor(clipWidth / 50))); // 1 keyframe per 50px
return Math.min(maxKeyframes, Math.max(1, Math.floor(...)));
```
- Adapts to actual visible width
- Prevents tiny unreadable thumbnails
- Better performance for narrow clips

### Option 3: **Remove Clamp, Add Virtualization** ⚠️ COMPLEX
- Only render visible keyframes
- Virtual scrolling for keyframes
- Requires significant refactoring
- Best performance but most work

### Option 4: **Remove Clamp, Accept Issues** ❌ NOT RECOMMENDED
- Will cause performance problems
- localStorage quota issues
- Poor UX with unreadable thumbnails

---

## Conclusion

**Removing the clamp without other changes is NOT recommended** due to:
1. Memory/storage limits (localStorage quota)
2. DOM performance (too many elements)
3. UI clutter (unreadable thumbnails)

**Better approach**: Increase clamp to 15-20, or implement dynamic clamping based on visible width.

