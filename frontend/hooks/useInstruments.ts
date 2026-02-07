import { useEffect, useRef, useMemo } from 'react';
import * as Tone from 'tone';
import { createInstrument, InstrumentId } from '@/utils/instruments';
import type { Track } from '@/types/project';

// Store synthesizer instances per track
const synthesizerCache = new Map<string, Tone.ToneAudioNode>();

export function useInstruments(tracks: Track[]) {
  const cacheRef = useRef(synthesizerCache);

  // Initialize synthesizers for all tracks
  useEffect(() => {
    tracks.forEach((track) => {
      if (track.instrument && !cacheRef.current.has(track.id)) {
        try {
          const synth = createInstrument(track.instrument as InstrumentId);
          cacheRef.current.set(track.id, synth);
        } catch (error) {
          console.error(`Failed to create instrument for track ${track.id}:`, error);
        }
      }
    });

    // Cleanup: remove synthesizers for tracks that no longer exist
    const trackIds = new Set(tracks.map((t) => t.id));
    cacheRef.current.forEach((synth, trackId) => {
      if (!trackIds.has(trackId)) {
        try {
          synth.dispose();
          cacheRef.current.delete(trackId);
        } catch (error) {
          console.error(`Failed to dispose synthesizer for track ${trackId}:`, error);
        }
      }
    });
  }, [tracks]);

  // Note: We don't cleanup synthesizers on component unmount because:
  // 1. The cache is shared across all components (PianoRollView, usePlayback, etc.)
  // 2. Synthesizers should persist across view switches
  // 3. Cleanup is handled when tracks are removed (lines 25-36)

  // Get synthesizer for a specific track
  const getSynthesizer = (trackId: string): Tone.ToneAudioNode | null => {
    return cacheRef.current.get(trackId) || null;
  };

  // Store base volume per track (before velocity adjustments)
  const baseVolumes = useRef(new Map<string, number>());
  // Track active note previews to prevent volume restoration conflicts
  const activePreviews = useRef(new Map<string, number>());

  // Play a note on a track's synthesizer
  const playNote = (trackId: string, note: string, duration?: string, time?: number, velocity?: number) => {
    const synth = getSynthesizer(trackId);
    if (synth && 'triggerAttackRelease' in synth) {
      const playable = synth as Tone.PolySynth | Tone.MonoSynth | Tone.Synth | Tone.FMSynth | Tone.AMSynth | Tone.DuoSynth | Tone.PluckSynth | Tone.MembraneSynth | Tone.MetalSynth;
      
      // Get or set base volume for this track (first time, save current volume as base)
      if (!baseVolumes.current.has(trackId)) {
        baseVolumes.current.set(trackId, playable.volume.value);
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
      playable.volume.value = targetVolume;
      
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
        if (activePreviews.current.get(trackId) === 0) {
          playable.volume.value = baseVolume;
        }
      }, (durationSeconds * 1000) + 50); // Add 50ms buffer
    }
  };

  return {
    getSynthesizer,
    playNote,
  };
}
