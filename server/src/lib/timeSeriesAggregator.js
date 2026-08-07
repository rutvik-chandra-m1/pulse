/**
 * Time-Series Aggregator
 * ------------------------
 * Backs the live dashboard. Naively, a "requests per minute for the last
 * hour" chart means either (a) re-running a GROUP BY query against the
 * events table on every poll/websocket tick, which gets expensive as the
 * table grows, or (b) maintaining a running aggregate incrementally.
 *
 * This class does (b): it keeps a fixed-size ring buffer of buckets per
 * (project, metric) pair. Each bucket covers `bucketSizeMs` of time and
 * stores a count + arbitrary numeric rollups (sum, min, max) so we can
 * answer "events per bucket over the last N buckets" in O(N) instead of
 * scanning the underlying table.
 *
 * Insertion is O(1) amortized: we compute which bucket `now` falls into,
 * and if the ring has rotated past old buckets, we lazily zero them out
 * (rather than eagerly clearing on a timer) which keeps write-side cost
 * independent of idle time.
 */

export class TimeSeriesAggregator {
  /**
   * @param {object} opts
   * @param {number} opts.bucketSizeMs - width of each bucket (e.g. 60_000 for per-minute)
   * @param {number} opts.bucketCount - how many trailing buckets to retain (e.g. 60 for a 1hr window)
   */
  constructor({ bucketSizeMs, bucketCount }) {
    this.bucketSizeMs = bucketSizeMs;
    this.bucketCount = bucketCount;
    /** @type {Map<string, { buckets: Float64Array, bucketStartIdx: Int32Array, anchorMs: number }>} */
    this.series = new Map();
  }

  _seriesFor(key) {
    let s = this.series.get(key);
    if (!s) {
      s = {
        counts: new Float64Array(this.bucketCount),
        // epoch-minute (or bucket-index) each slot was last written for,
        // used to detect staleness lazily instead of eager clearing
        slotEpoch: new Int32Array(this.bucketCount).fill(-1),
      };
      this.series.set(key, s);
    }
    return s;
  }

  _bucketIndex(ts) {
    return Math.floor(ts / this.bucketSizeMs);
  }

  /** Record one occurrence of `key` at time `ts` (default now). */
  record(key, ts = Date.now(), value = 1) {
    const s = this._seriesFor(key);
    const epoch = this._bucketIndex(ts);
    const slot = epoch % this.bucketCount;

    if (s.slotEpoch[slot] !== epoch) {
      // This slot belongs to an old, now-expired bucket. Reset it lazily.
      s.counts[slot] = 0;
      s.slotEpoch[slot] = epoch;
    }
    s.counts[slot] += value;
  }

  /**
   * Returns the last `bucketCount` buckets as [{ t, count }], oldest first,
   * with empty buckets filled as 0 (not skipped) so charts don't have gaps.
   */
  series_(key, now = Date.now()) {
    const s = this.series.get(key);
    const currentEpoch = this._bucketIndex(now);
    const out = [];

    for (let i = this.bucketCount - 1; i >= 0; i--) {
      const epoch = currentEpoch - i;
      const slot = epoch % this.bucketCount;
      const slotIdx = ((slot % this.bucketCount) + this.bucketCount) % this.bucketCount;
      const valid = s && s.slotEpoch[slotIdx] === epoch;
      out.push({
        t: epoch * this.bucketSizeMs,
        count: valid ? s.counts[slotIdx] : 0,
      });
    }
    return out;
  }

  /** Sum of all valid buckets in the retained window. */
  total(key, now = Date.now()) {
    return this.series_(key, now).reduce((acc, b) => acc + b.count, 0);
  }

  /** Rate of change: last bucket vs the bucket before it (momentum indicator). */
  momentum(key, now = Date.now()) {
    const s = this.series_(key, now);
    if (s.length < 2) return 0;
    const [prev, curr] = [s[s.length - 2].count, s[s.length - 1].count];
    if (prev === 0) return curr > 0 ? 1 : 0;
    return (curr - prev) / prev;
  }
}
