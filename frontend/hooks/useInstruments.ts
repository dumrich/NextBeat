import { useEffect, useRef, useMemo } from 'react';
import * as Tone from 'tone';
import { createInstrument, InstrumentId, isSoundfontInstrument } from '@/utils/instruments';
import { SoundfontInstrument } from '@/utils/soundfont';
import type { Track } from '@/types/project';

// Store synthesizer instances per track (can be Tone.js or SoundFont)
const synthesizerCache = new Map<string, Tone.ToneAudioNode | SoundfontInstrument>();

export function useInstruments(tracks: Track[]) {
  const cacheRef = useRef(synthesizerCache);

  // Initialize synthesizers for all tracks
  useEffect(() => {
    const loadInstruments = async () => {
      for (const track of tracks) {
        if (track.instrument && !cacheRef.current.has(track.id)) {
          try {
            // Get audio context (use Tone.js context or create new one)
            const audioContext = Tone.getContext().rawContext as AudioContext;
            
            // Create instrument (async for SoundFont, sync for Tone.js)
            const synth = await createInstrument(
              track.instrument,
              audioContext,
              track.midiProgram
            );
            cacheRef.current.set(track.id, synth);
          } catch (error) {
            // Failed to create instrument
          }
        }
      }
    };

    loadInstruments();

    // Cleanup: remove synthesizers for tracks that no longer exist
    const trackIds = new Set(tracks.map((t) => t.id));
    cacheRef.current.forEach((synth, trackId) => {
      if (!trackIds.has(trackId)) {
        try {
          if ('dispose' in synth && typeof synth.dispose === 'function') {
            synth.dispose();
          }
          cacheRef.current.delete(trackId);
        } catch (error) {
          // Failed to dispose synthesizer
        }
      }
    });
  }, [tracks]);

  // Note: We don't cleanup synthesizers on component unmount because:
  // 1. The cache is shared across all components (PianoRollView, usePlayback, etc.)
  // 2. Synthesizers should persist across view switches
  // 3. Cleanup is handled when tracks are removed (lines 25-36)

  // Get synthesizer for a specific track
  const getSynthesizer = (trackId: string): Tone.ToneAudioNode | SoundfontInstrument | null => {
    return cacheRef.current.get(trackId) || null;
  };

  // Store base volume per track (before velocity adjustments)
  const baseVolumes = useRef(new Map<string, number>());
  // Track active note previews to prevent volume restoration conflicts
  const activePreviews = useRef(new Map<string, number>());

  // Play a note on a track's synthesizer
  const playNote = (trackId: string, note: string, duration?: string, time?: number, velocity?: number) => {
    const synth = getSynthesizer(trackId);
    if (!synth) return;

    // Check if it's a SoundFont instrument
    if (synth instanceof SoundfontInstrument) {
      try {
        // Convert note name to MIDI note number
        const midiNote = noteNameToMidi(note);
        if (midiNote !== null) {
          const velocityValue = velocity !== undefined ? velocity : 100;
          const noteDuration = duration || '8n';
          // triggerAttackRelease is async, but we don't need to await it for preview
          synth.triggerAttackRelease(midiNote, noteDuration, time, velocityValue).catch(() => {
            // Error playing note - silently fail
          });
        }
      } catch (error) {
        // Error in playNote - silently fail
      }
      return;
    }

    // Handle Tone.js synthesizers
    if ('triggerAttackRelease' in synth) {
      const playable = synth as Tone.PolySynth | Tone.MonoSynth | Tone.Synth | Tone.FMSynth | Tone.AMSynth | Tone.DuoSynth | Tone.PluckSynth | Tone.MembraneSynth | Tone.MetalSynth;
      
      // Check if volume is a Signal (has .value property) or just a number
      const hasVolumeSignal = playable.volume && typeof playable.volume === 'object' && 'value' in playable.volume;
      
      // Get or set base volume for this track (first time, save current volume as base)
      if (!baseVolumes.current.has(trackId)) {
        const currentVolume = hasVolumeSignal 
          ? (playable.volume as any).value 
          : (typeof playable.volume === 'number' ? playable.volume : 0);
        baseVolumes.current.set(trackId, currentVolume);
      }
      const baseVolume = baseVolumes.current.get(trackId)!;
      
      // Increment active preview counter
      const currentCount = activePreviews.current.get(trackId) || 0;
      activePreviews.current.set(trackId, currentCount + 1);
      
      // Convert velocity (0-127) to gain (0-1), default to 100 (full velocity)
      const velocityValue = velocity !== undefined ? velocity : 100;
      const velocityGain = velocityValue / 127;
      
      // Calculate volume: base volume + velocity adjustment
      // Velocity gain (0-1) converted to dB, then added to base volume
      const velocityDb = Tone.gainToDb(velocityGain);
      const targetVolume = baseVolume + velocityDb;
      
      // Set volume for this note (relative to base, not current)
      // Only set if volume is a Signal object
      if (hasVolumeSignal) {
        (playable.volume as any).value = targetVolume;
      }
      
      // Play the note
      const noteDuration = duration || '8n';
      playable.triggerAttackRelease(note, noteDuration, time);
      
      // Restore base volume after the note duration
      // Convert duration to seconds and add a small buffer
      const durationSeconds = Tone.Time(noteDuration).toSeconds();
      setTimeout(() => {
        // Decrement active preview counter
        const count = activePreviews.current.get(trackId) || 0;
        activePreviews.current.set(trackId, Math.max(0, count - 1));
        
        // Only restore to base volume if this was the last active preview
        // This prevents restoring volume while other notes are still playing
        if (activePreviews.current.get(trackId) === 0 && hasVolumeSignal) {
          (playable.volume as any).value = baseVolume;
        }
      }, (durationSeconds * 1000) + 50); // Add 50ms buffer
    }
  };

  // Convert note name (e.g., "C4") to MIDI note number (0-127)
  function noteNameToMidi(noteName: string): number | null {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const match = noteName.match(/^([A-G]#?)(\d+)$/);
    if (!match) return null;
    
    const note = match[1];
    const octave = parseInt(match[2]);
    const noteIndex = noteNames.indexOf(note);
    if (noteIndex === -1) return null;
    
    return (octave + 1) * 12 + noteIndex;
  }

  return {
    getSynthesizer,
    playNote,
  };
}
