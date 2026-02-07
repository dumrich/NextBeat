// MIDI Export Utility

import { Midi } from '@tonejs/midi';
import type { Project, MidiClip, ArrangementClip } from '@/types/project';

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
    
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        if (!arrayBuffer) {
          reject(new Error('Failed to read file'));
          return;
        }
        
        // Parse MIDI file
        const midi = new Midi(arrayBuffer);
        
        // Update project tempo and time signature
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
        
        // Constants for conversion
        const TICKS_PER_QUARTER_NOTE = 480;
        
        // Get time signature (default to 4/4)
        const timeSignature = midi.header.timeSignatures[0];
        const numerator = timeSignature?.timeSignature[0] || 4;
        const denominator = timeSignature?.timeSignature[1] || 4;
        const TICKS_PER_BAR = (numerator * TICKS_PER_QUARTER_NOTE * 4) / denominator;
        
        // Get tempo
        const tempo = midi.header.tempos[0]?.bpm || 120;
        const baseTimestamp = Date.now();
        
        // Process each MIDI track
        midi.tracks.forEach((midiTrack, trackIndex) => {
          if (midiTrack.notes.length === 0) return; // Skip empty tracks
          
          // Create unique IDs with timestamp and random component
          const timestamp = baseTimestamp + trackIndex;
          const random = Math.random().toString(36).substr(2, 9);
          const trackId = `track-${timestamp}-${random}`;
          
          // Get MIDI program number from track (default to 0 = Acoustic Grand Piano)
          // MIDI program numbers are 0-127
          // @tonejs/midi stores program changes in controlChanges with type 'program'
          let midiProgram = 0;
          if (midiTrack.controlChanges) {
            // Look for program change events
            const programChanges = Object.values(midiTrack.controlChanges).flat();
            const programChange = programChanges.find((cc: any) => cc.type === 'program' || cc.number === 192);
            if (programChange && programChange.value !== undefined) {
              midiProgram = Math.round(programChange.value);
            }
          }
          // Ensure program is in valid range (0-127)
          midiProgram = Math.max(0, Math.min(127, midiProgram));
          
          const track = {
            id: trackId,
            name: midiTrack.name || `Track ${trackIndex + 1}`,
            color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
            type: 'instrument' as const,
            channelRackIds: [],
            instrument: `midi:${midiProgram}`, // Use MIDI program number for SoundFont instrument
            midiProgram: midiProgram, // Store MIDI program number
            mixerChannelId: null,
            mute: false,
            solo: false,
            arm: false,
            volume: 0.5,
            pan: 0,
          };
          
          addTrack(track);
          
          // Convert MIDI notes to our format
          // @tonejs/midi provides time in seconds, we need to convert to ticks
          const notes = midiTrack.notes.map((note) => {
            // Convert time (seconds) back to ticks
            // time * (tempo / 60) * ticks_per_quarter
            const startTick = Math.round((note.time * tempo / 60) * TICKS_PER_QUARTER_NOTE);
            const durationTick = Math.round((note.duration * tempo / 60) * TICKS_PER_QUARTER_NOTE);
            
            return {
              pitch: note.midi,
              startTick: startTick,
              durationTick: durationTick,
              velocity: note.velocity * 100,
              channel: 0,
            };
          });
          
          // Find the earliest and latest notes to determine clip length
          if (notes.length > 0) {
            const earliestTick = Math.min(...notes.map(n => n.startTick));
            const latestTick = Math.max(...notes.map(n => n.startTick + n.durationTick));
            
            // Normalize notes to start from 0
            const normalizedNotes = notes.map(note => ({
              ...note,
              startTick: note.startTick - earliestTick,
            }));
            
            // Calculate clip length in bars
            const clipLengthTicks = latestTick - earliestTick;
            const clipLengthBars = Math.ceil(clipLengthTicks / TICKS_PER_BAR);
            
            // Create MIDI clip with unique ID
            const midiClipId = `midi-${timestamp}-${random}`;
            const midiClip = {
              id: midiClipId,
              trackId: trackId,
              startBar: 0,
              lengthBars: Math.max(1, clipLengthBars),
              notes: normalizedNotes,
            };
            
            addMidiClip(midiClip);
            
            // Create arrangement clip at bar 0 with unique ID
            const arrangementClipId = `arr-${timestamp}-${random}`;
            const arrangementClip = {
              id: arrangementClipId,
              trackId: trackId,
              startBar: 0,
              lengthBars: Math.max(1, clipLengthBars),
              clipType: 'midi' as const,
              clipDataId: midiClipId,
            };
            
            addArrangementClip(arrangementClip);
          }
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
