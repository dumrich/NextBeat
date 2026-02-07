import type { ChatCompletionTool } from 'openai/resources/chat/completions';

/**
 * Tool definitions for the agentic LLM. The model calls these tools;
 * we convert tool_calls into ProposedEdit[] for the frontend.
 */

const TICKS_DESC = `Time is in TICKS: 1920 per bar, 480 per quarter. Bar N starts at tick N*1920. One eighth = 240 ticks, sixteenth = 120.`;

export const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'use_magenta',
      description: `Use Google Magenta AI to generate high-quality drums and/or melody. Call this for "create a beat", "full beat", "add drums", "add melody", or when the user wants AI-generated music. Do NOT use add_track/add_pattern/add_clip for full beats — use use_magenta instead.`,
      parameters: {
        type: 'object',
        properties: {
          generate: {
            type: 'string',
            enum: ['full_beat', 'drums_only', 'melody_only'],
            description: 'full_beat = drums + bass + melody; drums_only = just drums; melody_only = just melody/piano',
          },
        },
        required: ['generate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_track',
      description: `Create a new track. For a complete beat you need at least: (1) a Drums track, (2) a Bass track, (3) a Piano or Synth track. Call this once per instrument.`,
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Track name, e.g. "Drums", "Bass", "Piano"' },
          color: { type: 'string', description: 'Hex color e.g. "#3b82f6"' },
          type: {
            type: 'string',
            enum: ['instrument', 'drums', 'automation'],
            description: 'Use "drums" for drum track, "instrument" for bass/piano/synth',
          },
          instrument: {
            type: 'string',
            enum: ['piano', 'synth', 'bass', 'guitar', 'strings', 'brass', 'drums', 'percussion'],
            description: 'Required so the track makes sound. Use drums for drums, bass for bass, piano or synth for chords/melody.',
          },
        },
        required: ['name', 'instrument'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_pattern',
      description: `Add a step-sequencer pattern (best for drums). Steps: 16 = 4 bars, 32 = 8 bars. Each channel has a "steps" array of booleans (length = steps). Kick on 0,4,8,12; Snare on 4,12; Hi-hat on 2,6,10,14 or 1,3,5,7,9,11,13,15. Include a short fill in the last bar.`,
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Pattern name e.g. "Main Groove"' },
          trackName: { type: 'string', description: 'Name of track to place pattern on. Use "Drums" for drum patterns.' },
          steps: { type: 'number', description: '16 for 4 bars, 32 for 8 bars' },
          channels: {
            type: 'array',
            description: 'One object per drum channel (Kick, Snare, Hi-Hat)',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'e.g. "kick", "snare", "hat"' },
                name: { type: 'string', description: 'e.g. "Kick", "Snare", "Hi-Hat"' },
                steps: {
                  type: 'array',
                  items: { type: 'boolean' },
                  description: 'Length must equal "steps". true = hit on that step.',
                },
                volume: { type: 'number', description: '0-1' },
                pan: { type: 'number', description: '0' },
                mute: { type: 'boolean' },
                solo: { type: 'boolean' },
              },
              required: ['id', 'name', 'steps'],
            },
          },
        },
        required: ['name', 'steps', 'channels'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_clip',
      description: `Add a MIDI clip (notes) to an existing track. Use trackName that matches a track you added (e.g. "Bass", "Piano"). Keep clips short (2-4 bars) with simple patterns so timing stays correct. ${TICKS_DESC}`,
      parameters: {
        type: 'object',
        properties: {
          trackName: { type: 'string', description: 'Exact name of the track (e.g. "Bass", "Piano")' },
          startBar: { type: 'number', description: 'Usually 0' },
          lengthBars: { type: 'number', description: '2, 4, or 8' },
          notes: {
            type: 'array',
            description: 'MIDI notes. startTick: bar*1920 + beat offset (0, 480, 960, 1440 per bar). durationTick: 480=quarter, 240=eighth. pitch: bass 36-48, melody 48-84. velocity 80-110.',
            items: {
              type: 'object',
              properties: {
                pitch: { type: 'number' },
                startTick: { type: 'number' },
                durationTick: { type: 'number' },
                velocity: { type: 'number' },
                channel: { type: 'number' },
              },
              required: ['pitch', 'startTick', 'durationTick', 'velocity', 'channel'],
            },
          },
        },
        required: ['trackName', 'startBar', 'lengthBars', 'notes'],
      },
    },
  },
];

/** Map tool call name + arguments to ProposedEdit shape (or use_magenta placeholder for route to expand). */
export function toolCallToEdit(
  name: string,
  args: Record<string, unknown>
): { type: string; description: string; data: Record<string, unknown> } | null {
  if (name === 'use_magenta') {
    const gen = args.generate === 'drums_only' || args.generate === 'melody_only' ? args.generate : 'full_beat';
    return {
      type: 'use_magenta',
      description: `Generate with Magenta: ${gen}`,
      data: { generate: gen },
    };
  }
  if (name === 'add_track') {
    return {
      type: 'addTrack',
      description: `Add track: ${args.name ?? 'Untitled'}`,
      data: {
        name: String(args.name ?? 'New Track'),
        color: typeof args.color === 'string' ? args.color : undefined,
        type: args.type === 'drums' || args.type === 'automation' ? args.type : 'instrument',
        instrument: typeof args.instrument === 'string' ? args.instrument : null,
      },
    };
  }
  if (name === 'add_pattern') {
    return {
      type: 'addPattern',
      description: `Add pattern: ${args.name ?? 'Pattern'}`,
      data: {
        name: String(args.name ?? 'Pattern'),
        steps: Number(args.steps) || 16,
        channels: Array.isArray(args.channels) ? args.channels : [],
        trackName: typeof args.trackName === 'string' ? args.trackName : undefined,
      },
    };
  }
  if (name === 'add_clip') {
    return {
      type: 'addClip',
      description: `Add clip to ${args.trackName ?? 'track'}: ${Number(args.lengthBars) || 4} bars`,
      data: {
        trackName: String(args.trackName ?? ''),
        startBar: Number(args.startBar) ?? 0,
        lengthBars: Math.max(1, Number(args.lengthBars) || 4),
        notes: Array.isArray(args.notes) ? args.notes : [],
      },
    };
  }
  return null;
}
