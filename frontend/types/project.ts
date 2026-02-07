// Project Model Types

export type TimeSignature = {
  numerator: number;
  denominator: number;
};

export type MidiNote = {
  pitch: number; // MIDI note number (0-127)
  startTick: number;
  durationTick: number;
  velocity: number;
  channel: number;
};

export type MidiClip = {
  id: string;
  trackId: string;
  startBar: number;
  lengthBars: number;
  notes: MidiNote[];
};

export type Pattern = {
  id: string;
  name: string;
  steps: number;
  channels: PatternChannel[];
};

export type PatternChannel = {
  id: string;
  name: string;
  steps: boolean[]; // Step sequencer data
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
};

export type Track = {
  id: string;
  name: string;
  color: string;
  type: 'instrument' | 'drums' | 'automation';
  channelRackIds: string[];
  instrument: string | null;
  mixerChannelId: string | null;
  mute: boolean;
  solo: boolean;
  arm: boolean;
  volume: number;
  pan: number;
};

export type ArrangementClip = {
  id: string;
  trackId: string;
  startBar: number;
  lengthBars: number;
  clipType: 'midi' | 'pattern';
  clipDataId: string; // References MidiClip.id or Pattern.id
};

export type AutomationLane = {
  id: string;
  trackId: string;
  parameter: string;
  points: AutomationPoint[];
};

export type AutomationPoint = {
  tick: number;
  value: number;
};

export type MixerChannel = {
  id: string;
  trackId: string | null;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  inserts: string[];
  sends: { [key: string]: number };
};

export type Project = {
  id: string;
  title: string;
  tempo: number;
  timeSignature: TimeSignature;
  tracks: Track[];
  patterns: Pattern[];
  midiClips: MidiClip[];
  arrangementClips: ArrangementClip[];
  automationLanes: AutomationLane[];
  mixer: {
    channels: MixerChannel[];
  };
};

  export type ViewMode = 'playlist' | 'pianoRoll';

export type Tool = 'select' | 'draw' | 'erase' | 'slice';

export type Selection = {
  clips: string[];
  notes: string[];
  track: string | null;
};
