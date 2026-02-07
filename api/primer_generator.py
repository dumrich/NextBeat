"""
Claude Primer Generator Module.

Calls Claude API to generate structured musical primers (2-bar note data)
that capture the essence of a requested musical style. Claude understands
style semantics (what makes jazz "jazzy") and outputs structured JSON that
the post-processing and Magenta modules can work with.
"""

import json
import logging
import re

from anthropic import Anthropic

from config import settings

logger = logging.getLogger(__name__)

# Standard MIDI drum map (General MIDI percussion)
DRUM_MIDI_MAP = {
    "kick": 36,
    "snare": 38,
    "rimshot": 37,
    "clap": 39,
    "hihat": 42,       # Closed hi-hat
    "hihat_open": 46,  # Open hi-hat
    "ride": 51,
    "crash": 49,
    "tom_high": 50,
    "tom_mid": 47,
    "tom_low": 45,
    "cowbell": 56,
}


def _build_drum_prompt(style: str, bars: int, tempo: int) -> str:
    """Build a prompt for Claude to generate drum primer notes."""
    return f"""You are a professional drummer and music producer. Generate a {bars}-bar drum pattern in the style of "{style}" at {tempo} BPM in 4/4 time.

Output ONLY a JSON array of note objects. Do NOT wrap in markdown code blocks. Do NOT include any text before or after the JSON.

Each note object must have:
- "drum": one of {list(DRUM_MIDI_MAP.keys())}
- "time": beat position as a float (0.0 = beat 1 of bar 1, 1.0 = beat 2, 4.0 = beat 1 of bar 2, etc.)
- "velocity": integer 40-120

Style guidelines:
- Jazz: ride cymbal pattern with light kick/snare comping, use of hihat on 2 and 4, swing feel implied
- Rock: strong kick on 1 and 3, snare on 2 and 4, steady hihat eighth notes
- Funk: syncopated kick patterns, ghost notes on snare (velocity 40-55), tight hihat
- Latin: clave-based patterns, use of ride, toms for tumbao
- Hip-hop: heavy kick, clap on 2 and 4, hihat 16th note patterns with some open hihats
- Blues: shuffle feel with kick on 1 and 3, snare on 2 and 4, ride or hihat shuffle
- Reggae: kick on beats 3 and 4, rimshot on beat 3, hihat steady
- Pop: four-on-the-floor kick, snare on 2 and 4, hihat eighth notes

Total beats in {bars} bars = {bars * 4}. Keep time values between 0.0 and {bars * 4.0 - 0.25}.
Make it musically interesting with appropriate fills, ghost notes, and variations for the style.

Example output format:
[{{"drum": "kick", "time": 0.0, "velocity": 100}}, {{"drum": "hihat", "time": 0.0, "velocity": 70}}, {{"drum": "snare", "time": 1.0, "velocity": 90}}]"""


def _build_piano_prompt(style: str, bars: int, tempo: int) -> str:
    """Build a prompt for Claude to generate piano/melody primer notes."""
    return f"""You are a professional pianist and composer. Generate a {bars}-bar piano part in the style of "{style}" at {tempo} BPM in 4/4 time.

Output ONLY a JSON array of note objects. Do NOT wrap in markdown code blocks. Do NOT include any text before or after the JSON.

Each note object must have:
- "pitch": MIDI note number (Middle C = 60, C3 = 48, C5 = 72). Use range 48-84 for piano.
- "time": beat position as a float (0.0 = beat 1 of bar 1, 1.0 = beat 2, 4.0 = beat 1 of bar 2, etc.)
- "duration": note length in beats (0.25 = 16th, 0.5 = 8th, 1.0 = quarter, 2.0 = half)
- "velocity": integer 40-120

Style guidelines:
- Jazz: use 7th/9th/13th chords (add b7, 9th intervals), walking bass in left hand or shell voicings, chromatic approach tones
- Classical: clear melodic lines, proper voice leading, use of scales and arpeggios
- Blues: pentatonic/blues scale (add b3, b5, b7), call-and-response phrases, bent-note approximations via grace notes
- Pop: simple triads and power chords, repetitive hook-based melody, octave doubling
- R&B: extended chords (9ths, 11ths), smooth voice leading, rhodes-style voicings
- Latin: montuno patterns, rhythmic chord comping on offbeats
- Romantic: arpeggiated accompaniment, wide dynamic range, expressive melody
- Rock: power chords, driving eighth-note rhythm, pentatonic riffs

Include both melodic content (single notes) and harmonic content (chords with multiple simultaneous notes at same time).
Total beats in {bars} bars = {bars * 4}. Keep time values between 0.0 and {bars * 4.0 - 0.25}.

Example output format:
[{{"pitch": 60, "time": 0.0, "duration": 1.0, "velocity": 80}}, {{"pitch": 64, "time": 0.0, "duration": 1.0, "velocity": 75}}, {{"pitch": 67, "time": 0.0, "duration": 1.0, "velocity": 75}}]"""


def _extract_json_from_response(text: str) -> list[dict]:
    """Extract JSON array from Claude's response, handling markdown formatting.

    Claude sometimes wraps JSON in ```json ... ``` blocks despite instructions
    not to. This handles all common response formats robustly.
    """
    # Try direct parse first
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strip markdown code blocks
    code_block_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
    if code_block_match:
        try:
            return json.loads(code_block_match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Find the outermost JSON array
    bracket_start = text.find("[")
    bracket_end = text.rfind("]")
    if bracket_start != -1 and bracket_end != -1 and bracket_end > bracket_start:
        try:
            return json.loads(text[bracket_start : bracket_end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not extract valid JSON from Claude response:\n{text[:500]}")


def _validate_drum_notes(notes: list[dict], max_time: float) -> list[dict]:
    """Validate and clean drum note data from Claude."""
    validated = []
    for note in notes:
        drum = note.get("drum", "")
        if drum not in DRUM_MIDI_MAP:
            logger.warning(f"Unknown drum '{drum}', skipping")
            continue

        time = float(note.get("time", 0))
        velocity = int(note.get("velocity", 80))

        # Clamp values
        time = max(0.0, min(time, max_time))
        velocity = max(settings.velocity_min, min(velocity, settings.velocity_max))

        validated.append({
            "drum": drum,
            "midi_note": DRUM_MIDI_MAP[drum],
            "time": time,
            "velocity": velocity,
        })

    return validated


def _validate_piano_notes(notes: list[dict], max_time: float) -> list[dict]:
    """Validate and clean piano note data from Claude."""
    validated = []
    for note in notes:
        pitch = int(note.get("pitch", 60))
        time = float(note.get("time", 0))
        duration = float(note.get("duration", 1.0))
        velocity = int(note.get("velocity", 80))

        # Clamp values to musically reasonable ranges
        pitch = max(21, min(pitch, 108))  # Piano range A0-C8
        time = max(0.0, min(time, max_time))
        duration = max(0.125, min(duration, 8.0))  # 32nd note to 2 bars
        velocity = max(settings.velocity_min, min(velocity, settings.velocity_max))

        validated.append({
            "pitch": pitch,
            "time": time,
            "duration": duration,
            "velocity": velocity,
        })

    return validated


def generate_primer(
    prompt: str,
    instrument: str,
    bars: int = 2,
    tempo: int = 120,
) -> dict:
    """Generate a musical primer by calling Claude API.

    Args:
        prompt: User's style description (e.g. "1920s jazz", "heavy metal")
        instrument: "drums", "piano", or "melody"
        bars: Number of bars to generate (default 2 for primer)
        tempo: BPM for the piece

    Returns:
        dict with keys:
            - "notes": list of validated note dicts
            - "instrument": the instrument type
            - "bars": number of bars generated
            - "tempo": the tempo
    """
    if not settings.anthropic_api_key:
        raise ValueError(
            "ANTHROPIC_API_KEY not set. Add it to api/.env file. "
            "Get a key at https://console.anthropic.com/settings/keys"
        )

    client = Anthropic(api_key=settings.anthropic_api_key)

    is_drums = instrument.lower() in ("drums", "percussion", "drum")
    if is_drums:
        user_prompt = _build_drum_prompt(prompt, bars, tempo)
    else:
        user_prompt = _build_piano_prompt(prompt, bars, tempo)

    logger.info(f"Calling Claude API for {instrument} primer: '{prompt}' ({bars} bars, {tempo} BPM)")

    response = client.messages.create(
        model=settings.claude_model,
        max_tokens=settings.claude_max_tokens,
        temperature=settings.claude_temperature,
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw_text = response.content[0].text
    logger.debug(f"Claude raw response ({len(raw_text)} chars): {raw_text[:200]}...")

    # Parse and validate
    raw_notes = _extract_json_from_response(raw_text)
    max_time = bars * 4.0 - 0.25  # Max beat position

    if is_drums:
        notes = _validate_drum_notes(raw_notes, max_time)
    else:
        notes = _validate_piano_notes(raw_notes, max_time)

    if not notes:
        raise ValueError(
            f"Claude returned no valid notes for '{prompt}' ({instrument}). "
            "Raw response may have had unexpected format."
        )

    logger.info(f"Primer generated: {len(notes)} notes for {instrument}")

    return {
        "notes": notes,
        "instrument": "drums" if is_drums else "piano",
        "bars": bars,
        "tempo": tempo,
        "style": prompt,
    }
