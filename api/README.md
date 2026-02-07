# NextBeat Backend — AI Music Generation API

Hybrid AI music generation backend that combines Claude (for style understanding) with Magenta (for musical sophistication).

**Pipeline:** User Prompt → Claude Primer → Post-Processing → Magenta Continuation → MIDI

## Quick Start

### 1. Install dependencies

```bash
cd api
pip install -r requirements.txt
```

**Apple Silicon note:** If `magenta` fails to install, install TensorFlow first:
```bash
pip install tensorflow-macos tensorflow-metal
pip install note-seq magenta
```

**Alternative (without Magenta):** The server works without Magenta models — it will return Claude-generated primers only:
```bash
pip install fastapi uvicorn pydantic pydantic-settings python-dotenv anthropic note-seq pretty-midi mido
```

### 2. Configure API key

```bash
cp .env.example .env
# Edit .env and add your Anthropic API key
```

Get a key at: https://console.anthropic.com/settings/keys

### 3. Download Magenta models (optional)

```bash
mkdir -p models

# DrumsRNN (~5 MB)
gsutil cp gs://magentadata/models/music_rnn/drum_kit_rnn.mag models/

# Music Transformer (~100 MB) — see Magenta docs for checkpoint location
# Alternative: download from Magenta's GitHub releases
```

If `gsutil` isn't available:
```bash
pip install google-cloud-storage
# Or download directly from Magenta's GitHub releases page
```

### 4. Run the server

```bash
cd api
python main.py
```

The server starts on `http://localhost:8000`. Startup takes 1-3 minutes if Magenta models are present (loading into memory). Without models, it starts instantly.

**Verify it's running:**
```bash
curl http://localhost:8000/health
```

**API docs:** Open http://localhost:8000/docs for interactive Swagger UI.

## API Endpoints

### POST /generate

Generate music from a style prompt.

**Request:**
```json
{
  "prompt": "1920s jazz piano melody",
  "bars": 8,
  "primer_bars": 2,
  "tempo": 120,
  "temperature": 0.9,
  "instrument": "piano"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `prompt` | string | required | Style description |
| `bars` | int | 8 | Total bars to generate (1-64) |
| `primer_bars` | int | 2 | Bars for Claude primer (1-8) |
| `tempo` | int | 120 | BPM (40-300) |
| `temperature` | float | 0.9 | Creativity (0.1-2.0) |
| `instrument` | string | "piano" | "drums", "piano", or "melody" |

**Response:**
```json
{
  "midi_base64": "<base64 MIDI data>",
  "filename": "nextbeat_piano_abc12345.mid",
  "total_notes": 87,
  "duration_seconds": 16.0,
  "primer_notes": 24,
  "generated_notes": 63,
  "instrument": "piano",
  "style": "1920s jazz piano melody",
  "tempo": 120,
  "bars": 8
}
```

### GET /health

```json
{
  "status": "ok",
  "models": {
    "drums_rnn_loaded": true,
    "music_transformer_loaded": false,
    "any_loaded": true
  },
  "claude_api": "configured",
  "version": "1.0.0"
}
```

## Architecture

```
api/
├── main.py                 # FastAPI app, endpoint definitions, pipeline orchestration
├── config.py               # Pydantic Settings (all config from .env)
├── primer_generator.py     # Claude API integration, prompt engineering, JSON parsing
├── post_processing.py      # Quantization, swing, humanization, style transforms
├── magenta_continuator.py  # Magenta model loading, sequence conversion, continuation
├── requirements.txt        # Python dependencies
├── .env.example            # Environment variable template
└── models/                 # Magenta model checkpoints (not in git)
    ├── drum_kit_rnn.mag
    └── music_transformer/
```

### Module Responsibilities

- **config.py** — All settings in one place. Change parameters here (swing ratio, humanization amount, temperatures, etc.) without touching code.
- **primer_generator.py** — Builds style-specific prompts for Claude, handles JSON extraction from responses (including when Claude wraps in markdown), validates note data.
- **post_processing.py** — The quality layer. Quantizes timing, applies style transforms (swing for jazz, ghost notes for funk, emphasis for rock, offbeats for reggae), then adds humanization.
- **magenta_continuator.py** — Loads models at startup, converts between note dicts and NoteSequence protobuf, generates continuations, exports MIDI.
- **main.py** — FastAPI endpoints, CORS, pipeline orchestration with logging at each step.

## Testing

### Test Claude primer generation
```bash
python -c "
from primer_generator import generate_primer
result = generate_primer('jazz swing', 'drums', bars=2, tempo=120)
print(f'{len(result[\"notes\"])} notes generated')
for n in result['notes'][:5]:
    print(n)
"
```

### Test post-processing
```bash
python -c "
from post_processing import post_process
notes = [
    {'drum': 'kick', 'midi_note': 36, 'time': 0.0, 'velocity': 100},
    {'drum': 'hihat', 'midi_note': 42, 'time': 0.498, 'velocity': 70},
    {'drum': 'snare', 'midi_note': 38, 'time': 1.0, 'velocity': 90},
]
processed = post_process(notes, 'jazz swing', 'drums')
for n in processed:
    print(f'{n[\"drum\"]:>10} t={n[\"time\"]:.3f} v={n[\"velocity\"]}')
"
```

### Test full pipeline via API
```bash
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "funky drum groove", "instrument": "drums", "bars": 4}'
```

### Example prompts to try
- `"1920s jazz swing drums"` — ride cymbal pattern, brush-like snare
- `"heavy rock drums"` — driving kick/snare, crash cymbal accents
- `"funk groove drums"` — syncopated with ghost notes
- `"jazz piano walking bass"` — 7th chords, chromatic approaches
- `"blues piano"` — pentatonic licks, call-and-response
- `"classical piano sonata"` — arpeggios, clear melody

## Tuning Parameters

All in `.env` or `config.py`:

| Parameter | Default | Effect |
|-----------|---------|--------|
| `QUANTIZE_GRID` | 0.25 | Grid resolution (0.25=16ths, 0.5=8ths) |
| `SWING_RATIO` | 0.66 | Swing amount (0.5=straight, 0.75=hard swing) |
| `HUMANIZE_TIMING` | 0.015 | Timing randomness in beats |
| `HUMANIZE_VELOCITY` | 8 | Velocity randomness range |
| `DRUMS_TEMPERATURE` | 0.9 | DrumsRNN creativity |
| `PIANO_TEMPERATURE` | 0.8 | Music Transformer creativity |
| `CLAUDE_TEMPERATURE` | 0.7 | Claude primer creativity |

## Troubleshooting

**"ANTHROPIC_API_KEY not set"** — Create `.env` file with your key. See `.env.example`.

**"DrumsRNN checkpoint not found"** — Download models to `api/models/`. Server still works without them (returns primer only).

**"Could not extract valid JSON from Claude response"** — Claude sometimes changes output format. The parser handles most variations, but if it fails repeatedly, check the prompt in `primer_generator.py`.

**"Magenta not installed"** — `pip install magenta`. On Apple Silicon, may need `tensorflow-macos` first.

**Frontend can't connect** — Check CORS settings in `.env` and ensure the server is running on the expected port (default 8000).
