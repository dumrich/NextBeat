import { Router, type Request, type Response } from 'express';
import { buildProjectContext, callAgentLLM, validateAndNormalizeEdits } from '../agent/llm.js';
import { runMagenta, type MagentaGenerateOption } from '../agent/magenta.js';
import type { AgentResponse } from '../types.js';

const router = Router();

router.post('/api/agent', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      projectSnapshot?: Record<string, unknown>;
      message?: string;
      songLength?: number;
      startBar?: number;
      lengthBars?: number;
    };
    const { projectSnapshot, message, songLength, startBar, lengthBars } = body;

    if (!projectSnapshot || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({
        message: 'Missing projectSnapshot or message',
        proposedEdits: [],
      } as AgentResponse);
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        message: 'Agent is not configured: OPENAI_API_KEY is missing. Add it to backend/.env',
        proposedEdits: [],
      } as AgentResponse);
      return;
    }

    const section =
      typeof startBar === 'number' && typeof lengthBars === 'number' && lengthBars > 0
        ? { startBar, lengthBars }
        : undefined;
    const context = buildProjectContext(projectSnapshot, { songLength, section });
    const result = await callAgentLLM(context, message.trim(), apiKey, {
      songLength,
      section,
      maxTokens: 8192,
    });

    // Expand use_magenta into real edits (Magenta-generated tracks + clips)
    const expanded: unknown[] = [];
    for (const e of result.proposedEdits) {
      const edit = e as { type: string; description?: string; data?: { generate?: string } };
      if (edit.type === 'use_magenta' && edit.data?.generate) {
        try {
          const magentaEdits = await runMagenta(
            edit.data.generate as MagentaGenerateOption,
            songLength
          );
          expanded.push(...magentaEdits);
        } catch (magentaErr) {
          console.error('Magenta generation failed:', magentaErr);
          expanded.push({
            type: 'addTrack',
            description: 'Magenta failed; add a placeholder track',
            data: { name: 'Piano', instrument: 'piano' },
          });
        }
      } else {
        expanded.push(e);
      }
    }
    const proposedEdits = validateAndNormalizeEdits(expanded);

    const response: AgentResponse = {
      message: result.message,
      proposedEdits: proposedEdits.length > 0 ? proposedEdits : undefined,
    };
    res.json(response);
  } catch (err) {
    console.error('Agent error:', err);
    const message = err instanceof Error ? err.message : 'Agent request failed';
    res.status(500).json({
      message: `Error: ${message}`,
      proposedEdits: [],
    } as AgentResponse);
  }
});

export default router;
