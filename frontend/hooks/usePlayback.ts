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
// Add 12 to raise by one octave (12 semitones = 1 octave)
function midiToNoteName(midiNote: number): string {
  return Tone.Frequency(midiNote + 12, 'midi').toNote();
}

// Convert MIDI velocity (0-127) to gain (0-1)
function velocityToGain(velocity: number): number {
  return velocity / 127;
}

export function usePlayback(
  project: Project | null,
  isPlaying: boolean,
  tempo: number,
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

      // Store base track volume - we'll combine this with note velocity per note
      const baseTrackVolume = track.volume;

      // Collect all notes from all clips on this track
      const allNotes: Array<{ note: MidiNote, clipStartBars: number }> = [];
      
      clips.forEach(({ arrClip, midiClip }) => {
        const clipStartBars = arrClip.startBar;
        midiClip.notes.forEach((note: MidiNote) => {
          allNotes.push({ note, clipStartBars });
        });
      });

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

      // Get current transport time in bars to ensure we don't schedule notes in the past
      const currentTransportBars = Tone.getTransport().seconds > 0 
        ? (Tone.getTransport().seconds / 60) * (tempo / 4)
        : 0;
      
      // Add a small safety margin to ensure notes are scheduled in the future
      // This prevents notes at time 0 from being missed if transport has already started
      const safetyMargin = 0.001; // 1ms worth of bars at typical tempo
      const minStartBars = Math.max(0, currentTransportBars + safetyMargin);
      
      // Schedule notes, ensuring strictly increasing start times
      let lastStartBars = -Infinity;
      
      sortedStartTimes.forEach((startBars) => {
        const notesAtTime = notesByStartTime.get(startBars)!;
        
        // Ensure start time is strictly greater than previous AND not in the past
        // For notes at time 0 or very close, ensure they're at least at minStartBars
        const adjustedStartBars = Math.max(
          Math.max(startBars, minStartBars),
          lastStartBars + 0.00001
        );
        
        // For PolySynth chords with same velocity, play together; otherwise play individually
        const hasDifferentVelocities = notesAtTime.length > 1 && 
          notesAtTime.some(note => note.velocity !== notesAtTime[0].velocity);
        
        // Check if all notes have the same duration (for chord playback)
        const hasDifferentDurations = notesAtTime.length > 1 &&
          notesAtTime.some(note => note.durationTick !== notesAtTime[0].durationTick);
        
        if (playable instanceof Tone.PolySynth && notesAtTime.length > 1 && !hasDifferentVelocities && !hasDifferentDurations) {
          // Play chord: all notes have same velocity and duration, so we can play them together
          const noteNames = notesAtTime.map(note => midiToNoteName(note.pitch));
          
          // All notes have the same velocity and duration
          const noteVelocity = notesAtTime[0].velocity;
          const noteDurationBars = ticksToBars(notesAtTime[0].durationTick);
          
          // Combine note velocity (0-127) with track volume (0-1)
          // Final gain = (note.velocity / 127) * track.volume
          const combinedGain = (noteVelocity / 127) * baseTrackVolume;
          const velocityDb = Tone.gainToDb(combinedGain);
          
          const event = new Tone.ToneEvent((time) => {
            // Set volume for this chord based on combined velocity
            // Note: This affects all voices, but since all notes in chord have same velocity, it's OK
            playable.volume.value = velocityDb;
            playable.triggerAttackRelease(noteNames, noteDurationBars, time);
          });
          
          event.start(adjustedStartBars);
          scheduledEventsRef.current.push(event);
        } else {
          // Play individual notes (different velocities/durations in chord, or single notes, or non-PolySynth)
          notesAtTime.forEach((note) => {
            const noteName = midiToNoteName(note.pitch);
            const noteDurationBars = ticksToBars(note.durationTick);
            
            // Combine note velocity (0-127) with track volume (0-1)
            // Final gain = (note.velocity / 127) * track.volume
            const combinedGain = (note.velocity / 127) * baseTrackVolume;
            const velocityDb = Tone.gainToDb(combinedGain);
            
            const event = new Tone.ToneEvent((time) => {
              // Set volume for this specific note based on its velocity
              // Note: For PolySynth, this affects all voices, so chords with different velocities
              // will be played individually (handled above)
              playable.volume.value = velocityDb;
              playable.triggerAttackRelease(noteName, noteDurationBars, time);
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
      // Schedule notes immediately (before or right as transport starts)
      // Use a very small delay to ensure Transport context is ready
      const timeout = setTimeout(() => {
        scheduleNotes();
      }, 1);
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
  }, [isPlaying, project, tempo]);

  return {
    scheduleNotes,
  };
}
