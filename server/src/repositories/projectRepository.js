import { db } from '../config/db.js';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

function generateApiKey() {
  return `pk_${crypto.randomBytes(20).toString('hex')}`;
}

function toCamel(row) {
  if (!row) return row;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    apiKey: row.api_key,
    createdAt: row.created_at,
  };
}

export const projectRepository = {
  create({ userId, name }) {
    const id = nanoid();
    const apiKey = generateApiKey();
    const createdAt = Date.now();
    db.prepare(
      `INSERT INTO projects (id, user_id, name, api_key, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(id, userId, name, apiKey, createdAt);
    return { id, userId, name, apiKey, createdAt };
  },

  findByUser(userId) {
    const rows = db.prepare(`SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC`).all(userId);
    return rows.map(toCamel);
  },

  findById(id) {
    return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
  },

  findByApiKey(apiKey) {
    return db.prepare(`SELECT * FROM projects WHERE api_key = ?`).get(apiKey);
  },

  belongsToUser(projectId, userId) {
    const row = db
      .prepare(`SELECT 1 FROM projects WHERE id = ? AND user_id = ?`)
      .get(projectId, userId);
    return !!row;
  },
};
