import * as Tone from 'tone';

export type InstrumentId = 'piano' | 'synth' | 'bass' | 'guitar' | 'strings' | 'brass' | 'drums' | 'percussion' | 'automation';

export interface InstrumentConfig {
  id: InstrumentId;
  name: string;
  createSynth: () => Tone.ToneAudioNode;
}

// Map instrument IDs to Tone.js synthesizers
export function createInstrument(instrumentId: InstrumentId): Tone.ToneAudioNode {
  switch (instrumentId) {
    case 'piano':
      // Piano-like sound using FMSynth with bell-like characteristics
      // Wrap in PolySynth for polyphonic playback (chords)
      return new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3,
        modulationIndex: 10,
        detune: 0,
        oscillator: {
          type: 'sine',
        },
        envelope: {
          attack: 0.01,
          decay: 0.3,
          sustain: 0.1,
          release: 0.5,
        },
        modulation: {
          type: 'square',
        },
        modulationEnvelope: {
          attack: 0.5,
          decay: 0.01,
          sustain: 1,
          release: 0.5,
        },
      }).toDestination();

    case 'synth':
      // Classic synthesizer sound
      // Wrap in PolySynth for polyphonic playback (chords)
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: {
          type: 'sawtooth',
        },
        envelope: {
          attack: 0.1,
          decay: 0.2,
          sustain: 0.5,
          release: 0.8,
        },
      }).toDestination();

    case 'bass':
      // Bass sound using MonoSynth
      // Wrap in PolySynth for polyphonic playback (chords)
      return new Tone.PolySynth(Tone.MonoSynth, {
        oscillator: {
          type: 'sawtooth',
        },
        envelope: {
          attack: 0.1,
          decay: 0.3,
          sustain: 0.7,
          release: 0.8,
        },
        filterEnvelope: {
          attack: 0.001,
          decay: 0.7,
          sustain: 0.1,
          release: 0.8,
          baseFrequency: 300,
          octaves: 4,
        },
      }).toDestination();

    case 'guitar':
      // Guitar-like plucked sound
      // PluckSynth is already polyphonic, but wrap in PolySynth for consistency
      return new Tone.PolySynth(Tone.PluckSynth, {
        attackNoise: 1,
        dampening: 4000,
        resonance: 0.7,
      }).toDestination();

    case 'strings':
      // String ensemble using DuoSynth
      return new Tone.DuoSynth({
        voice0: {
          oscillator: {
            type: 'sawtooth',
          },
          envelope: {
            attack: 0.1,
            decay: 0.3,
            sustain: 0.5,
            release: 1.2,
          },
          filterEnvelope: {
            attack: 0.001,
            decay: 0.5,
            sustain: 0.8,
            release: 1.5,
            baseFrequency: 200,
            octaves: 3,
          },
        },
        voice1: {
          oscillator: {
            type: 'sawtooth',
          },
          envelope: {
            attack: 0.1,
            decay: 0.3,
            sustain: 0.5,
            release: 1.2,
          },
          filterEnvelope: {
            attack: 0.001,
            decay: 0.5,
            sustain: 0.8,
            release: 1.5,
            baseFrequency: 200,
            octaves: 3,
          },
        },
        vibratoAmount: 0.5,
        vibratoRate: 5,
        harmonicity: 1.5,
        volume: -10,
      }).toDestination();

    case 'brass':
      // Brass section using AMSynth
      // Wrap in PolySynth for polyphonic playback (chords)
      return new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 3,
        detune: 0,
        oscillator: {
          type: 'sine',
        },
        envelope: {
          attack: 0.01,
          decay: 0.3,
          sustain: 0.7,
          release: 0.8,
        },
        modulation: {
          type: 'square',
        },
        modulationEnvelope: {
          attack: 0.5,
          decay: 0.01,
          sustain: 1,
          release: 0.5,
        },
      }).toDestination();

    case 'drums':
      // Drum kit using MembraneSynth for kick and MetalSynth for cymbals
      // We'll use a combination - for simplicity, using MembraneSynth
      return new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 10,
        oscillator: {
          type: 'sine',
        },
        envelope: {
          attack: 0.001,
          decay: 0.4,
          sustain: 0.01,
          release: 1.4,
          attackCurve: 'exponential',
        },
      }).toDestination();

    case 'percussion':
      // Percussion using MetalSynth
      return new Tone.MetalSynth({
        frequency: 200,
        envelope: {
          attack: 0.001,
          decay: 0.1,
          release: 0.01,
        },
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4000,
        octaves: 1.5,
      }).toDestination();

    case 'automation':
      // Automation tracks don't need sound, but we'll provide a simple synth
      // Wrap in PolySynth for polyphonic playback
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: {
          type: 'sine',
        },
        envelope: {
          attack: 0.1,
          decay: 0.2,
          sustain: 0.5,
          release: 0.8,
        },
      }).toDestination();

    default:
      // Default to basic synth wrapped in PolySynth
      return new Tone.PolySynth(Tone.Synth).toDestination();
  }
}

// Get instrument name from ID
export function getInstrumentName(instrumentId: InstrumentId | string | null): string {
  if (!instrumentId) return 'None';
  
  const names: Record<InstrumentId, string> = {
    piano: 'Piano',
    synth: 'Synthesizer',
    bass: 'Bass',
    guitar: 'Guitar',
    strings: 'Strings',
    brass: 'Brass',
    drums: 'Drum Kit',
    percussion: 'Percussion',
    automation: 'Automation',
  };
  
  return names[instrumentId as InstrumentId] || 'Unknown';
}
