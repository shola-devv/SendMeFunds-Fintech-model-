import 'dotenv/config';
import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';

import connectDB from './db/connect';
import userRoutes from './routes/user';
import walletRoutes from './routes/wallet';
import { createSuper } from './controlers/auth';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

const app = express();



app.use(helmet());
 
// ─── 2. CORS — restrict allowed origins ───────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
 
 app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no origin) or whitelisted origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' is not allowed`));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // needed because you use signed cookies
  })
);




 
// ─── 3. Body / cookie parsing ──────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET || 'default-cookie-secret'));
 
// ─── 4. Rate limiting ─────────────────────────────────────────────────────────
 
// Global limiter — all routes
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use(globalLimiter);
 
// Stricter limiter for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});
 



app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET || 'default-cookie-secret'));

const port = Number(process.env.PORT ?? 3000);




app.get('/', (req: Request, res: Response) => {
  res.send('fintech api');
});
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Apply strict rate limit to auth-related user routes
app.use('/api/v1/users', authLimiter, userRoutes);
app.use('/api/v1/wallets', walletRoutes);
 
// ─── Global Error Handler ──────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // Surface CORS errors clearly; hide internals for everything else
  if (err.message.startsWith('CORS:')) {
    return res.status(403).json({ error: err.message });
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error.' });
});




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

