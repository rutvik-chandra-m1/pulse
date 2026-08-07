const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

function getTokens() {
  return {
    accessToken: localStorage.getItem('pulse_access_token'),
    refreshToken: localStorage.getItem('pulse_refresh_token'),
  };
}

function setTokens({ accessToken, refreshToken }) {
  if (accessToken) localStorage.setItem('pulse_access_token', accessToken);
  if (refreshToken) localStorage.setItem('pulse_refresh_token', refreshToken);
}

function clearTokens() {
  localStorage.removeItem('pulse_access_token');
  localStorage.removeItem('pulse_refresh_token');
}

async function request(path, { method = 'GET', body, auth = true, retry = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const { accessToken } = getTokens();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth && retry) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request(path, { method, body, auth, retry: false });
    }
    clearTokens();
    window.location.assign('/login');
    throw new Error('Session expired');
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(data?.message || `Request failed: ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

async function tryRefresh() {
  const { refreshToken } = getTokens();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setTokens(data);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  register: (email, password) =>
    request('/api/auth/register', { method: 'POST', body: { email, password }, auth: false }),
  login: (email, password) =>
    request('/api/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  logout: async () => {
    const { refreshToken } = getTokens();
    if (refreshToken) {
      await request('/api/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }).catch(() => {});
    }
    clearTokens();
  },

  listProjects: () => request('/api/projects'),
  createProject: (name) => request('/api/projects', { method: 'POST', body: { name } }),

  getSummary: (projectId) => request(`/api/events/${projectId}/summary`),
  getRecent: (projectId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/events/${projectId}/recent${qs ? `?${qs}` : ''}`);
  },

  wsUrl: (projectId) => {
    const { accessToken } = getTokens();
    const base = API_BASE.replace(/^http/, 'ws');
    return `${base}/ws?token=${encodeURIComponent(accessToken)}&projectId=${encodeURIComponent(projectId)}`;
  },
};

export { getTokens, setTokens, clearTokens, API_BASE };
