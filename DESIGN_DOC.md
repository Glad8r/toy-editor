# Timeline Editor – Design Notes

## Technologies used
Core framework & language
- React 18.3.1 — UI framework
- TypeScript 5.2.2 — type safety
- Vite 5.3.1 — build tool and dev server
UI libraries & components
- Radix UI — accessible primitives (Dialog, Dropdown, Slider, Tooltip, etc.)
- Tailwind CSS 3.4.4 — styling
- Lucide React — icons
- Sonner — toast notifications
- ReactFlow 11.11.4 — (likely comes from the rest of flick UI)

## Key features
1. Timeline editing
- Drag-and-drop clip rearrangement
- Trim handles for adjusting clip duration
- Time-based positioning (seconds)
- Ripple preview when trimming
2. Video playback
- Preview panel (65% of screen)
- Play/pause controls
- Frame-accurate seeking
- Skip forward/backward
3. Zoom system
- Three zoom levels: Overview (20px/s), Normal (60px/s), Detail (120px/s)
- Dynamic timeline width calculation
- Pixel-perfect alignment between ruler and clips
4. Media management
- Blob URL handling for local files
- Video frame extraction
- Keyframe caching for thumbnails
- Support for MP4, MOV, JPG, PNG

## Design patterns
- Single source of truth: VirtualTimelineManager manages timeline state
- Observer pattern: components subscribe to timeline changes
- Command pattern: operations for undo/redo support
S- eparation of concerns: UI, state, and business logic are separated
Development setup
- Development: npm run dev (Vite dev server on port 5173)
- Build: npm run build (TypeScript compilation + Vite build)
- Linting: ESLint with TypeScript support
Current status
- A functional timeline editor with core editing features. The codebase is modular and extensible, with room for additional features like transitions, effects, and export functionality.


## 1. Goals & Context
- Show my approach to designing a scalable timeline editor.
- Make small but meaningful improvements in each of the four areas.
- Balance quick iteration with long-term maintainability.

## 2. Mental Model of the Editor
- Timeline → Tracks → Clips (or Scenes, Layers, etc.)
- Source of truth for state (e.g., X store, React state, etc.)
- How rendering & playback currently work (your understanding).

## 3. Overview of the Four Areas
For each area:
- What it is (my understanding).
- Long-term vision (2–3 bullet points).
- Constraints I noticed (if any).

```
1. Performance is good even when user adds a lot of clips to it (production grade video editor like final cut pro)

## What's already working: 
Can add a single clip

## Not working:
Video freezes, or choppy

## Obvious extension points:
User can import a lot of clips
Performance does not degrade
Can add and remove clips to/from asset browser and timeline

## Design considerations
Performance with many clips is upload–store–render problem (not just UI). The timeline/asset UI should stay responsive even with hundreds of clips, and the backend must support efficient upload, storage, transcoding, and streaming of those clips at scale.

a. Storage
Object storage for media (e.g. S3)
Relational DB for metadata - assets, projects (e.g. Postgres)

b. 

```
2. ⁠Supports all the features like changing opacity, overlay texts etc. from the right panel. expect similar features just like any other video editors)

## What's already working: 
Panel is there
Opacity slider is there

## Not working:
Opacity slider is not working
Need to apply per clip

## Obvious extension points:
Need to add features to the right panel:
Opacity (already added)
Fade in/out
Time Stretch
Overlay Text/Graphics
Color grading
Pan & zoom
Video filters
Transitions

3. ⁠User should be able to export the edited video as a whole

## What's already working: 
Export button is there

## Not working:
Functionality is not implemented

## Obvious extension points:
Implement Export Video functionality

4. ⁠We need to support multiple timeline tracks overlaying together in the timeline area

## What's already working: 
Single track in the timeline area

## Not working:
Very basic implementation, no zoom in/out, etc

## Obvious extension points:
Add multiple track support
Add zoom
Disable/enable tracks
Add/delete tracks

## Future design

In a production system, exporting an edited video is a server-side rendering pipeline:
- the editor sends a structured timeline + asset manifest,
- backend service uses something like ffmpeg or a custom renderer
- the final file is stored in object storage

## Current implementation

As a first step, I implemented:
- a manifest format that captures endocing info, tracks, clips, assets, effects, etc 
- a client-side export that lets the user download current project as JSON.

This payload is  what a future render backend would consume

## Next steps
- Send this payload to an export API
- Show progress dialog and poll for completion
- Download final video when ready


## 4. What I Implemented

### Area 1: [Name]
- **Problem:** short description.
- **Changes made:**
  - [x] UI/UX change
  - [x] Data model / abstraction change
- **How this scales long-term:**
  - bullet points

### Area 2: [Name]
...

## 5. Design Decisions & Tradeoffs
- Why I chose X over Y.
- Where I deliberately kept things simple.
- Places where I see risks / bottlenecks in the future.

## 6. Future Work (if I had more time)
- Concrete next steps for each of the four areas.
- Ideas for testing / performance / UX polish.


Commits:
- Fix: invalid hook call error: a hook called inside event handler
- Fix: Prevent infinite re-renders and premature blob URL revocation 
- Fix: Use actual video duration when adding clips to timeline 
- Fix: Choppy video playback 
- Feature: Add media library with drag-and-drop to timeline 
- Style: Update video playback panel layout for zoom slider 
- Feature: Improve zoom system with continuous zoom and preserve zoom across updates
- Perf: Add performance optimizations and debugging tools
- Refactor: Replace discrete zoom calculations with continuous zoom system
- Fix: infinite loops and state management
- Refactor: Remove discrete zoom levels, use only continuous zoom
- Feature: Implement simplified keyframe thumbnails
- Implement video export JSON generation