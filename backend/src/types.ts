// Mirrors frontend types for agent API (no need to import from frontend)

export type ProposedEdit =
  | { type: 'addTrack'; description: string; data: AddTrackData }
  | { type: 'addClip'; description: string; data: AddClipData }
  | { type: 'addPattern'; description: string; data: AddPatternData };

export type AddTrackData = {
  name: string;
  color?: string;
  type?: 'instrument' | 'drums' | 'automation';
  instrument?: string | null;
};

export type AddClipData = {
  trackName: string;
  startBar: number;
  lengthBars: number;
  notes: MidiNoteData[];
};

export type MidiNoteData = {
  pitch: number;
  startTick: number;
  durationTick: number;
  velocity: number;
  channel: number;
};

export type AddPatternData = {
  name: string;
  steps: number;
  channels: PatternChannelData[];
  /** Track to place the pattern on (e.g. "Drums"). If omitted, frontend uses first track. */
  trackName?: string;
};

export type PatternChannelData = {
  id: string;
  name: string;
  steps: boolean[];
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
};

export type AgentResponse = {
  message: string;
  proposedEdits?: ProposedEdit[];
  suggestions?: Suggestion[];
};

export type Suggestion = {
  type: 'chord' | 'pattern' | 'note';
  text: string;
  data: Record<string, unknown>;
};

// Minimal project context we send to the LLM (reduces tokens)
export type ProjectContext = {
  title: string;
  tempo: number;
  timeSignature: { numerator: number; denominator: number };
  tracks: { id: string; name: string; type: string; instrument: string | null }[];
  clipSummary?: string[];
  /** Total song length in bars (timeline length). */
  songLength?: number;
  /** When set, generate only for this bar range (for chunked long songs). */
  section?: { startBar: number; lengthBars: number };
};
