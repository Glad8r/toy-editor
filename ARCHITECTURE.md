# Timeline Editor - Architecture Documentation

## Project Overview

A standalone video timeline editor built with React and TypeScript. Supports drag-and-drop clip editing, trimming, playback, and zoom. Designed for performance and extensibility.

---

## Technology Stack

### Core Framework
- **React 18.3.1** — Modern UI framework with hooks
- **TypeScript 5.2.2** — Type safety and developer experience
- **Vite 5.3.1** — Fast build tool and dev server (HMR)

### UI Libraries & Styling
- **Tailwind CSS 3.4.4** — Utility-first CSS framework
- **Radix UI** — Accessible component primitives (Dialog, Dropdown, Slider, Tooltip, etc.)
- **Lucide React** — Icon library
- **Sonner** — Toast notifications
- **ReactFlow 11.11.4** — (Inherited from parent project)

### Development Tools
- **ESLint** — Code linting with TypeScript support
- **PostCSS + Autoprefixer** — CSS processing
- **TypeScript strict mode** — Enhanced type safety

---

## Architecture Overview

### 1. Component Hierarchy

```
App
└── TimelineProvider (Context)
    └── SceneEditorLayout
        ├── SceneEditorHeader
        ├── SceneEditorInspector (Left Panel - Media Library)
        ├── SceneEditor (Main Editor)
        │   ├── VideoPreviewArea (65% height - Video player)
        │   ├── VideoPlaybackPanel (Controls + Zoom slider)
        │   └── TimelineArea (31% height)
        │       ├── TimelineControls (Left 10%)
        │       └── TimelineCanvas (Right 90%)
        │           ├── TimelineRuler (Time markers)
        │           ├── TimelineTrack[] (Timeline tracks)
        │           │   └── TimelineClip[] (Individual clips per track)
        │           └── TimelinePlayhead (Playhead indicator)
        └── SceneEditorRightPanel (Properties panel)
```

### 2. State Management Architecture

#### Three-Layer State System:

**Layer 1: Canvas State (TimelineContext)**
- `SimpleStateManager` — manages `Canvas` object
- Stores `nodes` (media files) and `sceneEditor.cells` (timeline clips)
- Provides CRUD operations via context
- Uses React state with ref-based manager to prevent infinite loops

**Layer 2: Virtual Timeline Manager (VTM)**
- Single source of truth for timeline state
- Manages time mapping: global timeline time ↔ clip positions
- Master clock for playback synchronization
- Event system: `onTimelineChange`, `onCurrentTimeChange`, `onVideoPlayerInstruction`
- Zoom system integration

**Layer 3: Component State**
- UI-specific state (hover, drag, trim preview)
- Subscribes to VTM events for synchronization
- Local state for temporary interactions

### 3. Key Design Patterns

#### Observer Pattern
```typescript
// Components subscribe to VTM changes
virtualTimeline.onTimelineChange((state) => {
  // React to timeline updates
});
```

#### Command Pattern (Simplified)
```typescript
// Operations encapsulate state changes
class AddSceneEditorCellOperation {
  execute(context) {
    // Mutate state
  }
}
```

#### Single Source of Truth
- VTM owns timeline state
- Components read from VTM, not local state
- Updates flow: User Action → Operation → StateManager → VTM → Components

---

## Core Systems

### 1. Virtual Timeline Manager (VTM)

**Purpose:** Centralized timeline state and time mapping

**Key Responsibilities:**
- Time conversion: `globalTimeToClipPosition()`, `clipPositionToGlobalTime()`
- Master clock: `startMasterClock()`, `stopMasterClock()`
- Playback state: `setPlaying()`, `isPlaying()`
- Zoom integration: `getZoomSystem()`, `updateZoomSystem()`
- Event notifications to subscribers

**Implementation:**
- `VirtualTimelineManagerImpl` class
- Maintains sorted `cells` array
- Calculates `totalDuration` from effective clip durations
- Handles trimming: `effectiveDuration = duration - trimStart - trimEnd`

### 2. Continuous Zoom System

**Purpose:** Pixel-perfect timeline scaling

**Design:**
- **Continuous zoom**: 5-120 pixels per second (no discrete levels)
- `ZoomSystem` interface with conversion functions
- `getPixelFromTime()`, `getTimeFromPixel()`
- Dynamic timeline width calculation

**Integration:**
- VTM owns zoom system
- Components read zoom from VTM
- Zoom slider updates VTM, which notifies subscribers

### 3. Media Management

**Media Library (`SceneEditorInspector`):**
- Upload files → creates `MediaNode` with blob URLs
- Displays thumbnails in grid
- Drag-and-drop to timeline

**Timeline Clips (`TimelineClip`):**
- **Premiere-style thumbnails**: First and last frame only
- Extracted on-demand (2 frames per clip)
- Cached in memory (localStorage disabled due to quota)

**Blob URL Management:**
- `mediaService` handles blob URL creation/revocation
- Prevents memory leaks with cleanup

### 4. Video Playback System

**Hybrid Playback Architecture:**
- **Paused**: VTM master clock drives seeking
- **Playing**: Video element drives playback, syncs to VTM via `timeupdate`
- **Clip transitions**: Pause current → Load new → Seek → Play

**Components:**
- `VideoPreviewArea`: Main video player
- `VideoPlaybackPanel`: Controls (play/pause, skip, zoom slider)
- Frame-accurate seeking via VTM

### 5. Timeline Editing Features

**Timeline Track Structure:**
- `TimelineCanvas` contains `TimelineTrack[]` components
- Each `TimelineTrack` contains `TimelineClip[]` components
- Currently: Single active track (Track 1)
- Visual mockup: Track 2 displayed as inactive placeholder (lines only)

**Trim Mode:**
- Drag handles on clip edges
- Real-time preview with ripple effect
- Updates `trimStart`/`trimEnd` on clip

**Rearrange Mode:**
- Drag clips to reorder
- Visual spacing during drag
- Recalculates `startTime` for all clips

**Time-Based Layout:**
- Clips positioned by `startTime` (seconds)
- No pixel-based positioning
- `migrateToTimeBasedLayout()` converts legacy position-based to time-based

---

## Data Flow

### Adding a Clip:
```
User drops media
  → TimelineCanvas.handleTrackDrop()
  → AddSceneEditorCellOperation.execute()
  → SimpleStateManager.updateCanvas()
  → React state update
  → SceneEditor.useEffect (detects cell change)
  → VTM.updateTimeline()
  → VTM.notifyTimelineChange()
  → All subscribers re-render
```

### Playback:
```
User clicks play
  → VTM.setPlaying(true)
  → VTM.startMasterClock()
  → VideoPreviewArea receives instruction
  → Video element plays
  → timeupdate event fires
  → VTM.syncTimeFromVideo()
  → VTM.notifyCurrentTimeChange()
  → TimelinePlayhead updates position
```

### Zoom Change:
```
User moves zoom slider
  → VideoPlaybackPanel.handleZoomChange()
  → createZoomSystem(pixelsPerSecond)
  → VTM.updateZoomSystem()
  → VTM.notifyTimelineChange()
  → TimelineArea/TimelineCanvas re-render
  → Timeline recalculates width
```

---

## Performance Optimizations

### 1. State Update Guards
- Cell ID tracking prevents unnecessary VTM updates
- Zoom sync guards prevent feedback loops
- Re-entry guards in `updateCanvas()`

### 2. Lightweight Thumbnails
- Only 2 frames per clip (first + last)
- Extracted once per clip (not on zoom changes)
- No heavy keyframe extraction

### 3. Memoization
- `useMemo` for expensive calculations
- `useCallback` for event handlers
- Ref-based VTM persistence (no recreation on every render)

### 4. Event Throttling
- VTM notifications throttled to prevent cascades
- Video `timeupdate` events throttled

---

## File Structure

```
src/
├── components/
│   ├── SceneEditor/          # Timeline editor components
│   │   ├── SceneEditor.tsx   # Main container
│   │   ├── VirtualTimelineManager.ts  # Core state management
│   │   ├── zoomSystem.ts      # Zoom calculations
│   │   ├── TimelineArea.tsx   # Timeline container
│   │   ├── TimelineCanvas.tsx # Tracks + ruler + playhead
│   │   ├── TimelineTrack.tsx  # Timeline track container
│   │   ├── TimelineClip.tsx   # Individual clip rendering
│   │   ├── VideoPreviewArea.tsx  # Video player
│   │   ├── VideoPlaybackPanel.tsx # Controls
│   │   └── ...
│   └── ui/                    # Reusable UI components (Radix-based)
│
├── contexts/
│   ├── TimelineContext.tsx    # Canvas state + media operations
│   ├── SceneEditorPanelContext.tsx  # Panel visibility
│   └── TimelineModeContext.tsx  # Trim/Rearrange modes
│
├── operations/
│   └── SceneEditorOperations.ts  # Add/Remove/Trim/Move operations
│
├── services/
│   ├── mediaService.ts        # Blob URL management
│   └── videoFrameExtractor.ts  # Frame extraction utilities
│
├── types/
│   └── timeline.ts            # TypeScript definitions
│
└── layout/
    └── SceneEditorLayout.tsx  # Main layout with panels
```

---

## Current Features

### ✅ Implemented:
- Drag-and-drop media to timeline
- Clip trimming with handles
- Clip rearrangement
- Video playback with frame-accurate seeking
- Continuous zoom (5-120 px/s)
- First/last frame thumbnails
- Play/pause controls
- Skip forward/backward
- Keyboard shortcuts (Space for play/pause)
- TimelineTrack component structure (single track active)

### 🚧 Planned (from DESIGN_DOC.md):
- Multiple timeline tracks (Track 2 visual mockup exists, functionality pending)
- Opacity controls (UI exists, not functional)
- Video export
- Transitions, effects, color grading
- Performance optimizations for many clips

---

## Technical Highlights

1. **Time-based positioning** (not pixel-based)
2. **Continuous zoom system** (no discrete levels)
3. **Master clock synchronization** for playback
4. **Observer pattern** for component synchronization
5. **Guarded state updates** to prevent infinite loops
6. **Lightweight thumbnail extraction** (2 frames per clip)

---

## Type Definitions

### Core Types

```typescript
interface Canvas {
  id: string;
  name: string;
  nodes: Node[];              // Media files
  sceneEditor?: SceneEditor;  // Timeline data
}

interface SceneEditor {
  cells: SceneEditorCell[];   // Timeline clips
  aspectRatio: string;        // "16:9"
  totalDuration?: number;     // Calculated
  currentTime?: number;       // Playhead position
  zoom?: number;              // Legacy zoom level
}

interface SceneEditorCell {
  id: string;
  mediaNodeId: string;       // Reference to MediaNode
  position: number;          // Legacy position index
  startTime?: number;        // Time position in seconds
  duration?: number;         // Clip duration
  trimStart?: number;        // Seconds trimmed from start
  trimEnd?: number;          // Seconds trimmed from end
}

interface MediaNode {
  id: string;
  type: NodeType.IMAGE | NodeType.VIDEO;
  label: string;
  data: {
    url: string;             // Blob URL
    width?: number;
    height?: number;
    duration?: number;       // For videos
    status: MediaNodeStatus;
    file?: File;
  };
}
```

### Zoom System

```typescript
interface ZoomSystem {
  pixelsPerSecond: number;   // 5-120 range
  getPixelFromTime: (seconds: number) => number;
  getTimeFromPixel: (pixel: number) => number;
  getKeyframeCount: (clipDuration: number) => number;
  getTimelineWidth: (totalDuration: number) => number;
}
```

### Virtual Timeline Manager

```typescript
interface VirtualTimelineManager {
  // Time mapping
  globalTimeToClipPosition(globalTime: number): ClipPosition | null;
  clipPositionToGlobalTime(clipIndex: number, clipTime: number): number;
  
  // State management
  getCurrentTime(): number;
  setCurrentTime(globalTime: number): void;
  getTotalDuration(): number;
  updateTimeline(cells: SceneEditorCell[]): void;
  
  // Zoom integration
  getZoomSystem(): ZoomSystem;
  updateZoomSystem(newZoomSystem: ZoomSystem): void;
  
  // Playback
  setPlaying(isPlaying: boolean): void;
  isPlaying(): boolean;
  startMasterClock(): void;
  stopMasterClock(): void;
  
  // Events
  onTimelineChange(callback: TimelineChangeCallback): () => void;
  onCurrentTimeChange(callback: CurrentTimeChangeCallback): () => void;
  onVideoPlayerInstruction(callback: VideoPlayerCallback): () => void;
}
```

---

## Development Workflow

### Running the Project

```bash
# Install dependencies
npm install

# Start development server (port 5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

### Key Commands

- **Space** — Play/pause video
- **ESC** — Exit rearrange mode
- **Click timeline** — Seek to position
- **Drag clip** — Rearrange (in rearrange mode)
- **Drag trim handles** — Trim clip (in trim mode)

---

## Known Issues & Solutions

### Fixed Issues

1. **Infinite loops in state updates**
   - **Solution**: Added guards with cell ID tracking and re-entry protection

2. **Choppy video playback**
   - **Solution**: Hybrid playback approach (video drives during play, VTM drives when paused)

3. **Heavy keyframe extraction causing hangs**
   - **Solution**: Replaced with lightweight first/last frame thumbnails

4. **Memory leaks from blob URLs**
   - **Solution**: Proper cleanup in useEffect hooks

### Current Limitations

- **Single timeline track active** (Track 1 only; Track 2 is visual mockup only)
- No multi-track functionality (track assignment, compositing, etc.)
- No video export functionality
- Opacity slider UI exists but not functional
- Thumbnails cached in memory only (localStorage quota issues)

---

## Future Enhancements

Based on `DESIGN_DOC.md`, planned improvements:

1. **Performance**
   - Optimize for hundreds of clips
   - Virtual scrolling for timeline
   - Lazy loading of thumbnails

2. **Features**
   - Multiple timeline tracks
   - Opacity, fade in/out, time stretch
   - Overlay text/graphics
   - Color grading and filters
   - Transitions between clips

3. **Export**
   - Video export functionality
   - Multiple format support
   - Quality settings

4. **Storage**
   - Backend integration (S3 for media, Postgres for metadata)
   - Cloud transcoding
   - Efficient streaming

---

## Architecture Decisions

### Why Continuous Zoom?

- **Flexibility**: Users can zoom to any level, not just 3 presets
- **Smooth UX**: Slider provides gradual zoom experience
- **Simpler code**: No need to map between discrete levels and pixels

### Why VTM as Single Source of Truth?

- **Consistency**: All components see the same timeline state
- **Synchronization**: Master clock ensures playback stays in sync
- **Testability**: Centralized logic is easier to test

### Why Time-Based Positioning?

- **Accuracy**: Time is the natural unit for video editing
- **Zoom-independent**: Clips stay in correct time position regardless of zoom
- **Easier calculations**: Duration, trimming, and gaps are time-based

### Why Premiere-Style Thumbnails?

- **Performance**: Only 2 extractions per clip vs 10-20
- **Visual clarity**: First/last frames show clip boundaries
- **Familiar UX**: Matches industry-standard video editors

---

## Testing Strategy

### Current State
- Manual testing during development
- No automated tests yet

### Recommended Testing
- **Unit tests**: VTM time mapping, zoom calculations
- **Integration tests**: Clip operations, playback flow
- **E2E tests**: User workflows (add clip, trim, play)
- **Performance tests**: Many clips, long videos

---

## Contributing Guidelines

### Code Style
- TypeScript strict mode
- ESLint configuration enforced
- Functional components with hooks
- Clear separation of concerns

### Commit Messages
- Use conventional commits: `fix:`, `feat:`, `refactor:`, etc.
- Group related changes together
- Keep commits focused and atomic

---

## References

- [DESIGN_DOC.md](./DESIGN_DOC.md) — Original design document
- [README.md](./README.md) — Quick start guide
- Component source files in `src/components/SceneEditor/`

---

*Last updated: Based on commits through "feat: Implement simplified keyframe thumbnails"*

