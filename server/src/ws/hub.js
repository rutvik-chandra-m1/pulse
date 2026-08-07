import { WebSocketServer } from 'ws';
import { verifyAccessToken } from '../lib/tokens.js';
import { projectRepository } from '../repositories/projectRepository.js';
import url from 'url';

/**
 * WebSocket hub: clients connect to /ws?token=<jwt>&projectId=<id> and
 * receive live event pushes for that project. We keep a Map of
 * projectId -> Set<WebSocket> so broadcasts are O(subscribers) instead
 * of iterating every connected client on every event.
 */
export function createHub(server) {
  const wss = new WebSocketServer({ noServer: true });
  /** @type {Map<string, Set<import('ws').WebSocket>>} */
  const subscribers = new Map();

  server.on('upgrade', (req, socket, head) => {
    const { pathname, query } = url.parse(req.url, true);
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }

    try {
      const payload = verifyAccessToken(query.token);
      const project = projectRepository.findById(query.projectId);
      if (!project || project.user_id !== payload.sub) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.projectId = query.projectId;
        wss.emit('connection', ws, req);
      });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    if (!subscribers.has(ws.projectId)) subscribers.set(ws.projectId, new Set());
    subscribers.get(ws.projectId).add(ws);

    ws.send(JSON.stringify({ type: 'connected', projectId: ws.projectId }));

    ws.on('close', () => {
      subscribers.get(ws.projectId)?.delete(ws);
      if (subscribers.get(ws.projectId)?.size === 0) {
        subscribers.delete(ws.projectId);
      }
    });

    // Heartbeat so dead connections get reaped instead of leaking.
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
  });

  const heartbeat = setInterval(() => {
    for (const set of subscribers.values()) {
      for (const ws of set) {
        if (!ws.isAlive) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }
  }, 30_000);
  heartbeat.unref?.();

  function broadcast(projectId, payload) {
    const set = subscribers.get(projectId);
    if (!set || set.size === 0) return;
    const message = JSON.stringify(payload);
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) ws.send(message);
    }
  }

  return { broadcast, subscriberCount: (projectId) => subscribers.get(projectId)?.size ?? 0 };
}
