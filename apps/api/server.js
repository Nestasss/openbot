import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true, service: 'messenger-api' }));

app.listen(process.env.PORT || 3000, () => {
  console.log('API listening on', process.env.PORT || 3000);
});
