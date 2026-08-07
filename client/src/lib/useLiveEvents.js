import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * Subscribes to the live event WebSocket for a project. Auto-reconnects
 * with backoff if the connection drops (network blip, server restart)
 * rather than leaving the dashboard silently stale.
 */
export function useLiveEvents(projectId, onEvent) {
  const [status, setStatus] = useState('connecting');
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!projectId) return;
    let ws;
    let closedByEffect = false;
    let attempt = 0;
    let reconnectTimer;

    function connect() {
      setStatus('connecting');
      ws = new WebSocket(api.wsUrl(projectId));

      ws.onopen = () => {
        attempt = 0;
        setStatus('live');
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.type === 'event' || data.type === 'batch') {
            onEventRef.current?.(data);
          }
        } catch {
          /* ignore malformed frame */
        }
      };

      ws.onclose = () => {
        if (closedByEffect) return;
        setStatus('reconnecting');
        const delay = Math.min(1000 * 2 ** attempt, 15_000);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      closedByEffect = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [projectId]);

  return status;
}
