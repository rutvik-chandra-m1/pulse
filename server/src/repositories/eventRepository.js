import { db } from '../config/db.js';
import { nanoid } from 'nanoid';

let _insertStmt = null;
function insertStmt() {
  if (!_insertStmt) {
    _insertStmt = db.prepare(`
      INSERT INTO events (id, project_id, name, properties, session_id, occurred_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
  }
  return _insertStmt;
}

export const eventRepository = {
  insert({ projectId, name, properties = {}, sessionId = null, occurredAt = Date.now() }) {
    const id = nanoid();
    insertStmt().run(
      id,
      projectId,
      name,
      JSON.stringify(properties),
      sessionId,
      occurredAt,
      Date.now()
    );
    return { id, projectId, name, properties, sessionId, occurredAt };
  },

  /** Bulk insert wrapped in a transaction for throughput. */
  insertMany(events) {
    const tx = db.transaction((rows) => {
      const results = [];
      for (const e of rows) {
        results.push(this.insert(e));
      }
      return results;
    });
    return tx(events);
  },

  findRecent({ projectId, limit = 50, before = null, name = null }) {
    let query = `SELECT * FROM events WHERE project_id = ?`;
    const params = [projectId];

    if (name) {
      query += ` AND name = ?`;
      params.push(name);
    }
    if (before) {
      query += ` AND occurred_at < ?`;
      params.push(before);
    }
    query += ` ORDER BY occurred_at DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(query).all(...params);
    return rows.map((r) => ({ ...r, properties: JSON.parse(r.properties) }));
  },

  countByNameSince({ projectId, sinceTs }) {
    return db
      .prepare(
        `SELECT name, COUNT(*) as count FROM events
         WHERE project_id = ? AND occurred_at >= ?
         GROUP BY name ORDER BY count DESC`
      )
      .all(projectId, sinceTs);
  },

  distinctSessionsSince({ projectId, sinceTs }) {
    const row = db
      .prepare(
        `SELECT COUNT(DISTINCT session_id) as count FROM events
         WHERE project_id = ? AND occurred_at >= ? AND session_id IS NOT NULL`
      )
      .get(projectId, sinceTs);
    return row.count;
  },

  totalCount(projectId) {
    return db
      .prepare(`SELECT COUNT(*) as count FROM events WHERE project_id = ?`)
      .get(projectId).count;
  },
};
