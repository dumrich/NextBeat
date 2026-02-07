# NextBeat

AI-assisted MIDI DAW (digital audio workstation).

## Run the app

**Backend (LLM agent)** — from repo root:
```bash
cd backend && npm install && cp .env.example .env
```
Add your `OPENAI_API_KEY` to `backend/.env`, then:
```bash
npm run dev
```
Runs at http://localhost:3001.

**Frontend** — from repo root:
```bash
cd frontend && npm install && npm run dev
```
Runs at http://localhost:3000. The Agent panel will call the backend at `http://localhost:3001` by default (override with `NEXT_PUBLIC_AGENT_API_URL` in `frontend/.env.local`).

## Project layout

- **frontend/** — Next.js DAW UI (playlist, piano roll, step sequencer, agent panel).
- **backend/** — Express server with POST `/api/agent` that uses OpenAI to generate edits (add track, add clip, add pattern).
- **docs/** — AI pipeline notes and proposals.
