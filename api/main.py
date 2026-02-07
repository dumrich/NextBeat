"""
NextBeat Music Generation API.

FastAPI application that orchestrates the full generation pipeline:
  User Request → Claude Primer → Post-Processing → Magenta Continuation → MIDI

Endpoints:
  POST /generate  - Generate music from a style prompt
  GET  /health    - Check server and model status
"""

import base64
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import settings
from primer_generator import generate_primer
from post_processing import post_process
import magenta_continuator as continuator

# --- Logging ---

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("nextbeat")


# --- Request / Response Models ---

class GenerateRequest(BaseModel):
    prompt: str = Field(..., description="Style description, e.g. '1920s jazz piano melody'")
    bars: int = Field(default=8, ge=1, le=64, description="Total bars to generate")
    primer_bars: int = Field(default=2, ge=1, le=8, description="Bars for Claude primer")
    tempo: int = Field(default=120, ge=40, le=300, description="Tempo in BPM")
    temperature: float = Field(default=0.9, ge=0.1, le=2.0, description="Generation temperature")
    instrument: str = Field(default="piano", description="'drums', 'piano', or 'melody'")


class GenerateResponse(BaseModel):
    midi_base64: str
    filename: str
    total_notes: int
    duration_seconds: float
    primer_notes: int
    generated_notes: int
    instrument: str
    style: str
    tempo: int
    bars: int


class HealthResponse(BaseModel):
    status: str
    models: dict
    claude_api: str
    version: str


# --- Lifecycle ---

model_status = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: load Magenta models, create output dir."""
    global model_status

    logger.info("=" * 60)
    logger.info("NextBeat Music Generation API starting up")
    logger.info("=" * 60)

    # Create output directory
    os.makedirs(settings.output_dir, exist_ok=True)
    logger.info(f"Output directory: {settings.output_dir}")

    # Check Claude API key
    if settings.anthropic_api_key:
        logger.info("Claude API key: configured")
    else:
        logger.warning(
            "ANTHROPIC_API_KEY not set! Add it to api/.env file. "
            "The /generate endpoint will fail without it."
        )

    # Load Magenta models (this takes 1-3 minutes)
    logger.info("Loading Magenta models (this may take a few minutes)...")
    model_status = continuator.load_all_models()

    if not model_status.get("drums_rnn"):
        logger.warning("DrumsRNN not loaded — drum generation will return primer only")
    if not model_status.get("music_transformer"):
        logger.warning("Music Transformer not loaded — piano generation will return primer only")

    logger.info("=" * 60)
    logger.info("NextBeat API ready!")
    logger.info(f"  Docs: http://{settings.host}:{settings.port}/docs")
    logger.info("=" * 60)

    yield  # App runs here

    logger.info("Shutting down NextBeat API")


# --- App ---

app = FastAPI(
    title="NextBeat Music Generation API",
    version="1.0.0",
    description="AI-powered music generation using Claude + Magenta",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Endpoints ---

@app.get("/health", response_model=HealthResponse)
async def health():
    """Check server health, model status, and API connectivity."""
    return HealthResponse(
        status="ok",
        models=continuator.models_status(),
        claude_api="configured" if settings.anthropic_api_key else "missing",
        version="1.0.0",
    )


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    """Generate music from a style prompt.

    Full pipeline:
    1. Claude generates a style-appropriate primer (2 bars)
    2. Post-processing refines timing, applies swing/groove, humanizes
    3. Magenta model continues the primer to full length
    4. Result converted to MIDI and returned as base64
    """
    request_id = uuid.uuid4().hex[:8]
    logger.info(
        f"[{request_id}] Generate request: prompt='{req.prompt}', "
        f"instrument={req.instrument}, bars={req.bars}, tempo={req.tempo}"
    )
    pipeline_start = time.time()

    # Validate instrument routing
    instrument = req.instrument.lower()
    if instrument in ("drums", "percussion", "drum"):
        instrument = "drums"
    elif instrument in ("piano", "melody", "keys", "keyboard"):
        instrument = "piano"
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown instrument '{req.instrument}'. Use 'drums', 'piano', or 'melody'.",
        )

    # Ensure primer is shorter than total
    primer_bars = min(req.primer_bars, req.bars)

    # --- Step 1: Generate primer with Claude ---
    try:
        logger.info(f"[{request_id}] Step 1: Generating primer with Claude...")
        step_start = time.time()

        primer = generate_primer(
            prompt=req.prompt,
            instrument=instrument,
            bars=primer_bars,
            tempo=req.tempo,
        )
        primer_notes = primer["notes"]
        primer_count = len(primer_notes)

        logger.info(
            f"[{request_id}] Primer: {primer_count} notes "
            f"({time.time() - step_start:.1f}s)"
        )

    except ValueError as e:
        logger.error(f"[{request_id}] Primer generation failed: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"[{request_id}] Claude API error: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Claude API error: {str(e)}",
        )

    # --- Step 2: Post-process primer ---
    logger.info(f"[{request_id}] Step 2: Post-processing...")
    step_start = time.time()

    processed_notes = post_process(
        notes=primer_notes,
        style=req.prompt,
        instrument=instrument,
    )

    logger.info(
        f"[{request_id}] Post-processed: {len(processed_notes)} notes "
        f"({time.time() - step_start:.2f}s)"
    )

    # --- Step 3: Magenta continuation ---
    logger.info(f"[{request_id}] Step 3: Magenta continuation...")
    step_start = time.time()

    if instrument == "drums":
        sequence = continuator.continue_drums(
            primer_notes=processed_notes,
            total_bars=req.bars,
            primer_bars=primer_bars,
            tempo=req.tempo,
            temperature=req.temperature,
        )
    else:
        sequence = continuator.continue_piano(
            primer_notes=processed_notes,
            total_bars=req.bars,
            primer_bars=primer_bars,
            tempo=req.tempo,
            temperature=req.temperature,
        )

    if sequence is None:
        raise HTTPException(status_code=500, detail="Magenta generation returned no output")

    total_notes = len(sequence.notes)
    generated_notes = total_notes - primer_count
    duration = sequence.total_time

    logger.info(
        f"[{request_id}] Continuation: {generated_notes} new notes, "
        f"{duration:.1f}s total ({time.time() - step_start:.1f}s)"
    )

    # --- Step 4: Convert to MIDI ---
    logger.info(f"[{request_id}] Step 4: Converting to MIDI...")

    filename = f"nextbeat_{instrument}_{request_id}.mid"
    output_path = os.path.join(settings.output_dir, filename)

    try:
        continuator.sequence_to_midi_file(sequence, output_path)

        with open(output_path, "rb") as f:
            midi_bytes = f.read()

        midi_base64 = base64.b64encode(midi_bytes).decode("utf-8")

    except Exception as e:
        logger.error(f"[{request_id}] MIDI conversion failed: {e}")
        raise HTTPException(status_code=500, detail=f"MIDI conversion error: {str(e)}")

    total_time = time.time() - pipeline_start
    logger.info(
        f"[{request_id}] Complete! {total_notes} notes, {duration:.1f}s, "
        f"pipeline took {total_time:.1f}s"
    )

    return GenerateResponse(
        midi_base64=midi_base64,
        filename=filename,
        total_notes=total_notes,
        duration_seconds=round(duration, 2),
        primer_notes=primer_count,
        generated_notes=max(0, generated_notes),
        instrument=instrument,
        style=req.prompt,
        tempo=req.tempo,
        bars=req.bars,
    )


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.environment == "development",
    )
