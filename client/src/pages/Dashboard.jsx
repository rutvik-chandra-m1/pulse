import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';
import { useLiveEvents } from '../lib/useLiveEvents.js';
import { useAuth } from '../context/AuthContext.jsx';
import { PulseMark } from '../components/PulseMark.jsx';
import { StatCard } from '../components/StatCard.jsx';
import { LiveChart } from '../components/LiveChart.jsx';
import './Dashboard.css';

const SEED_SNIPPET = (apiKey) => `curl -X POST ${window.location.hostname === 'localhost' ? 'http://localhost:4000' : ''}/api/events/track \\
  -H "X-API-Key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "signup", "properties": {"plan": "pro"}}'`;

export function Dashboard() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  const loadProjects = useCallback(async () => {
    const data = await api.listProjects();
    setProjects(data);
    if (data.length && !activeProjectId) {
      setActiveProjectId(data[0].id);
    }
    setLoading(false);
  }, [activeProjectId]);

  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run once on mount only
  }, []);

  const refreshDashboard = useCallback(async () => {
    if (!activeProjectId) return;
    const [s, r] = await Promise.all([
      api.getSummary(activeProjectId),
      api.getRecent(activeProjectId, { limit: 20 }),
    ]);
    setSummary(s);
    setRecent(r);
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProjectId) return;
    refreshDashboard();
    // Fallback poll every 15s in case the socket drops silently;
    // live pushes below make this feel instant in the common case.
    pollRef.current = setInterval(refreshDashboard, 15_000);
    return () => clearInterval(pollRef.current);
  }, [activeProjectId, refreshDashboard]);

  const wsStatus = useLiveEvents(activeProjectId, (msg) => {
    refreshDashboard();
    if (msg.type === 'event') {
      setRecent((prev) => [
        { id: `live-${Date.now()}`, ...msg.event },
        ...prev,
      ].slice(0, 20));
    }
  });

  async function handleCreateProject(e) {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    const project = await api.createProject(newProjectName.trim());
    setProjects((prev) => [project, ...prev]);
    setActiveProjectId(project.id);
    setNewProjectName('');
    setShowNewProject(false);
  }

  if (loading) {
    return (
      <div className="dashboard dashboard--loading">
        <PulseMark size={40} />
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div className="dashboard__brand">
          <PulseMark size={22} />
          <span>pulse</span>
        </div>

        <div className="dashboard__project-switcher">
          {projects.length > 0 && (
            <select
              value={activeProjectId || ''}
              onChange={(e) => setActiveProjectId(e.target.value)}
              className="dashboard__project-select"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <button className="dashboard__new-project-btn" onClick={() => setShowNewProject((v) => !v)}>
            + New project
          </button>
        </div>

        <div className="dashboard__user">
          <span className="dashboard__user-email mono">{user?.email}</span>
          <button className="dashboard__logout" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      {showNewProject && (
        <form className="dashboard__new-project-form" onSubmit={handleCreateProject}>
          <input
            autoFocus
            placeholder="Project name, e.g. Marketing site"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
          />
          <button type="submit">Create</button>
        </form>
      )}

      {!activeProject ? (
        <EmptyState onCreate={() => setShowNewProject(true)} />
      ) : (
        <main className="dashboard__main">
          <div className="dashboard__status-row">
            <div className={`dashboard__ws-status dashboard__ws-status--${wsStatus}`}>
              <span className="dashboard__ws-dot" />
              {wsStatus === 'live' ? 'Live' : wsStatus === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
            </div>
            <IntegrationSnippet apiKey={activeProject.apiKey} />
          </div>

          <section className="dashboard__stats">
            <StatCard label="Total events" value={summary?.totalEvents ?? '—'} accent />
            <StatCard label="Active sessions (30m)" value={summary?.activeSessions30m ?? '—'} />
            <StatCard
              label="Momentum (last min vs prior)"
              value={summary ? `${summary.momentum >= 0 ? '+' : ''}${(summary.momentum * 100).toFixed(0)}%` : '—'}
            />
          </section>

          <section className="dashboard__chart-panel">
            <div className="dashboard__panel-header">
              <h2>Events per minute</h2>
              <span className="dashboard__panel-sub mono">last 60 min</span>
            </div>
            {summary?.liveSeries && <LiveChart data={summary.liveSeries} />}
          </section>

          <div className="dashboard__lower-grid">
            <section className="dashboard__panel">
              <div className="dashboard__panel-header">
                <h2>Top events</h2>
                <span className="dashboard__panel-sub mono">24h</span>
              </div>
              <div className="dashboard__breakdown">
                {summary?.breakdown24h?.length ? (
                  summary.breakdown24h.map((b) => (
                    <div key={b.name} className="dashboard__breakdown-row">
                      <span className="dashboard__breakdown-name">{b.name}</span>
                      <div className="dashboard__breakdown-bar-track">
                        <div
                          className="dashboard__breakdown-bar"
                          style={{
                            width: `${Math.min(
                              100,
                              (b.count / summary.breakdown24h[0].count) * 100
                            )}%`,
                          }}
                        />
                      </div>
                      <span className="dashboard__breakdown-count mono">{b.count}</span>
                    </div>
                  ))
                ) : (
                  <p className="dashboard__empty-hint">No events yet in the last 24h.</p>
                )}
              </div>
            </section>

            <section className="dashboard__panel">
              <div className="dashboard__panel-header">
                <h2>Recent activity</h2>
                <span className="dashboard__panel-sub mono">live feed</span>
              </div>
              <div className="dashboard__feed">
                {recent.length ? (
                  recent.map((e) => (
                    <div key={e.id} className="dashboard__feed-row">
                      <span className="dashboard__feed-dot" />
                      <span className="dashboard__feed-name">{e.name}</span>
                      <span className="dashboard__feed-time mono">
                        {new Date(e.occurredAt).toLocaleTimeString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="dashboard__empty-hint">Waiting for the first event.</p>
                )}
              </div>
            </section>
          </div>
        </main>
      )}
    </div>
  );
}

function IntegrationSnippet({ apiKey }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(SEED_SNIPPET(apiKey));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="integration-snippet">
      <button className="integration-snippet__toggle" onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide' : 'Send a test event'}
      </button>
      {open && (
        <div className="integration-snippet__panel">
          <pre className="mono">{SEED_SNIPPET(apiKey)}</pre>
          <button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div className="dashboard__empty">
      <PulseMark size={36} />
      <h2>No projects yet</h2>
      <p>Create a project to get an API key and start tracking events.</p>
      <button onClick={onCreate}>Create your first project</button>
    </div>
  );
}
