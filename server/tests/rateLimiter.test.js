import { describe, it, expect, vi, afterEach } from 'vitest';
import { SlidingWindowRateLimiter } from '../src/lib/rateLimiter.js';

describe('SlidingWindowRateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under the limit', () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 1000, max: 3 });
    const now = 1000;
    expect(limiter.check('a', now).allowed).toBe(true);
    expect(limiter.check('a', now).allowed).toBe(true);
    expect(limiter.check('a', now).allowed).toBe(true);
    limiter.dispose();
  });

  it('blocks requests once the limit is hit within the window', () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 1000, max: 2 });
    const now = 1000;
    expect(limiter.check('a', now).allowed).toBe(true);
    expect(limiter.check('a', now).allowed).toBe(true);
    const third = limiter.check('a', now);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    limiter.dispose();
  });

  it('does not allow burst-doubling at window boundaries (unlike fixed windows)', () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 1000, max: 2 });
    // 2 requests right before the boundary
    expect(limiter.check('a', 999).allowed).toBe(true);
    expect(limiter.check('a', 999).allowed).toBe(true);
    // A fixed-window counter keyed by whole seconds would reset here and
    // allow 2 more. The sliding window must not, since both prior hits
    // are still within 1000ms of "now".
    expect(limiter.check('a', 1001).allowed).toBe(false);
  });

  it('frees up capacity as old entries age out of the window', () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 1000, max: 1 });
    expect(limiter.check('a', 1000).allowed).toBe(true);
    expect(limiter.check('a', 1500).allowed).toBe(false);
    // Now past the 1000ms window from the first hit at t=1000
    expect(limiter.check('a', 2001).allowed).toBe(true);
  });

  it('tracks separate keys independently', () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 1000, max: 1 });
    expect(limiter.check('a', 1000).allowed).toBe(true);
    expect(limiter.check('b', 1000).allowed).toBe(true);
    expect(limiter.check('a', 1000).allowed).toBe(false);
    expect(limiter.check('b', 1000).allowed).toBe(false);
  });

  it('reports accurate remaining count', () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 1000, max: 5 });
    limiter.check('a', 1000);
    limiter.check('a', 1000);
    const result = limiter.check('a', 1000);
    expect(result.remaining).toBe(2); // 5 - 3 used
  });

  it('sweep evicts fully-expired keys to bound memory', () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 1000, max: 5 });
    limiter.check('a', 1000);
    limiter.check('b', 1000);
    expect(limiter.hits.size).toBe(2);
    limiter._sweep(5000); // well past window for both
    expect(limiter.hits.size).toBe(0);
  });
});
