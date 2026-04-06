'use client';

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, name);
        setSuccess('Registration successful! Please log in.');
        setMode('login');
        setPassword('');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Portfolio Insights</h1>
        <p>{mode === 'login' ? 'Sign in to continue' : 'Create your account'}</p>

        {error && <div className="password-error">{error}</div>}
        {success && <div style={{ color: 'var(--profit-green)', fontSize: '0.875rem', textAlign: 'center', marginBottom: '1rem' }}>{success}</div>}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <input
              type="text"
              className="password-input"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
            />
          )}
          <input
            type="email"
            className="password-input"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
          <input
            type="password"
            className="password-input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            disabled={loading}
          />
          {mode === 'register' && (
            <p style={{
              color: 'var(--secondary-text-color)',
              fontSize: '0.75rem',
              margin: '-0.5rem 0 0.75rem 0',
              textAlign: 'center'
            }}>
              Please don&apos;t use a password you use somewhere else
            </p>
          )}
          <button type="submit" className="password-submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Register'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          {mode === 'login' ? (
            <p style={{ color: 'var(--secondary-text-color)', fontSize: '0.875rem' }}>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => { setMode('register'); setError(''); setSuccess(''); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-color)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  fontSize: '0.875rem',
                }}
              >
                Register
              </button>
            </p>
          ) : (
            <p style={{ color: 'var(--secondary-text-color)', fontSize: '0.875rem' }}>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-color)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  fontSize: '0.875rem',
                }}
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
