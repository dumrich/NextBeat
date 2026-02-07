# AI Beat Generation: Architecture Research & Recommendation

## What We’re Doing Today (Clarification)

**We are not using MIDI files in the pipeline.** The flow is:

- **Backend**: The LLM (with tools) outputs **structured JSON** that matches our app’s schema: `add_track`, `add_pattern` (step sequencer booleans), `add_clip` (notes as `pitch`, `startTick`, `durationTick`, `velocity`, `channel`).
- **Frontend**: Receives `proposedEdits` (JSON), applies them via the store (`addTrack`, `addMidiClip`, `addPattern`, `addArrangementClip`). Our internal model is **app-specific JSON** (Project, MidiClip, MidiNote, Pattern).
- **Export**: We *export* to a real MIDI file (`.mid`) using `@tonejs/midi` when the user clicks “Export MIDI”. So: **internal = JSON; export = MIDI.**

So the LLM is **not** creating a MIDI file; it’s creating **JSON that we map 1:1 into our app state**. That’s why tick math and musical quality are fragile: a general-purpose LLM is generating low-level note/pattern data without a music-specific representation or model.

---

## Why LLM-Only Beats Are “Really Bad”

From recent research and practice:

1. **LLMs are not music models**  
   They’re trained on text. Even with tools, they’re doing “pattern completion” in JSON, not music reasoning. Work like *“Can LLMs Reason in Music?”* shows **poor multi-step music reasoning** and limited use of real music knowledge.

2. **Wrong task**  
   Asking the model to output hundreds of precise numbers (ticks, pitches, velocities) in one shot is a **regression/sequence task**, not a natural language task. Specialized music models are trained on **event sequences** or **MIDI** and learn timing, rhythm, and harmony.

3. **No guarantee of validity**  
   We validate and clamp values, but we can’t fix bad rhythm, wrong harmony, or boring patterns. Quality needs either **templates/rules** or **music-trained models**.

4. **Representation**  
   Research systems (e.g. MIDI-GPT, Music Transformer) use **time-ordered event sequences** and **track structure**, often with explicit conditioning (instrument, style, density). Our current prompt + JSON is a very loose representation compared to that.

So: **optimal architecture = use the LLM for intent only; use something else (templates or a music model) to generate the actual notes/patterns.**

---

## MIDI File vs JSON in the Pipeline

| Aspect | MIDI file (`.mid`) | Our JSON (current) |
|--------|---------------------|---------------------|
| **What it is** | Standard binary/stream of events (note on/off, delta time, etc.). | App-specific: `Project`, `MidiClip`, `MidiNote[]`, `Pattern` (step booleans). |
| **Who produces it** | Many tools and models output MIDI (DAWs, Magenta, MIDI-GPT, etc.). | Only our backend; LLM outputs JSON that we defined. |
| **Interchange** | Universal. Any DAW or library can read/write. | Tied to our app. No standard. |
| **In our app** | We **export** to MIDI via `@tonejs/midi`. We do **not** currently **import** MIDI. | We **only** work internally with JSON; we apply edits as JSON. |

So:

- **“LLM creating a MIDI file”** = we don’t do that today. We’d need a backend step that produces a `.mid` (or equivalent event list), then we’d **parse MIDI → our JSON** in the frontend or backend.
- **“LLM creating JSON”** = that’s exactly what we do. The LLM (via tools) returns JSON that we apply as edits. The downside is that the LLM is bad at producing that JSON in a musically good way.

**Recommendation:**  
Keep **our internal format as JSON** (no need to change the app model). Change **how that JSON is produced**:

- Either **backend generates MIDI** (or event list) with a music model or templates, then **converts MIDI → our JSON** and sends `proposedEdits` as now,  
- Or **backend generates our JSON directly** from templates / rule engines (no MIDI step).  

So: **we can keep the same API and frontend; only the backend’s “generation” path changes** (LLM for intent → templates or music model → same JSON edits).

---

## Optimal Architecture (Research-Based)

### 1. **Hybrid: LLM for intent, something else for content**

- **LLM role**: Understand the user (“chill beat”, “trap”, “add drums only”, “full beat with bass and piano”). Output **intent**: style, tempo, key, which layers (drums / bass / chords), maybe bar range. **Do not** output raw note arrays or long step arrays.
- **Content generation**: A separate path that produces **notes and/or patterns**:
  - **Option A – Templates**: Curated drum patterns (step grids), bass patterns (note sequences), chord progressions. Backend picks by style/key and fills in ticks. Output is our JSON (add_pattern, add_clip). **Pros**: Fast, deterministic, no model; **cons**: limited variety.
  - **Option B – Music model**: Call a specialized model (e.g. Magenta-style, or an API that returns MIDI/events). Backend converts model output → our JSON (or MIDI → our JSON). **Pros**: More varied, potentially higher quality; **cons**: dependency, latency, hosting.
  - **Option C – Rules + randomness**: Rule-based rhythm (e.g. kick on 1 and 3, snare on 2 and 4), simple harmony rules (e.g. chord tones in key), random variation within constraints. Output our JSON. **Pros**: No external model; **cons**: can sound mechanical.

### 2. **Representation: event-based vs our JSON**

- **Event-based (MIDI-like)**: Note on, note off, delta time. Many research models output this (or MIDI). We can add a **MIDI → Project** importer: parse `.mid` (or an event list) into `MidiClip` + `MidiNote[]` and optionally into tracks/arrangement. Then “AI generates MIDI” fits: backend (or external service) produces MIDI → we parse to our JSON → same Apply flow.
- **Our JSON**: Remains the **internal** format. The only question is where the numbers (ticks, pitches, etc.) come from: LLM (current, weak) vs templates vs music model (stronger).

### 3. **Concrete pipeline options**

**Option I – Template library (fastest to ship)**  
- Backend has a **library of patterns**: e.g. 5–10 drum patterns (as step arrays), 5–10 bass patterns (as note lists with ticks), a few chord progressions (as note lists).  
- LLM (or a simple classifier) maps user message → **style/key/tempo** and **which templates** to use.  
- Backend fills in **ticks** from tempo/ticksPerBar, assigns track names, and returns **same `proposedEdits`** (add_track, add_pattern, add_clip) as today.  
- **No MIDI file** in the loop; we just generate our JSON from templates. Quality is bounded by template design.

**Option II – MIDI-capable backend**  
- Backend (or external API) runs a **music model** that outputs **MIDI** (or event list).  
- Backend converts **MIDI → our schema** (tracks, MidiClips, notes; optionally patterns if we derive step grids from MIDI).  
- Backend still returns **same `proposedEdits`** so the frontend doesn’t change.  
- We add a small **MIDI → Project** conversion (e.g. in backend or frontend) so “AI generates MIDI” becomes “AI generates MIDI → we turn it into our JSON and apply.”

**Option III – Specialized API (e.g. Replicate / Hugging Face)**  
- Use a **symbolic music model** (e.g. Music Transformer, or a drum/bass generator on Replicate/HF) that returns **MIDI or JSON notes**.  
- LLM only produces **conditioning** (style, BPM, key, “drums + bass”).  
- Backend calls the music API, converts response → our JSON, returns `proposedEdits`.  
- Still **no change** to the frontend contract; we’re just swapping “LLM generates notes” for “music model generates notes, we map to our JSON.”

---

## Summary Table

| Question | Answer |
|----------|--------|
| **Is the LLM creating a MIDI file?** | No. It’s creating **JSON** (our schema: tracks, clips, notes, patterns) that we apply in the app. We only **export** to MIDI when the user clicks Export. |
| **Should we switch to “LLM/model outputs MIDI”?** | Optional. We can have the **backend** (or an external service) output MIDI and then **convert MIDI → our JSON** so the rest of the app stays the same. |
| **Why are beats bad?** | Because a **general-purpose LLM** is generating low-level music data (ticks, pitches) without music training or structure. |
| **Optimal architecture?** | **LLM for intent only** (style, tempo, what to add). **Templates or a music model** for the actual notes/patterns. Output remains **our JSON** (same API and Apply flow). |
| **Easiest improvement?** | **Template library**: predefined drum patterns, bass patterns, chord progressions; LLM picks which + key/tempo; backend fills ticks and returns same `proposedEdits`. No new infra, no MIDI parsing if you don’t want it. |
| **Next step up?** | **MIDI in the loop**: backend or API generates MIDI → we add **MIDI → Project** conversion → same `proposedEdits` (or import flow). Then we can plug in any MIDI-capable model or service later. |

---

## References (from research)

- **MIDI-GPT** (arXiv:2501.17011): Controllable multitrack composition; track/bar infilling; conditioning on instrument, style, density; event-based representation.
- **LLMs and music**: “Can LLMs Reason in Music?” – LLMs show poor multi-step music reasoning; hybrid with music-specific components is preferred.
- **Music Transformer (Magenta)**: Event-based, long-term structure; trained on large MIDI/piano datasets; good for continuation/generation.
- **Template/rule systems**: e.g. Orthogonal Flow (drum patterns with state machines), Magenta.js for drums – deterministic or small-ML patterns.
- **MIDI vs JSON**: MIDI = standard interchange; JSON = flexible for web/API; conversion between them is standard; our app can stay on JSON internally and optionally accept MIDI as input to that JSON.
