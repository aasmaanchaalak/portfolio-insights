'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface UserSummary {
  id: string;
  email: string;
  name: string | null;
  role: 'portfolio' | 'analyst';
  createdAt: string;
  lastLoginAt: string | null;
}

interface AllowedEmail {
  id: string;
  email: string;
  addedBy: string | null;
  createdAt: string;
}

export default function AdminPanel() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [allowedEmails, setAllowedEmails] = useState<AllowedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [addingEmail, setAddingEmail] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
      fetchAllowedEmails();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/users');
      if (!res.ok) {
        throw new Error('Failed to fetch users');
      }
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllowedEmails = async () => {
    try {
      const res = await fetch('/api/admin/allowed-emails');
      if (!res.ok) {
        throw new Error('Failed to fetch allowed emails');
      }
      const data = await res.json();
      setAllowedEmails(data);
    } catch (err) {
      console.error('Error fetching allowed emails:', err);
    }
  };

  const addAllowedEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    try {
      setAddingEmail(true);
      const res = await fetch('/api/admin/allowed-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add email');
      }

      const addedEmail = await res.json();
      setAllowedEmails(prev => [addedEmail, ...prev]);
      setNewEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add email');
    } finally {
      setAddingEmail(false);
    }
  };

  const removeAllowedEmail = async (email: string) => {
    if (!confirm(`Remove ${email} from allowlist? They won't be able to register again.`)) return;

    try {
      const res = await fetch('/api/admin/allowed-emails', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove email');
      }

      setAllowedEmails(prev => prev.filter(e => e.email !== email));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove email');
    }
  };

  const updateRole = async (email: string, newRole: 'portfolio' | 'analyst') => {
    try {
      setUpdating(email);
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: newRole }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update role');
      }

      // Update local state
      setUsers(users.map(user =>
        user.email === email ? { ...user, role: newRole } : user
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setUpdating(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="admin-panel">
        <div className="admin-error">
          Access denied. Admin privileges required.
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2>User Management</h2>
        <p className="admin-subtitle">Manage user roles and permissions</p>
      </div>

      {error && (
        <div className="admin-error" style={{ marginBottom: '1rem' }}>
          {error}
          <button onClick={() => setError('')} style={{ marginLeft: '1rem' }}>Dismiss</button>
        </div>
      )}

      <div className="role-legend">
        <div className="legend-item">
          <span className="role-badge portfolio">Portfolio</span>
          <span>Full access to all data including financial amounts</span>
        </div>
        <div className="legend-item">
          <span className="role-badge analyst">Analyst</span>
          <span>Restricted: Cannot see invested amounts, portfolio value, quantity, or absolute gains</span>
        </div>
      </div>

      {loading ? (
        <div className="admin-loading">Loading users...</div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Registered</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className={user.email === 'aditya@saguncapital.com' ? 'admin-row' : ''}>
                  <td>{user.name || '-'}</td>
                  <td>
                    {user.email}
                    {user.email === 'aditya@saguncapital.com' && (
                      <span className="admin-badge">Admin</span>
                    )}
                  </td>
                  <td>
                    <span className={`role-badge ${user.role}`}>
                      {user.role}
                    </span>
                  </td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td>{formatDate(user.lastLoginAt)}</td>
                  <td>
                    {user.email === 'aditya@saguncapital.com' ? (
                      <span className="admin-protected">Protected</span>
                    ) : (
                      <select
                        value={user.role}
                        onChange={(e) => updateRole(user.email, e.target.value as 'portfolio' | 'analyst')}
                        disabled={updating === user.email}
                        className="role-select"
                      >
                        <option value="analyst">Analyst</option>
                        <option value="portfolio">Portfolio</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Allowed Emails Section */}
      <div className="admin-header" style={{ marginTop: '2.5rem' }}>
        <h2>Registration Allowlist</h2>
        <p className="admin-subtitle">Manage which emails can register for an account</p>
      </div>

      <form onSubmit={addAllowedEmail} className="add-email-form">
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="Enter email to allow registration"
          className="email-input"
          disabled={addingEmail}
        />
        <button type="submit" className="add-email-btn" disabled={addingEmail || !newEmail.trim()}>
          {addingEmail ? 'Adding...' : 'Add Email'}
        </button>
      </form>

      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Status</th>
              <th>Added</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {allowedEmails.map(item => {
              const isRegistered = users.some(u => u.email === item.email);
              return (
                <tr key={item.id}>
                  <td>{item.email}</td>
                  <td>
                    <span className={`status-badge ${isRegistered ? 'registered' : 'pending'}`}>
                      {isRegistered ? 'Registered' : 'Pending'}
                    </span>
                  </td>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>
                    {item.email === 'aditya@saguncapital.com' ? (
                      <span className="admin-protected">Protected</span>
                    ) : (
                      <button
                        onClick={() => removeAllowedEmail(item.email)}
                        className="remove-btn"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {allowedEmails.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--secondary-text-color)' }}>
                  No allowed emails configured
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .admin-panel {
          padding: 1.5rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .admin-header {
          margin-bottom: 1.5rem;
        }

        .admin-header h2 {
          color: var(--text-color);
          margin: 0 0 0.5rem 0;
          font-size: 1.5rem;
        }

        .admin-subtitle {
          color: var(--secondary-text-color);
          margin: 0;
          font-size: 0.9rem;
        }

        .admin-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid var(--loss-red);
          color: var(--loss-red);
          padding: 1rem;
          border-radius: 8px;
          text-align: center;
        }

        .admin-loading {
          text-align: center;
          color: var(--secondary-text-color);
          padding: 2rem;
        }

        .role-legend {
          display: flex;
          gap: 2rem;
          padding: 1rem;
          background: var(--card-bg-color);
          border-radius: 8px;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.85rem;
          color: var(--secondary-text-color);
        }

        .admin-table-container {
          overflow-x: auto;
          background: var(--card-bg-color);
          border-radius: 8px;
          border: 1px solid var(--border-color);
        }

        .admin-table {
          width: 100%;
          border-collapse: collapse;
        }

        .admin-table th,
        .admin-table td {
          padding: 0.875rem 1rem;
          text-align: left;
          border-bottom: 1px solid var(--border-color);
        }

        .admin-table th {
          background: var(--header-bg-color);
          color: var(--secondary-text-color);
          font-weight: 600;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .admin-table td {
          color: var(--text-color);
          font-size: 0.9rem;
        }

        .admin-table tbody tr:hover {
          background: var(--hover-bg-color);
        }

        .admin-row {
          background: rgba(59, 130, 246, 0.05);
        }

        .role-badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: capitalize;
        }

        .role-badge.portfolio {
          background: rgba(34, 197, 94, 0.15);
          color: var(--profit-green);
        }

        .role-badge.analyst {
          background: rgba(59, 130, 246, 0.15);
          color: #3b82f6;
        }

        .admin-badge {
          display: inline-block;
          margin-left: 0.5rem;
          padding: 0.15rem 0.5rem;
          background: rgba(234, 179, 8, 0.15);
          color: #eab308;
          border-radius: 8px;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .admin-protected {
          color: var(--secondary-text-color);
          font-style: italic;
          font-size: 0.85rem;
        }

        .role-select {
          padding: 0.4rem 0.75rem;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: var(--bg-color);
          color: var(--text-color);
          font-size: 0.85rem;
          cursor: pointer;
        }

        .role-select:hover {
          border-color: var(--accent-color);
        }

        .role-select:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .add-email-form {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .email-input {
          flex: 1;
          padding: 0.6rem 1rem;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: var(--bg-color);
          color: var(--text-color);
          font-size: 0.9rem;
        }

        .email-input:focus {
          outline: none;
          border-color: var(--accent-color);
        }

        .add-email-btn {
          padding: 0.6rem 1.25rem;
          background: var(--accent-color);
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
        }

        .add-email-btn:hover:not(:disabled) {
          opacity: 0.9;
        }

        .add-email-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .status-badge.registered {
          background: rgba(34, 197, 94, 0.15);
          color: var(--profit-green);
        }

        .status-badge.pending {
          background: rgba(234, 179, 8, 0.15);
          color: #eab308;
        }

        .remove-btn {
          padding: 0.3rem 0.75rem;
          background: rgba(239, 68, 68, 0.1);
          color: var(--loss-red);
          border: 1px solid var(--loss-red);
          border-radius: 6px;
          font-size: 0.8rem;
          cursor: pointer;
        }

        .remove-btn:hover {
          background: rgba(239, 68, 68, 0.2);
        }
      `}</style>
    </div>
  );
}
