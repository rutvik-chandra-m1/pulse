import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import { createEventRoutes } from './routes/events.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createAnalyticsService } from './services/analyticsService.js';

export function createApp({ broadcast } = {}) {
  const app = express();
  const analyticsService = createAnalyticsService({ broadcast });

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/events', createEventRoutes(analyticsService));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, analyticsService };
}
