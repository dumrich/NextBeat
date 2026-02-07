"""
Magenta Continuator Module.

Loads Magenta's DrumsRNN and Music Transformer models and uses them
to extend primers into complete musical sequences. The key insight is
that these sequence models learn patterns from their input — a
jazz-styled primer will produce a jazz-styled continuation.

Models are loaded once at startup and kept in memory for fast generation.
"""

import logging
import os
import time
from typing import Optional

from config import settings

# note_seq and protobuf are optional — the server can start without them
# but generation will fail gracefully if they're missing
try:
    import note_seq
    from note_seq.protobuf import music_pb2
    _NOTE_SEQ_AVAILABLE = True
except ImportError:
    note_seq = None
    music_pb2 = None
    _NOTE_SEQ_AVAILABLE = False

logger = logging.getLogger(__name__)

# Global model state — loaded once at startup
_drums_rnn_model = None
_music_transformer_model = None
_models_loaded = False


def _beats_to_seconds(beats: float, tempo: int) -> float:
    """Convert beat position to seconds given tempo in BPM."""
    return beats * 60.0 / tempo


def _seconds_to_beats(seconds: float, tempo: int) -> float:
    """Convert seconds to beat position given tempo in BPM."""
    return seconds * tempo / 60.0


# --- Model Loading ---

def load_drums_rnn(checkpoint_path: str = None) -> bool:
    """Load the DrumsRNN model from a .mag bundle.

    Args:
        checkpoint_path: Path to drum_kit_rnn.mag file.
                        Defaults to settings.drums_rnn_checkpoint.
    Returns:
        True if loaded successfully, False otherwise.
    """
    global _drums_rnn_model

    if checkpoint_path is None:
        checkpoint_path = settings.drums_rnn_checkpoint

    if not os.path.exists(checkpoint_path):
        logger.warning(
            f"DrumsRNN checkpoint not found at '{checkpoint_path}'. "
            "Download it with: gsutil cp gs://magentadata/models/music_rnn/drum_kit_rnn.mag models/"
        )
        return False

    try:
        from magenta.models.drums_rnn import drums_rnn_sequence_generator
        from magenta.models.shared import sequence_generator_bundle

        logger.info(f"Loading DrumsRNN from {checkpoint_path}...")
        start = time.time()

        bundle = sequence_generator_bundle.read_bundle_file(checkpoint_path)
        generator_map = drums_rnn_sequence_generator.get_generator_map()
        _drums_rnn_model = generator_map["drum_kit"](checkpoint=None, bundle=bundle)
        _drums_rnn_model.initialize()

        elapsed = time.time() - start
        logger.info(f"DrumsRNN loaded in {elapsed:.1f}s")
        return True

    except ImportError:
        logger.warning(
            "Magenta not installed. Install with: pip install magenta"
        )
        return False
    except Exception as e:
        logger.error(f"Failed to load DrumsRNN: {e}")
        return False


def load_music_transformer(checkpoint_path: str = None) -> bool:
    """Load the Music Transformer model.

    Args:
        checkpoint_path: Path to Music Transformer checkpoint directory.
                        Defaults to settings.music_transformer_checkpoint.
    Returns:
        True if loaded successfully, False otherwise.
    """
    global _music_transformer_model

    if checkpoint_path is None:
        checkpoint_path = settings.music_transformer_checkpoint

    if not os.path.exists(checkpoint_path):
        logger.warning(
            f"Music Transformer checkpoint not found at '{checkpoint_path}'. "
            "See README for download instructions."
        )
        return False

    try:
        from magenta.models.score2perf import score2perf

        logger.info(f"Loading Music Transformer from {checkpoint_path}...")
        start = time.time()

        _music_transformer_model = score2perf.Score2PerfProblem.load(checkpoint_path)

        elapsed = time.time() - start
        logger.info(f"Music Transformer loaded in {elapsed:.1f}s")
        return True

    except ImportError:
        logger.warning(
            "Magenta not installed. Install with: pip install magenta"
        )
        return False
    except Exception as e:
        logger.error(f"Failed to load Music Transformer: {e}")
        return False


def load_all_models() -> dict:
    """Load all Magenta models at startup. Returns status dict."""
    global _models_loaded

    if not _NOTE_SEQ_AVAILABLE:
        logger.warning(
            "note-seq not installed. Install with: pip install note-seq\n"
            "MIDI generation will use the mido fallback (primer only, no Magenta continuation)."
        )

    status = {
        "drums_rnn": load_drums_rnn(),
        "music_transformer": load_music_transformer(),
    }
    _models_loaded = any(status.values())

    logger.info(f"Model loading complete: {status}")
    return status


def models_status() -> dict:
    """Return current model loading status."""
    return {
        "drums_rnn_loaded": _drums_rnn_model is not None,
        "music_transformer_loaded": _music_transformer_model is not None,
        "any_loaded": _models_loaded,
    }


# --- Sequence Conversion ---

def _drum_notes_to_sequence(notes: list[dict], tempo: int):
    """Convert post-processed drum notes to a NoteSequence for DrumsRNN.

    Uses note_seq's NoteSequence protobuf if available, falls back to
    FallbackSequence otherwise (still produces valid MIDI via mido).

    Args:
        notes: List of dicts with keys: midi_note, time, velocity
        tempo: BPM
    """
    if _NOTE_SEQ_AVAILABLE:
        seq = music_pb2.NoteSequence()
        seq.tempos.add(qpm=tempo)
        seq.ticks_per_quarter = 480

        for note in notes:
            start_seconds = _beats_to_seconds(note["time"], tempo)
            end_seconds = start_seconds + 0.05  # Drum hits are short

            ns_note = seq.notes.add()
            ns_note.pitch = note["midi_note"]
            ns_note.start_time = start_seconds
            ns_note.end_time = end_seconds
            ns_note.velocity = note["velocity"]
            ns_note.is_drum = True
            ns_note.instrument = 9  # GM drum channel

        if seq.notes:
            seq.total_time = max(n.end_time for n in seq.notes)
        return seq

    # Fallback without note_seq
    seq = FallbackSequence(tempo)
    for note in notes:
        start_seconds = _beats_to_seconds(note["time"], tempo)
        seq.add_note(
            pitch=note["midi_note"],
            start_time=start_seconds,
            end_time=start_seconds + 0.05,
            velocity=note["velocity"],
            is_drum=True,
            instrument=9,
        )
    return seq


def _piano_notes_to_sequence(notes: list[dict], tempo: int):
    """Convert post-processed piano notes to a NoteSequence for Music Transformer.

    Uses note_seq's NoteSequence protobuf if available, falls back to
    FallbackSequence otherwise.

    Args:
        notes: List of dicts with keys: pitch, time, duration, velocity
        tempo: BPM
    """
    if _NOTE_SEQ_AVAILABLE:
        seq = music_pb2.NoteSequence()
        seq.tempos.add(qpm=tempo)
        seq.ticks_per_quarter = 480

        for note in notes:
            start_seconds = _beats_to_seconds(note["time"], tempo)
            end_seconds = start_seconds + _beats_to_seconds(note["duration"], tempo)

            ns_note = seq.notes.add()
            ns_note.pitch = note["pitch"]
            ns_note.start_time = start_seconds
            ns_note.end_time = end_seconds
            ns_note.velocity = note["velocity"]
            ns_note.is_drum = False
            ns_note.instrument = 0

        if seq.notes:
            seq.total_time = max(n.end_time for n in seq.notes)
        return seq

    # Fallback without note_seq
    seq = FallbackSequence(tempo)
    for note in notes:
        start_seconds = _beats_to_seconds(note["time"], tempo)
        end_seconds = start_seconds + _beats_to_seconds(note["duration"], tempo)
        seq.add_note(
            pitch=note["pitch"],
            start_time=start_seconds,
            end_time=end_seconds,
            velocity=note["velocity"],
            is_drum=False,
            instrument=0,
        )
    return seq


# --- Generation ---

def continue_drums(
    primer_notes: list[dict],
    total_bars: int,
    primer_bars: int,
    tempo: int,
    temperature: float = None,
) -> Optional[music_pb2.NoteSequence]:
    """Generate drum continuation using DrumsRNN.

    Takes primer notes (from Claude + post-processing) and extends them
    to the requested total length.

    Args:
        primer_notes: Post-processed drum note dicts
        total_bars: Total desired length in bars
        primer_bars: How many bars the primer covers
        tempo: BPM
        temperature: Generation randomness (0.5=conservative, 1.5=wild)

    Returns:
        Complete NoteSequence (primer + continuation), or None if model unavailable.
    """
    if _drums_rnn_model is None:
        logger.warning("DrumsRNN not loaded, returning primer only")
        return _drum_notes_to_sequence(primer_notes, tempo)

    if temperature is None:
        temperature = settings.drums_temperature

    primer_seq = _drum_notes_to_sequence(primer_notes, tempo)

    # Calculate generation length
    total_seconds = _beats_to_seconds(total_bars * 4, tempo)
    remaining_bars = total_bars - primer_bars
    total_steps = remaining_bars * settings.steps_per_bar

    logger.info(
        f"Generating drum continuation: {remaining_bars} bars "
        f"({total_steps} steps) at temperature {temperature}"
    )

    try:
        from magenta.protobuf import generator_pb2

        # Build generation request
        gen_options = generator_pb2.GeneratorOptions()
        gen_options.args["temperature"].float_value = temperature

        # Generate from end of primer to total length
        primer_end = primer_seq.total_time
        gen_section = gen_options.generate_sections.add(
            start_time=primer_end,
            end_time=total_seconds,
        )

        result = _drums_rnn_model.generate(primer_seq, gen_options)

        generated_count = len(result.notes) - len(primer_seq.notes)
        logger.info(f"DrumsRNN generated {generated_count} additional notes")

        return result

    except Exception as e:
        logger.error(f"DrumsRNN generation failed: {e}")
        return primer_seq  # Return primer as fallback


def continue_piano(
    primer_notes: list[dict],
    total_bars: int,
    primer_bars: int,
    tempo: int,
    temperature: float = None,
) -> Optional[music_pb2.NoteSequence]:
    """Generate piano continuation using Music Transformer.

    Args:
        primer_notes: Post-processed piano note dicts
        total_bars: Total desired length in bars
        primer_bars: How many bars the primer covers
        tempo: BPM
        temperature: Generation randomness

    Returns:
        Complete NoteSequence (primer + continuation), or None if model unavailable.
    """
    if _music_transformer_model is None:
        logger.warning("Music Transformer not loaded, returning primer only")
        return _piano_notes_to_sequence(primer_notes, tempo)

    if temperature is None:
        temperature = settings.piano_temperature

    primer_seq = _piano_notes_to_sequence(primer_notes, tempo)
    total_seconds = _beats_to_seconds(total_bars * 4, tempo)

    logger.info(
        f"Generating piano continuation: {total_bars - primer_bars} bars "
        f"at temperature {temperature}"
    )

    try:
        # Music Transformer uses a different generation API
        result = _music_transformer_model.generate(
            primer_seq,
            target_length_seconds=total_seconds,
            temperature=temperature,
        )

        generated_count = len(result.notes) - len(primer_seq.notes)
        logger.info(f"Music Transformer generated {generated_count} additional notes")

        return result

    except Exception as e:
        logger.error(f"Music Transformer generation failed: {e}")
        return primer_seq  # Return primer as fallback


def sequence_to_midi_file(sequence, output_path: str) -> str:
    """Write a NoteSequence to a MIDI file.

    Uses note_seq if available, falls back to mido for lightweight MIDI writing.
    """
    if _NOTE_SEQ_AVAILABLE and hasattr(sequence, 'notes'):
        note_seq.sequence_proto_to_midi_file(sequence, output_path)
    else:
        _write_midi_with_mido(sequence, output_path)

    logger.info(f"MIDI file written to {output_path}")
    return output_path


def primer_only_to_sequence(
    notes: list[dict],
    instrument: str,
    tempo: int,
):
    """Convert primer notes to a NoteSequence without Magenta continuation.

    Useful when Magenta models aren't loaded — still returns playable MIDI
    from just the Claude-generated primer.
    """
    if instrument == "drums":
        return _drum_notes_to_sequence(notes, tempo)
    else:
        return _piano_notes_to_sequence(notes, tempo)


# --- Fallback MIDI writer using mido (no tensorflow dependency) ---

def _write_midi_with_mido(sequence, output_path: str):
    """Write a NoteSequence-like object to MIDI using mido.

    This is the fallback path when note_seq isn't installed.
    Works with both NoteSequence protobufs and our FallbackSequence.
    """
    import mido

    mid = mido.MidiFile(ticks_per_beat=480)
    track = mido.MidiTrack()
    mid.tracks.append(track)

    # Set tempo
    tempo_bpm = 120
    if hasattr(sequence, 'tempos') and sequence.tempos:
        tempo_bpm = int(sequence.tempos[0].qpm)
    elif hasattr(sequence, 'tempo'):
        tempo_bpm = sequence.tempo

    track.append(mido.MetaMessage('set_tempo', tempo=mido.bpm2tempo(tempo_bpm)))

    # Collect all note events and sort by time
    events = []
    notes = sequence.notes if hasattr(sequence, 'notes') else []

    for n in notes:
        start_tick = int(n.start_time / 60 * tempo_bpm * 480) if hasattr(n, 'start_time') else 0
        end_tick = int(n.end_time / 60 * tempo_bpm * 480) if hasattr(n, 'end_time') else start_tick + 240
        channel = 9 if (hasattr(n, 'is_drum') and n.is_drum) else 0
        velocity = n.velocity if hasattr(n, 'velocity') else 80

        events.append((start_tick, 'note_on', n.pitch, velocity, channel))
        events.append((end_tick, 'note_off', n.pitch, 0, channel))

    events.sort(key=lambda e: e[0])

    # Convert absolute ticks to delta ticks
    prev_tick = 0
    for tick, msg_type, pitch, velocity, channel in events:
        delta = max(0, tick - prev_tick)
        track.append(mido.Message(msg_type, note=pitch, velocity=velocity, channel=channel, time=delta))
        prev_tick = tick

    mid.save(output_path)


class _FallbackNote:
    """Minimal note object for when note_seq isn't available."""
    def __init__(self, pitch, start_time, end_time, velocity, is_drum=False, instrument=0):
        self.pitch = pitch
        self.start_time = start_time
        self.end_time = end_time
        self.velocity = velocity
        self.is_drum = is_drum
        self.instrument = instrument


class _FallbackTempo:
    def __init__(self, qpm):
        self.qpm = qpm


class FallbackSequence:
    """Minimal NoteSequence replacement for when note_seq/protobuf isn't available."""
    def __init__(self, tempo=120):
        self.notes = []
        self.tempos = [_FallbackTempo(tempo)]
        self.tempo = tempo
        self.ticks_per_quarter = 480
        self.total_time = 0.0

    def add_note(self, pitch, start_time, end_time, velocity, is_drum=False, instrument=0):
        note = _FallbackNote(pitch, start_time, end_time, velocity, is_drum, instrument)
        self.notes.append(note)
        self.total_time = max(self.total_time, end_time)
