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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cacheRef.current.forEach((synth) => {
        try {
          synth.dispose();
        } catch (error) {
          console.error('Failed to dispose synthesizer:', error);
        }
      });
      cacheRef.current.clear();
    };
  }, []);

  // Get synthesizer for a specific track
  const getSynthesizer = (trackId: string): Tone.ToneAudioNode | null => {
    return cacheRef.current.get(trackId) || null;
  };

  // Play a note on a track's synthesizer
  const playNote = (trackId: string, note: string, duration?: string, time?: number) => {
    const synth = getSynthesizer(trackId);
    if (synth && 'triggerAttackRelease' in synth) {
      const playable = synth as Tone.PolySynth | Tone.MonoSynth | Tone.Synth | Tone.FMSynth | Tone.AMSynth | Tone.DuoSynth | Tone.PluckSynth | Tone.MembraneSynth | Tone.MetalSynth;
      playable.triggerAttackRelease(note, duration || '8n', time);
    }
  };

  return {
    getSynthesizer,
    playNote,
  };
}
