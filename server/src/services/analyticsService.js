import { eventRepository } from '../repositories/eventRepository.js';
import { TimeSeriesAggregator } from '../lib/timeSeriesAggregator.js';

// One aggregator instance for the whole process: per-minute buckets,
// 60 of them retained -> a rolling 1-hour view without re-querying SQLite.
const perMinuteAggregator = new TimeSeriesAggregator({
  bucketSizeMs: 60_000,
  bucketCount: 60,
});

function aggregatorKey(projectId, eventName) {
  return `${projectId}::${eventName}`;
}

function projectTotalKey(projectId) {
  return `${projectId}::__total__`;
}

export function createAnalyticsService({ broadcast } = {}) {
  return {
    /**
     * Ingest a single event: persist to SQLite (source of truth) and
     * update the in-memory aggregator (fast path for live charts), then
     * broadcast to any connected dashboard sockets for this project.
     */
    track({ projectId, name, properties, sessionId, occurredAt }) {
      const event = eventRepository.insert({
        projectId,
        name,
        properties,
        sessionId,
        occurredAt,
      });

      const ts = event.occurredAt;
      perMinuteAggregator.record(aggregatorKey(projectId, name), ts);
      perMinuteAggregator.record(projectTotalKey(projectId), ts);

      broadcast?.(projectId, {
        type: 'event',
        event: { name: event.name, occurredAt: event.occurredAt, properties: event.properties },
      });

      return event;
    },

    trackBatch({ projectId, events }) {
      const inserted = eventRepository.insertMany(
        events.map((e) => ({ ...e, projectId }))
      );
      for (const event of inserted) {
        perMinuteAggregator.record(aggregatorKey(projectId, event.name), event.occurredAt);
        perMinuteAggregator.record(projectTotalKey(projectId), event.occurredAt);
      }
      broadcast?.(projectId, { type: 'batch', count: inserted.length });
      return inserted;
    },

    /** Live per-minute series for the last hour, straight from memory. */
    getLiveSeries(projectId, eventName = null) {
      const key = eventName ? aggregatorKey(projectId, eventName) : projectTotalKey(projectId);
      return perMinuteAggregator.series_(key);
    },

    getMomentum(projectId, eventName = null) {
      const key = eventName ? aggregatorKey(projectId, eventName) : projectTotalKey(projectId);
      return perMinuteAggregator.momentum(key);
    },

    /** Historical breakdown (durable, from SQLite) for a longer lookback. */
    getEventBreakdown(projectId, lookbackMs = 24 * 60 * 60 * 1000) {
      return eventRepository.countByNameSince({
        projectId,
        sinceTs: Date.now() - lookbackMs,
      });
    },

    getActiveSessions(projectId, lookbackMs = 30 * 60 * 1000) {
      return eventRepository.distinctSessionsSince({
        projectId,
        sinceTs: Date.now() - lookbackMs,
      });
    },

    getRecentEvents(projectId, { limit, before, name } = {}) {
      return eventRepository.findRecent({ projectId, limit, before, name });
    },

    getSummary(projectId) {
      return {
        totalEvents: eventRepository.totalCount(projectId),
        activeSessions30m: this.getActiveSessions(projectId),
        liveSeries: this.getLiveSeries(projectId),
        momentum: this.getMomentum(projectId),
        breakdown24h: this.getEventBreakdown(projectId),
      };
    },
  };
}
