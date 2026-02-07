import { useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import type { Project, MidiNote } from '@/types/project';
import { SoundfontInstrument } from '@/utils/soundfont';

type GetSynthesizer = (trackId: string) => Tone.ToneAudioNode | SoundfontInstrument | null;
type PlayNoteFn = (trackId: string, note: string, duration?: string, time?: number, velocity?: number) => void;

// Convert MIDI ticks to bars using project time signature (480 ticks per quarter note)
function ticksToBars(ticks: number, numerator: number, denominator: number): number {
  const ticksPerBar = (numerator * 480 * 4) / denominator;
  return ticks / ticksPerBar;
}

// Convert MIDI note number to note name (60 = C4 in Tone.js)
function midiToNoteName(midiNote: number): string {
  return Tone.Frequency(midiNote, 'midi').toNote();
}

// Convert MIDI velocity (0-127) to gain (0-1)
function velocityToGain(velocity: number): number {
  return velocity / 127;
}

export function usePlayback(
  project: Project | null,
  isPlaying: boolean,
  tempo: number,
  setPlayheadPosition: (position: number) => void,
  instrumentsReady: boolean = true,
  getSynthesizer: GetSynthesizer,
  playNote: PlayNoteFn
) {
  const scheduledEventsRef = useRef<Tone.ToneEvent[]>([]);
  const playheadUpdateRef = useRef<number | null>(null);

  // Schedule all MIDI notes for playback
  // Use useCallback to ensure it uses the latest tempo and project
  const scheduleNotes = useCallback(() => {
    if (!project) return;

    const { numerator, denominator } = project.timeSignature;

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
      if (!synth) return;

      // Check if it's a SoundFont instrument
      const isSoundfont = synth instanceof SoundfontInstrument;
      
      // For Tone.js synths, check if they support triggerAttackRelease
      if (!isSoundfont && !('triggerAttackRelease' in synth)) return;

      // PolySynth and other synthesizers that support triggerAttackRelease
      const playable = isSoundfont 
        ? synth as SoundfontInstrument
        : synth as Tone.PolySynth | Tone.MonoSynth | Tone.Synth | Tone.FMSynth | Tone.AMSynth | Tone.DuoSynth | Tone.PluckSynth | Tone.MembraneSynth | Tone.MetalSynth;

      // Store base track volume
      const baseTrackVolume = track.volume;
      
      // Set track volume once for Tone.js synths (not per-note)
      // This prevents volume changes from affecting currently playing notes
      if (!isSoundfont) {
        const toneSynth = playable as Tone.PolySynth | Tone.MonoSynth | Tone.Synth | Tone.FMSynth | Tone.AMSynth | Tone.DuoSynth | Tone.PluckSynth | Tone.MembraneSynth | Tone.MetalSynth;
        const trackVolumeDb = Tone.gainToDb(baseTrackVolume);
        toneSynth.volume.value = trackVolumeDb;
      }

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
        const noteStartBars = clipStartBars + ticksToBars(note.startTick, numerator, denominator);
        // Apply tempo scaling: divide by (tempo / 240)
        // This ensures notes play at the correct positions relative to tempo
        const tempoScaledBars = noteStartBars / (tempo / 240);
        // Round to avoid floating point precision issues
        const roundedStartBars = Math.round(tempoScaledBars * 10000) / 10000;
        
        if (!notesByStartTime.has(roundedStartBars)) {
          notesByStartTime.set(roundedStartBars, []);
        }
        notesByStartTime.get(roundedStartBars)!.push(note);
      });

      // Sort start times to ensure strictly increasing order
      const sortedStartTimes = Array.from(notesByStartTime.keys()).sort((a, b) => a - b);

      // Get current transport time in bars to ensure we don't schedule notes in the past
      // Use the actual Transport BPM (not the tempo parameter) to calculate current position
      // Apply the same tempo scaling factor for consistency
      const transportBpm = Tone.getTransport().bpm.value;
      const currentTransportBarsRaw = Tone.getTransport().seconds > 0 
        ? (Tone.getTransport().seconds / 60) * (transportBpm / 4)
        : 0;
      // Apply tempo scaling to match how we scale note positions
      const currentTransportBars = currentTransportBarsRaw / (tempo / 240);
      
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
        
        // Handle SoundFont instruments differently
        if (isSoundfont) {
          // Use playNote function which works correctly for SoundFont instruments
          // Convert MIDI note numbers to note names for playNote
          notesAtTime.forEach((note) => {
            const noteName = midiToNoteName(note.pitch);
            // Convert duration from ticks to bars, then to Tone.js time string
            // This accurately preserves sustained note durations
            const noteDurationBars = ticksToBars(note.durationTick, numerator, denominator);
            // Convert bars to Tone.js time string using 'm' (measures/bars)
            // This preserves the exact duration including sustained notes
            const noteDuration = noteDurationBars > 0 ? `${noteDurationBars}m` : '8n';
            
            const event = new Tone.ToneEvent((time) => {
              // Use playNote which handles SoundFont instruments correctly
              // Don't pass time - let it play immediately when the event fires
              // The ToneEvent already handles the scheduling at the correct time
              playNote(track.id, noteName, noteDuration, undefined, note.velocity);
            });
            
            event.start(adjustedStartBars);
            scheduledEventsRef.current.push(event);
          });
        } else {
          // Tone.js synthesizers: handle chords and individual notes
          const toneSynth = playable as Tone.PolySynth | Tone.MonoSynth | Tone.Synth | Tone.FMSynth | Tone.AMSynth | Tone.DuoSynth | Tone.PluckSynth | Tone.MembraneSynth | Tone.MetalSynth;
          
          // For PolySynth chords with same velocity, play together; otherwise play individually
          const hasDifferentVelocities = notesAtTime.length > 1 && 
            notesAtTime.some(note => note.velocity !== notesAtTime[0].velocity);
          
          // Check if all notes have the same duration (for chord playback)
          const hasDifferentDurations = notesAtTime.length > 1 &&
            notesAtTime.some(note => note.durationTick !== notesAtTime[0].durationTick);
          
          if (toneSynth instanceof Tone.PolySynth && notesAtTime.length > 1 && !hasDifferentVelocities && !hasDifferentDurations) {
            // Play chord: all notes have same velocity and duration, so we can play them together
            const noteNames = notesAtTime.map(note => midiToNoteName(note.pitch));
            
            // All notes have the same velocity and duration
            const noteVelocity = notesAtTime[0].velocity;
            const noteDurationBars = ticksToBars(notesAtTime[0].durationTick, numerator, denominator);
            // Apply tempo scaling to duration to match tempo-scaled scheduling
            const tempoScaledDuration = noteDurationBars / (tempo / 240);
            
            // Convert MIDI velocity (0-127) to normalized velocity (0-1)
            const normalizedVelocity = noteVelocity / 127;
            
            const noteDuration = noteDurationBars > 0 ? `${tempoScaledDuration}m` : '8n';
            const event = new Tone.ToneEvent((time) => {
              // Use velocity parameter to set per-note volume without affecting other voices
              toneSynth.triggerAttackRelease(noteNames, noteDuration, time, normalizedVelocity);
            });
            
            event.start(adjustedStartBars);
            scheduledEventsRef.current.push(event);
          } else {
            // Play individual notes (different velocities/durations in chord, or single notes, or non-PolySynth)
            notesAtTime.forEach((note) => {
              const noteName = midiToNoteName(note.pitch);
              const noteDurationBars = ticksToBars(note.durationTick, numerator, denominator);
              // Apply tempo scaling to duration to match tempo-scaled scheduling
              const tempoScaledDuration = noteDurationBars / (tempo / 240);
              
              // Convert MIDI velocity (0-127) to normalized velocity (0-1)
              const normalizedVelocity = note.velocity / 127;
              
              const noteDuration = noteDurationBars > 0 ? `${tempoScaledDuration}m` : '8n';
              const event = new Tone.ToneEvent((time) => {
                // Use velocity parameter to set per-note volume without affecting other voices
                toneSynth.triggerAttackRelease(noteName, noteDuration, time, normalizedVelocity);
              });
              
              event.start(adjustedStartBars);
              scheduledEventsRef.current.push(event);
            });
          }
        }
        
        // Update lastStartBars after processing all notes at this time
        lastStartBars = adjustedStartBars;
      });
    });
  }, [project, tempo, getSynthesizer, playNote, instrumentsReady]);

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
      // Use the actual Transport BPM (not the tempo parameter) for accuracy
      // Assuming 4/4 time signature (4 beats per bar)
      const transportBpm = Tone.getTransport().bpm.value;
      const bars = (seconds / 60) * (transportBpm / 4);
      
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

  // Schedule notes when playback starts, tempo changes, or instruments become ready (e.g. after MIDI import)
  useEffect(() => {
    if (isPlaying && project && instrumentsReady) {
      // Set BPM synchronously first - this is critical for proper timing
      Tone.getTransport().bpm.value = tempo;
      
      // Clear any existing events first to prevent duplicates
      scheduledEventsRef.current.forEach((event) => event.dispose());
      scheduledEventsRef.current = [];
      
      // Schedule notes using requestAnimationFrame to ensure Transport state is ready
      // This gives Tone.js a moment to process the BPM change
      const scheduleId = requestAnimationFrame(() => {
        // Double-check BPM was set correctly (sometimes needs a moment to apply)
        const currentBpm = Tone.getTransport().bpm.value;
        if (Math.abs(currentBpm - tempo) > 0.1) {
          // If BPM didn't set correctly, set it again
          Tone.getTransport().bpm.value = tempo;
        }
        // Now schedule all notes with the correct BPM
        scheduleNotes();
      });
      
      return () => {
        cancelAnimationFrame(scheduleId);
        // Cleanup: dispose all scheduled events
        scheduledEventsRef.current.forEach((event) => event.dispose());
        scheduledEventsRef.current = [];
      };
    } else {
      // Clear scheduled events when stopped
      scheduledEventsRef.current.forEach((event) => event.dispose());
      scheduledEventsRef.current = [];
    }

    return () => {
      scheduledEventsRef.current.forEach((event) => event.dispose());
      scheduledEventsRef.current = [];
    };
  }, [isPlaying, project, tempo, instrumentsReady, scheduleNotes]);

  return {
    scheduleNotes,
  };
}
