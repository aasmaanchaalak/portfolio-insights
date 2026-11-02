'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useFirm } from '../../contexts/FirmContext';
import LoginPage from '../../components/LoginPage';

// Consent screen for the Claude connector. Claude opens this with the OAuth
// request in the query string; the user signs in (if needed) and approves, and
// the browser goes back to Claude with an authorization code.
export default function AuthorizePage() {
  const { user, loading } = useAuth();
  const { firm } = useFirm();
  const [params, setParams] = useState<Record<string, string> | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setParams(Object.fromEntries(new URLSearchParams(window.location.search)));
  }, []);

  useEffect(() => {
    if (!user || !params) return;
    fetch(`/api/oauth/authorize?${new URLSearchParams(params)}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Invalid request');
        if (data.redirect) window.location.href = data.redirect;
        else setClientName(data.clientName);
      })
      .catch(err => setError(err.message));
  }, [user, params]);

  const decide = async (approve: boolean) => {
    if (!params) return;
    setBusy(true);
    try {
      const res = await fetch('/api/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, approve }),
      });
      const data = await res.json();
      if (!res.ok || !data.redirect) throw new Error(data.error || 'Could not complete sign-in');
      window.location.href = data.redirect;
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (loading || !params) return null;
  if (!user) return <LoginPage />;

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Connect {clientName || 'Claude'}</h1>
        {error ? (
          <div className="password-error">{error}</div>
        ) : (
          <>
            <p>
              {clientName || 'Claude'} wants to access {firm.name} as <strong>{user.email}</strong>.
            </p>
            <ul style={{ color: 'var(--secondary-text-color)', fontSize: '0.875rem', lineHeight: 1.6, margin: '0 0 1.5rem', paddingLeft: '1.25rem' }}>
              <li>Read and update forward models for portfolio stocks, pipeline ideas and PE companies</li>
              <li>Read and add notes and attachments</li>
              <li>Update the PE checklist and manage pipeline ideas and guidance</li>
            </ul>
            <button className="password-submit" disabled={busy || !clientName} onClick={() => decide(true)}>
              {busy ? 'Connecting…' : 'Allow'}
            </button>
            <button
              disabled={busy}
              onClick={() => decide(false)}
              style={{ marginTop: '0.75rem', width: '100%', background: 'none', border: 'none', color: 'var(--secondary-text-color)', cursor: 'pointer', fontSize: '0.875rem' }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
