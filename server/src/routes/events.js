import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireApiKey, requireProjectOwnership } from '../middleware/auth.js';
import { rateLimitMiddleware, SlidingWindowRateLimiter } from '../lib/rateLimiter.js';

const eventSchema = z.object({
  name: z.string().min(1).max(120),
  properties: z.record(z.any()).optional().default({}),
  sessionId: z.string().optional(),
  occurredAt: z.number().optional(),
});

// Generous per-API-key limiter for ingestion: 300 events/min per project key.
const ingestLimiter = new SlidingWindowRateLimiter({ windowMs: 60_000, max: 300 });

export function createEventRoutes(analyticsService) {
  const router = Router();

  // ---- Ingestion (public-ish, guarded by project API key) ----

  router.post(
    '/track',
    requireApiKey,
    rateLimitMiddleware(ingestLimiter, (req) => req.project.id),
    (req, res, next) => {
      try {
        const body = eventSchema.parse(req.body);
        const event = analyticsService.track({
          projectId: req.project.id,
          name: body.name,
          properties: body.properties,
          sessionId: body.sessionId ?? null,
          occurredAt: body.occurredAt ?? Date.now(),
        });
        res.status(201).json(event);
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/track/batch',
    requireApiKey,
    rateLimitMiddleware(ingestLimiter, (req) => req.project.id),
    (req, res, next) => {
      try {
        const events = z.array(eventSchema).min(1).max(500).parse(req.body.events);
        const inserted = analyticsService.trackBatch({
          projectId: req.project.id,
          events: events.map((e) => ({
            name: e.name,
            properties: e.properties,
            sessionId: e.sessionId ?? null,
            occurredAt: e.occurredAt ?? Date.now(),
          })),
        });
        res.status(201).json({ inserted: inserted.length });
      } catch (err) {
        next(err);
      }
    }
  );

  // ---- Dashboard queries (JWT-protected, scoped to owned project) ----

  router.get(
    '/:projectId/summary',
    requireAuth,
    requireProjectOwnership,
    (req, res) => {
      res.json(analyticsService.getSummary(req.params.projectId));
    }
  );

  router.get(
    '/:projectId/live-series',
    requireAuth,
    requireProjectOwnership,
    (req, res) => {
      const { eventName } = req.query;
      res.json(analyticsService.getLiveSeries(req.params.projectId, eventName || null));
    }
  );

  router.get(
    '/:projectId/recent',
    requireAuth,
    requireProjectOwnership,
    (req, res) => {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const before = req.query.before ? Number(req.query.before) : null;
      const name = req.query.name || null;
      res.json(analyticsService.getRecentEvents(req.params.projectId, { limit, before, name }));
    }
  );

  return router;
}
