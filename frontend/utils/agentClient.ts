// Agent Client for AI-assisted MIDI production — calls backend LLM

import type { Project } from '@/types/project';

const AGENT_API_URL =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_AGENT_API_URL
    ? process.env.NEXT_PUBLIC_AGENT_API_URL
    : 'http://localhost:3001';

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

export type AgentSendOptions = {
  /** Total song length in bars; helps the agent generate for the full timeline. */
  songLength?: number;
  /** Generate only for this section (e.g. for chunked long songs). */
  startBar?: number;
  lengthBars?: number;
};

export const agentClient = {
  async sendMessage(
    projectSnapshot: Project,
    userMessage: string,
    options?: AgentSendOptions
  ): Promise<AgentResponse> {
    try {
      const body: Record<string, unknown> = {
        projectSnapshot,
        message: userMessage,
      };
      if (options?.songLength != null) body.songLength = options.songLength;
      if (options?.startBar != null && options?.lengthBars != null) {
        body.startBar = options.startBar;
        body.lengthBars = options.lengthBars;
      }
      const res = await fetch(`${AGENT_API_URL}/api/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(res.status === 500 ? errBody : `Agent API error: ${res.status}`);
      }

      const data = (await res.json()) as AgentResponse;
      return {
        message: data.message ?? 'Done.',
        proposedEdits: data.proposedEdits,
        suggestions: data.suggestions,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      return {
        message: `Could not reach the agent. ${message} Make sure the backend is running (npm run dev in backend/) and OPENAI_API_KEY is set in backend/.env`,
        proposedEdits: [],
      };
    }
  },

  async getAutocomplete(projectSnapshot: Project, cursorContext: any): Promise<Suggestion[]> {
    // Still mock for now; can be wired to POST /api/autocomplete later
    return [
      { type: 'chord', text: 'Next chord: Dm9', data: { pitches: [50, 53, 57, 60, 64] } },
      { type: 'pattern', text: 'Hat pattern: swing 56%', data: { swing: 0.56 } },
      { type: 'note', text: 'Suggested note: E4', data: { pitch: 64 } },
    ];
  },
};
