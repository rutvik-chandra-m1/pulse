/**
 * Sliding Window Log Rate Limiter
 * ---------------------------------
 * Why not a fixed window counter? Fixed windows allow burst-doubling at
 * window boundaries (e.g. 100 req at 0:59 + 100 req at 1:01 = 200 req in
 * 2 seconds even with a "100/min" limit). Why not a simple token bucket?
 * Token buckets are great for smoothing but don't give an exact count of
 * requests in the *actual* trailing window, which matters when we want to
 * report "X requests remaining in the last 60s" back to API clients.
 *
 * This implementation keeps a per-key deque (array used as a ring) of
 * request timestamps. On each check we evict everything older than
 * `windowMs` from the front (O(1) amortized per eviction since timestamps
 * are monotonically increasing) and then compare the remaining count
 * against the limit. Memory is O(active keys * requests in window), which
 * is bounded and self-cleaning -- stale keys are swept periodically so we
 * don't leak memory for one-off clients.
 */

export class SlidingWindowRateLimiter {
  /**
   * @param {object} opts
   * @param {number} opts.windowMs - size of the trailing window in ms
   * @param {number} opts.max - max requests allowed per window per key
   * @param {number} [opts.sweepIntervalMs] - how often to purge dead keys
   */
  constructor({ windowMs, max, sweepIntervalMs = 60_000 }) {
    this.windowMs = windowMs;
    this.max = max;
    /** @type {Map<string, number[]>} key -> sorted timestamps (ms) */
    this.hits = new Map();

    this._sweepTimer = setInterval(() => this._sweep(), sweepIntervalMs);
    this._sweepTimer.unref?.();
  }

  /**
   * Records a hit for `key` and returns whether it's allowed.
   * @returns {{ allowed: boolean, remaining: number, resetMs: number }}
   */
  check(key, now = Date.now()) {
    const windowStart = now - this.windowMs;
    let timestamps = this.hits.get(key);

    if (!timestamps) {
      timestamps = [];
      this.hits.set(key, timestamps);
    }

    // Evict everything that has aged out of the window.
    // Timestamps are appended in increasing order, so the stale entries
    // are always a contiguous prefix -> binary search + slice is O(log n).
    const firstValidIdx = this._firstIndexAtOrAfter(timestamps, windowStart);
    if (firstValidIdx > 0) {
      timestamps.splice(0, firstValidIdx);
    }

    const allowed = timestamps.length < this.max;
    if (allowed) {
      timestamps.push(now);
    }

    const resetMs = timestamps.length > 0 ? timestamps[0] + this.windowMs - now : 0;

    return {
      allowed,
      remaining: Math.max(0, this.max - timestamps.length),
      resetMs: Math.max(0, resetMs),
    };
  }

  /** Binary search for first timestamp >= threshold. */
  _firstIndexAtOrAfter(arr, threshold) {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] < threshold) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Remove keys with no timestamps left in the current window. */
  _sweep(now = Date.now()) {
    const windowStart = now - this.windowMs;
    for (const [key, timestamps] of this.hits) {
      const idx = this._firstIndexAtOrAfter(timestamps, windowStart);
      if (idx >= timestamps.length) {
        this.hits.delete(key);
      } else if (idx > 0) {
        timestamps.splice(0, idx);
      }
    }
  }

  dispose() {
    clearInterval(this._sweepTimer);
  }
}

/** Express middleware factory built on SlidingWindowRateLimiter. */
export function rateLimitMiddleware(limiter, keyFn = (req) => req.ip) {
  return (req, res, next) => {
    const key = keyFn(req);
    const { allowed, remaining, resetMs } = limiter.check(key);

    res.setHeader('X-RateLimit-Limit', limiter.max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetMs / 1000));

    if (!allowed) {
      return res.status(429).json({
        error: 'rate_limited',
        message: `Too many requests. Try again in ${Math.ceil(resetMs / 1000)}s.`,
      });
    }
    next();
  };
}
