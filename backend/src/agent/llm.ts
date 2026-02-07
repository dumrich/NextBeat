import OpenAI from 'openai';
import type { ProjectContext, ProposedEdit } from '../types.js';
import { AGENT_TOOLS, toolCallToEdit } from './tools.js';

const TICKS_PER_BAR = 1920;
const TICKS_PER_QUARTER = 480;

/** Build a compact project context for the LLM to save tokens */
export function buildProjectContext(
  project: Record<string, unknown>,
  options?: { songLength?: number; section?: { startBar: number; lengthBars: number } }
): ProjectContext {
  const p = project as {
    title?: string;
    tempo?: number;
    timeSignature?: { numerator: number; denominator: number };
    tracks?: Array<{ id: string; name: string; type: string; instrument: string | null }>;
    arrangementClips?: Array<{ trackId: string; startBar: number; lengthBars: number; clipType: string }>;
  };
  const tracks = (p.tracks || []).map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    instrument: t.instrument ?? null,
  }));
  const clipSummary = (p.arrangementClips || []).map(
    (c) => `Track ${c.trackId}: ${c.clipType} clip at bar ${c.startBar}, length ${c.lengthBars} bars`
  );
  const context: ProjectContext = {
    title: p.title ?? 'Untitled',
    tempo: p.tempo ?? 120,
    timeSignature: p.timeSignature ?? { numerator: 4, denominator: 4 },
    tracks,
    clipSummary,
  };
  if (options?.songLength != null) context.songLength = options.songLength;
  if (options?.section) context.section = options.section;
  return context;
}

const SYSTEM_PROMPT = `You are an AI assistant for a DAW. You create and edit MIDI music by calling the tools provided. You MUST use the tools to make changes — do not just describe what you would do.

PREFER MAGENTA FOR BEAT GENERATION:
When the user asks for a "beat", "full beat", "create a beat", "complete track", "make a song", "add drums", or "add melody", you MUST call the use_magenta tool first:
- For a full beat (drums + bass + melody): use_magenta with generate "full_beat".
- For only drums: use_magenta with generate "drums_only".
- For only melody/piano: use_magenta with generate "melody_only".
Do NOT use add_track/add_pattern/add_clip for these requests — use use_magenta so the app can generate high-quality AI music with Google Magenta.

Only use add_track, add_pattern, and add_clip when the user asks for something very specific that is not "create a beat" or "add drums" or "add melody" (e.g. "add a track named Lead Synth" or "add a chord progression in Am").

If the user asks for something specific (e.g. "just add drums"), call use_magenta with generate "drums_only". If they ask for a full beat or something complete, call use_magenta with generate "full_beat".`;

export type LLMResult = { message: string; proposedEdits: unknown[] };

export type AgentOptions = {
  songLength?: number;
  section?: { startBar: number; lengthBars: number };
  maxTokens?: number;
};

export async function callAgentLLM(
  projectContext: ProjectContext,
  userMessage: string,
  apiKey: string,
  options: AgentOptions = {}
): Promise<LLMResult> {
  const openai = new OpenAI({ apiKey });
  const { maxTokens = 4096 } = options;

  let userContent = `Current project: ${JSON.stringify(projectContext)}

User request: ${userMessage}`;

  if (projectContext.section) {
    userContent += `\n\nGenerate ONLY for bars ${projectContext.section.startBar}–${projectContext.section.startBar + projectContext.section.lengthBars - 1}. Use startBar ${projectContext.section.startBar} for add_clip.`;
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    tools: AGENT_TOOLS,
    tool_choice: 'auto',
    temperature: 0.3,
    max_tokens: maxTokens,
  });

  const msg = response.choices[0]?.message;
  if (!msg) {
    throw new Error('Empty response from LLM');
  }

  const proposedEdits: unknown[] = [];
  let message = (msg.content && String(msg.content).trim()) || '';

  if (msg.tool_calls && msg.tool_calls.length > 0) {
    for (const tc of msg.tool_calls) {
      if (tc.type !== 'function' || !tc.function) continue;
      const name = tc.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = (JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>) ?? {};
      } catch {
        continue;
      }
      const edit = toolCallToEdit(name, args);
      if (edit) proposedEdits.push(edit);
    }
    if (proposedEdits.length > 0 && !message) {
      const parts = proposedEdits.map((e: unknown) => (e as { description?: string }).description).filter(Boolean);
      message = parts.length > 0 ? `I've added: ${parts.join('; ')}.` : 'Done.';
    }
  }

  return {
    message: message || 'No changes made. Try asking for a "full beat" or "add drums and bass".',
    proposedEdits,
  };
}

/** Validate and normalize proposedEdits so they match frontend expectations. */
export function validateAndNormalizeEdits(edits: unknown[], _ticksPerBar: number = TICKS_PER_BAR): ProposedEdit[] {
  const result: ProposedEdit[] = [];
  const MAX_NOTES_PER_CLIP = 2000;
  for (const e of edits) {
    if (!e || typeof e !== 'object' || !('type' in e) || !('description' in e) || !('data' in e)) continue;
    const edit = e as { type: string; description: string; data: Record<string, unknown> };
    if (edit.type === 'addTrack') {
      const d = edit.data as Record<string, unknown>;
      result.push({
        type: 'addTrack',
        description: String(edit.description),
        data: {
          name: String(d.name ?? 'New Track'),
          color: typeof d.color === 'string' ? d.color : undefined,
          type: d.type === 'drums' || d.type === 'automation' ? d.type : 'instrument',
          instrument: typeof d.instrument === 'string' ? d.instrument : null,
        },
      });
    } else if (edit.type === 'addClip') {
      const d = edit.data as Record<string, unknown>;
      let notes = Array.isArray(d.notes) ? d.notes : [];
      if (notes.length > MAX_NOTES_PER_CLIP) notes = notes.slice(0, MAX_NOTES_PER_CLIP);
      result.push({
        type: 'addClip',
        description: String(edit.description),
        data: {
          trackName: String(d.trackName ?? ''),
          startBar: Number(d.startBar) || 0,
          lengthBars: Math.max(1, Number(d.lengthBars) || 4),
          notes: notes.map((n: unknown) => {
            const note = (n as Record<string, unknown>) ?? {};
            return {
              pitch: Math.min(127, Math.max(0, Number(note.pitch) || 60)),
              startTick: Math.max(0, Number(note.startTick) || 0),
              durationTick: Math.max(1, Number(note.durationTick) || TICKS_PER_QUARTER),
              velocity: Math.min(127, Math.max(0, Number(note.velocity) || 100)),
              channel: Number(note.channel) || 0,
            };
          }),
        },
      });
    } else if (edit.type === 'addPattern') {
      const d = edit.data as Record<string, unknown>;
      const steps = Math.max(16, Math.min(256, Number(d.steps) || 16));
      const channels = Array.isArray(d.channels) ? d.channels : [];
      result.push({
        type: 'addPattern',
        description: String(edit.description),
        data: {
          name: String(d.name ?? 'Pattern'),
          steps,
          trackName: typeof d.trackName === 'string' ? d.trackName : undefined,
          channels: channels.map((c: unknown, idx: number) => {
            const ch = (c as Record<string, unknown>) ?? {};
            let stepArr = Array.isArray(ch.steps) ? ch.steps : [];
            if (stepArr.length !== steps) {
              stepArr =
                stepArr.length > steps
                  ? stepArr.slice(0, steps)
                  : [...stepArr, ...Array(steps - stepArr.length).fill(false)];
            }
            return {
              id: String(ch.id ?? `ch-${idx}`),
              name: String(ch.name ?? 'Channel'),
              steps: stepArr.map((s) => Boolean(s)),
              volume: Number(ch.volume) ?? 0.8,
              pan: Number(ch.pan) ?? 0,
              mute: Boolean(ch.mute),
              solo: Boolean(ch.solo),
            };
          }),
        },
      });
    }
  }
  return result;
}
