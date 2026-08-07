import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PulseMark } from '../components/PulseMark.jsx';
import './AuthPage.css';

export function AuthPage() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password);
      }
      navigate('/');
    } catch (err) {
      setError(err.body?.issues?.[0]?.message || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-page__panel">
        <div className="auth-page__brand">
          <PulseMark size={26} />
          <span>pulse</span>
        </div>
        <h1 className="auth-page__title">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="auth-page__subtitle">
          {mode === 'login'
            ? 'Sign in to see what your product is doing right now.'
            : 'Start tracking events in under a minute.'}
        </p>

        <form onSubmit={handleSubmit} className="auth-page__form">
          <label className="auth-page__field">
            <span>Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </label>
          <label className="auth-page__field">
            <span>Password</span>
            <input
              type="password"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
            />
          </label>

          {error && <div className="auth-page__error">{error}</div>}

          <button type="submit" className="auth-page__submit" disabled={loading}>
            {loading ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          className="auth-page__switch"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
