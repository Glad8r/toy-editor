# Video Export Data Structure (Server-Side Encoding)

## Overview

This document defines the data structure that the frontend will generate and send to the backend for video export. The backend will use this data to generate a complete video file from the timeline.

---

## Data Structure

### Root Export Request

```typescript
interface VideoExportRequest {
  // Export configuration
  config: ExportConfig;
  
  // Timeline structure
  timeline: TimelineData;
  
  // Media files (if uploading with request)
  mediaFiles?: MediaFileUpload[];
  
  // Alternative: Media references (if files already on server)
  mediaReferences?: MediaReference[];
}
```

### Export Configuration

```typescript
interface ExportConfig {
  // Output video settings
  resolution: {
    width: number;      // e.g., 1920
    height: number;     // e.g., 1080
    aspectRatio?: string; // e.g., "16:9" (optional, can be calculated)
  };
  
  frameRate: number;    // e.g., 30, 24, 60
  codec: string;        // e.g., "h264", "vp9", "hevc"
  bitrate?: number;     // Optional: bitrate in kbps (e.g., 5000)
  quality?: string;     // Optional: "low", "medium", "high", "ultra"
  
  // Audio settings (if audio tracks are added in future)
  audioCodec?: string;  // e.g., "aac", "mp3"
  audioBitrate?: number; // e.g., 128
  
  // Timeline behavior
  fillGaps: boolean;     // true = fill gaps with black frames, false = compact timeline
  gapFillColor?: string; // Color for gaps (default: "#000000")
  
  // Image handling
  defaultImageDuration?: number; // Duration for images if not specified (default: 3)
  
  // Output format
  format: string;       // e.g., "mp4", "webm", "mov"
  
  // Metadata (optional)
  metadata?: {
    title?: string;
    description?: string;
    author?: string;
  };
}
```

### Timeline Data

```typescript
interface TimelineData {
  // Timeline identifier (for tracking/logging)
  timelineId: string;
  
  // Total duration in seconds (calculated)
  totalDuration: number;
  
  // Clips in timeline order (sorted by startTime)
  clips: TimelineClip[];
  
  // Timeline metadata
  aspectRatio: string;  // e.g., "16:9" (from SceneEditor)
}
```

### Timeline Clip

```typescript
interface TimelineClip {
  // Clip identifier (from SceneEditorCell.id)
  clipId: string;
  
  // Timeline position
  startTime: number;    // Global start time in seconds (from SceneEditorCell.startTime)
  
  // Media reference
  mediaId: string;      // Reference to MediaNode.id (used to match with mediaFiles/mediaReferences)
  
  // Source media information
  mediaType: 'video' | 'image';
  
  // Trimming information
  trim: {
    start: number;      // Seconds to trim from beginning (from SceneEditorCell.trimStart)
    end: number;        // Seconds to trim from end (from SceneEditorCell.trimEnd)
  };
  
  // Clip duration (effective duration after trimming)
  duration: number;     // Calculated: originalDuration - trimStart - trimEnd
  
  // Source media duration (before trimming) - for validation
  sourceDuration: number; // Original media duration from MediaNode
  
  // Source media dimensions (for scaling/cropping if needed)
  sourceDimensions?: {
    width: number;
    height: number;
  };
  
  // Optional: Transform/effects (for future enhancements)
  transform?: {
    scale?: number;     // Scale factor (1.0 = original)
    position?: { x: number; y: number }; // Position offset
    opacity?: number;   // 0.0 to 1.0
  };
}
```

### Media File Upload

```typescript
interface MediaFileUpload {
  // Media identifier (matches TimelineClip.mediaId)
  mediaId: string;
  
  // File data
  file: File | Blob;    // Actual file data (for multipart/form-data)
  
  // Or base64 encoded (alternative format)
  // data?: string;     // Base64 encoded file data
  // mimeType?: string; // e.g., "video/mp4", "image/jpeg"
  
  // File metadata
  filename: string;     // Original filename
  mimeType: string;     // e.g., "video/mp4", "image/jpeg"
  size: number;         // File size in bytes
}
```

### Media Reference (Alternative)

```typescript
interface MediaReference {
  // Media identifier (matches TimelineClip.mediaId)
  mediaId: string;
  
  // Server-side reference
  serverUrl: string;   // URL or path to file on server
  storageKey?: string;  // Storage service key (S3, etc.)
  
  // File metadata (for validation)
  filename: string;
  mimeType: string;
  size: number;
  duration?: number;    // For videos
  dimensions?: {
    width: number;
    height: number;
  };
}
```

---

## Complete Example

### JSON Format (with base64 media)

```json
{
  "config": {
    "resolution": {
      "width": 1920,
      "height": 1080,
      "aspectRatio": "16:9"
    },
    "frameRate": 30,
    "codec": "h264",
    "bitrate": 5000,
    "quality": "high",
    "format": "mp4",
    "fillGaps": false,
    "defaultImageDuration": 3,
    "metadata": {
      "title": "My Timeline Export",
      "author": "User Name"
    }
  },
  "timeline": {
    "timelineId": "timeline-123456",
    "totalDuration": 45.5,
    "aspectRatio": "16:9",
    "clips": [
      {
        "clipId": "cell-1",
        "startTime": 0,
        "mediaId": "node-video-1",
        "mediaType": "video",
        "trim": {
          "start": 2.5,
          "end": 1.0
        },
        "duration": 10.5,
        "sourceDuration": 14.0,
        "sourceDimensions": {
          "width": 1920,
          "height": 1080
        }
      },
      {
        "clipId": "cell-2",
        "startTime": 10.5,
        "mediaId": "node-image-1",
        "mediaType": "image",
        "trim": {
          "start": 0,
          "end": 0
        },
        "duration": 3.0,
        "sourceDuration": 0,
        "sourceDimensions": {
          "width": 3840,
          "height": 2160
        }
      },
      {
        "clipId": "cell-3",
        "startTime": 13.5,
        "mediaId": "node-video-2",
        "mediaType": "video",
        "trim": {
          "start": 0,
          "end": 5.0
        },
        "duration": 32.0,
        "sourceDuration": 37.0,
        "sourceDimensions": {
          "width": 1280,
          "height": 720
        }
      }
    ]
  },
  "mediaFiles": [
    {
      "mediaId": "node-video-1",
      "filename": "video1.mp4",
      "mimeType": "video/mp4",
      "size": 15728640
    },
    {
      "mediaId": "node-image-1",
      "filename": "image1.jpg",
      "mimeType": "image/jpeg",
      "size": 524288
    },
    {
      "mediaId": "node-video-2",
      "filename": "video2.mp4",
      "mimeType": "video/mp4",
      "size": 31457280
    }
  ]
}
```

### Multipart Form Data Format

For large files, use `multipart/form-data`:

```
POST /api/export/video
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="exportRequest"
Content-Type: application/json

{
  "config": { ... },
  "timeline": { ... }
}

--boundary
Content-Disposition: form-data; name="mediaFiles"; filename="video1.mp4"
Content-Type: video/mp4

[binary file data]

--boundary
Content-Disposition: form-data; name="mediaFiles"; filename="image1.jpg"
Content-Type: image/jpeg

[binary file data]

--boundary--
```

---

## Frontend Generation Logic

### TypeScript Implementation

```typescript
// src/services/videoExportService.ts

interface ExportRequestBuilder {
  buildExportRequest(
    canvas: Canvas,
    virtualTimeline: VirtualTimelineManager,
    config: ExportConfig,
    uploadMedia: boolean // true = include files, false = use references
  ): Promise<VideoExportRequest>;
}

class VideoExportRequestBuilder implements ExportRequestBuilder {
  async buildExportRequest(
    canvas: Canvas,
    virtualTimeline: VirtualTimelineManager,
    config: ExportConfig,
    uploadMedia: boolean = true
  ): Promise<VideoExportRequest> {
    const sceneEditor = canvas.sceneEditor;
    if (!sceneEditor?.cells || sceneEditor.cells.length === 0) {
      throw new Error('Timeline is empty');
    }

    // Sort cells by startTime
    const sortedCells = [...sceneEditor.cells].sort(
      (a, b) => (a.startTime || 0) - (b.startTime || 0)
    );

    // Build timeline clips
    const clips: TimelineClip[] = [];
    const mediaFiles: MediaFileUpload[] = [];
    const mediaReferences: MediaReference[] = [];
    const mediaMap = new Map<string, MediaNode>();

    // Create media node lookup
    canvas.nodes.forEach(node => {
      if (node.type === NodeType.VIDEO || node.type === NodeType.IMAGE) {
        mediaMap.set(node.id, node as MediaNode);
      }
    });

    // Process each cell
    for (const cell of sortedCells) {
      const mediaNode = mediaMap.get(cell.mediaNodeId);
      if (!mediaNode) {
        console.warn(`Media node not found for cell ${cell.id}`);
        continue;
      }

      // Calculate effective duration
      const originalDuration = cell.duration || mediaNode.data.duration || 0;
      const trimStart = cell.trimStart || 0;
      const trimEnd = cell.trimEnd || 0;
      const effectiveDuration = Math.max(0.1, originalDuration - trimStart - trimEnd);

      // Build clip data
      const clip: TimelineClip = {
        clipId: cell.id,
        startTime: cell.startTime || 0,
        mediaId: mediaNode.id,
        mediaType: mediaNode.type === NodeType.VIDEO ? 'video' : 'image',
        trim: {
          start: trimStart,
          end: trimEnd,
        },
        duration: effectiveDuration,
        sourceDuration: originalDuration,
        sourceDimensions: mediaNode.data.width && mediaNode.data.height
          ? {
              width: mediaNode.data.width,
              height: mediaNode.data.height,
            }
          : undefined,
      };

      clips.push(clip);

      // Handle media file/reference
      if (uploadMedia) {
        // Option 1: Upload files with request
        if (mediaNode.data.file) {
          mediaFiles.push({
            mediaId: mediaNode.id,
            file: mediaNode.data.file,
            filename: mediaNode.data.file.name,
            mimeType: mediaNode.data.file.type,
            size: mediaNode.data.file.size,
          });
        } else {
          // Fallback: Convert blob URL to File/Blob
          // Note: This requires fetching the blob
          const blob = await this.fetchBlobFromUrl(mediaNode.data.url);
          mediaFiles.push({
            mediaId: mediaNode.id,
            file: blob,
            filename: `${mediaNode.id}.${this.getFileExtension(mediaNode.type)}`,
            mimeType: this.getMimeType(mediaNode.type),
            size: blob.size,
          });
        }
      } else {
        // Option 2: Use server-side references
        mediaReferences.push({
          mediaId: mediaNode.id,
          serverUrl: mediaNode.data.url, // Assuming URL points to server
          filename: mediaNode.label || mediaNode.id,
          mimeType: this.getMimeType(mediaNode.type),
          size: 0, // Unknown if not on server
          duration: mediaNode.data.duration,
          dimensions: mediaNode.data.width && mediaNode.data.height
            ? {
                width: mediaNode.data.width,
                height: mediaNode.data.height,
              }
            : undefined,
        });
      }
    }

    // Calculate total duration
    const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0);

    // Build timeline data
    const timeline: TimelineData = {
      timelineId: canvas.id || `timeline-${Date.now()}`,
      totalDuration,
      clips,
      aspectRatio: sceneEditor.aspectRatio || '16:9',
    };

    // Build export request
    const request: VideoExportRequest = {
      config,
      timeline,
      ...(uploadMedia ? { mediaFiles } : { mediaReferences }),
    };

    return request;
  }

  private async fetchBlobFromUrl(url: string): Promise<Blob> {
    const response = await fetch(url);
    return await response.blob();
  }

  private getFileExtension(type: NodeType): string {
    switch (type) {
      case NodeType.VIDEO:
        return 'mp4';
      case NodeType.IMAGE:
        return 'jpg';
      default:
        return 'bin';
    }
  }

  private getMimeType(type: NodeType): string {
    switch (type) {
      case NodeType.VIDEO:
        return 'video/mp4';
      case NodeType.IMAGE:
        return 'image/jpeg';
      default:
        return 'application/octet-stream';
    }
  }
}
```

---

## Backend Processing Flow

### Expected Backend Operations

1. **Receive Request**
   - Parse JSON payload or multipart form data
   - Validate structure
   - Extract media files if provided

2. **Validate Timeline**
   - Check all clips have valid media references
   - Verify trim values don't exceed source duration
   - Validate timeline ordering (no negative gaps)

3. **Process Each Clip**
   - For videos: Extract segment using `trim.start` and `trim.end`
   - For images: Convert to video frames with specified `duration`
   - Scale/resize to target resolution if needed

4. **Compose Timeline**
   - Concatenate clips in order based on `startTime`
   - Fill gaps with black frames if `fillGaps: true`
   - Or compact timeline if `fillGaps: false`

5. **Encode Final Video**
   - Apply codec settings
   - Set bitrate/quality
   - Generate output file

6. **Return Result**
   - Return download URL or file stream
   - Include job ID for status tracking

---

## API Endpoint Design

### REST API

```typescript
// POST /api/export/video
// Content-Type: multipart/form-data or application/json

interface ExportResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  estimatedTime?: number; // seconds
  downloadUrl?: string;     // Available when completed
  error?: string;          // If failed
}

// GET /api/export/status/:jobId
interface ExportStatusResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;       // 0-100
  estimatedTimeRemaining?: number; // seconds
  downloadUrl?: string;
  error?: string;
}
```

### WebSocket Alternative

```typescript
// WebSocket connection for real-time progress
interface ExportProgressMessage {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;        // 0-100
  currentStep?: string;    // e.g., "Processing clip 3/10"
  downloadUrl?: string;
  error?: string;
}
```

---

## Validation Rules

### Frontend Validation (Before Sending)

1. **Timeline Validation**
   - At least one clip exists
   - All clips have valid media references
   - No negative startTime values
   - Clips don't overlap (unless intentional)

2. **Trim Validation**
   - `trim.start >= 0`
   - `trim.end >= 0`
   - `trim.start + trim.end < sourceDuration`
   - `duration > 0.1` (minimum clip duration)

3. **Media Validation**
   - All referenced media files exist
   - Media types match (video/image)
   - File sizes are reasonable

4. **Config Validation**
   - Resolution is valid (width > 0, height > 0)
   - Frame rate is valid (1-120 fps)
   - Codec is supported
   - Format is supported

### Backend Validation (After Receiving)

1. **Structure Validation**
   - Required fields present
   - Data types correct
   - References resolve (mediaId matches mediaFiles/mediaReferences)

2. **Business Logic Validation**
   - Trim values don't exceed source duration
   - Timeline is sequential
   - Media files are valid (can be opened/decoded)

---

## Error Handling

### Frontend Error Cases

```typescript
interface ExportError {
  code: 'EMPTY_TIMELINE' | 'MISSING_MEDIA' | 'INVALID_TRIM' | 'UNSUPPORTED_FORMAT' | 'FILE_TOO_LARGE';
  message: string;
  details?: any;
}
```

### Backend Error Cases

```typescript
interface BackendExportError {
  code: 'INVALID_REQUEST' | 'MEDIA_NOT_FOUND' | 'ENCODING_FAILED' | 'STORAGE_ERROR' | 'TIMEOUT';
  message: string;
  jobId?: string;
  details?: any;
}
```

---

## Performance Considerations

### Request Size Limits

- **JSON-only**: ~10MB max (for base64 encoded small files)
- **Multipart**: No hard limit, but recommend chunking for >100MB
- **Streaming upload**: For very large files, use chunked upload API

### Optimization Strategies

1. **Media References**: Use `mediaReferences` instead of `mediaFiles` if files already on server
2. **Compression**: Compress JSON payload if large
3. **Chunked Upload**: Upload media files separately, then send timeline data
4. **Async Processing**: Return job ID immediately, process in background

---

## Future Extensions

### Additional Fields (for future features)

```typescript
interface TimelineClip {
  // ... existing fields ...
  
  // Transitions (future)
  transitionIn?: {
    type: 'fade' | 'crossfade' | 'wipe' | 'slide';
    duration: number;
  };
  transitionOut?: {
    type: 'fade' | 'crossfade' | 'wipe' | 'slide';
    duration: number;
  };
  
  // Effects (future)
  effects?: {
    colorGrading?: ColorGradingSettings;
    filters?: FilterSettings[];
    overlays?: OverlaySettings[];
  };
  
  // Audio (future)
  audioTracks?: AudioTrackSettings[];
}
```

---

## Summary

This data structure provides:

1. **Complete Timeline Information**: All clips with trimming, positioning, and ordering
2. **Media References**: Either file uploads or server-side references
3. **Export Configuration**: All settings needed for video generation
4. **Extensibility**: Easy to add future features (transitions, effects, audio)
5. **Validation**: Clear validation rules for both frontend and backend
6. **Error Handling**: Comprehensive error codes and messages

The backend can use this structure to:
- Validate the export request
- Process each clip with trimming
- Compose the final timeline
- Encode the output video
- Return the result to the user

