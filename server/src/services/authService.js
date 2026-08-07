import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { userRepository } from '../repositories/userRepository.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from '../lib/tokens.js';

class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

export const authService = {
  async register({ email, password }) {
    const existing = userRepository.findByEmail(email);
    if (existing) throw new AuthError('Email already registered', 409);

    const passwordHash = await bcrypt.hash(password, 12);
    const user = userRepository.create({ email, passwordHash });
    return this._issueTokens(user);
  },

  async login({ email, password }) {
    const user = userRepository.findByEmail(email);
    if (!user) throw new AuthError('Invalid credentials');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new AuthError('Invalid credentials');

    return this._issueTokens(user);
  },

  refresh(refreshTokenRaw) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshTokenRaw);
    } catch {
      throw new AuthError('Invalid or expired refresh token');
    }

    const tokenHash = hashToken(refreshTokenRaw);
    const stored = userRepository.findRefreshToken(tokenHash);
    if (!stored || stored.expires_at < Date.now()) {
      throw new AuthError('Refresh token revoked or expired');
    }

    const user = userRepository.findById(payload.sub);
    if (!user) throw new AuthError('User not found');

    // Rotate: revoke the used token, issue a new pair.
    userRepository.revokeRefreshToken(tokenHash);
    return this._issueTokens(user);
  },

  logout(refreshTokenRaw) {
    const tokenHash = hashToken(refreshTokenRaw);
    userRepository.revokeRefreshToken(tokenHash);
  },

  _issueTokens(user) {
    const accessToken = signAccessToken(user);
    const { token: refreshToken, expiresAt } = signRefreshToken(user);

    userRepository.saveRefreshToken({
      id: nanoid(),
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email },
    };
  },
};

export { AuthError };
