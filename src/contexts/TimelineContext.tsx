import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Node, Canvas, SceneEditorCell, MediaNode, NodeType, MediaNodeStatus } from '../types/timeline';

// Simplified state manager interface for timeline operations
class SimpleStateManager {
  private canvas: Canvas;
  private listeners: Set<() => void> = new Set();
  private reactSetCanvas?: React.Dispatch<React.SetStateAction<Canvas>>;
  private isUpdating = false; // Guard against re-entry

  constructor(initialCanvas: Canvas) {
    this.canvas = initialCanvas;
  }

  // Allow React to hook into state updates
  setReactSetCanvas(setCanvas: React.Dispatch<React.SetStateAction<Canvas>>) {
    this.reactSetCanvas = setCanvas;
  }

  getCanvas(): Canvas {
    return this.canvas;
  }

  // Sync internal state from React state (called after setCanvas with updater function)
  syncFromReact(newCanvas: Canvas): void {
    this.canvas = newCanvas;
  }

  updateCanvas(newCanvas: Canvas): void {
    // Guard against re-entry to prevent infinite loops
    if (this.isUpdating) {
      return;
    }
    
    this.isUpdating = true;
    
    this.canvas = newCanvas;

    // CRITICAL FIX: Trigger React re-render by calling setCanvas
    if (this.reactSetCanvas) {
      this.reactSetCanvas(newCanvas);
    }

    this.notifyListeners();
    
    // Reset guard after a microtask to allow React to process the update
    queueMicrotask(() => {
      this.isUpdating = false;
    });
  }

  getSceneEditor() {
    return this.canvas.sceneEditor || { cells: [], aspectRatio: '16:9' };
  }

  getNodes(): Node[] {
    return this.canvas.nodes;
  }

  // Operation manager stub (for compatibility)
  getOperationManager() {
    return {
      executeWithContext: (operation: any, context: any) => {
        // Execute operation directly
        operation.execute?.(context);
      }
    };
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener());
  }
}

interface TimelineContextType {
  // Core state
  canvas: Canvas;
  nodes: Node[];
  stateManager: SimpleStateManager;

  // CRUD operations
  addMediaFromFile: (file: File) => Promise<string>;
  addMediaToTimeline: (mediaNodeId: string) => void;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, updates: Partial<SceneEditorCell>) => void;
  moveClip: (clipId: string, newStartTime: number) => void;

  // UI state (for compatibility with existing components)
  isSceneEditorVisible: boolean;
  toggleSceneEditorVisibility: () => void;
  isSceneEditorMode: boolean;
}

const TimelineContext = createContext<TimelineContextType | undefined>(undefined);

export const TimelineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize with empty canvas
  const [canvas, setCanvas] = useState<Canvas>({
    id: 'timeline-1',
    name: 'Timeline Editor',
    nodes: [],
    sceneEditor: {
      cells: [],
      aspectRatio: '16:9',
      totalDuration: 0,
      currentTime: 0,
      zoom: 1.0
    }
  });

  // State manager instance (persisted across renders)
  const stateManagerRef = useRef<SimpleStateManager>(new SimpleStateManager(canvas));

  // Hook up React state to state manager
  React.useEffect(() => {
    stateManagerRef.current.setReactSetCanvas(setCanvas);
  }, []);

  // Wrapper for setCanvas that also syncs state manager
  // Use this instead of setCanvas directly to keep state manager in sync
  const updateCanvasState = useCallback((updater: Canvas | ((prev: Canvas) => Canvas)) => {
    setCanvas(prev => {
      const newCanvas = typeof updater === 'function' ? updater(prev) : updater;
      // Sync state manager's internal state (don't call updateCanvas to avoid loop)
      stateManagerRef.current.syncFromReact(newCanvas);
      return newCanvas;
    });
  }, []);

  // Always visible in standalone mode
  const [isSceneEditorVisible] = useState(true);
  const toggleSceneEditorVisibility = useCallback(() => {
    // No-op in standalone mode (always visible)
  }, []);

  // Add media from file (creates media node)
  const addMediaFromFile = useCallback(async (file: File) => {
    const nodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const blobUrl = URL.createObjectURL(file);

    // Determine if image or video
    const isVideo = file.type.startsWith('video/');
    const nodeType = isVideo ? NodeType.VIDEO : NodeType.IMAGE;

    // Get dimensions and duration
    let width: number | undefined;
    let height: number | undefined;
    let duration: number | undefined;

    if (isVideo) {
      // Get video metadata
      const video = document.createElement('video');
      video.src = blobUrl;
      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          width = video.videoWidth;
          height = video.videoHeight;
          duration = video.duration;
          resolve(null);
        };
      });
    } else {
      // Get image dimensions
      const img = new Image();
      img.src = blobUrl;
      await new Promise((resolve) => {
        img.onload = () => {
          width = img.width;
          height = img.height;
          resolve(null);
        };
      });
    }

    const newNode: MediaNode = {
      id: nodeId,
      type: nodeType,
      label: file.name,
      position: { x: 0, y: 0 }, // Not used in timeline
      data: {
        url: blobUrl,
        width,
        height,
        duration,
        status: 'completed' as MediaNodeStatus,
        file
      }
    };

    updateCanvasState(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));

    return nodeId;
  }, [updateCanvasState]);

  // Add media node to timeline
  const addMediaToTimeline = useCallback((mediaNodeId: string) => {
    updateCanvasState(prev => {
      const node = prev.nodes.find(n => n.id === mediaNodeId);
      if (!node) return prev;

      const cells = prev.sceneEditor?.cells || [];

      // Calculate start time based on existing clips
      let startTime = 0;
      if (cells.length > 0) {
        const lastCell = cells[cells.length - 1];
        const lastCellDuration = lastCell.duration || (node.type === NodeType.VIDEO ? node.data.duration : 3) || 3;
        const lastCellTrimStart = lastCell.trimStart || 0;
        const lastCellTrimEnd = lastCell.trimEnd || 0;
        const effectiveDuration = lastCellDuration - lastCellTrimStart - lastCellTrimEnd;
        startTime = (lastCell.startTime || 0) + effectiveDuration;
      }

      const cellId = `cell-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const duration = node.type === NodeType.VIDEO ? node.data.duration : 3;

      const newCell: SceneEditorCell = {
        id: cellId,
        mediaNodeId,
        position: cells.length,
        startTime,
        duration,
        trimStart: 0,
        trimEnd: 0
      };

      return {
        ...prev,
        sceneEditor: {
          ...prev.sceneEditor!,
          cells: [...cells, newCell]
        }
      };
    });
  }, [updateCanvasState]);

  // Remove clip from timeline
  const removeClip = useCallback((clipId: string) => {
    updateCanvasState(prev => {
      const cells = prev.sceneEditor?.cells || [];
      const updatedCells = cells.filter(c => c.id !== clipId);

      // Recalculate positions and start times
      const recalculatedCells = updatedCells.map((cell, index) => {
        let startTime = 0;
        for (let i = 0; i < index; i++) {
          const prevCell = updatedCells[i];
          const prevDuration = prevCell.duration || 3;
          const trimStart = prevCell.trimStart || 0;
          const trimEnd = prevCell.trimEnd || 0;
          startTime += prevDuration - trimStart - trimEnd;
        }
        return { ...cell, position: index, startTime };
      });

      return {
        ...prev,
        sceneEditor: {
          ...prev.sceneEditor!,
          cells: recalculatedCells
        }
      };
    });
  }, [updateCanvasState]);

  // Update clip properties
  const updateClip = useCallback((clipId: string, updates: Partial<SceneEditorCell>) => {
    updateCanvasState(prev => {
      const cells = prev.sceneEditor?.cells || [];
      const updatedCells = cells.map(cell =>
        cell.id === clipId ? { ...cell, ...updates } : cell
      );

      return {
        ...prev,
        sceneEditor: {
          ...prev.sceneEditor!,
          cells: updatedCells
        }
      };
    });
  }, [updateCanvasState]);

  // Move clip to new position
  const moveClip = useCallback((clipId: string, newStartTime: number) => {
    updateCanvasState(prev => {
      const cells = prev.sceneEditor?.cells || [];
      const updatedCells = cells.map(cell =>
        cell.id === clipId ? { ...cell, startTime: newStartTime } : cell
      );

      // Re-sort by start time
      updatedCells.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));

      // Update positions
      updatedCells.forEach((cell, index) => {
        cell.position = index;
      });

      return {
        ...prev,
        sceneEditor: {
          ...prev.sceneEditor!,
          cells: updatedCells
        }
      };
    });
  }, [updateCanvasState]);

  const value: TimelineContextType = {
    canvas,
    nodes: canvas.nodes,
    stateManager: stateManagerRef.current,
    addMediaFromFile,
    addMediaToTimeline,
    removeClip,
    updateClip,
    moveClip,
    isSceneEditorVisible,
    toggleSceneEditorVisibility,
    isSceneEditorMode: true // Always in scene editor mode in standalone
  };

  return (
    <TimelineContext.Provider value={value}>
      {children}
    </TimelineContext.Provider>
  );
};

export const useTimeline = (): TimelineContextType => {
  const context = useContext(TimelineContext);
  if (context === undefined) {
    throw new Error('useTimeline must be used within a TimelineProvider');
  }
  return context;
};

// Alias for compatibility with existing components that use useCanvas
export const useCanvas = useTimeline;
