# AI Pipeline Proposal for NextBeat

This document summarizes the current app, then proposes a concrete pipeline for **LLM-based beat creation** and **transformer-based autocomplete**.

---

## 1. Project Summary (What You Have)

- **Stack**: Next.js 16, React 19, Zustand, Tone.js, `@tonejs/midi`.
- **Data model** (see `frontend/types/project.ts`):
  - **Project**: `tempo`, `timeSignature`, `tracks[]`, `patterns[]`, `midiClips[]`, `arrangementClips[]`, `mixer`.
  - **Track**: `id`, `name`, `color`, `type` (instrument | drums | automation), `instrument` (e.g. `'piano'`, `'bass'`).
  - **MidiClip**: `trackId`, `startBar`, `lengthBars`, `notes[]`.
  - **MidiNote**: `pitch` (0–127), `startTick`, `durationTick`, `velocity`, `channel`.
  - **Pattern**: `steps`, `channels[]` with `steps: boolean[]` (step sequencer).
  - **ArrangementClip**: places a MidiClip or Pattern on a track at `startBar` for `lengthBars`.
- **Instruments**: Tone.js synths per track (piano, synth, bass, guitar, strings, brass, drums, percussion) via `useInstruments` and `createInstrument`.
- **Views**: Transport, Playlist (arrangement), Piano Roll, Step Sequencer, Agent Panel, Bottom Bar (Export MIDI).
- **Agent abstraction** (`frontend/utils/agentClient.ts`):
  - `sendMessage(projectSnapshot, userMessage)` → `AgentResponse` with `message`, `proposedEdits?`, `suggestions?`.
  - `getAutocomplete(projectSnapshot, cursorContext)` → `Suggestion[]`.
  - **ProposedEdit** types: `addClip` | `addPattern` | `modifyClip` | `addTrack`, each with `description` and `data` matching what the store expects.
- **Apply flow**: `AgentPanel.handleApplyEdit(edit)` already maps each edit type to `addTrack`, `addMidiClip`, `addPattern`, `addArrangementClip` — so any backend that returns the same edit shapes will work without frontend changes.

So the integration point for AI is: **implement the same `AgentResponse` / `ProposedEdit` / `Suggestion` contract on a real backend**, and swap the mock `agentClient` to call that backend.

---

## 2. LLM Pipeline — “Create a New Beat” and Similar Tasks

### Goal

Turn natural language (“Add a chill drum groove and a simple bassline”, “Create a new beat”, “Make a 4-bar drop”) into **structured edits** that the frontend can apply with the existing Apply/Reject flow.

### Contract (already defined)

- **Input**: `projectSnapshot` (full or summarized `Project`), `userMessage` (string).
- **Output**: `{ message: string, proposedEdits?: ProposedEdit[], suggestions?: Suggestion[] }` where each edit has `type`, `description`, and `data` in the exact shape expected by `handleApplyEdit` (see `AgentPanel.tsx` and `projectStore`).

### Pipeline Design

1. **Backend API**  
   - Single endpoint, e.g. `POST /api/agent` (or a separate Node/Python service).  
   - Body: `{ projectSnapshot: Project, message: string }`.  
   - Returns: `AgentResponse`.

2. **Context for the LLM**  
   - **Always**: `tempo`, `timeSignature`, `songLength` (or derived from arrangement), list of `tracks` with `id`, `name`, `instrument`, `type`.  
   - **Optional (token budget allowing)**: for each track, list of arrangement clips (trackId, startBar, lengthBars, clipType, clipDataId).  
   - **Optional (lightweight)**: per MidiClip, a short summary (e.g. “8 bars, 24 notes, pitch range C3–G5”) instead of full `notes[]` to avoid huge payloads.  
   - **Optional**: one or two “example” `ProposedEdit` JSON blocks in the system prompt so the model sees the exact format.

3. **Structured output**  
   - Use **LLM JSON mode** or **tool use** so the model returns only valid JSON.  
   - **Option A — Single JSON blob**: System prompt says “Reply with a JSON object: `{ \"message\": \"...\", \"proposedEdits\": [ ... ] }`. Each element of `proposedEdits` must have `type` (addTrack | addClip | addPattern | modifyClip), `description`, and `data` as follows: …” with a minimal schema for each type.  
   - **Option B — Tools**: Define tools like `add_track`, `add_midi_clip`, `add_pattern` with strict JSON schemas; map tool calls to `ProposedEdit[]` in your backend.  
   - Validate the parsed response against your TypeScript types (or a shared JSON schema) before returning to the frontend.

4. **“Create a new beat”**  
   - One possible interpretation: generate a set of edits, e.g.  
     - `addTrack` for Drums (or use existing drums track),  
     - `addPattern` with a kick/snare/hat pattern (e.g. 16 steps, `channels[].steps` booleans),  
     - `addArrangementClip` for that pattern on the drums track;  
     - optionally `addTrack` + `addClip` for a bassline (list of `MidiNote` with correct `startTick`/`durationTick` for the chosen tempo/ticksPerBar).  
   - The LLM doesn’t need to know Tone.js — only your project schema (tracks, clips, patterns, notes in ticks).

5. **Ticks and tempo**  
   - Your app uses `ticksPerBar = 1920` (see `PianoRollView`, `midiExport`). So for a given `tempo` and `timeSignature`, the LLM (or a small post-processor) must output `startTick` / `durationTick` consistent with that (e.g. quarter = 480 ticks). You can either (a) document this in the prompt and let the model output ticks, or (b) have the model output “quarter note positions” and convert to ticks in the backend.

### Suggested implementation order

- Add **Next.js API route** `app/api/agent/route.ts` (or equivalent) that:
  - Reads `projectSnapshot` and `message` from the body.
  - Builds a **compact project context** (track list, clip metadata, no full note arrays if possible).
  - Calls an LLM (OpenAI, Anthropic, or open-source) with a system prompt that includes the edit schema and 1–2 example edits.
  - Parses and validates the model output into `AgentResponse`, then returns it.
- In the frontend, replace the mock `agentClient.sendMessage` with a `fetch` to `POST /api/agent` and keep the rest of `AgentPanel` unchanged.

---

## 3. Transformer / Autocomplete Pipeline

### Goal

Suggest the “next” thing while the user is editing: **next chord**, **next note**, or **next step pattern** (e.g. hi-hat pattern), with low latency and optional “ghost” UI.

### Contract (already defined)

- **Input**: `projectSnapshot`, `cursorContext` (you can define shape).  
- **Output**: `Suggestion[]` with `type` (chord | pattern | note), `text`, and `data` (e.g. `pitches`, `pitch`, `swing`, etc.).  
- The frontend already has an “Autocomplete” mode in the Agent panel that displays suggestions and “Accept”; you can later hook the same suggestions into the piano roll or step sequencer as ghost notes.

### What “cursorContext” should contain

So that a model can suggest the next thing, it needs:

- **Piano roll**: `trackId`, `clipId`, `cursorTick` (or bar/beat), `recentNotes` (last N notes: pitch, startTick, durationTick, velocity), optionally `scale` or `key`.
- **Step sequencer**: `patternId`, `channelId`, `stepIndex`, `recentSteps` (e.g. last 8 steps for this channel or full pattern).

### Options (from simplest to more advanced)

1. **Rule-based + LLM (MVP)**  
   - **Chords**: Predefined progressions (I–V–vi–IV, etc.) or a small table of “next chord” given current chord; or call the same LLM with a tiny prompt: “Given these notes [last 4 chords], suggest the next chord in the same key.”  
   - **Notes**: Scale constraints (e.g. only notes in C major), or “repeat last interval”.  
   - **Pattern**: Copy a slice of the current pattern, or apply a template (e.g. “swing 8ths”).  
   - Implement in `getAutocomplete` (or in a new `POST /api/autocomplete`) and return `Suggestion[]`. No transformer needed; good for shipping fast.

2. **LLM for autocomplete**  
   - Same backend, endpoint e.g. `POST /api/autocomplete` with `projectSnapshot` + `cursorContext`.  
   - Prompt: “Given this context [cursorContext], suggest 3 short suggestions: next chord, next note, or pattern tweak. Return JSON: { suggestions: [ { type, text, data } ] }.”  
   - Pros: flexible, one model for many suggestion types. Cons: latency and cost; better for “next phrase” than per-note.

3. **Small transformer (dedicated autocomplete model)**  
   - **Input representation**: Sequence of “tokens” (e.g. note-on events, chord symbols, or step activations).  
   - **Output**: Next token or distribution (next note, next chord, next step).  
   - **Training**: Train on MIDI files or chord charts (e.g. Lakh MIDI, or internal datasets). You can use a small decoder-only transformer (e.g. 6 layers, 256 dim, context length 256–512).  
   - **Inference**:  
     - **Server**: Run the model in Python (PyTorch/ONNX) or Node (ONNX Runtime); call it from `POST /api/autocomplete`.  
     - **Browser**: Export to ONNX or TensorFlow.js and run in the worker to avoid blocking the UI; same API from the frontend.  
   - This gives fast, free, private suggestions once the model is trained and integrated.

4. **Hybrid**  
   - Use the **transformer** for high-frequency, low-level suggestions (next note, next step).  
   - Use the **LLM** for higher-level actions (e.g. “fill bar 4 with a variation”, “suggest a B section”) that produce `ProposedEdit[]` via the existing agent endpoint.

### Suggested implementation order

- **Phase 1**: Implement `POST /api/autocomplete` with **rule-based or LLM** logic; define `cursorContext` in the frontend (e.g. when opening piano roll or step sequencer, send current clip + last N notes and cursor position). Connect `agentClient.getAutocomplete` to this endpoint and wire “Accept” in the Autocomplete tab to apply the suggestion (e.g. insert a chord as notes, or apply a pattern suggestion).
- **Phase 2**: If you want lower latency and no per-request cost, add a **small transformer** (trained on MIDI or chord data) and run it in the backend (or in the browser via ONNX/TF.js); keep the same `getAutocomplete` → `Suggestion[]` contract so the UI doesn’t change.

---

## 4. End-to-End Architecture Sketch

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js)                                              │
│  - projectStore (Zustand)                                       │
│  - agentClient.sendMessage(project, message)                    │
│  - agentClient.getAutocomplete(project, cursorContext)           │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  API Layer (e.g. Next.js API Routes)                             │
│  POST /api/agent        → LLM → structured ProposedEdit[]       │
│  POST /api/autocomplete → Transformer or rules → Suggestion[]   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   LLM (OpenAI/         Small transformer   Rule-based
   Anthropic/           (next note/chord/   (scale, progressions,
   open-source)         step prediction)    templates)
```

- **Create beat / high-level edits**: LLM only; output must conform to `ProposedEdit[]` and your ticks convention.  
- **Autocomplete**: Start with rules or LLM; later add a transformer for speed and cost.

---

## 5. Summary and Next Steps

| Component        | Purpose                    | Implementation options                                      |
|-----------------|----------------------------|-------------------------------------------------------------|
| **LLM**         | “Create beat”, add drums, bass, chords, reharmonize | Next.js API route → LLM with structured output (JSON or tools) |
| **Transformer** | Autocomplete (next note/chord/pattern)             | Rule-based or LLM first; then small transformer (server or ONNX in browser) |
| **Frontend**    | No change to apply flow    | Swap mock `agentClient` to call `/api/agent` and `/api/autocomplete` |

**Concrete next steps:**

1. Add **`/api/agent`** with an LLM and a strict schema for `ProposedEdit` (and ticks rules); test with “Add drums” and “Create a new beat”.
2. Define **`cursorContext`** and add **`/api/autocomplete`** with simple rules or the same LLM; connect Agent panel Autocomplete tab to it.
3. Optionally add a **small transformer** for autocomplete later, keeping the same API contract.

If you want, next we can (a) add the Next.js API route stubs and a minimal LLM integration (e.g. OpenAI), or (b) define the exact `cursorContext` type and a first rule-based autocomplete implementation.

---

## 6. Implemented improvements for long songs and complex beats

The following changes were made so the agent handles **longer songs** and **more complex beats** better:

- **Tick formula in prompt**: The system prompt now states explicitly that bar N starts at tick `N * 1920`, with examples. This reduces tick math errors for multi-bar clips.
- **Song length in context**: The frontend sends `songLength` (total bars) with every request; the backend includes it in the project context so the LLM knows the timeline length and can generate for the full song when asked.
- **Section-based generation**: The API accepts optional `startBar` and `lengthBars`. When set, the prompt tells the LLM to generate only for that bar range (useful for chunked generation: e.g. “add drums for bars 8–12” or multiple calls for 0–4, 4–8, …).
- **Longer patterns**: The prompt explains that patterns can use `steps`: 16 (4 bars), 32 (8 bars), 64 (16 bars) with 4 steps per bar. Drum pattern guidance includes backbeat, hi-hat patterns, and a fill in the last 1–2 bars.
- **Long-clip guidance**: For 8+ bar clips, the prompt suggests repeating/evolving patterns, slight velocity variation, and optionally splitting into multiple `addClip` edits (e.g. one per 4 bars) for accuracy.
- **Higher max_tokens**: Completions use `max_tokens: 8192` so long note lists are not truncated.
- **Validation and safety**: `validateAndNormalizeEdits` caps notes per clip at 2000, clamps pitch/velocity/tick values, and normalizes pattern channel step array length to match `steps`. Temperature lowered to 0.4 for more consistent structure.
