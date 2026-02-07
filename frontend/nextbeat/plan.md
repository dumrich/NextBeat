# DAW Frontend Spec — “AI-Assisted MIDI Production App”

Build a **desktop-style DAW frontend** focused on **MIDI composition and arrangement** with an integrated **AI Agent panel** for guidance + autocomplete workflows. The UI should feel like a modern music workstation: fast, dense, keyboard-friendly, draggable panels, resizable splits, and clean dark theme.

## Goals
- Provide a full-featured **MIDI-focused production UI** with the classic DAW components:
  - Transport controls (play/pause/stop/rewind/record/metronome/loop)
  - Timeline + arrangement view with clips (playlist)
  - Step sequencer / pattern grid
  - Piano roll editor
  - Mixer with channels, inserts, sends, meters
  - Instrument/plugin rack and preset browser
  - Automation lanes
  - Browser/library panel for assets (MIDI clips, patterns, presets)
- Include a dedicated **Agent Mode** panel on the **right**:
  - Chat + action buttons that can modify the project (insert chords, generate drum patterns, reharmonize, humanize, etc.)
  - Should be docked, resizable, and persist across views
- Bottom options bar includes:
  - “Export MIDI” action (exports the current project arrangement into a .mid file)
- Build the frontend so it can later connect to a backend (LLM/RAG/autocomplete), but for now use stubs/mocked responses.

---

## Tech & Architecture Preferences
- Use **React + TypeScript**.
- Use a layout library that supports dockable/resizable panels (e.g., `react-resizable-panels`, `react-split-pane`, or a docking library).
- Use state management suitable for complex editing (e.g., Zustand/Redux). Prefer Zustand for simplicity unless otherwise needed.
- Use a component library sparingly; prioritize custom DAW-like widgets.
- Keep rendering smooth (virtualize long lists; avoid heavy rerenders).
- Provide keyboard shortcuts and mouse interactions.

---

## High-Level Layout (Single Window)
The app is one main window with 3 major zones:

### 1) Top Transport Bar (fixed height)
A horizontal bar at the very top containing:
- Play / Pause
- Stop
- Rewind to start
- Fast-forward (optional)
- Record (toggle)
- Metronome (toggle)
- Loop/Playback range (toggle)
- Tempo (BPM) numeric input + tap tempo
- Time signature selector (e.g., 4/4)
- Song position display (bars:beats:ticks and mm:ss)
- Snap/grid selector (1/4, 1/8, 1/16, triplet, etc.)
- CPU/Audio status area (mocked)
- Undo / Redo
- Save / Open (can be mocked)

### 2) Main Workspace (center-left)
A multi-panel layout with resizable sections:

#### Left Sidebar: Browser / Library
A vertical panel containing:
- Tabs: **Library**, **Instruments**, **Presets**, **MIDI Patterns**, **Samples** (samples can be stubbed)
- Search bar
- Tree view / list of items
- Drag-and-drop items into:
  - Playlist (as clips)
  - Channel rack (as patterns)
  - Instrument rack (as instruments/presets)
- Favorites and recent items

#### Center: Arrangement + Editors
This should support switching between views while keeping consistent workflow:

**A) Playlist / Arrangement View (primary)**
- Horizontal timeline with measures/bars
- Vertical tracks (instrument tracks, pattern tracks, automation tracks)
- Clips on tracks:
  - MIDI clips (blocks)
  - Pattern clips (blocks)
  - Automation clips/lanes
- Clip operations:
  - Drag to move
  - Resize to extend/trim
  - Duplicate (Alt-drag)
  - Split at playhead
  - Merge
  - Quantize (menu)
- Playhead with scrub + loop region selection
- Zoom controls (time zoom + track height zoom)
- Track headers:
  - Mute / Solo
  - Arm record
  - Track name + color
  - Output routing (to mixer channel)
  - Track volume/pan knobs (simple)

**B) Piano Roll Editor (dockable or bottom subpanel)**
- Grid of pitches vs time
- Notes as rectangles with velocity
- Tools:
  - Draw, Select, Erase, Slice
  - Velocity lane (bottom)
  - Snap settings and quantize
- Support:
  - Multi-note selection
  - Drag notes
  - Resize duration
  - Duplicate
  - Transpose (Shift+Up/Down)
- Context menu actions:
  - Humanize
  - Randomize velocity
  - Strum
  - Legato
  - Scale constrain (optional)

**C) Step Sequencer / Pattern Grid**
- Channel list (e.g., Kick, Snare, Hat, Bass, Chords)
- 16-step grid per pattern (expandable length)
- Pattern selector + pattern naming
- Per-channel controls:
  - Mute/Solo
  - Volume/pan
  - Small step probability / velocity (optional)
- Ability to “Send to Playlist” as a pattern clip

**D) Automation Editor**
- Automation lanes under tracks
- Points + curves
- Parameters selectable (volume, filter cutoff, etc.)
- Pencil tool to draw curves
- Snap/quantize for automation points

> Implementation note: You don’t need full audio synthesis now—just UI + state.

#### Bottom Center (optional): Instrument/Plugin Rack
- Shows instruments loaded per track/channel
- Each instrument card:
  - Instrument name
  - Preset dropdown
  - “Open UI” button (mock)
  - Bypass toggle
- Simple effects chain per track (mock):
  - EQ, Compressor, Reverb, Delay (UI placeholders)

### 3) Right Panel: Agent Mode (fixed dock, resizable)
A vertical agent area that is always visible (dockable allowed but default docked right).

Contents:
- Header: “Agent Mode”
  - Toggle: **Chat** | **Actions** | **Autocomplete**
  - Connection indicator (mock)
- Chat thread:
  - User messages + assistant messages
  - Messages can include:
    - Suggested actions (buttons)
    - Inline previews (e.g., “Insert chord progression”)
- Prompt input:
  - Multi-line input with send button
  - Quick prompt chips: “Add drums”, “Reharmonize”, “Make it darker”, “Humanize”, “Build a drop”
- “Apply Changes” area:
  - When agent suggests edits, show a diff summary:
    - “Add MIDI clip to Track 3 (bars 9–13)”
    - “Add drum fill (bar 8)”
  - Buttons:
    - Apply
    - Preview (mock)
    - Reject
- Autocomplete mode (UX concept):
  - Shows “ghost suggestions” list:
    - “Next chord: Dm9”
    - “Hat pattern: swing 56%”
  - Toggle “Live suggestions” on/off
  - “Accept” and “Accept partial” (mock)

Agent should not directly mutate UI state without user confirmation unless user enables “Auto-apply”.

---

## Bottom Options Bar (fixed height)
At the bottom of the window, create an options/status bar containing:
- Export:
  - Button: **Export MIDI**
  - Exports the entire arrangement to a `.mid` file (for now, generate a simple MIDI file from stored note events or export JSON placeholder if MIDI writer not implemented yet—prefer actual MIDI using a library like `@tonejs/midi`).
- Additional controls:
  - Snap indicator
  - Selected tool indicator (Draw/Select/etc.)
  - Status text (e.g., “Ready”, “Playing…”, “Recording…”, “Exported successfully”)

---

## Functional Requirements (Frontend State)
Represent the project with a MIDI-centric data model.

### Project Model (suggested)
- `Project`
  - `title`
  - `tempo`
  - `timeSignature`
  - `tracks[]`
  - `patterns[]`
  - `arrangementClips[]` (clips placed on playlist)
  - `automationLanes[]`
  - `mixer`
  - `history` (undo/redo)

- `Track`
  - `id`, `name`, `color`
  - `type`: instrument | drums | automation
  - `channelRackIds[]` (optional)
  - `instrument` (name/preset)
  - `mixerChannelId`
  - `mute/solo/arm`, `volume/pan`

- `MidiClip`
  - `id`, `trackId`
  - `startBar`, `lengthBars`
  - `notes[]` where each note:
    - `pitch`, `startTick`, `durationTick`, `velocity`, `channel`

- `Pattern`
  - step-seq representation + ability to convert to midi notes

### UI State
- Current view: playlist | piano roll | step sequencer | automation
- Selection: selected clip(s), selected notes, selected track
- Playhead position
- Loop region
- Tool selection
- Agent panel open mode + current draft edits

---

## Interaction Requirements
- Drag and drop:
  - From library → playlist creates clip
  - From library → channel rack adds instrument/pattern
- Double click:
  - Clip opens piano roll for that clip
- Right click context menus:
  - Clips (duplicate/split/delete)
  - Notes (quantize/humanize)
  - Tracks (add automation lane)
- Keyboard shortcuts (minimum):
  - Space: play/pause
  - R: record toggle
  - Ctrl/Cmd+Z: undo
  - Ctrl/Cmd+Shift+Z: redo
  - Delete: delete selection
  - Ctrl/Cmd+D: duplicate selection
  - Ctrl/Cmd+E: export MIDI

---

## Agent Integration (Mock First)
Implement an abstraction layer so the agent can later connect to real backend endpoints.

### Agent API Stub
Create a module:
- `agentClient.sendMessage(projectSnapshot, userMessage) -> agentResponse`
- `agentClient.getAutocomplete(projectSnapshot, cursorContext) -> suggestions`

Agent response should support:
- Plain text
- `proposedEdits[]` (structured)
- `suggestions[]` (for ghost notes)

When user clicks “Apply”, dispatch edits to the project store.

---

## Export MIDI (Frontend)
Implement **Export MIDI**:
- Use `@tonejs/midi` (preferred) or any browser-friendly MIDI writer.
- Convert arrangement clips + notes into tracks.
- File name: `${projectTitle}.mid`
- Trigger download.

If full MIDI export is too heavy for now:
- Provide a minimal valid MIDI with a single track and basic note events.

---

## Visual Design Notes
- Dark theme
- Clear contrast for clips and selection
- Grid lines subtle
- Meters and transport look professional
- Use icons where appropriate
- Resizable panels with grab handles

---

## Deliverables
- A working React app with:
  - Top transport bar
  - Left browser
  - Central playlist + piano roll + step sequencer + mixer (can be tabs or dockable)
  - Right agent mode panel (chat + actions + autocomplete list)
  - Bottom options bar with Export MIDI
- State persistence:
  - Save/load project as JSON locally (localStorage) is sufficient for demo
- Mock agent responses that can generate basic MIDI clips and show how “Apply” would work.

---

## Demo Scenario (Must Support)
1. User creates a track and draws a small MIDI clip in piano roll.
2. User opens Agent Mode and types: “Add a chill drum groove and a simple bassline.”
3. Agent responds with:
   - a short explanation
   - buttons: “Insert drums”, “Insert bass”, “Humanize”
4. User clicks “Insert drums” and sees a new drum clip appear in the playlist.
5. User exports the project via **Export MIDI** from the bottom bar.

Build the UI + state so this flow feels realistic.
