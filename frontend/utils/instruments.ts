import * as Tone from 'tone';
import { loadSoundfontInstrument, getSoundfontNameFromProgram, SoundfontInstrument } from './soundfont';

export type InstrumentId = 'piano' | 'synth' | 'bass' | 'guitar' | 'strings' | 'brass' | 'flute' | 'drums' | 'percussion' | 'gunshot' | 'automation';

// Map InstrumentId to MIDI program numbers (General MIDI)
const INSTRUMENT_TO_MIDI_PROGRAM: Record<InstrumentId, number> = {
  piano: 0,        // Acoustic Grand Piano
  synth: 80,       // Lead 1 (square) - classic synth sound
  bass: 32,        // Acoustic Bass
  guitar: 24,      // Acoustic Guitar (nylon)
  strings: 48,     // String Ensemble 1
  brass: 56,       // Trumpet
  flute: 73,       // Flute
  drums: 115,      // Woodblock (sharp percussive click - hi-hat-like)
  percussion: 117, // Melodic Tom (tom drum sounds)
  gunshot: 127,    // Gunshot (sound effect)
  automation: 0,   // Automation tracks don't need sound
};

// Check if instrument string is a SoundFont instrument
export function isSoundfontInstrument(instrument: string | null): boolean {
  // All InstrumentId values now use SoundFont, plus explicit soundfont: and midi: prefixes
  return instrument?.startsWith('soundfont:') || 
         instrument?.startsWith('midi:') || 
         (instrument !== null && Object.keys(INSTRUMENT_TO_MIDI_PROGRAM).includes(instrument)) ||
         false;
}

// Get SoundFont instrument name from track instrument string
export function getSoundfontInstrumentName(instrument: string | null, midiProgram?: number): string | null {
  if (instrument?.startsWith('soundfont:')) {
    return instrument.replace('soundfont:', '');
  }
  
  // If midiProgram is provided, use it directly
  if (midiProgram !== undefined && midiProgram >= 0) {
    return getSoundfontNameFromProgram(midiProgram);
  }
  
  // If it's a midi: prefix, extract the program number
  if (instrument?.startsWith('midi:')) {
    const program = parseInt(instrument.replace('midi:', ''));
    return getSoundfontNameFromProgram(program);
  }
  
  // If it's a known InstrumentId, map it to MIDI program number
  if (instrument && instrument in INSTRUMENT_TO_MIDI_PROGRAM) {
    const program = INSTRUMENT_TO_MIDI_PROGRAM[instrument as InstrumentId];
    if (program >= 0) {
      return getSoundfontNameFromProgram(program);
    }
  }
  
  return null;
}

export interface InstrumentConfig {
  id: InstrumentId;
  name: string;
  createSynth: () => Tone.ToneAudioNode;
}

// Map instrument IDs to SoundFont instruments (with Tone.js fallback)
export async function createInstrument(
  instrumentId: InstrumentId | string,
  audioContext?: AudioContext,
  midiProgram?: number
): Promise<Tone.ToneAudioNode | SoundfontInstrument> {
  // Get audio context if not provided
  if (!audioContext) {
    // Use Tone.js context if available, otherwise create new one
    try {
      audioContext = Tone.getContext().rawContext as AudioContext;
    } catch {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  // Determine MIDI program number
  let program: number | undefined = midiProgram;
  
  // If it's a known InstrumentId, map it to MIDI program number
  if (instrumentId in INSTRUMENT_TO_MIDI_PROGRAM && !program) {
    program = INSTRUMENT_TO_MIDI_PROGRAM[instrumentId as InstrumentId];
  }
  
  // If it's a midi: prefix, extract the program number
  if (instrumentId?.startsWith('midi:') && !program) {
    program = parseInt(instrumentId.replace('midi:', ''));
  }

  // Try to load SoundFont instrument
  const soundfontName = getSoundfontInstrumentName(instrumentId, program);
  if (soundfontName) {
    try {
      const soundfont = await loadSoundfontInstrument(soundfontName, audioContext);
      if (soundfont) {
        // Verify the soundfont is actually valid before returning
        // Check if it has the triggerAttackRelease method
        if (soundfont && typeof (soundfont as any).triggerAttackRelease === 'function') {
          return soundfont;
        }
      }
    } catch (error) {
      // SoundFont loading failed, will fall back to Tone.js
    }
  }

  // Fallback to Tone.js synthesizers if SoundFont fails
  return createToneInstrument(instrumentId as InstrumentId);
}

// Map instrument IDs to Tone.js synthesizers (synchronous version for backward compatibility)
export function createToneInstrument(instrumentId: InstrumentId): Tone.ToneAudioNode {
  switch (instrumentId) {
    case 'piano':
      // Piano-like sound using FMSynth with bell-like characteristics
      // Wrap in PolySynth for polyphonic playback (chords)
      return new Tone.PolySynth(Tone.FMSynth, {
        maxPolyphony: 64, // Increase polyphony for overlapping sustained notes
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
        maxPolyphony: 64, // Increase polyphony for overlapping sustained notes
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
        maxPolyphony: 64, // Increase polyphony for overlapping sustained notes
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
        maxPolyphony: 64, // Increase polyphony for overlapping sustained notes
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
        maxPolyphony: 64, // Increase polyphony for overlapping sustained notes
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

    case 'gunshot':
      // Gunshot using NoiseSynth for percussive burst
      return new Tone.NoiseSynth({
        noise: {
          type: 'white',
        },
        envelope: {
          attack: 0.001,
          decay: 0.05,
          sustain: 0,
          release: 0.1,
        },
      }).toDestination();

    case 'automation':
      // Automation tracks don't need sound, but we'll provide a simple synth
      // Wrap in PolySynth for polyphonic playback
      return new Tone.PolySynth(Tone.Synth, {
        maxPolyphony: 64, // Increase polyphony for overlapping sustained notes
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
      return new Tone.PolySynth(Tone.Synth, {
        maxPolyphony: 64 // Increase polyphony for overlapping sustained notes
      }).toDestination();
  }
}

// Get instrument name from ID
export function getInstrumentName(instrumentId: InstrumentId | string | null): string {
  if (!instrumentId) return 'None';
  
  // Handle MIDI program numbers
  if (instrumentId.startsWith('midi:')) {
    const program = parseInt(instrumentId.replace('midi:', ''));
    const soundfontName = getSoundfontNameFromProgram(program);
    // Convert soundfont name to readable format (e.g., "acoustic_grand_piano" -> "Acoustic Grand Piano")
    return soundfontName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  // Handle soundfont: prefix
  if (instrumentId.startsWith('soundfont:')) {
    const name = instrumentId.replace('soundfont:', '');
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  // Handle regular InstrumentId
  const names: Record<InstrumentId, string> = {
    piano: 'Acoustic Grand Piano',
    synth: 'Square Lead Synth',
    bass: 'Acoustic Bass',
    guitar: 'Nylon Guitar',
    strings: 'String Ensemble',
    brass: 'Trumpet',
    flute: 'Flute',
    drums: 'Woodblock',
    percussion: 'Melodic Toms',
    gunshot: 'Gunshot',
    automation: 'Automation',
  };
  
  return names[instrumentId as InstrumentId] || 'Unknown';
}
