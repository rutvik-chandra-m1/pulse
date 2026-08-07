import { db } from '../config/db.js';
import { nanoid } from 'nanoid';

export const userRepository = {
  create({ email, passwordHash }) {
    const id = nanoid();
    const createdAt = Date.now();
    db.prepare(
      `INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`
    ).run(id, email, passwordHash, createdAt);
    return { id, email, createdAt };
  },

  findByEmail(email) {
    return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
  },

  findById(id) {
    return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
  },

  saveRefreshToken({ id, userId, tokenHash, expiresAt }) {
    db.prepare(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`
    ).run(id, userId, tokenHash, expiresAt, Date.now());
  },

  findRefreshToken(tokenHash) {
    return db
      .prepare(`SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = 0`)
      .get(tokenHash);
  },

  revokeRefreshToken(tokenHash) {
    db.prepare(`UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?`).run(tokenHash);
  },

  revokeAllForUser(userId) {
    db.prepare(`UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?`).run(userId);
  },
};
