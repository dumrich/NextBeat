// Agent Client for AI-assisted MIDI production
// Connects to the FastAPI backend for music generation via Claude + Magenta

import type { Project, MidiNote } from '@/types/project';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export type AgentResponse = {
  message: string;
  proposedEdits?: ProposedEdit[];
  suggestions?: Suggestion[];
};

export type ProposedEdit = {
  type: 'addClip' | 'addPattern' | 'modifyClip' | 'addTrack';
  description: string;
  data: any;
};

export type Suggestion = {
  type: 'chord' | 'pattern' | 'note';
  text: string;
  data: any;
};

// Response from the /generate endpoint
type GenerateResponse = {
  midi_base64: string;
  filename: string;
  total_notes: number;
  duration_seconds: number;
  primer_notes: number;
  generated_notes: number;
  instrument: string;
  style: string;
  tempo: number;
  bars: number;
};

/**
 * Parse the user's message to extract generation parameters.
 * Detects instrument type and style from natural language.
 */
function parseGenerationParams(message: string, project: Project) {
  const lower = message.toLowerCase();

  // Detect instrument
  let instrument = 'piano';
  if (/\b(drum|drums|groove|beat|percussion|kick|snare|hihat)\b/.test(lower)) {
    instrument = 'drums';
  } else if (/\b(piano|keys|keyboard|chord|melody|solo)\b/.test(lower)) {
    instrument = 'piano';
  }

  // Detect bar count from message (e.g., "4 bars", "8 bar")
  const barMatch = lower.match(/(\d+)\s*bars?/);
  const bars = barMatch ? Math.min(64, Math.max(1, parseInt(barMatch[1]))) : 8;

  return {
    prompt: message,
    instrument,
    bars,
    tempo: project.tempo,
    primer_bars: 2,
    temperature: 0.9,
  };
}

/**
 * Convert base64 MIDI data into MidiNote[] in the frontend's tick format.
 *
 * The backend returns MIDI as base64. We decode it and parse note events
 * to create notes compatible with the project store.
 *
 * Tick conversion: 480 ticks per quarter note (matching project's ticks_per_quarter).
 */
function midiBase64ToNotes(
  base64Data: string,
  tempo: number,
  instrument: string,
): MidiNote[] {
  // Decode the base64 MIDI and parse note-on events
  // The @tonejs/midi library on the frontend can parse this,
  // but for the agent response we create notes from the metadata.
  // This is a simplified conversion — the frontend's MIDI import
  // can handle the full file if needed.
  const notes: MidiNote[] = [];
  const ticksPerBeat = 480;

  try {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Use @tonejs/midi to parse if available
    // This import works because @tonejs/midi is in the frontend deps
    const { Midi } = require('@tonejs/midi');
    const midi = new Midi(bytes.buffer);

    for (const track of midi.tracks) {
      for (const note of track.notes) {
        // Convert seconds back to ticks
        const startTick = Math.round((note.time / 60) * tempo * ticksPerBeat);
        const durationTick = Math.max(
          Math.round((note.duration / 60) * tempo * ticksPerBeat),
          ticksPerBeat / 4, // Minimum 16th note
        );

        notes.push({
          pitch: note.midi,
          startTick,
          durationTick,
          velocity: Math.round(note.velocity * 127),
          channel: instrument === 'drums' ? 9 : 0,
        });
      }
    }
  } catch (e) {
    console.warn('MIDI parsing fallback — returning empty notes', e);
  }

  return notes;
}

export const agentClient = {
  /**
   * Send a message to the AI agent. Detects whether this is a generation
   * request and routes to the backend /generate endpoint, or falls back
   * to contextual responses.
   */
  async sendMessage(projectSnapshot: Project, userMessage: string): Promise<AgentResponse> {
    const lower = userMessage.toLowerCase();

    // Keywords that indicate a generation request
    const generationKeywords = [
      'generate', 'create', 'make', 'add', 'play', 'write',
      'drum', 'drums', 'beat', 'groove', 'bass', 'bassline',
      'piano', 'melody', 'chord', 'progression', 'solo',
      'jazz', 'rock', 'funk', 'blues', 'pop', 'latin',
      'reggae', 'hip-hop', 'classical', 'metal',
    ];

    const isGenerationRequest = generationKeywords.some(kw => lower.includes(kw));

    if (isGenerationRequest) {
      return this._handleGeneration(projectSnapshot, userMessage);
    }

    // Non-generation messages get contextual responses
    if (lower.includes('help') || lower.includes('what can')) {
      return {
        message:
          "I can generate music in any style! Try prompts like:\n" +
          "- \"Create a funky drum groove\"\n" +
          "- \"Write a jazz piano melody\"\n" +
          "- \"Generate 4 bars of rock drums\"\n" +
          "- \"Make a blues piano progression\"\n\n" +
          "I'll create a styled primer with Claude AI, then extend it with Magenta for natural musical variation.",
      };
    }

    return {
      message:
        "I can help you generate music! Describe a style and instrument " +
        "(e.g., \"funky drum groove\" or \"jazz piano melody\") and I'll create it for you.",
    };
  },

  /**
   * Handle a music generation request by calling the backend.
   */
  async _handleGeneration(project: Project, message: string): Promise<AgentResponse> {
    const params = parseGenerationParams(message, project);

    try {
      // Call the backend /generate endpoint
      const response = await fetch(`${API_BASE}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(error.detail || `Server error: ${response.status}`);
      }

      const data: GenerateResponse = await response.json();

      // Convert MIDI data to frontend note format
      const notes = midiBase64ToNotes(data.midi_base64, data.tempo, data.instrument);

      // Build proposed edits for the user to approve
      const edits: ProposedEdit[] = [];

      // If the instrument doesn't have a track yet, propose adding one
      const trackName = data.instrument === 'drums' ? 'Drums' : 'Piano';
      const trackType = data.instrument === 'drums' ? 'drums' : 'instrument';
      const existingTrack = project.tracks.find(
        t => t.name.toLowerCase() === trackName.toLowerCase() ||
             t.type === trackType,
      );

      if (!existingTrack) {
        edits.push({
          type: 'addTrack',
          description: `Create ${trackName} track`,
          data: {
            name: trackName,
            color: data.instrument === 'drums' ? '#ef4444' : '#3b82f6',
            type: trackType,
          },
        });
      }

      // Propose adding the generated clip
      edits.push({
        type: 'addClip',
        description:
          `Add ${data.bars}-bar ${data.style} ${data.instrument} clip ` +
          `(${data.total_notes} notes, ${data.primer_notes} from AI primer + ${data.generated_notes} from Magenta)`,
        data: {
          trackName,
          startBar: 0,
          lengthBars: data.bars,
          notes,
          // Store raw MIDI for potential re-import
          _midi_base64: data.midi_base64,
          _filename: data.filename,
        },
      });

      return {
        message:
          `Generated ${data.bars} bars of "${data.style}" for ${data.instrument}!\n\n` +
          `${data.primer_notes} notes from Claude AI primer, ` +
          `${data.generated_notes} notes from Magenta continuation.\n` +
          `Duration: ${data.duration_seconds}s at ${data.tempo} BPM.`,
        proposedEdits: edits,
      };

    } catch (error: any) {
      // Check if backend is reachable
      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        return {
          message:
            "Can't reach the backend server. Make sure it's running:\n\n" +
            "```\ncd api && python main.py\n```\n\n" +
            "The server needs to be running on " + API_BASE,
        };
      }

      return {
        message: `Generation failed: ${error.message}\n\nCheck the backend logs for details.`,
      };
    }
  },

  async getAutocomplete(projectSnapshot: Project, cursorContext: any): Promise<Suggestion[]> {
    // Autocomplete could be enhanced with backend calls in the future
    return [
      { type: 'chord', text: 'Next chord: Dm9', data: { pitches: [50, 53, 57, 60, 64] } },
      { type: 'pattern', text: 'Hat pattern: swing 56%', data: { swing: 0.56 } },
      { type: 'note', text: 'Suggested note: E4', data: { pitch: 64 } },
    ];
  },
};
