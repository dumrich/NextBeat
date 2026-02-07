/**
 * Google Magenta integration: generate drums and melody with MusicVAE,
 * then convert NoteSequence to our app's proposedEdits (add_track + add_clip).
 */

import { createRequire } from 'node:module';
import type { ProposedEdit } from '../types.js';

const require = createRequire(import.meta.url);

// Use pure-JS TensorFlow (no tfjs-node). tfjs-node native bindings often fail on Windows/Node 24.
// @magenta/music will use @tensorflow/tfjs CPU backend; inference may be slower but works everywhere.
const TICKS_PER_QUARTER = 480;
const TICKS_PER_BAR = 1920;
const STEPS_PER_QUARTER = 4;
const TICKS_PER_STEP = TICKS_PER_QUARTER / STEPS_PER_QUARTER; // 120

// 4-bar models for longer, higher-quality output (we concatenate chunks for 8+ bars)
const DRUMS_CHECKPOINT = 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/drums_4bar_med_lokl_q2';
const MELODY_CHECKPOINT = 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_4bar_small_q2';
const BARS_PER_CHUNK = 4;

type NoteSequence = {
  notes?: Array<{
    pitch?: number;
    velocity?: number;
    startTime?: number;
    endTime?: number;
    quantizedStartStep?: number;
    quantizedEndStep?: number;
    isDrum?: boolean;
  }>;
  totalQuantizedSteps?: number;
  quantizationInfo?: { stepsPerQuarter?: number };
  tempos?: Array<{ qpm?: number }>;
};

type OurNote = { pitch: number; startTick: number; durationTick: number; velocity: number; channel: number };

let drumsModel: unknown = null;
let melodyModel: unknown = null;

async function getDrumsModel() {
  if (drumsModel) return drumsModel;
  const musicVae = require('@magenta/music/node/music_vae');
  const MusicVAE = musicVae.MusicVAE;
  drumsModel = new MusicVAE(DRUMS_CHECKPOINT);
  await (drumsModel as { initialize: () => Promise<void> }).initialize();
  return drumsModel;
}

async function getMelodyModel() {
  if (melodyModel) return melodyModel;
  const musicVae = require('@magenta/music/node/music_vae');
  const MusicVAE = musicVae.MusicVAE;
  melodyModel = new MusicVAE(MELODY_CHECKPOINT);
  await (melodyModel as { initialize: () => Promise<void> }).initialize();
  return melodyModel;
}

function noteSequenceToOurNotes(seq: NoteSequence, startBarOffset: number = 0): OurNote[] {
  const stepsPerQuarter = seq.quantizationInfo?.stepsPerQuarter ?? STEPS_PER_QUARTER;
  const ticksPerStep = TICKS_PER_QUARTER / stepsPerQuarter;
  const baseTick = startBarOffset * 4 * 4 * ticksPerStep; // 4 beats * 4 steps per bar

  const notes: OurNote[] = [];
  for (const n of seq.notes ?? []) {
    const pitch = Math.min(127, Math.max(0, n.pitch ?? 60));
    const velocity = Math.min(127, Math.max(0, Math.round((n.velocity ?? 100) * 127)));
    let startTick: number;
    let durationTick: number;
    if (n.quantizedStartStep != null && n.quantizedEndStep != null) {
      startTick = baseTick + n.quantizedStartStep * ticksPerStep;
      durationTick = Math.max(1, (n.quantizedEndStep - n.quantizedStartStep) * ticksPerStep);
    } else if (typeof n.startTime === 'number' && typeof n.endTime === 'number') {
      const qpm = seq.tempos?.[0]?.qpm ?? 120;
      const ticksPerSec = (TICKS_PER_QUARTER * qpm) / 60;
      startTick = Math.round(baseTick + n.startTime * ticksPerSec);
      durationTick = Math.max(1, Math.round((n.endTime - n.startTime) * ticksPerSec));
    } else {
      continue;
    }
    notes.push({ pitch, startTick, durationTick, velocity, channel: 0 });
  }
  return notes.sort((a, b) => a.startTick - b.startTick);
}

/** Generate one chunk of drum notes (4 bars from model). */
async function sampleDrumsChunk(): Promise<OurNote[]> {
  const model = await getDrumsModel();
  const samples = await (model as { sample: (n: number) => Promise<NoteSequence[]> }).sample(1);
  const seq = samples[0];
  if (!seq?.notes?.length) return [];
  return noteSequenceToOurNotes(seq, 0);
}

/** Generate edits for drums; lengthBars can be 4, 8, 12, 16, etc. (we concatenate 4-bar chunks). */
async function generateDrumsEdits(lengthBars: number): Promise<ProposedEdit[]> {
  const numChunks = Math.max(1, Math.ceil(lengthBars / BARS_PER_CHUNK));
  const allNotes: OurNote[] = [];
  for (let i = 0; i < numChunks; i++) {
    const chunkNotes = await sampleDrumsChunk();
    const tickOffset = i * BARS_PER_CHUNK * TICKS_PER_BAR;
    for (const n of chunkNotes) {
      allNotes.push({
        ...n,
        startTick: n.startTick + tickOffset,
      });
    }
  }
  const actualBars = numChunks * BARS_PER_CHUNK;
  return [
    {
      type: 'addTrack',
      description: 'Add Drums track (Magenta)',
      data: { name: 'Drums', color: '#ef4444', type: 'drums' as const, instrument: 'drums' },
    },
    {
      type: 'addClip',
      description: `Add drum clip (Magenta, ${actualBars} bars)`,
      data: { trackName: 'Drums', startBar: 0, lengthBars: actualBars, notes: allNotes },
    },
  ];
}

/** Generate one chunk of melody notes (4 bars from model). */
async function sampleMelodyChunk(): Promise<OurNote[]> {
  const model = await getMelodyModel();
  const samples = await (model as { sample: (n: number) => Promise<NoteSequence[]> }).sample(1);
  const seq = samples[0];
  if (!seq?.notes?.length) return [];
  return noteSequenceToOurNotes(seq, 0);
}

/** Generate edits for melody; lengthBars can be 4, 8, 12, 16, etc. (we concatenate 4-bar chunks). */
async function generateMelodyEdits(lengthBars: number): Promise<ProposedEdit[]> {
  const numChunks = Math.max(1, Math.ceil(lengthBars / BARS_PER_CHUNK));
  const allNotes: OurNote[] = [];
  for (let i = 0; i < numChunks; i++) {
    const chunkNotes = await sampleMelodyChunk();
    const tickOffset = i * BARS_PER_CHUNK * TICKS_PER_BAR;
    for (const n of chunkNotes) {
      allNotes.push({
        ...n,
        startTick: n.startTick + tickOffset,
      });
    }
  }
  const actualBars = numChunks * BARS_PER_CHUNK;
  return [
    {
      type: 'addTrack',
      description: 'Add Piano track (Magenta)',
      data: { name: 'Piano', color: '#3b82f6', type: 'instrument' as const, instrument: 'piano' },
    },
    {
      type: 'addClip',
      description: `Add melody clip (Magenta, ${actualBars} bars)`,
      data: { trackName: 'Piano', startBar: 0, lengthBars: actualBars, notes: allNotes },
    },
  ];
}

/** Bass pattern: root notes on beats 1 and 3 for the full length. */
function makeBassEdits(lengthBars: number): ProposedEdit[] {
  const notes: OurNote[] = [];
  for (let bar = 0; bar < lengthBars; bar++) {
    const base = bar * TICKS_PER_BAR;
    notes.push({ pitch: 36, startTick: base + 0, durationTick: 480, velocity: 100, channel: 0 });
    notes.push({ pitch: 36, startTick: base + 960, durationTick: 480, velocity: 95, channel: 0 });
  }
  return [
    {
      type: 'addTrack',
      description: 'Add Bass track',
      data: { name: 'Bass', color: '#10b981', type: 'instrument' as const, instrument: 'bass' },
    },
    {
      type: 'addClip',
      description: `Add bass clip (${lengthBars} bars)`,
      data: { trackName: 'Bass', startBar: 0, lengthBars, notes },
    },
  ];
}

export type MagentaGenerateOption = 'full_beat' | 'drums_only' | 'melody_only';

/** Default and max bars when songLength not provided. */
const DEFAULT_LENGTH_BARS = 8;
const MAX_LENGTH_BARS = 32;

/** Run Magenta (and optional bass) and return proposedEdits in our schema. Uses songLength for longer output. */
export async function runMagenta(
  generate: MagentaGenerateOption,
  songLength?: number
): Promise<ProposedEdit[]> {
  const lengthBars = Math.min(
    MAX_LENGTH_BARS,
    Math.max(BARS_PER_CHUNK, Math.ceil(songLength ?? DEFAULT_LENGTH_BARS))
  );
  const edits: ProposedEdit[] = [];

  if (generate === 'full_beat' || generate === 'drums_only') {
    edits.push(...(await generateDrumsEdits(lengthBars)));
  }
  if (generate === 'full_beat') {
    edits.push(...makeBassEdits(lengthBars));
  }
  if (generate === 'full_beat' || generate === 'melody_only') {
    edits.push(...(await generateMelodyEdits(lengthBars)));
  }

  return edits;
}
