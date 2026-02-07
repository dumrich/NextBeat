// Mock Agent Client for AI-assisted MIDI production

import type { Project } from '@/types/project';

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

export const agentClient = {
  async sendMessage(projectSnapshot: Project, userMessage: string): Promise<AgentResponse> {
    // Mock delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    const lowerMessage = userMessage.toLowerCase();
    
    // Mock responses based on keywords
    if (lowerMessage.includes('drum') || lowerMessage.includes('groove')) {
      return {
        message: "I can add a chill drum groove to your project. Here's what I'll create:",
        proposedEdits: [
          {
            type: 'addPattern',
            description: 'Add drum pattern with kick, snare, and hi-hat',
            data: {
              name: 'Chill Groove',
              steps: 16,
              channels: [
                {
                  id: 'kick',
                  name: 'Kick',
                  steps: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
                  volume: 0.9,
                  pan: 0,
                  mute: false,
                  solo: false,
                },
                {
                  id: 'snare',
                  name: 'Snare',
                  steps: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
                  volume: 0.8,
                  pan: 0,
                  mute: false,
                  solo: false,
                },
                {
                  id: 'hat',
                  name: 'Hi-Hat',
                  steps: [false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true],
                  volume: 0.6,
                  pan: 0,
                  mute: false,
                  solo: false,
                },
              ],
            },
          },
        ],
      };
    }
    
    if (lowerMessage.includes('bass') || lowerMessage.includes('bassline')) {
      return {
        message: "I'll create a simple bassline that complements your track.",
        proposedEdits: [
          {
            type: 'addTrack',
            description: 'Create Bass track',
            data: {
              name: 'Bass',
              color: '#10b981',
              type: 'instrument',
            },
          },
          {
            type: 'addClip',
            description: 'Add bassline MIDI clip',
            data: {
              trackName: 'Bass',
              startBar: 0,
              lengthBars: 4,
              notes: [
                { pitch: 36, startTick: 0, durationTick: 480, velocity: 100, channel: 0 },
                { pitch: 36, startTick: 960, durationTick: 480, velocity: 100, channel: 0 },
                { pitch: 38, startTick: 1920, durationTick: 480, velocity: 100, channel: 0 },
                { pitch: 36, startTick: 2880, durationTick: 480, velocity: 100, channel: 0 },
              ],
            },
          },
        ],
      };
    }
    
    if (lowerMessage.includes('chord') || lowerMessage.includes('progression')) {
      return {
        message: "I can add a chord progression. Here are some suggestions:",
        suggestions: [
          { type: 'chord', text: 'C major', data: { pitches: [60, 64, 67] } },
          { type: 'chord', text: 'Am', data: { pitches: [57, 60, 64] } },
          { type: 'chord', text: 'F major', data: { pitches: [53, 57, 60] } },
          { type: 'chord', text: 'G major', data: { pitches: [55, 59, 62] } },
        ],
      };
    }
    
    // Default response
    return {
      message: "I understand you want help with your project. I can help you add drums, basslines, chords, or other musical elements. What would you like to add?",
    };
  },
  
  async getAutocomplete(projectSnapshot: Project, cursorContext: any): Promise<Suggestion[]> {
    // Mock autocomplete suggestions
    return [
      { type: 'chord', text: 'Next chord: Dm9', data: { pitches: [50, 53, 57, 60, 64] } },
      { type: 'pattern', text: 'Hat pattern: swing 56%', data: { swing: 0.56 } },
      { type: 'note', text: 'Suggested note: E4', data: { pitch: 64 } },
    ];
  },
};
