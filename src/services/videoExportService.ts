/**
 * Video Export Service
 * 
 * Generates export data structure for server-side video encoding.
 * Currently exports JSON file for download. In the future, this will send
 * the data to a backend API for video processing.
 */

import { Canvas, MediaNode, NodeType } from '../types/timeline';
import { getClipDuration } from '../components/SceneEditor/timelineUtils';

// Export data structure types (matching EXPORT_DATA_STRUCTURE.md)
export interface ExportConfig {
  resolution: {
    width: number;
    height: number;
    aspectRatio?: string;
  };
  frameRate: number;
  codec: string;
  bitrate?: number;
  quality?: string;
  audioCodec?: string;
  audioBitrate?: number;
  fillGaps: boolean;
  gapFillColor?: string;
  defaultImageDuration?: number;
  format: string;
  metadata?: {
    title?: string;
    description?: string;
    author?: string;
  };
}

export interface TimelineClip {
  clipId: string;
  startTime: number;
  mediaId: string;
  mediaType: 'video' | 'image';
  trim: {
    start: number;
    end: number;
  };
  duration: number;
  sourceDuration: number;
  sourceDimensions?: {
    width: number;
    height: number;
  };
  opacity?: number; // Opacity value 0-100 (default: 100)
}

export interface TimelineData {
  timelineId: string;
  totalDuration: number;
  clips: TimelineClip[];
  aspectRatio: string;
}

export interface MediaFileUpload {
  mediaId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface MediaReference {
  mediaId: string;
  serverUrl: string;
  storageKey?: string;
  filename: string;
  mimeType: string;
  size: number;
  duration?: number;
  dimensions?: {
    width: number;
    height: number;
  };
}

export interface VideoExportRequest {
  config: ExportConfig;
  timeline: TimelineData;
  mediaFiles?: MediaFileUpload[];
  mediaReferences?: MediaReference[];
}

/**
 * Default export configuration
 */
const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  resolution: {
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
  },
  frameRate: 30,
  codec: 'h264',
  bitrate: 5000,
  quality: 'high',
  format: 'mp4',
  fillGaps: false,
  defaultImageDuration: 3,
  metadata: {
    title: 'Timeline Export',
  },
};

/**
 * Build export request from canvas data
 */
export async function buildExportRequest(
  canvas: Canvas,
  config?: Partial<ExportConfig>
): Promise<VideoExportRequest> {
  const sceneEditor = canvas.sceneEditor;
  if (!sceneEditor?.cells || sceneEditor.cells.length === 0) {
    throw new Error('Timeline is empty. Add clips to the timeline before exporting.');
  }

  // Merge with default config
  const exportConfig: ExportConfig = {
    ...DEFAULT_EXPORT_CONFIG,
    ...config,
    resolution: {
      ...DEFAULT_EXPORT_CONFIG.resolution,
      ...config?.resolution,
    },
  };

  // Sort cells by startTime
  const sortedCells = [...sceneEditor.cells].sort(
    (a, b) => (a.startTime || 0) - (b.startTime || 0)
  );

  // Create media node lookup map
  const mediaMap = new Map<string, MediaNode>();
  canvas.nodes.forEach((node) => {
    if (node.type === NodeType.VIDEO || node.type === NodeType.IMAGE) {
      mediaMap.set(node.id, node as MediaNode);
    }
  });

  // Build timeline clips and collect media file info
  const clips: TimelineClip[] = [];
  const mediaFiles: MediaFileUpload[] = [];

  for (const cell of sortedCells) {
    const mediaNode = mediaMap.get(cell.mediaNodeId);
    if (!mediaNode) {
      console.warn(`Media node not found for cell ${cell.id}, skipping...`);
      continue;
    }

    // Get original duration from cell or media node
    const originalDuration = getClipDuration(cell, canvas.nodes);
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
      sourceDimensions:
        mediaNode.data.width && mediaNode.data.height
          ? {
              width: mediaNode.data.width,
              height: mediaNode.data.height,
            }
          : undefined,
      // Include opacity if set (defaults to 100 if not specified)
      opacity: cell.opacity !== undefined ? cell.opacity : 100,
    };

    clips.push(clip);

    // Collect media file metadata (for reference, not actual file data in JSON)
    // In the future, when sending to server, we'll include actual file data
    const filename = mediaNode.data.file?.name || `${mediaNode.id}.${getFileExtension(mediaNode.type)}`;
    const mimeType = getMimeType(mediaNode.type);
    const fileSize = mediaNode.data.file?.size || 0;

    mediaFiles.push({
      mediaId: mediaNode.id,
      filename,
      mimeType,
      size: fileSize,
    });
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
    config: exportConfig,
    timeline,
    mediaFiles, // For now, just metadata. In future, will include actual file data when sending to server
  };

  return request;
}

/**
 * Generate JSON file and trigger download
 */
export function downloadExportJSON(exportRequest: VideoExportRequest, filename?: string): void {
  const jsonString = JSON.stringify(exportRequest, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `timeline-export-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up blob URL
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * FUTURE: Send export request to server API
 * 
 * This function will replace downloadExportJSON when server-side encoding is implemented.
 * It will:
 * 1. Prepare multipart form data with JSON config and media files
 * 2. Send POST request to /api/export/video
 * 3. Handle progress updates via WebSocket or polling
 * 4. Return job ID for status tracking
 * 
 * @example
 * ```typescript
 * const jobId = await sendExportToServer(exportRequest);
 * // Poll for status: GET /api/export/status/:jobId
 * // Download when complete: GET /api/export/download/:jobId
 * ```
 */
export async function sendExportToServer(
  _exportRequest: VideoExportRequest
): Promise<string> {
  // TODO: Implement server-side export
  // 1. Create FormData with exportRequest JSON
  // 2. Append media files from exportRequest.mediaFiles
  // 3. POST to /api/export/video
  // 4. Return job ID from response
  // 5. Set up WebSocket or polling for progress updates

  throw new Error('Server-side export not yet implemented');
}

/**
 * Helper: Get file extension from node type
 */
function getFileExtension(type: NodeType): string {
  switch (type) {
    case NodeType.VIDEO:
      return 'mp4';
    case NodeType.IMAGE:
      return 'jpg';
    default:
      return 'bin';
  }
}

/**
 * Helper: Get MIME type from node type
 */
function getMimeType(type: NodeType): string {
  switch (type) {
    case NodeType.VIDEO:
      return 'video/mp4';
    case NodeType.IMAGE:
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Main export service interface
 */
export const videoExportService = {
  /**
   * Export timeline to JSON file (current implementation)
   * 
   * FUTURE: This will be replaced with server-side export:
   * - Generate export request
   * - Send to server via sendExportToServer()
   * - Show progress dialog
   * - Download final video when complete
   */
  exportVideo: async (canvas: Canvas, config?: Partial<ExportConfig>) => {
    try {
      // Build export request from canvas data
      const exportRequest = await buildExportRequest(canvas, config);

      // CURRENT: Download as JSON file
      downloadExportJSON(exportRequest);

      // FUTURE: Send to server instead
      // const jobId = await sendExportToServer(exportRequest);
      // Show progress dialog and poll for completion
      // Download final video when ready

      return exportRequest;
    } catch (error) {
      console.error('Export failed:', error);
      throw error;
    }
  },
};
