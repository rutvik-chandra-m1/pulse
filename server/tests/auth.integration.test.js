import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';

process.env.DB_PATH = path.join(process.cwd(), 'tests', 'test.db');

let app;

beforeAll(async () => {
  // fresh db file for the test run
  try {
    fs.unlinkSync(process.env.DB_PATH);
  } catch {}
  const { migrate } = await import('../src/config/db.js');
  migrate();
  ({ app } = (await import('../src/app.js')).createApp());
});

describe('Auth flow', () => {
  const creds = { email: 'test@example.com', password: 'supersecret123' };

  it('registers a new user and returns tokens', async () => {
    const res = await request(app).post('/api/auth/register').send(creds);
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe(creds.email);
  });

  it('rejects duplicate registration', async () => {
    const res = await request(app).post('/api/auth/register').send(creds);
    expect(res.status).toBe(409);
  });

  it('rejects invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'supersecret123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send(creds);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: creds.email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('refreshes tokens and rotates the refresh token', async () => {
    const login = await request(app).post('/api/auth/login').send(creds);
    const { refreshToken } = login.body;

    const refreshed = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeDefined();
    expect(refreshed.body.refreshToken).not.toBe(refreshToken);

    // Old refresh token should now be revoked (rotation).
    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(reuse.status).toBe(401);
  });

  it('protects project routes without a bearer token', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });
});
