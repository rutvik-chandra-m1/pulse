import { verifyAccessToken } from '../lib/tokens.js';
import { projectRepository } from '../repositories/projectRepository.js';

/** Requires a valid JWT access token in the Authorization header. */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing bearer token' });
  }
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token' });
  }
}

/** Requires a valid project API key (used by the ingestion endpoints, SDK-style). */
export function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing X-API-Key header' });
  }
  const project = projectRepository.findByApiKey(key);
  if (!project) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid API key' });
  }
  req.project = project;
  next();
}

/** Ensures the authenticated user owns the :projectId in the route. */
export function requireProjectOwnership(req, res, next) {
  const { projectId } = req.params;
  if (!projectRepository.belongsToUser(projectId, req.user.id)) {
    return res.status(404).json({ error: 'not_found', message: 'Project not found' });
  }
  next();
}
