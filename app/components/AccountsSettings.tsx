'use client';

import { useEffect, useState } from 'react';

// Admin → Accounts. Lists the accounts ("Portfolio" names) in the latest PF
// upload; each gets an optional display name and a family office. The
// Portfolio page's account selector groups accounts by family office.

interface Row {
  portfolio: string;
  label: string;
  familyOffice: string;
  savedLabel: string;
  savedFamilyOffice: string;
}

export default function AccountsSettings() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/accounts')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d) {
          setRows((d.accounts || []).map((a: any) => ({
            portfolio: a.portfolio,
            label: a.label || '',
            familyOffice: a.familyOffice || '',
            savedLabel: a.label || '',
            savedFamilyOffice: a.familyOffice || '',
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const update = (portfolio: string, patch: Partial<Row>) =>
    setRows(rs => rs.map(r => (r.portfolio === portfolio ? { ...r, ...patch } : r)));

  const save = async (row: Row) => {
    setSaving(row.portfolio);
    setMsg('');
    try {
      const res = await fetch('/api/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio: row.portfolio, label: row.label, familyOffice: row.familyOffice }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save');
      }
      update(row.portfolio, { label: row.label.trim(), familyOffice: row.familyOffice.trim(), savedLabel: row.label.trim(), savedFamilyOffice: row.familyOffice.trim() });
      setMsg(`Saved ${row.label.trim() || row.portfolio} ✓`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(null);
    }
  };

  const familyOffices = [...new Set(rows.map(r => r.savedFamilyOffice).filter(Boolean))].sort();
  const unassigned = rows.filter(r => !r.savedFamilyOffice).length;

  return (
    <div className="admin-section" style={{ marginBottom: '2rem', padding: '1.25rem', background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
      <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 600 }}>Accounts &amp; Family Offices</h3>
      <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: 'var(--secondary-text-color)' }}>
        Accounts from the latest PF upload (the &quot;Portfolio&quot; column of a combined export). Put each one in a family office to
        view it on its own from the account selector on the Portfolio page.
        {unassigned > 0 && <> <strong>{unassigned} not in a family office yet.</strong></>}
      </p>
      {!loaded ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--secondary-text-color)' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--secondary-text-color)' }}>
          No accounts yet. Upload a combined PF export (one with a &quot;Portfolio&quot; column) on Data → PF Data.
        </p>
      ) : (
        <>
          <datalist id="family-office-options">
            {familyOffices.map(fo => <option key={fo} value={fo} />)}
          </datalist>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--secondary-text-color)' }}>
                  <th style={{ padding: '0.375rem 0.5rem', fontWeight: 600 }}>Account (as in PF export)</th>
                  <th style={{ padding: '0.375rem 0.5rem', fontWeight: 600 }}>Display name</th>
                  <th style={{ padding: '0.375rem 0.5rem', fontWeight: 600 }}>Family office</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const dirty = r.label.trim() !== r.savedLabel || r.familyOffice.trim() !== r.savedFamilyOffice;
                  return (
                    <tr key={r.portfolio} style={{ borderTop: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.375rem 0.5rem', whiteSpace: 'nowrap' }}>{r.portfolio}</td>
                      <td style={{ padding: '0.375rem 0.5rem' }}>
                        <input type="text" value={r.label} maxLength={255} placeholder={r.portfolio}
                          onChange={e => update(r.portfolio, { label: e.target.value })} style={{ width: '100%', minWidth: 140 }} />
                      </td>
                      <td style={{ padding: '0.375rem 0.5rem' }}>
                        <input type="text" value={r.familyOffice} maxLength={255} list="family-office-options" placeholder="e.g. Own FO"
                          onChange={e => update(r.portfolio, { familyOffice: e.target.value })} style={{ width: '100%', minWidth: 140 }} />
                      </td>
                      <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right' }}>
                        <button
                          onClick={() => save(r)}
                          disabled={!dirty || saving === r.portfolio}
                          style={{ padding: '0.3rem 0.75rem', background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: 600, cursor: dirty ? 'pointer' : 'default', opacity: !dirty || saving === r.portfolio ? 0.5 : 1 }}
                        >
                          {saving === r.portfolio ? 'Saving…' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {msg && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem', color: msg.includes('✓') ? 'var(--success-color)' : 'var(--error-color)' }}>{msg}</p>
          )}
        </>
      )}
    </div>
  );
}
