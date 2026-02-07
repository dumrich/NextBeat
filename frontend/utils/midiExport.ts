// MIDI Export Utility

import { Midi } from '@tonejs/midi';
import type { Project, MidiClip, ArrangementClip } from '@/types/project';
import type { InstrumentId } from '@/utils/instruments';

// API base URL for MP3 to MIDI conversion
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Constants for MIDI conversion
const TICKS_PER_QUARTER_NOTE = 480; // Standard MIDI resolution
const TICKS_PER_BAR = 1920; // 4 beats * 480 ticks (assuming 4/4 time)

// Convert ticks to seconds based on tempo
function ticksToSeconds(ticks: number, tempo: number): number {
  // ticks / (ticks_per_quarter * tempo / 60)
  return (ticks / TICKS_PER_QUARTER_NOTE) * (60 / tempo);
}

export function exportProjectToMidi(project: Project): Blob {
  const midi = new Midi();
  
  // Set tempo (BPM)
  midi.header.setTempo(project.tempo);
  
  // Set time signature
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: [project.timeSignature.numerator, project.timeSignature.denominator],
  });
  
  // Group arrangement clips by track
  const trackClips: { [trackId: string]: ArrangementClip[] } = {};
  project.arrangementClips.forEach((clip) => {
    if (!trackClips[clip.trackId]) {
      trackClips[clip.trackId] = [];
    }
    trackClips[clip.trackId].push(clip);
  });
  
  // Create MIDI tracks - one per project track
  project.tracks.forEach((track) => {
    const clips = trackClips[track.id] || [];
    
    // Only create a track if it has MIDI clips
    if (clips.length === 0) return;
    
    const midiTrack = midi.addTrack();
    midiTrack.name = track.name;
    
    // Add essential MIDI Control Changes for better playback in other programs
    // CC 7: Channel Volume
    midiTrack.addCC({
      number: 7,
      value: Math.round(track.volume * 127),
      time: 0
    });
    
    // CC 10: Pan (0=left, 64=center, 127=right)
    midiTrack.addCC({
      number: 10,
      value: Math.round(((track.pan + 1) / 2) * 127), // Convert -1..1 to 0..127
      time: 0
    });
    
    // CC 11: Expression (subtle dynamics for more natural sound)
    midiTrack.addCC({
      number: 11,
      value: 100,
      time: 0
    });
    
    // Process all arrangement clips for this track
    clips.forEach((arrClip) => {
      if (arrClip.clipType === 'midi') {
        const midiClip = project.midiClips.find((c) => c.id === arrClip.clipDataId);
        if (midiClip && midiClip.notes.length > 0) {
          // Convert arrangement clip start bar to ticks
          const clipStartTick = arrClip.startBar * TICKS_PER_BAR;
          
          // Add all notes from this clip
          midiClip.notes.forEach((note) => {
            // Calculate absolute time in ticks
            const absoluteStartTick = clipStartTick + note.startTick;
            
            // Convert to seconds (accounting for tempo)
            const startTime = ticksToSeconds(absoluteStartTick, project.tempo);
            const duration = ticksToSeconds(note.durationTick, project.tempo);
            
            midiTrack.addNote({
              midi: note.pitch,
              time: startTime,
              duration: duration,
              velocity: note.velocity,
            });
          });
        }
      }
    });
  });
  
  // Convert to blob
  const arrayBuffer = midi.toArray();
  return new Blob([arrayBuffer], { type: 'audio/midi' });
}

export function downloadMidi(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Instrument mapping: map MIDI track metadata to app instruments (piano, guitar, drums, etc.)
// Always use InstrumentId so playback uses known synths/SoundFonts that work
type MidiNoteForMapping = { pitch: number };

// Map MIDI program (0-127) to our InstrumentId for imported tracks
function programToInstrumentId(program: number): InstrumentId {
  if (program === 9) return 'drums'; // GM channel 10 = drums
  if (program >= 112 && program <= 119) return 'percussion';
  if (program >= 0 && program <= 15) return 'piano';   // pianos, chromatic perc
  if (program >= 16 && program <= 23) return 'synth'; // organs
  if (program >= 24 && program <= 31) return 'guitar';
  if (program >= 32 && program <= 39) return 'bass';
  if (program >= 40 && program <= 47) return 'strings';
  if (program >= 48 && program <= 55) return 'strings'; // ensemble
  if (program >= 56 && program <= 63) return 'brass';
  if (program >= 64 && program <= 71) return 'brass';  // reed
  if (program >= 72 && program <= 79) return 'strings'; // pipe
  if (program >= 80 && program <= 95) return 'synth';  // synth lead/pad
  if (program >= 96 && program <= 103) return 'synth'; // fx
  if (program >= 104 && program <= 111) return 'guitar'; // ethnic
  return 'piano';
}

function suggestInstrument(
  trackName: string,
  channelIndex: number,
  notes: MidiNoteForMapping[],
  midiProgram: number | null
): InstrumentId {
  const lowerName = trackName.toLowerCase();
  // GM Channel 10 (0-indexed: 9) is percussion
  if (channelIndex === 9 || lowerName.includes('drum') || lowerName.includes('kick') || lowerName.includes('perc')) {
    return 'drums';
  }
  if (lowerName.includes('bass')) return 'bass';
  if (lowerName.includes('synth')) return 'synth';
  if (lowerName.includes('piano')) return 'piano';
  if (lowerName.includes('guitar')) return 'guitar';
  if (lowerName.includes('string')) return 'strings';
  if (lowerName.includes('brass')) return 'brass';
  if (lowerName.includes('hat') || lowerName.includes('cymbal')) return 'percussion';

  // Use MIDI program from file when available
  if (midiProgram !== null && midiProgram >= 0 && midiProgram <= 127) {
    return programToInstrumentId(midiProgram);
  }

  // Pitch-based heuristics
  if (notes.length > 0) {
    const avgPitch = notes.reduce((s, n) => s + n.pitch, 0) / notes.length;
    if (avgPitch < 45) return 'bass';
    if (avgPitch > 72) return 'strings';
  }

  return 'piano';
}

// Shared import logic: parses MIDI ArrayBuffer and adds to project
export type MidiImportMutators = {
  addTrack: (track: any) => void;
  addMidiClip: (clip: any) => void;
  addArrangementClip: (clip: any) => void;
  setTempo: (tempo: number) => void;
  setTimeSignature: (ts: { numerator: number; denominator: number }) => void;
};

function isMidiArrayBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const bytes = new Uint8Array(buffer);
  return bytes[0] === 0x4d && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64;
}

export async function importMidiFromArrayBuffer(
  arrayBuffer: ArrayBuffer,
  mutators: MidiImportMutators
): Promise<void> {
  const { addTrack, addMidiClip, addArrangementClip, setTempo, setTimeSignature } = mutators;
  const TICKS_PER_QUARTER_NOTE = 480;

  if (!isMidiArrayBuffer(arrayBuffer)) {
    throw new Error('Invalid MIDI data. The server may have returned an error or non-MIDI content.');
  }

  let midi: Midi;
  try {
    midi = new Midi(arrayBuffer);
  } catch (e) {
    throw new Error('Failed to parse MIDI file. The data may be corrupted or in an unsupported format.');
  }

  const tracksWithNotes = midi.tracks.filter((t) => t.notes.length > 0);
  if (tracksWithNotes.length === 0) {
    throw new Error('MIDI file has no tracks with notes. Nothing to import.');
  }

  if (midi.header.tempos.length > 0) {
    setTempo(midi.header.tempos[0].bpm);
  }

  if (midi.header.timeSignatures.length > 0) {
    const ts = midi.header.timeSignatures[0];
    setTimeSignature({
      numerator: ts.timeSignature[0],
      denominator: ts.timeSignature[1],
    });
  }

  const timeSignature = midi.header.timeSignatures[0];
  const numerator = timeSignature?.timeSignature[0] || 4;
  const denominator = timeSignature?.timeSignature[1] || 4;
  const TICKS_PER_BAR = (numerator * TICKS_PER_QUARTER_NOTE * 4) / denominator;

  const tempo = midi.header.tempos[0]?.bpm || 120;
  const baseTimestamp = Date.now();

  midi.tracks.forEach((midiTrack, trackIndex) => {
    if (midiTrack.notes.length === 0) return;

    const timestamp = baseTimestamp + trackIndex;
    const random = Math.random().toString(36).substr(2, 9);
    const trackId = `track-${timestamp}-${random}`;

    const notes = midiTrack.notes.map((note) => {
      const startTick = Math.round((note.time * tempo / 60) * TICKS_PER_QUARTER_NOTE);
      const durationTick = Math.round((note.duration * tempo / 60) * TICKS_PER_QUARTER_NOTE);
      return {
        pitch: note.midi,
        startTick,
        durationTick,
        velocity: note.velocity * 100,
        channel: 0,
      };
    });

    // Use known instrument types (piano, guitar, drums, etc.) so playback always works
    const midiProgramFromFile = (midiTrack as { instrument?: { number?: number } }).instrument?.number;
    const program = midiProgramFromFile !== undefined && midiProgramFromFile >= 0 && midiProgramFromFile <= 127
      ? midiProgramFromFile
      : null;

    const instrument = suggestInstrument(
      midiTrack.name || '',
      midiTrack.channel ?? 0,
      notes,
      program
    );
    const trackType = (instrument === 'drums' || instrument === 'percussion') ? 'drums' : 'instrument';

    addTrack({
      id: trackId,
      name: midiTrack.name || `Track ${trackIndex + 1}`,
      color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
      type: trackType,
      channelRackIds: [],
      instrument,
      mixerChannelId: null,
      mute: false,
      solo: false,
      arm: false,
      volume: 0.5,
      pan: 0,
    });

    const earliestTick = Math.min(...notes.map((n) => n.startTick));
    const latestTick = Math.max(...notes.map((n) => n.startTick + n.durationTick));

    const normalizedNotes = notes.map((note) => ({
      ...note,
      startTick: note.startTick - earliestTick,
    }));

    const clipLengthTicks = latestTick - earliestTick;
    const clipLengthBars = Math.ceil(clipLengthTicks / TICKS_PER_BAR);

    const midiClipId = `midi-${timestamp}-${random}`;
    addMidiClip({
      id: midiClipId,
      trackId,
      startBar: 0,
      lengthBars: Math.max(1, clipLengthBars),
      notes: normalizedNotes,
    });

    addArrangementClip({
      id: `arr-${timestamp}-${random}`,
      trackId,
      startBar: 0,
      lengthBars: Math.max(1, clipLengthBars),
      clipType: 'midi',
      clipDataId: midiClipId,
    });
  });
}

// Import MIDI from Blob (for API response)
export async function importMidiFromBlob(
  blob: Blob,
  mutators: MidiImportMutators
): Promise<void> {
  const arrayBuffer = await blob.arrayBuffer();
  return importMidiFromArrayBuffer(arrayBuffer, mutators);
}

// Import MIDI file and create tracks/notes
export async function importMidiFile(
  file: File,
  addTrack: (track: any) => void,
  addMidiClip: (clip: any) => void,
  addArrangementClip: (clip: any) => void,
  setTempo: (tempo: number) => void,
  setTimeSignature: (timeSignature: { numerator: number; denominator: number }) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const arrayBuffer = reader.result as ArrayBuffer;
        if (!arrayBuffer) {
          reject(new Error('Failed to read file'));
          return;
        }
        await importMidiFromArrayBuffer(arrayBuffer, {
          addTrack,
          addMidiClip,
          addArrangementClip,
          setTempo,
          setTimeSignature,
        });
        resolve();
      } catch (error) {
        console.error('Error importing MIDI:', error);
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsArrayBuffer(file);
  });
}

// Convert MP3 to MIDI using the backend API
export async function convertMp3ToMidi(file: File): Promise<File> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${API_BASE}/convert`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Conversion failed: ${response.statusText}`);
    }

    // Get the MIDI file as a blob
    const midiBlob = await response.blob();
    
    // Create a File object from the blob with a .mid extension
    const midiFile = new File([midiBlob], file.name.replace(/\.(mp3|wav|m4a|ogg)$/i, '.mid'), {
      type: 'audio/midi',
    });

    return midiFile;
  } catch (error) {
    console.error('MP3 to MIDI conversion error:', error);
    throw error;
  }
}
