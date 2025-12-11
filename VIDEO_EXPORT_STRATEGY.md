# Video Export Strategy

## Overview

This document outlines the strategy for implementing video export functionality that combines all timeline clips into a single video file. The export will respect trimming, clip ordering, and handle both video and image media types.

---

## Current State

### Existing Infrastructure

1. **Export Button**: Located in `src/components/SceneEditor/SceneEditorHeader.tsx`
   - Currently shows placeholder alert
   - Needs to be connected to export service

2. **Video Export Service**: `src/services/videoExportService.ts`
   - Currently a stub with placeholder implementation
   - Needs full implementation

3. **Timeline Data Structure**:
   - `SceneEditorCell`: Contains `mediaNodeId`, `startTime`, `duration`, `trimStart`, `trimEnd`
   - `MediaNode`: Contains blob URL (`data.url`), original `File` reference (`data.file`), and metadata
   - `VirtualTimelineManager`: Provides timeline state and clip ordering

4. **Media Access**:
   - Media files stored as blob URLs
   - Original `File` objects may be available in `MediaNode.data.file`
   - `mediaService` handles blob URL management

---

## Technical Approach

### Option 1: Browser-Based Encoding (Recommended for MVP)

**Technology**: WebCodecs API + Canvas API

**Pros**:
- No external dependencies
- Works entirely in browser
- No server required
- Good for MVP/prototype

**Cons**:
- Limited codec support (H.264, VP8/VP9)
- Performance may be slower for long videos
- Browser compatibility considerations
- Memory intensive for large exports

**Implementation Steps**:

1. **Extract Timeline Data**
   ```typescript
   // Get sorted cells from VirtualTimelineManager or SceneEditor
   const cells = virtualTimeline.getTimelineState().cells
     .sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
   ```

2. **Process Each Clip**
   - For each `SceneEditorCell`:
     - Load source media (video or image)
     - Apply trimming: `trimStart` and `trimEnd`
     - Extract segment: `[trimStart, duration - trimEnd]`
     - Decode frames at target frame rate (e.g., 30fps)
     - Render to canvas with consistent dimensions (16:9)

3. **Compose Timeline**
   - Create canvas at target resolution (e.g., 1920x1080)
   - For each clip segment:
     - Render frames sequentially
     - Maintain timeline order based on `startTime`
     - Handle gaps (if any) with black frames

4. **Encode Output**
   - Use `VideoEncoder` (WebCodecs API)
   - Configure codec (H.264 recommended)
   - Set bitrate, frame rate, resolution
   - Stream encoded chunks to final blob

5. **Download Result**
   - Create blob from encoded chunks
   - Trigger browser download via `<a>` element

**Key Functions Needed**:
- `extractClipSegment(mediaUrl, trimStart, trimEnd, duration)`: Extract trimmed portion
- `decodeVideoFrames(videoElement, startTime, endTime)`: Decode frames from video
- `renderImageToFrames(imageUrl, duration)`: Convert image to video frames
- `composeTimeline(clipSegments)`: Combine all segments
- `encodeVideo(frames, config)`: Encode final video

---

### Option 2: FFmpeg.wasm (More Robust)

**Technology**: FFmpeg.wasm (WebAssembly port of FFmpeg)

**Pros**:
- Full FFmpeg feature set
- Better codec support
- More reliable encoding
- Better performance for complex operations

**Cons**:
- Large bundle size (~20MB+)
- Requires WASM support
- More complex setup
- Slower initial load

**Implementation Steps**:

1. **Install FFmpeg.wasm**
   ```bash
   npm install @ffmpeg/ffmpeg @ffmpeg/util
   ```

2. **Build Command List**
   - For each clip, create FFmpeg filter command:
     - Video: `[0:v]trim=start=X:end=Y,setpts=PTS-STARTPTS[v0]`
     - Image: `[0:v]loop=loop=-1:size=1:start=0,setpts=PTS/30/TB,scale=1920:1080[img0]`
   - Concatenate: `[v0][v1][img0]concat=n=3:v=1[outv]`

3. **Execute FFmpeg**
   - Load FFmpeg.wasm
   - Write input files to virtual filesystem
   - Run FFmpeg command
   - Read output from virtual filesystem

4. **Download Result**

**Key Functions Needed**:
- `buildFFmpegCommand(cells, nodes)`: Generate FFmpeg filter graph
- `loadMediaToFFmpeg(ffmpeg, mediaUrl, filename)`: Write media to virtual FS
- `executeFFmpeg(ffmpeg, command)`: Run encoding
- `extractOutputBlob(ffmpeg)`: Get final video

---

### Option 3: Server-Side Encoding (Production)

**Technology**: Backend service (Node.js + FFmpeg, or cloud service)

**Pros**:
- Best performance
- No client-side limitations
- Can handle large files
- Professional quality encoding

**Cons**:
- Requires backend infrastructure
- Network latency
- Server costs
- More complex architecture

**Implementation Steps**:

1. **Prepare Export Request**
   - Serialize timeline data (cells, media references)
   - Upload media files to server (if not already there)
   - Send export job request

2. **Server Processing**
   - Download/access source media
   - Apply trimming and composition
   - Encode final video
   - Store result

3. **Client Polling/WebSocket**
   - Poll for export completion
   - Download result when ready

---

## Recommended Implementation Plan

### Phase 1: MVP with WebCodecs (Option 1)

**Goal**: Basic export functionality working in browser

**Steps**:

1. **Create Export Service Structure**
   ```typescript
   // src/services/videoExportService.ts
   interface ExportConfig {
     resolution: { width: number; height: number };
     frameRate: number;
     codec: string;
     bitrate: number;
   }
   
   interface ClipSegment {
     mediaUrl: string;
     mediaType: 'video' | 'image';
     trimStart: number;
     trimEnd: number;
     duration: number;
     startTime: number; // Timeline position
   }
   ```

2. **Implement Core Functions**
   - `prepareClipSegments(cells, nodes)`: Convert timeline to export segments
   - `extractVideoSegment(videoUrl, trimStart, trimEnd)`: Extract trimmed video
   - `convertImageToVideo(imageUrl, duration)`: Convert image to video frames
   - `composeVideoSegments(segments, config)`: Combine all segments
   - `encodeVideoWithWebCodecs(frames, config)`: Encode final video

3. **Integrate with UI**
   - Update `SceneEditorHeader.handleExport()`
   - Add progress indicator
   - Show export status (preparing, encoding, complete)
   - Trigger download on completion

4. **Error Handling**
   - Handle missing media files
   - Handle unsupported codecs
   - Handle memory limitations
   - Provide user feedback

**Estimated Complexity**: Medium-High
**Time Estimate**: 2-3 weeks

---

### Phase 2: Enhanced Features

**After MVP is working**:

1. **Export Settings Dialog**
   - Resolution selection (720p, 1080p, 4K)
   - Frame rate selection (24, 30, 60 fps)
   - Codec selection (H.264, VP9)
   - Quality/bitrate settings

2. **Progress Tracking**
   - Show progress bar
   - Show current step (processing clip 3/10, encoding...)
   - Allow cancellation

3. **Optimization**
   - Parallel processing where possible
   - Memory management for large exports
   - Chunked encoding to prevent memory issues

4. **Image Handling**
   - Configurable image duration
   - Transitions between clips (fade, crossfade)
   - Image scaling/cropping options

---

## Implementation Details

### Data Flow

```
User clicks Export
  ↓
SceneEditorHeader.handleExport()
  ↓
videoExportService.exportTimeline(canvas, virtualTimeline)
  ↓
1. Extract timeline data (cells + nodes)
2. Sort cells by startTime
3. Prepare clip segments (apply trimming)
4. Process each segment:
   - Video: Extract trimmed portion
   - Image: Convert to video frames
5. Compose timeline (sequential rendering)
6. Encode to final video
7. Create download blob
  ↓
Trigger browser download
```

### Key Considerations

1. **Trimming Logic**
   - `trimStart`: Seconds to skip from beginning
   - `trimEnd`: Seconds to skip from end
   - Effective duration: `duration - trimStart - trimEnd`
   - Extract segment: `[trimStart, duration - trimEnd]`

2. **Timeline Gaps**
   - If `startTime` of next clip > `endTime` of previous clip, fill with black frames
   - Or: Compact timeline (no gaps) - depends on design decision

3. **Image Duration**
   - Use `cell.duration` if set
   - Default to 3 seconds (as per `DEFAULT_IMAGE_DURATION`)
   - Render image as static video frames

4. **Resolution**
   - Default: 1920x1080 (16:9)
   - Match aspect ratio of first video clip
   - Or: Use `SceneEditor.aspectRatio` setting

5. **Frame Rate**
   - Default: 30 fps
   - Match source video frame rate if possible
   - Or: User-configurable

6. **Memory Management**
   - Process clips sequentially (not all at once)
   - Release blob URLs after processing
   - Use streaming/chunked encoding
   - Show memory warnings for large exports

---

## Code Structure

### New Files to Create

1. **`src/services/videoExportService.ts`** (main export service)
   - `exportTimeline(canvas, virtualTimeline, config)`: Main export function
   - `prepareClipSegments(cells, nodes)`: Timeline preparation
   - `processVideoSegment(...)`: Video processing
   - `processImageSegment(...)`: Image processing
   - `composeTimeline(...)`: Composition logic
   - `encodeVideo(...)`: Encoding logic

2. **`src/services/videoEncoder.ts`** (WebCodecs wrapper)
   - `createVideoEncoder(config)`: Encoder setup
   - `encodeFrame(frame, timestamp)`: Frame encoding
   - `finalizeEncoding()`: Get final blob

3. **`src/components/SceneEditor/ExportDialog.tsx`** (optional UI)
   - Export settings form
   - Progress indicator
   - Cancel button

### Files to Modify

1. **`src/components/SceneEditor/SceneEditorHeader.tsx`**
   - Replace `handleExport()` with actual implementation
   - Connect to export service
   - Show progress/status

2. **`src/services/videoExportService.ts`** (existing stub)
   - Replace stub with full implementation

---

## Testing Strategy

1. **Unit Tests**
   - Test trimming logic
   - Test timeline composition
   - Test image-to-video conversion

2. **Integration Tests**
   - Test full export flow
   - Test with various clip combinations
   - Test with trimmed clips

3. **Manual Testing**
   - Single video clip
   - Multiple video clips
   - Mixed video + image clips
   - Trimmed clips
   - Long timeline (>5 minutes)
   - High resolution exports

---

## Browser Compatibility

### WebCodecs API Support
- Chrome/Edge: ✅ (Full support)
- Firefox: ⚠️ (Partial support, may need fallback)
- Safari: ❌ (Not supported, need alternative)

### Fallback Strategy
- Detect WebCodecs support
- Fall back to FFmpeg.wasm if not available
- Or: Show message to use Chrome/Edge

---

## Performance Considerations

1. **Large Files**
   - Process in chunks
   - Show progress
   - Allow cancellation
   - Consider Web Workers for encoding

2. **Memory**
   - Don't load all clips into memory
   - Process sequentially
   - Release resources promptly

3. **User Experience**
   - Show progress indicator
   - Allow background processing
   - Don't block UI thread

---

## Future Enhancements

1. **Transitions**: Fade, crossfade, wipe between clips
2. **Effects**: Color grading, filters, overlays
3. **Audio**: Mix audio tracks, add background music
4. **Titles/Text**: Add text overlays, titles, captions
5. **Multiple Tracks**: Support multiple video/audio tracks
6. **Cloud Export**: Server-side encoding for better performance
7. **Preview**: Preview export before final encoding

---

## References

- [WebCodecs API](https://www.w3.org/TR/webcodecs/)
- [FFmpeg.wasm](https://ffmpegwasm.netlify.app/)
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [Media Source Extensions](https://developer.mozilla.org/en-US/docs/Web/API/Media_Source_Extensions_API)

---

## Decision Points

1. **MVP Approach**: WebCodecs (Option 1) recommended for initial implementation
2. **Image Duration**: Use `cell.duration` or default 3 seconds
3. **Timeline Gaps**: Fill with black frames or compact (no gaps)
4. **Resolution**: Default 1080p, or match first video clip
5. **Frame Rate**: Default 30fps, or match source videos
6. **Progress UI**: Inline progress bar or modal dialog

---

## Next Steps

1. ✅ Review and approve strategy
2. ⏳ Implement Phase 1 (MVP with WebCodecs)
3. ⏳ Test with various timeline configurations
4. ⏳ Add progress tracking and error handling
5. ⏳ Consider Phase 2 enhancements based on user feedback

