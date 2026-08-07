import { describe, it, expect } from 'vitest';
import { TimeSeriesAggregator } from '../src/lib/timeSeriesAggregator.js';

describe('TimeSeriesAggregator', () => {
  it('records and retrieves counts in the correct bucket', () => {
    const agg = new TimeSeriesAggregator({ bucketSizeMs: 60_000, bucketCount: 5 });
    const t0 = 0;
    agg.record('signup', t0);
    agg.record('signup', t0 + 1000);
    agg.record('signup', t0 + 59_000);

    const series = agg.series_('signup', t0 + 59_000);
    expect(series[series.length - 1].count).toBe(3);
  });

  it('separates counts into different buckets by time', () => {
    const agg = new TimeSeriesAggregator({ bucketSizeMs: 60_000, bucketCount: 5 });
    agg.record('signup', 0);
    agg.record('signup', 60_000); // next bucket

    const series = agg.series_('signup', 60_000);
    expect(series[series.length - 1].count).toBe(1); // current bucket
    expect(series[series.length - 2].count).toBe(1); // previous bucket
  });

  it('fills empty buckets with 0 rather than skipping them', () => {
    const agg = new TimeSeriesAggregator({ bucketSizeMs: 60_000, bucketCount: 5 });
    agg.record('signup', 0);
    const series = agg.series_('signup', 4 * 60_000);
    expect(series).toHaveLength(5);
    expect(series.filter((b) => b.count === 0)).toHaveLength(4);
  });

  it('lazily expires stale buckets when the ring wraps around', () => {
    const agg = new TimeSeriesAggregator({ bucketSizeMs: 60_000, bucketCount: 3 });
    agg.record('x', 0); // epoch 0 -> slot 0
    // Jump forward so epoch 3 also maps to slot 0 (3 % 3 === 0)
    agg.record('x', 3 * 60_000);

    const series = agg.series_('x', 3 * 60_000);
    // The bucket at epoch 0 must NOT still show a stale count in slot 0
    // since epoch 3 overwrote that slot.
    const total = series.reduce((acc, b) => acc + b.count, 0);
    expect(total).toBe(1); // only the epoch-3 hit should be visible
  });

  it('computes total across the retained window', () => {
    const agg = new TimeSeriesAggregator({ bucketSizeMs: 1000, bucketCount: 10 });
    for (let i = 0; i < 5; i++) agg.record('x', i * 1000);
    expect(agg.total('x', 4000)).toBe(5);
  });

  it('computes momentum as relative change between last two buckets', () => {
    const agg = new TimeSeriesAggregator({ bucketSizeMs: 1000, bucketCount: 5 });
    agg.record('x', 0);
    agg.record('x', 0);
    agg.record('x', 1000);
    agg.record('x', 1000);
    agg.record('x', 1000);
    agg.record('x', 1000);
    // prev bucket = 2, curr bucket = 4 -> (4-2)/2 = 1.0
    expect(agg.momentum('x', 1000)).toBeCloseTo(1.0);
  });

  it('keeps independent series per key', () => {
    const agg = new TimeSeriesAggregator({ bucketSizeMs: 1000, bucketCount: 5 });
    agg.record('a', 0);
    agg.record('b', 0);
    agg.record('b', 0);
    expect(agg.total('a', 0)).toBe(1);
    expect(agg.total('b', 0)).toBe(2);
  });
});
