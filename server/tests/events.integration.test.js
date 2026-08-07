import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';

process.env.DB_PATH = path.join(process.cwd(), 'tests', 'test-events.db');

let app;
let accessToken;
let apiKey;
let projectId;

beforeAll(async () => {
  try {
    fs.unlinkSync(process.env.DB_PATH);
  } catch {}
  const { migrate } = await import('../src/config/db.js');
  migrate();
  ({ app } = (await import('../src/app.js')).createApp());

  const reg = await request(app)
    .post('/api/auth/register')
    .send({ email: 'events@example.com', password: 'supersecret123' });
  accessToken = reg.body.accessToken;

  const proj = await request(app)
    .post('/api/projects')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'My Website' });
  apiKey = proj.body.apiKey;
  projectId = proj.body.id;
});

describe('Event ingestion + analytics', () => {
  it('returns consistent camelCase project shape from list as from create', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body[0].apiKey).toBeDefined();
    expect(res.body[0].api_key).toBeUndefined();
  });

  it('rejects ingestion without an API key', async () => {
    const res = await request(app).post('/api/events/track').send({ name: 'page_view' });
    expect(res.status).toBe(401);
  });

  it('ingests a single event with a valid API key', async () => {
    const res = await request(app)
      .post('/api/events/track')
      .set('X-API-Key', apiKey)
      .send({ name: 'page_view', properties: { path: '/home' }, sessionId: 's1' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('page_view');
  });

  it('ingests a batch of events', async () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      name: 'click',
      properties: { i },
      sessionId: 's1',
    }));
    const res = await request(app)
      .post('/api/events/track/batch')
      .set('X-API-Key', apiKey)
      .send({ events });
    expect(res.status).toBe(201);
    expect(res.body.inserted).toBe(10);
  });

  it('rejects malformed event payloads', async () => {
    const res = await request(app)
      .post('/api/events/track')
      .set('X-API-Key', apiKey)
      .send({ properties: {} }); // missing required `name`
    expect(res.status).toBe(400);
  });

  it('returns a live summary reflecting ingested events', async () => {
    const res = await request(app)
      .get(`/api/events/${projectId}/summary`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totalEvents).toBeGreaterThanOrEqual(11);
    expect(Array.isArray(res.body.liveSeries)).toBe(true);
    expect(res.body.breakdown24h.some((b) => b.name === 'click')).toBe(true);
  });

  it('denies access to a project the user does not own', async () => {
    const res = await request(app)
      .get(`/api/events/does-not-exist/summary`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it('enforces the ingestion rate limit', async () => {
    // ingestLimiter is 300/min per project; blast past it
    const requests = Array.from({ length: 305 }, () =>
      request(app).post('/api/events/track').set('X-API-Key', apiKey).send({ name: 'spam' })
    );
    const results = await Promise.all(requests);
    const blocked = results.filter((r) => r.status === 429);
    expect(blocked.length).toBeGreaterThan(0);
  });
});
