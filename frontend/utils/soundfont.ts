// SoundFont Instrument Support
// This module provides SoundFont instrument loading and playback

import * as Tone from 'tone';

// General MIDI instrument names (0-127)
export const GM_INSTRUMENTS: string[] = [
  // Piano (0-7)
  'acoustic_grand_piano', 'bright_acoustic_piano', 'electric_grand_piano', 'honkytonk_piano',
  'electric_piano_1', 'electric_piano_2', 'harpsichord', 'clavi',
  // Chromatic Percussion (8-15)
  'celesta', 'glockenspiel', 'music_box', 'vibraphone', 'marimba', 'xylophone', 'tubular_bells', 'dulcimer',
  // Organ (16-23)
  'drawbar_organ', 'percussive_organ', 'rock_organ', 'church_organ', 'reed_organ', 'accordion', 'harmonica', 'tango_accordion',
  // Guitar (24-31)
  'acoustic_guitar_nylon', 'acoustic_guitar_steel', 'electric_guitar_jazz', 'electric_guitar_clean',
  'electric_guitar_muted', 'overdriven_guitar', 'distortion_guitar', 'guitar_harmonics',
  // Bass (32-39)
  'acoustic_bass', 'electric_bass_finger', 'electric_bass_pick', 'fretless_bass',
  'slap_bass_1', 'slap_bass_2', 'synth_bass_1', 'synth_bass_2',
  // Strings (40-47)
  'violin', 'viola', 'cello', 'contrabass', 'tremolo_strings', 'pizzicato_strings', 'orchestral_harp', 'timpani',
  // Ensemble (48-55)
  'string_ensemble_1', 'string_ensemble_2', 'synth_strings_1', 'synth_strings_2',
  'choir_aahs', 'voice_oohs', 'synth_voice', 'orchestra_hit',
  // Brass (56-63)
  'trumpet', 'trombone', 'tuba', 'muted_trumpet', 'french_horn', 'brass_section', 'synth_brass_1', 'synth_brass_2',
  // Reed (64-71)
  'soprano_sax', 'alto_sax', 'tenor_sax', 'baritone_sax', 'oboe', 'english_horn', 'bassoon', 'clarinet',
  // Pipe (72-79)
  'piccolo', 'flute', 'recorder', 'pan_flute', 'blown_bottle', 'shakuhachi', 'whistle', 'ocarina',
  // Synth Lead (80-87)
  'lead_1_square', 'lead_2_sawtooth', 'lead_3_calliope', 'lead_4_chiff', 'lead_5_charang', 'lead_6_voice', 'lead_7_fifths', 'lead_8_bass_lead',
  // Synth Pad (88-95)
  'pad_1_new_age', 'pad_2_warm', 'pad_3_polysynth', 'pad_4_choir', 'pad_5_bowed', 'pad_6_metallic', 'pad_7_halo', 'pad_8_sweep',
  // Synth Effects (96-103)
  'fx_1_rain', 'fx_2_soundtrack', 'fx_3_crystal', 'fx_4_atmosphere', 'fx_5_brightness', 'fx_6_goblins', 'fx_7_echoes', 'fx_8_sci_fi',
  // Ethnic (104-111)
  'sitar', 'banjo', 'shamisen', 'koto', 'kalimba', 'bag_pipe', 'fiddle', 'shanai',
  // Percussive (112-119)
  'tinkle_bell', 'agogo', 'steel_drums', 'woodblock', 'taiko_drum', 'melodic_tom', 'synth_drum', 'reverse_cymbal',
  // Sound Effects (120-127)
  'guitar_fret_noise', 'breath_noise', 'seashore', 'bird_tweet', 'telephone_ring', 'helicopter', 'applause', 'gunshot',
];

// Map MIDI program number (0-127) to SoundFont instrument name
export function getSoundfontNameFromProgram(program: number): string {
  const index = Math.max(0, Math.min(127, program));
  return GM_INSTRUMENTS[index] || 'acoustic_grand_piano';
}

// SoundFont instrument wrapper that works with Tone.js
export class SoundfontInstrument {
  private audioContext: AudioContext;
  private soundfontPlayer: any; // soundfont-player Player object
  private gainNode: GainNode;
  private volume: number = 1.0; // Default to full volume (was 0.5, too quiet)
  private activeNoteIds: Set<string> = new Set(); // Track active note IDs

  constructor(audioContext: AudioContext, soundfontPlayer: any) {
    this.audioContext = audioContext;
    this.soundfontPlayer = soundfontPlayer;
    this.gainNode = audioContext.createGain();
    
    // Connect the soundfont player's output through our gain node
    if (soundfontPlayer.out) {
      // Disconnect from any existing connections
      try {
        soundfontPlayer.out.disconnect();
      } catch (e) {
        // May not be connected
      }
      soundfontPlayer.out.connect(this.gainNode);
    } else if (soundfontPlayer.connect) {
      try {
        soundfontPlayer.disconnect();
      } catch (e) {
        // May not be connected
      }
      soundfontPlayer.connect(this.gainNode);
    }
    
    this.gainNode.connect(audioContext.destination);
    this.gainNode.gain.value = this.volume;
  }

  // Play a note (MIDI note number 0-127)
  async triggerAttackRelease(midiNote: number, duration: string, time?: number, velocity: number = 100): Promise<void> {
    try {
      if (!this.soundfontPlayer) {
        return;
      }

      // Ensure audio context is running
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const noteName = this.midiToNoteName(midiNote);
      
      // Convert Tone.js duration to seconds
      const durationSeconds = Tone.Time(duration).toSeconds();
      
      // Calculate start time (in seconds from now)
      const startTime = time !== undefined 
        ? this.audioContext.currentTime + time 
        : this.audioContext.currentTime;
      
      // Convert velocity (0-127) to gain (0-1)
      // Apply volume boost - multiply by 2 to make it louder (since default was 0.5)
      const velocityGain = (velocity / 127) * 2.0;
      const finalGain = velocityGain * this.volume;
      
      // Use the soundfont player's start() method
      // Try both note name and MIDI note number
      if (this.soundfontPlayer.start) {
        try {
          // Try with note name first
          this.soundfontPlayer.start(noteName, startTime, {
            gain: finalGain,
            duration: durationSeconds
          });
        } catch (error) {
          // Try with MIDI note number if note name fails
          try {
            this.soundfontPlayer.start(midiNote, startTime, {
              gain: finalGain,
              duration: durationSeconds
            });
          } catch (error2) {
            // Error calling start()
          }
        }
        
        // Stop the note after duration using the player's stop method
        if (this.soundfontPlayer.stop) {
          const stopTime = startTime + durationSeconds;
          // Use setTimeout to stop the note
          const timeoutMs = Math.max(0, (stopTime - this.audioContext.currentTime) * 1000);
          setTimeout(() => {
            try {
              // Stop all notes (or we could track specific note IDs)
              this.soundfontPlayer.stop(this.audioContext.currentTime);
            } catch (e) {
              // Error stopping note
            }
          }, timeoutMs);
        }
      } else if (this.soundfontPlayer.play) {
        // Fallback to play() method if start() doesn't exist
        try {
          this.soundfontPlayer.play(noteName, startTime, {
            gain: finalGain,
            duration: durationSeconds
          });
        } catch (error) {
          // Error calling play()
        }
      }
    } catch (error) {
      // Catch all errors to prevent crashes
      return;
    }
  }

  // Convert MIDI note number to note name (e.g., 60 -> "C4")
  private midiToNoteName(midiNote: number): string {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midiNote / 12) - 1;
    const note = noteNames[midiNote % 12];
    return `${note}${octave}`;
  }

  // Set volume (0-1)
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.gainNode.gain.value = this.volume;
  }

  // Get current volume
  getVolume(): number {
    return this.volume;
  }

  // Stop all active notes
  releaseAll(): void {
    if (this.soundfontPlayer && this.soundfontPlayer.stop) {
      try {
        // Stop all notes immediately
        this.soundfontPlayer.stop(this.audioContext.currentTime);
      } catch (e) {
        // Ignore errors
      }
    }
    this.activeNoteIds.clear();
  }

  // Dispose of the instrument
  dispose(): void {
    this.releaseAll();
    this.gainNode.disconnect();
  }
}

// Load SoundFont instrument
export async function loadSoundfontInstrument(
  instrumentName: string,
  audioContext: AudioContext
): Promise<SoundfontInstrument | null> {
  try {
    // Ensure audio context is running (required for audio playback in modern browsers)
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // Dynamic import of soundfont-player
    const soundfontModule = await import('soundfont-player');
    const Soundfont = soundfontModule.default || soundfontModule;
    
    // Load the instrument - Soundfont.instrument() returns a Player object
    const soundfont = await Soundfont.instrument(audioContext, instrumentName as any);
    
    if (!soundfont) {
      return null;
    }

    // Verify it's actually a Player object with start/play methods
    if (!soundfont || typeof soundfont !== 'object') {
      return null;
    }

    // Check if it has the required methods
    if (!soundfont.start && !soundfont.play) {
      return null;
    }

    return new SoundfontInstrument(audioContext, soundfont);
  } catch (error) {
    return null;
  }
}
