import { useEffect, useRef } from 'react';
import * as Tone from 'tone';
import type { Project, MidiNote } from '@/types/project';
import { useInstruments } from './useInstruments';

// Convert MIDI ticks to Tone.js time (in bars)
// Assuming 1920 ticks per bar (standard MIDI resolution)
const TICKS_PER_BAR = 1920;

function ticksToBars(ticks: number): number {
  return ticks / TICKS_PER_BAR;
}

// Convert MIDI note number to note name
function midiToNoteName(midiNote: number): string {
  return Tone.Frequency(midiNote, 'midi').toNote();
}

// Convert MIDI velocity (0-127) to gain (0-1)
function velocityToGain(velocity: number): number {
  return velocity / 127;
}

// Snap grid to fraction mapping
const SNAPGRID_TO_FRACTION: { [key: string]: number } = {
  '1/4': 4,
  '1/8': 8,
  '1/16': 16,
  '1/32': 32,
};

export function usePlayback(
  project: Project | null,
  isPlaying: boolean,
  tempo: number,
  snapGrid: string,
  setPlayheadPosition: (position: number) => void
) {
  const { getSynthesizer } = useInstruments(project?.tracks || []);
  const scheduledEventsRef = useRef<Tone.ToneEvent[]>([]);
  const playheadUpdateRef = useRef<number | null>(null);

  // Schedule all MIDI notes for playback
  const scheduleNotes = () => {
    if (!project) return;

    // Clear any existing scheduled events
    scheduledEventsRef.current.forEach((event) => event.dispose());
    scheduledEventsRef.current = [];

    // Get all arrangement clips that are MIDI clips
    const midiArrangementClips = project.arrangementClips.filter(
      (arrClip) => arrClip.clipType === 'midi'
    );

    // Group clips by track to set volume once per track
    const tracksWithClips = new Map<string, { track: typeof project.tracks[0], clips: Array<{ arrClip: typeof midiArrangementClips[0], midiClip: typeof project.midiClips[0] }> }>();

    midiArrangementClips.forEach((arrClip) => {
      const midiClip = project.midiClips.find((clip) => clip.id === arrClip.clipDataId);
      if (!midiClip) return;

      const track = project.tracks.find((t) => t.id === arrClip.trackId);
      if (!track || track.mute || !track.instrument) return;

      if (!tracksWithClips.has(track.id)) {
        tracksWithClips.set(track.id, { track, clips: [] });
      }
      tracksWithClips.get(track.id)!.clips.push({ arrClip, midiClip });
    });

    // Schedule notes for each track
    tracksWithClips.forEach(({ track, clips }) => {
      const synth = getSynthesizer(track.id);
      if (!synth || !('triggerAttackRelease' in synth)) return;

      // PolySynth and other synthesizers that support triggerAttackRelease
      const playable = synth as Tone.PolySynth | Tone.MonoSynth | Tone.Synth | Tone.FMSynth | Tone.AMSynth | Tone.DuoSynth | Tone.PluckSynth | Tone.MembraneSynth | Tone.MetalSynth;

      // Set track volume once (for PolySynth, this affects all voices)
      playable.volume.value = Tone.gainToDb(track.volume);

      // Collect all notes from all clips on this track
      const allNotes: Array<{ note: MidiNote, clipStartBars: number }> = [];
      
      clips.forEach(({ arrClip, midiClip }) => {
        const clipStartBars = arrClip.startBar;
        midiClip.notes.forEach((note: MidiNote) => {
          allNotes.push({ note, clipStartBars });
        });
      });

      // Calculate snap grid step duration
      const snapGridFraction = SNAPGRID_TO_FRACTION[snapGrid] || 16;
      const duration = `${snapGridFraction}n`; // e.g., "16n" for 1/16, "8n" for 1/8, etc.

      // Group notes by start time (to handle chords)
      const notesByStartTime = new Map<number, MidiNote[]>();
      
      allNotes.forEach(({ note, clipStartBars }) => {
        const noteStartBars = clipStartBars + ticksToBars(note.startTick);
        // Round to avoid floating point precision issues
        const roundedStartBars = Math.round(noteStartBars * 10000) / 10000;
        
        if (!notesByStartTime.has(roundedStartBars)) {
          notesByStartTime.set(roundedStartBars, []);
        }
        notesByStartTime.get(roundedStartBars)!.push(note);
      });

      // Sort start times to ensure strictly increasing order
      const sortedStartTimes = Array.from(notesByStartTime.keys()).sort((a, b) => a - b);

      // Schedule notes, ensuring strictly increasing start times
      let lastStartBars = -Infinity;
      
      sortedStartTimes.forEach((startBars) => {
        const notesAtTime = notesByStartTime.get(startBars)!;
        
        // Ensure start time is strictly greater than previous
        const adjustedStartBars = Math.max(startBars, lastStartBars + 0.00001);
        
        // For PolySynth, we can play multiple notes (chords) at once
        if (playable instanceof Tone.PolySynth && notesAtTime.length > 1) {
          // Play chord: pass array of note names
          const noteNames = notesAtTime.map(note => midiToNoteName(note.pitch));
          
          const event = new Tone.ToneEvent((time) => {
            // PolySynth can play multiple notes simultaneously
            playable.triggerAttackRelease(noteNames, duration, time);
          });
          
          event.start(adjustedStartBars);
          scheduledEventsRef.current.push(event);
        } else {
          // Play individual notes (for non-PolySynth or single notes)
          notesAtTime.forEach((note) => {
            const noteName = midiToNoteName(note.pitch);
            
            const event = new Tone.ToneEvent((time) => {
              playable.triggerAttackRelease(noteName, duration, time);
            });
            
            event.start(adjustedStartBars);
            scheduledEventsRef.current.push(event);
          });
        }
        
        // Update lastStartBars after processing all notes at this time
        lastStartBars = adjustedStartBars;
      });
    });
  };

  // Update playhead position during playback
  useEffect(() => {
    if (!isPlaying) {
      if (playheadUpdateRef.current !== null) {
        cancelAnimationFrame(playheadUpdateRef.current);
        playheadUpdateRef.current = null;
      }
      return;
    }

    const update = () => {
      // Get current transport position in seconds
      const seconds = Tone.getTransport().seconds;
      
      // Convert seconds to bars: (seconds / 60) * (bpm / beats_per_bar)
      // Assuming 4/4 time signature (4 beats per bar)
      const bars = (seconds / 60) * (tempo / 4);
      
      setPlayheadPosition(bars);
      playheadUpdateRef.current = requestAnimationFrame(update);
    };

    playheadUpdateRef.current = requestAnimationFrame(update);

    return () => {
      if (playheadUpdateRef.current !== null) {
        cancelAnimationFrame(playheadUpdateRef.current);
        playheadUpdateRef.current = null;
      }
    };
  }, [isPlaying, tempo, setPlayheadPosition]);

  // Schedule notes when playback starts
  useEffect(() => {
    if (isPlaying && project) {
      Tone.getTransport().bpm.value = tempo;
      // Small delay to ensure Transport is ready
      const timeout = setTimeout(() => {
        scheduleNotes();
      }, 10);
      return () => clearTimeout(timeout);
    } else {
      // Clear scheduled events when stopped
      scheduledEventsRef.current.forEach((event) => event.dispose());
      scheduledEventsRef.current = [];
    }

    return () => {
      scheduledEventsRef.current.forEach((event) => event.dispose());
      scheduledEventsRef.current = [];
    };
  }, [isPlaying, project, tempo, snapGrid]);

  return {
    scheduleNotes,
  };
}
