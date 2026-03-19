import 'dotenv/config';
import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';

import connectDB from './db/connect';
import userRoutes from './routes/user';
import walletRoutes from './routes/wallet';
import { createSuper } from './controlers/auth';

const app = express();
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET || 'default-cookie-secret'));

const port = Number(process.env.PORT ?? 3000);

app.get('/', (req: Request, res: Response) => {
  res.send('fintech api');
});

app.use('/api/v1/users', userRoutes);
app.use('/api/v1/wallets', walletRoutes);
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

export const start = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('Missing MONGO_URI in environment');
    process.exit(1);
  }

  try {
    await connectDB(mongoUri);
    await createSuper();

    app.listen(port, () => {
      console.log(`Server is listening on port ${port}...`);
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

// Only start the server when not running unit tests (allows importing app in tests)
if (process.env.NODE_ENV !== 'test') {
  start();
}

export default app;

