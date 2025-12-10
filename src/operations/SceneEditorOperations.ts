/**
 * Simplified SceneEditor Operations for standalone timeline editor
 * Direct state mutations instead of operation pattern
 */

import { SceneEditorCell, NodeType, MediaNode } from '../types/timeline';

/**
 * Simple operation classes for compatibility with existing components
 * These execute directly instead of going through an operation manager
 */

export class RemoveSceneEditorCellOperation {
  constructor(private cellId: string) {}

  execute(context: any) {
    const canvas = context.getCanvas();
    const cells = canvas.sceneEditor?.cells || [];
    const updatedCells = cells.filter((c: SceneEditorCell) => c.id !== this.cellId);

    // Recalculate positions
    updatedCells.forEach((cell: SceneEditorCell, index: number) => {
      cell.position = index;
    });

    // CRITICAL FIX: Recalculate startTime for all clips after removal
    // This ensures VirtualTimelineManager can correctly map playhead position to clips
    let cumulativeTime = 0;
    updatedCells.forEach((cell: SceneEditorCell) => {
      cell.startTime = cumulativeTime;
      // Calculate effective duration (accounting for trimming)
      const originalDuration = cell.duration || 0;
      const trimStart = cell.trimStart || 0;
      const trimEnd = cell.trimEnd || 0;
      const effectiveDuration = Math.max(0.1, originalDuration - trimStart - trimEnd);
      cumulativeTime += effectiveDuration;
    });

    console.log('🗑️ RemoveSceneEditorCellOperation: Recalculated startTime values after removing', this.cellId);

    context.updateCanvas({
      ...canvas,
      sceneEditor: {
        ...canvas.sceneEditor,
        cells: updatedCells
      }
    });
  }
}

export class TrimSceneEditorCellOperation {
  constructor(
    private cellId: string,
    private trimStart: number,
    private trimEnd: number
  ) {}

  execute(context: any) {
    const canvas = context.getCanvas();
    const cells = canvas.sceneEditor?.cells || [];

    const updatedCells = cells.map((cell: SceneEditorCell) => {
      if (cell.id === this.cellId) {
        return {
          ...cell,
          trimStart: this.trimStart,
          trimEnd: this.trimEnd
        };
      }
      return cell;
    });

    // CRITICAL FIX: Recalculate startTime for all clips after trimming
    // Trimming changes effective duration, which affects startTime of subsequent clips
    let cumulativeTime = 0;
    updatedCells.forEach((cell: SceneEditorCell) => {
      cell.startTime = cumulativeTime;
      // Calculate effective duration (accounting for trimming)
      const originalDuration = cell.duration || 0;
      const trimStart = cell.trimStart || 0;
      const trimEnd = cell.trimEnd || 0;
      const effectiveDuration = Math.max(0.1, originalDuration - trimStart - trimEnd);
      cumulativeTime += effectiveDuration;
    });

    console.log('✂️ TrimSceneEditorCellOperation: Recalculated startTime values after trimming', this.cellId);

    context.updateCanvas({
      ...canvas,
      sceneEditor: {
        ...canvas.sceneEditor,
        cells: updatedCells
      }
    });
  }
}

export class MoveTimelineClipOperation {
  constructor(
    private cellId: string,
    private newStartTime: number
  ) {}

  execute(context: any) {
    const canvas = context.getCanvas();
    const cells = canvas.sceneEditor?.cells || [];

    const updatedCells = cells.map((cell: SceneEditorCell) => {
      if (cell.id === this.cellId) {
        return {
          ...cell,
          startTime: this.newStartTime
        };
      }
      return cell;
    });

    // Re-sort by start time
    updatedCells.sort((a: SceneEditorCell, b: SceneEditorCell) =>
      (a.startTime || 0) - (b.startTime || 0)
    );

    // Update positions
    updatedCells.forEach((cell: SceneEditorCell, index: number) => {
      cell.position = index;
    });

    context.updateCanvas({
      ...canvas,
      sceneEditor: {
        ...canvas.sceneEditor,
        cells: updatedCells
      }
    });
  }
}

export class MoveSceneEditorCellOperation {
  constructor(
    private cellId: string,
    private newPosition: number
  ) {}

  execute(context: any) {
    const canvas = context.getCanvas();
    const cells = canvas.sceneEditor?.cells || [];

    // Find the cell to move
    const cellIndex = cells.findIndex((c: SceneEditorCell) => c.id === this.cellId);
    if (cellIndex === -1) return;

    const updatedCells = [...cells];
    const [movedCell] = updatedCells.splice(cellIndex, 1);
    updatedCells.splice(this.newPosition, 0, movedCell);

    // Update positions
    updatedCells.forEach((cell: SceneEditorCell, index: number) => {
      cell.position = index;
    });

    // CRITICAL FIX: Recalculate startTime for all clips after rearrangement
    // This ensures VirtualTimelineManager can correctly map playhead position to clips
    let cumulativeTime = 0;
    updatedCells.forEach((cell: SceneEditorCell) => {
      cell.startTime = cumulativeTime;
      // Calculate effective duration (accounting for trimming)
      const originalDuration = cell.duration || 0;
      const trimStart = cell.trimStart || 0;
      const trimEnd = cell.trimEnd || 0;
      const effectiveDuration = Math.max(0.1, originalDuration - trimStart - trimEnd);
      cumulativeTime += effectiveDuration;
    });

    console.log('🔄 MoveSceneEditorCellOperation: Recalculated startTime values:',
      updatedCells.map(c => ({ id: c.id, position: c.position, startTime: c.startTime })));

    context.updateCanvas({
      ...canvas,
      sceneEditor: {
        ...canvas.sceneEditor,
        cells: updatedCells
      }
    });
  }
}

export class AddSceneEditorCellOperation {
  constructor(
    private mediaNodeId: string,
    private position?: number
  ) {}

  execute(context: any) {
    const canvas = context.getCanvas();
    const cells = canvas.sceneEditor?.cells || [];

    // Find the media node to get its actual duration
    const mediaNode = canvas.nodes.find(
      (node: any) => node.id === this.mediaNodeId && 
      (node.type === NodeType.IMAGE || node.type === NodeType.VIDEO)
    ) as MediaNode | undefined;

    // Get duration from media node: videos use their duration, images default to 3 seconds
    const duration = mediaNode 
      ? (mediaNode.type === NodeType.VIDEO 
          ? (mediaNode.data.duration || 3) 
          : 3)
      : 3; // Fallback to 3 seconds if node not found

    const cellId = `cell-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newPosition = this.position !== undefined ? this.position : cells.length;

    const newCell: SceneEditorCell = {
      id: cellId,
      mediaNodeId: this.mediaNodeId,
      position: newPosition,
      startTime: 0,
      duration: duration, // Use actual media duration instead of 0
      trimStart: 0,
      trimEnd: 0
    };

    const updatedCells = [...cells];
    updatedCells.splice(newPosition, 0, newCell);

    // Update positions
    updatedCells.forEach((cell: SceneEditorCell, index: number) => {
      cell.position = index;
    });

    // CRITICAL FIX: Recalculate startTime for all clips after adding
    // This ensures VirtualTimelineManager can correctly map playhead position to clips
    let cumulativeTime = 0;
    updatedCells.forEach((cell: SceneEditorCell) => {
      cell.startTime = cumulativeTime;
      // Calculate effective duration (accounting for trimming)
      const originalDuration = cell.duration || 0;
      const trimStart = cell.trimStart || 0;
      const trimEnd = cell.trimEnd || 0;
      // Use actual duration, but ensure minimum of 0.1s to prevent zero-duration clips
      const effectiveDuration = Math.max(0.1, originalDuration - trimStart - trimEnd);
      cumulativeTime += effectiveDuration;
    });

    console.log('➕ AddSceneEditorCellOperation: Recalculated startTime values after adding', cellId);

    context.updateCanvas({
      ...canvas,
      sceneEditor: {
        ...canvas.sceneEditor,
        cells: updatedCells
      }
    });
  }
}

export class VideoFrameExtractOperation {
  constructor(
    private videoNodeId: string,
    private timestamp: number,
    private position: { x: number; y: number }
  ) {}

  execute(context: any) {
    // Not implemented in standalone version
    console.warn('VideoFrameExtractOperation not implemented in standalone version');
  }
}
