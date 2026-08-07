import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_me';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_me';

const ACCESS_TTL = '15m';
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function signAccessToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, ACCESS_SECRET, {
    expiresIn: ACCESS_TTL,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

export function signRefreshToken(user) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: user.id, jti }, REFRESH_SECRET, {
    expiresIn: Math.floor(REFRESH_TTL_MS / 1000),
  });
  return { token, jti, expiresAt: Date.now() + REFRESH_TTL_MS };
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
