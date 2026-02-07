// MIDI Humanization Utilities
// Adds natural variation to MIDI notes for less robotic playback

import type { MidiNote } from '@/types/project';

/**
 * Humanize velocity values for a more natural sound
 * Adds subtle variation and phrase shaping
 */
export function humanizeVelocity(notes: MidiNote[], options: {
  baseVariation?: number;      // Random variation amount (default: 8)
  phraseLength?: number;        // Notes per phrase for dynamics curve (default: 8)
  phraseDynamics?: number;      // Amount of phrase shaping (default: 15)
  minVelocity?: number;         // Minimum velocity (default: 70)
  maxVelocity?: number;         // Maximum velocity (default: 115)
} = {}): MidiNote[] {
  const {
    baseVariation = 8,
    phraseLength = 8,
    phraseDynamics = 15,
    minVelocity = 70,
    maxVelocity = 115,
  } = options;

  return notes.map((note, i) => {
    // Add phrase shaping (crescendo/diminuendo in arcs)
    const phrasePosition = (i % phraseLength) / phraseLength;
    const phraseCurve = Math.sin(phrasePosition * Math.PI); // Arc shape (0 -> 1 -> 0)
    
    // Base velocity + phrase dynamics + random variation
    const baseVelocity = note.velocity || 95;
    const newVelocity = 
      baseVelocity +
      (phraseCurve * phraseDynamics) +      // Phrase shaping
      (Math.random() * baseVariation * 2 - baseVariation); // Random variation
    
    return {
      ...note,
      velocity: Math.round(Math.max(minVelocity, Math.min(maxVelocity, newVelocity)))
    };
  });
}

/**
 * Humanize note timing for less mechanical feel
 * Adds subtle timing variations (swing/jitter)
 */
export function humanizeTiming(notes: MidiNote[], options: {
  jitterAmount?: number;        // Random timing offset in ticks (default: 8)
  swingAmount?: number;         // Swing feel adjustment 0-1 (default: 0)
} = {}): MidiNote[] {
  const {
    jitterAmount = 8,
    swingAmount = 0,
  } = options;

  return notes.map((note, i) => {
    let timingOffset = 0;
    
    // Add random jitter
    if (jitterAmount > 0) {
      timingOffset += Math.random() * jitterAmount * 2 - jitterAmount;
    }
    
    // Add swing (delay every other note slightly)
    if (swingAmount > 0 && i % 2 === 1) {
      timingOffset += swingAmount * 40; // Swing offset proportional to amount
    }
    
    return {
      ...note,
      startTick: Math.max(0, note.startTick + timingOffset)
    };
  });
}

/**
 * Full humanization: velocity + timing
 * Applies both velocity and timing humanization in one pass
 */
export function humanizeNotes(notes: MidiNote[], options: {
  velocityOptions?: Parameters<typeof humanizeVelocity>[1];
  timingOptions?: Parameters<typeof humanizeTiming>[1];
} = {}): MidiNote[] {
  let humanized = notes;
  
  // Apply velocity humanization first
  if (options.velocityOptions !== null) {
    humanized = humanizeVelocity(humanized, options.velocityOptions);
  }
  
  // Apply timing humanization
  if (options.timingOptions !== null) {
    humanized = humanizeTiming(humanized, options.timingOptions);
  }
  
  return humanized;
}

/**
 * Add accent pattern to notes
 * Emphasizes certain beats (e.g., downbeats)
 */
export function addAccents(notes: MidiNote[], options: {
  accentEvery?: number;         // Accent every N notes (default: 4 for downbeats)
  accentAmount?: number;        // Velocity boost for accents (default: 20)
} = {}): MidiNote[] {
  const {
    accentEvery = 4,
    accentAmount = 20,
  } = options;

  return notes.map((note, i) => {
    const isAccent = i % accentEvery === 0;
    return {
      ...note,
      velocity: isAccent 
        ? Math.min(127, (note.velocity || 100) + accentAmount)
        : note.velocity
    };
  });
}

/**
 * Gradually increase or decrease velocity (crescendo/diminuendo)
 */
export function addDynamicCurve(notes: MidiNote[], options: {
  startVelocity?: number;       // Starting velocity (default: current velocity)
  endVelocity?: number;         // Ending velocity (default: current velocity)
  curve?: 'linear' | 'exponential' | 'logarithmic'; // Curve type (default: 'linear')
} = {}): MidiNote[] {
  const { curve = 'linear' } = options;
  
  if (notes.length === 0) return notes;
  
  const startVel = options.startVelocity ?? notes[0].velocity ?? 100;
  const endVel = options.endVelocity ?? notes[notes.length - 1].velocity ?? 100;
  const range = endVel - startVel;
  
  return notes.map((note, i) => {
    const progress = i / (notes.length - 1 || 1);
    let curveMultiplier = progress;
    
    switch (curve) {
      case 'exponential':
        curveMultiplier = Math.pow(progress, 2);
        break;
      case 'logarithmic':
        curveMultiplier = Math.sqrt(progress);
        break;
      default: // linear
        curveMultiplier = progress;
    }
    
    const newVelocity = startVel + (range * curveMultiplier);
    
    return {
      ...note,
      velocity: Math.round(Math.max(1, Math.min(127, newVelocity)))
    };
  });
}
