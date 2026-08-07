import { Router } from 'express';
import { z } from 'zod';
import { authService } from '../services/authService.js';
import { rateLimitMiddleware } from '../lib/rateLimiter.js';
import { SlidingWindowRateLimiter } from '../lib/rateLimiter.js';

const router = Router();

// Tighter limiter specifically on auth endpoints to blunt credential stuffing.
const authLimiter = new SlidingWindowRateLimiter({ windowMs: 60_000, max: 10 });

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

router.post('/register', rateLimitMiddleware(authLimiter), async (req, res, next) => {
  try {
    const { email, password } = credentialsSchema.parse(req.body);
    const result = await authService.register({ email, password });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/login', rateLimitMiddleware(authLimiter), async (req, res, next) => {
  try {
    const { email, password } = credentialsSchema.parse(req.body);
    const result = await authService.login({ email, password });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', (req, res, next) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
    const result = authService.refresh(refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res, next) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
    authService.logout(refreshToken);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
