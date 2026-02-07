# NextBeat Backend

Express server that runs the AI agent for the NextBeat DAW. **Beat generation uses Google Magenta** (MusicVAE) for drums and melody; the LLM is used only to interpret the user’s request and to call the `use_magenta` tool. The backend converts Magenta’s output into the same proposedEdits (add_track, add_clip) that the frontend applies.

## Setup

1. Install dependencies:
   ```bash
   cd backend && npm install
   ```

2. Copy `.env.example` to `.env` and add your OpenAI API key:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set `OPENAI_API_KEY=sk-...` (get one at https://platform.openai.com/api-keys).

3. Run the server:
   ```bash
   npm run dev
   ```
   By default it runs at http://localhost:3001.

## API

- **POST /api/agent**  
  Body: `{ projectSnapshot: Project, message: string, songLength?: number }`  
  Returns: `{ message: string, proposedEdits?: ProposedEdit[] }`  
  The LLM interprets the message and typically calls **use_magenta** (e.g. full_beat, drums_only, melody_only). The backend runs **Google Magenta** (MusicVAE) to generate drums and/or melody, then converts the result to proposedEdits (add_track, add_clip) that the frontend applies. Optional: add_track, add_pattern, add_clip from the LLM for non-Magenta edits.

- **GET /health**  
  Returns `{ status: "ok" }`.

## Environment

| Variable         | Description                          |
|------------------|--------------------------------------|
| `OPENAI_API_KEY` | Required. OpenAI API key.            |
| `PORT`           | Optional. Server port (default 3001). |
