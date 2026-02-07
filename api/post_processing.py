"""
Post-Processing Module.

Transforms raw Claude output into musically polished input for Magenta.
This module is critical for quality — it's the difference between
mechanical-sounding output and something that grooves.

Processing order matters:
1. Quantize - snap to grid (clean up imprecise LLM timing)
2. Style transforms - apply intentional deviations (swing, emphasis)
3. Humanize - add micro-variations (make it feel alive)
"""

import random
import logging
from copy import deepcopy

from config import settings

logger = logging.getLogger(__name__)


# --- Quantization ---

def quantize_notes(notes: list[dict], grid: float = None) -> list[dict]:
    """Snap all note times to the nearest musical grid position.

    LLMs often output imprecise timing (e.g. 0.498 instead of 0.5).
    This rounds to the nearest grid subdivision.

    Args:
        notes: List of note dicts with "time" field
        grid: Grid resolution in beats (default: config's quantize_grid = 0.25 = 16th notes)
    """
    if grid is None:
        grid = settings.quantize_grid

    quantized = []
    for note in notes:
        n = deepcopy(note)
        n["time"] = round(n["time"] / grid) * grid
        # Also quantize duration if present (piano notes)
        if "duration" in n:
            n["duration"] = max(grid, round(n["duration"] / grid) * grid)
        quantized.append(n)

    return quantized


# --- Style-Specific Transforms ---

def apply_swing(notes: list[dict], ratio: float = None) -> list[dict]:
    """Apply swing feel by delaying offbeat notes.

    Swing transforms straight 8th/16th notes into a long-short pattern.
    A ratio of 0.66 means the downbeat 8th gets 2/3 of the beat and the
    upbeat gets 1/3 (standard swing). 0.5 = straight, 0.75 = hard swing.

    Only affects notes that fall on upbeat 8th-note positions (0.5, 1.5, etc.)
    within each beat.

    Args:
        notes: Quantized note list
        ratio: Swing ratio (0.5=straight, 0.66=standard, 0.75=hard swing)
    """
    if ratio is None:
        ratio = settings.swing_ratio

    if abs(ratio - 0.5) < 0.01:
        return notes  # No swing needed

    swung = []
    for note in notes:
        n = deepcopy(note)
        beat_pos = n["time"] % 1.0  # Position within the beat

        # If this note falls on the upbeat 8th (0.5 within the beat),
        # shift it forward based on swing ratio
        if abs(beat_pos - 0.5) < 0.01:
            beat_floor = n["time"] - beat_pos
            n["time"] = beat_floor + ratio

        # Also handle 16th-note level swing:
        # The "e" of each beat (0.25) stays, but the "a" (0.75) gets shifted
        elif abs(beat_pos - 0.75) < 0.01:
            beat_floor = n["time"] - beat_pos
            # Shift the "a" proportionally
            n["time"] = beat_floor + 0.5 + (ratio / 2)

        swung.append(n)

    return swung


def apply_rock_emphasis(notes: list[dict]) -> list[dict]:
    """Emphasize downbeats for rock/pop feel.

    Increases velocity on beats 1 and 3, slightly reduces beats 2 and 4
    for a driving feel.
    """
    emphasized = []
    for note in notes:
        n = deepcopy(note)
        beat_pos = n["time"] % 4.0  # Position within the bar

        # Beats 1 and 3 (0.0 and 2.0) get boosted
        if abs(beat_pos) < 0.01 or abs(beat_pos - 2.0) < 0.01:
            n["velocity"] = min(settings.velocity_max, int(n["velocity"] * 1.15))
        # Beats 2 and 4 (1.0 and 3.0) stay or get slightly reduced
        elif abs(beat_pos - 1.0) < 0.01 or abs(beat_pos - 3.0) < 0.01:
            n["velocity"] = max(settings.velocity_min, int(n["velocity"] * 0.95))

        emphasized.append(n)

    return emphasized


def add_funk_ghost_notes(notes: list[dict]) -> list[dict]:
    """Add ghost notes on snare for funk grooves.

    Ghost notes are quiet snare hits between main strokes that give
    funk its characteristic pocket feel.
    """
    result = deepcopy(notes)
    new_ghosts = []

    # Find all snare hit times to avoid doubling
    snare_times = {n["time"] for n in result if n.get("drum") == "snare"}

    # Add ghost notes on 16th-note positions where there's no snare hit
    max_time = max((n["time"] for n in result), default=0)
    bars = int(max_time / 4.0) + 1

    for bar in range(bars):
        for sixteenth in range(16):
            time = bar * 4.0 + sixteenth * 0.25
            if time > max_time:
                break
            # Skip positions that already have a snare hit
            if any(abs(time - t) < 0.01 for t in snare_times):
                continue
            # Add ghost note with ~40% probability on offbeat 16ths
            beat_sub = sixteenth % 4
            if beat_sub in (1, 3) and random.random() < 0.4:
                new_ghosts.append({
                    "drum": "snare",
                    "midi_note": 38,
                    "time": time,
                    "velocity": random.randint(35, 55),  # Very quiet
                })

    result.extend(new_ghosts)
    return result


def apply_reggae_offbeat(notes: list[dict]) -> list[dict]:
    """Shift rhythmic emphasis to offbeats for reggae/ska feel.

    In reggae, the "skank" guitar/keys emphasize the "and" of each beat.
    For drums, the kick often falls on beat 3 rather than 1.
    """
    shifted = []
    for note in notes:
        n = deepcopy(note)
        beat_pos = n["time"] % 1.0

        # Boost offbeat notes
        if abs(beat_pos - 0.5) < 0.1:
            n["velocity"] = min(settings.velocity_max, int(n["velocity"] * 1.2))
        # Reduce downbeat emphasis
        elif abs(beat_pos) < 0.1:
            n["velocity"] = max(settings.velocity_min, int(n["velocity"] * 0.85))

        shifted.append(n)

    return shifted


# --- Humanization ---

def humanize(
    notes: list[dict],
    timing_amount: float = None,
    velocity_amount: int = None,
) -> list[dict]:
    """Add subtle random variations to timing and velocity.

    Makes mechanical MIDI data sound more like a human performance.
    Applied after all intentional style transforms so it doesn't
    interfere with groove patterns.

    Args:
        notes: Note list after quantization and style processing
        timing_amount: Max timing offset in beats (default: config's humanize_timing)
        velocity_amount: Max velocity offset (default: config's humanize_velocity)
    """
    if timing_amount is None:
        timing_amount = settings.humanize_timing
    if velocity_amount is None:
        velocity_amount = settings.humanize_velocity

    humanized = []
    for note in notes:
        n = deepcopy(note)

        # Timing micro-variation (gaussian for more natural distribution)
        time_offset = random.gauss(0, timing_amount / 2)
        time_offset = max(-timing_amount, min(timing_amount, time_offset))
        n["time"] = max(0.0, n["time"] + time_offset)

        # Velocity micro-variation
        vel_offset = random.randint(-velocity_amount, velocity_amount)
        n["velocity"] = max(settings.velocity_min, min(settings.velocity_max, n["velocity"] + vel_offset))

        humanized.append(n)

    return humanized


# --- Style Detection and Pipeline ---

# Keywords that map to swing-based styles
SWING_STYLES = {"jazz", "swing", "blues", "shuffle", "bebop", "dixieland", "ragtime", "big band"}
ROCK_STYLES = {"rock", "metal", "punk", "grunge", "hard rock", "classic rock", "alternative"}
FUNK_STYLES = {"funk", "soul", "motown", "r&b", "neo-soul", "disco"}
REGGAE_STYLES = {"reggae", "ska", "dub", "dancehall"}


def _detect_style_category(style_prompt: str) -> str:
    """Detect which style category a prompt falls into for post-processing."""
    prompt_lower = style_prompt.lower()

    for keyword in SWING_STYLES:
        if keyword in prompt_lower:
            return "swing"
    for keyword in FUNK_STYLES:
        if keyword in prompt_lower:
            return "funk"
    for keyword in ROCK_STYLES:
        if keyword in prompt_lower:
            return "rock"
    for keyword in REGGAE_STYLES:
        if keyword in prompt_lower:
            return "reggae"

    return "neutral"  # No special style processing


def post_process(
    notes: list[dict],
    style: str,
    instrument: str,
) -> list[dict]:
    """Run the full post-processing pipeline on primer notes.

    Order: quantize → style-specific transforms → humanize

    Args:
        notes: Raw note data from Claude
        style: The style prompt (used to determine which transforms to apply)
        instrument: "drums" or "piano"
    """
    if not notes:
        return notes

    logger.info(f"Post-processing {len(notes)} {instrument} notes for style '{style}'")

    # Step 1: Quantize to grid
    processed = quantize_notes(notes)
    logger.debug(f"After quantization: {len(processed)} notes")

    # Step 2: Style-specific transforms
    category = _detect_style_category(style)
    logger.info(f"Detected style category: {category}")

    if category == "swing":
        processed = apply_swing(processed)
        logger.debug("Applied swing")

    elif category == "rock":
        processed = apply_rock_emphasis(processed)
        logger.debug("Applied rock emphasis")

    elif category == "funk":
        processed = apply_rock_emphasis(processed)  # Funk also benefits from emphasis
        if instrument == "drums":
            processed = add_funk_ghost_notes(processed)
            logger.debug("Applied funk ghost notes")

    elif category == "reggae":
        processed = apply_reggae_offbeat(processed)
        logger.debug("Applied reggae offbeat emphasis")

    # Step 3: Humanize
    processed = humanize(processed)
    logger.debug(f"After humanization: {len(processed)} notes")

    # Sort by time for clean output
    processed.sort(key=lambda n: n["time"])

    logger.info(f"Post-processing complete: {len(processed)} notes")
    return processed
