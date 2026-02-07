import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import agentRoutes from './routes/agent.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));
app.use(agentRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`NextBeat backend running at http://localhost:${PORT}`);
});
