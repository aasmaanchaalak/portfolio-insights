'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PipelineIdea, PipelineNote, PipelineStatus, PipelinePriority, GuidanceEntry } from '../../../types/pipeline';
import './pipeline.css';

const TEAM_MEMBERS = ['Aditya', 'Rahul', 'Priya', 'Vivek'];

const STATUSES: { value: PipelineStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'captured', label: 'Captured' },
  { value: 'triaged', label: 'Triaged' },
  { value: 'studying', label: 'Studying' },
  { value: 'tracking', label: 'Tracking' },
  { value: 'conviction', label: 'Conviction' },
  { value: 'exited_watch', label: 'Exited-Watch' },
  { value: 'killed', label: 'Killed' },
];

const DECISION_OPTIONS = [
  'Buy at target price',
  'Buy when capex live',
  'Buy after overhang removed',
  'Buy when milestone achieved',
  'Accumulate on dips',
  'Wait for results',
  'Rejected — kill',
  'Need more data',
  'Other',
];

const GUIDANCE_METRICS = ['Revenue', 'EBITDA', 'PAT', 'Market Cap', 'Sales Volume', 'Margin %', 'Other'];

const STATUS_LABEL: Record<PipelineStatus, string> = {
  captured: 'Captured',
  triaged: 'Triaged',
  studying: 'Studying',
  tracking: 'Tracking',
  conviction: 'Conviction',
  exited_watch: 'Exited-Watch',
  killed: 'Killed',
};

function fmt(n: number | null): string {
  if (n === null) return '—';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(a: number | null, b: number | null): string {
  if (!a || !b) return '—';
  return `${(((b - a) / a) * 100).toFixed(1)}%`;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// ───────────────────────── IDEA FORM MODAL ─────────────────────────

interface IdeaFormModalProps {
  open: boolean;
  idea?: PipelineIdea | null;
  onClose: () => void;
  onSaved: (idea: PipelineIdea) => void;
}

function IdeaFormModal({ open, idea, onClose, onSaved }: IdeaFormModalProps) {
  const editing = !!idea;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    ticker: '', companyName: '', addedBy: TEAM_MEMBERS[0], assignedTo: '',
    source: '', whyInteresting: '', priceAtAdd: '', status: 'captured' as PipelineStatus,
    priority: 'medium' as PipelinePriority, decision: '', decisionReason: '',
    triggerCondition: '', dateAdded: todayStr(),
  });

  useEffect(() => {
    if (idea) {
      setForm({
        ticker: idea.ticker,
        companyName: idea.companyName,
        addedBy: idea.addedBy,
        assignedTo: idea.assignedTo || '',
        source: idea.source || '',
        whyInteresting: idea.whyInteresting || '',
        priceAtAdd: idea.priceAtAdd?.toString() || '',
        status: idea.status,
        priority: idea.priority,
        decision: idea.decision || '',
        decisionReason: idea.decisionReason || '',
        triggerCondition: idea.triggerCondition || '',
        dateAdded: idea.dateAdded?.split('T')[0] || todayStr(),
      });
    } else {
      setForm({
        ticker: '', companyName: '', addedBy: TEAM_MEMBERS[0], assignedTo: '',
        source: '', whyInteresting: '', priceAtAdd: '', status: 'captured',
        priority: 'medium', decision: '', decisionReason: '', triggerCondition: '',
        dateAdded: todayStr(),
      });
    }
  }, [idea, open]);

  const handleTickerBlur = async () => {
    if (!form.ticker || form.priceAtAdd) return;
    try {
      const res = await fetch(`/api/pipeline/price?ticker=${encodeURIComponent(form.ticker)}`);
      const data = await res.json();
      if (data.price?.closePrice) {
        setForm(f => ({ ...f, priceAtAdd: String(data.price.closePrice) }));
      }
    } catch {}
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ticker || !form.companyName || !form.addedBy) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        assignedTo: form.assignedTo || null,
        source: form.source || null,
        whyInteresting: form.whyInteresting || null,
        priceAtAdd: form.priceAtAdd ? parseFloat(form.priceAtAdd) : null,
        decision: form.decision || null,
        decisionReason: form.decisionReason || null,
        triggerCondition: form.triggerCondition || null,
      };
      const url = editing ? `/api/pipeline/ideas/${idea!.id}` : '/api/pipeline/ideas';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Save failed');
      const data = await res.json();
      onSaved(data.idea);
      onClose();
    } catch (err) {
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className={`pipeline-modal-backdrop ${open ? 'open' : ''}`} onClick={onClose} aria-hidden />
      <div className={`pipeline-modal ${open ? 'open' : ''}`} role="dialog" aria-modal>
        <div className="pipeline-modal-header">
          <h2 className="pipeline-modal-title">{editing ? 'Edit Idea' : 'Add New Idea'}</h2>
          <button className="pipeline-modal-close" onClick={onClose} type="button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="pipeline-modal-body">
          <form onSubmit={handleSubmit}>
            <div className="pipeline-form-grid">
              <div className="pipeline-form-group">
                <label>Ticker *</label>
                <input value={form.ticker} onChange={set('ticker')} onBlur={handleTickerBlur}
                  placeholder="e.g. HDFCBANK" style={{ textTransform: 'uppercase' }} required />
              </div>
              <div className="pipeline-form-group">
                <label>Company Name *</label>
                <input value={form.companyName} onChange={set('companyName')} placeholder="e.g. HDFC Bank Ltd" required />
              </div>
              <div className="pipeline-form-group">
                <label>Added By *</label>
                <select value={form.addedBy} onChange={set('addedBy')}>
                  {TEAM_MEMBERS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="pipeline-form-group">
                <label>Assigned To</label>
                <select value={form.assignedTo} onChange={set('assignedTo')}>
                  <option value="">— Unassigned —</option>
                  {TEAM_MEMBERS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="pipeline-form-group">
                <label>Status</label>
                <select value={form.status} onChange={set('status')}>
                  {STATUSES.filter(s => s.value !== 'all').map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="pipeline-form-group">
                <label>Priority / Conviction</label>
                <select value={form.priority} onChange={set('priority')}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="pipeline-form-group">
                <label>Price at Add (₹)</label>
                <input type="number" step="0.01" value={form.priceAtAdd} onChange={set('priceAtAdd')} placeholder="CMP when logged" />
              </div>
              <div className="pipeline-form-group">
                <label>Date Added</label>
                <input type="date" value={form.dateAdded} onChange={set('dateAdded')} />
              </div>
              <div className="pipeline-form-group pipeline-form-full">
                <label>Source</label>
                <input value={form.source} onChange={set('source')} placeholder="e.g. Network — Rahul mentioned, Screener scan, Saw Dolly Khanna buying…" />
              </div>
              <div className="pipeline-form-group pipeline-form-full">
                <label>Trigger Condition</label>
                <input value={form.triggerCondition} onChange={set('triggerCondition')} placeholder="e.g. Buy below ₹450, Q2 results out, capex commissioning confirmed…" />
              </div>
              <div className="pipeline-form-group">
                <label>Decision</label>
                <select value={form.decision} onChange={set('decision')}>
                  <option value="">— Not decided —</option>
                  {DECISION_OPTIONS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="pipeline-form-group pipeline-form-full">
                <label>Why Interesting</label>
                <textarea value={form.whyInteresting} onChange={set('whyInteresting')} rows={3} placeholder="Quick thesis — what's the angle?" />
              </div>
              <div className="pipeline-form-group pipeline-form-full">
                <label>Decision Rationale</label>
                <textarea value={form.decisionReason} onChange={set('decisionReason')} rows={2} placeholder="What convinced or deterred you?" />
              </div>
            </div>
            <div className="pipeline-form-actions">
              <button type="button" className="pipeline-btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="pipeline-btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Idea'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ───────────────────────── IDEA DETAIL MODAL ─────────────────────────

interface IdeaDetailModalProps {
  open: boolean;
  idea: PipelineIdea | null;
  onClose: () => void;
  onEdit: (idea: PipelineIdea) => void;
  onDeleted: (id: string) => void;
}

function IdeaDetailModal({ open, idea, onClose, onEdit, onDeleted }: IdeaDetailModalProps) {
  const [notes, setNotes] = useState<PipelineNote[]>([]);
  const [noteInput, setNoteInput] = useState('');
  const [noteAuthor, setNoteAuthor] = useState(TEAM_MEMBERS[0]);
  const [savingNote, setSavingNote] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!idea || !open) return;
    fetch(`/api/pipeline/ideas/${idea.id}/notes`)
      .then(r => r.json())
      .then(d => setNotes(d.notes || []))
      .catch(() => {});
  }, [idea, open]);

  const addNote = async () => {
    if (!noteInput.trim() || !idea) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/pipeline/ideas/${idea.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteText: noteInput.trim(), addedBy: noteAuthor }),
      });
      const data = await res.json();
      setNotes(prev => [data.note, ...prev]);
      setNoteInput('');
    } finally {
      setSavingNote(false);
    }
  };

  const removeNote = async (noteId: string) => {
    await fetch(`/api/pipeline/notes/${noteId}`, { method: 'DELETE' });
    setNotes(prev => prev.filter(n => n.id !== noteId));
  };

  const handleDelete = async () => {
    if (!idea || !confirm(`Delete ${idea.ticker}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/pipeline/ideas/${idea.id}`, { method: 'DELETE' });
      onDeleted(idea.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  if (!idea) return null;

  const pct = idea.priceAtAdd && idea.currentPrice
    ? (((idea.currentPrice - idea.priceAtAdd) / idea.priceAtAdd) * 100)
    : null;
  const days = daysSince(idea.statusChangedDate);

  return (
    <>
      <div className={`pipeline-modal-backdrop ${open ? 'open' : ''}`} onClick={onClose} aria-hidden />
      <div className={`pipeline-modal ${open ? 'open' : ''}`} role="dialog" aria-modal>
        <div className="pipeline-modal-header">
          <h2 className="pipeline-modal-title">{idea.ticker} — {idea.companyName}</h2>
          <button className="pipeline-modal-close" onClick={onClose} type="button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="pipeline-modal-body">
          {/* Header */}
          <div className="pipeline-detail-header">
            <div className="pipeline-detail-ticker-row">
              <span className="pipeline-detail-ticker">{idea.ticker}</span>
              <span className={`pipeline-status-badge ${idea.status}`}>{STATUS_LABEL[idea.status]}</span>
              <span className="pipeline-priority">
                <span className={`pipeline-priority-dot ${idea.priority}`} />
                {idea.priority.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="pipeline-detail-price-row">
              <span><span className="label">Added at</span>{fmt(idea.priceAtAdd)}</span>
              <span><span className="label">Current</span>{fmt(idea.currentPrice)}</span>
              {pct !== null && (
                <span className={pct >= 0 ? 'pipeline-change-pos' : 'pipeline-change-neg'}>
                  {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                </span>
              )}
              <span className={days > 30 ? 'pipeline-days-warn' : ''}>
                {days}d in {STATUS_LABEL[idea.status]}
              </span>
            </div>
            <div className="pipeline-detail-meta">
              <span>Added by: {idea.addedBy}</span>
              {idea.assignedTo && <span>Assigned to: {idea.assignedTo}</span>}
              <span>Date: {idea.dateAdded?.split('T')[0] || '—'}</span>
            </div>
          </div>

          {/* Source */}
          {idea.source && (
            <div className="pipeline-section">
              <h4>Source</h4>
              <p>{idea.source}</p>
            </div>
          )}

          {/* Why interesting */}
          {idea.whyInteresting && (
            <div className="pipeline-section">
              <h4>Why Interesting</h4>
              <p>{idea.whyInteresting}</p>
            </div>
          )}

          {/* Trigger */}
          <div className="pipeline-section">
            <h4>Trigger Condition</h4>
            {idea.triggerCondition
              ? <div className="pipeline-trigger-box">{idea.triggerCondition}</div>
              : <p className="pipeline-muted">No trigger set</p>}
          </div>

          {/* Decision */}
          {(idea.decision || idea.decisionReason) && (
            <div className="pipeline-section">
              <h4>Decision</h4>
              {idea.decision && <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{idea.decision}</p>}
              {idea.decisionReason && <p>{idea.decisionReason}</p>}
            </div>
          )}

          {/* Notes */}
          <div className="pipeline-section">
            <h4>Notes</h4>
            <div className="pipeline-notes-input-row">
              <input
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), addNote())}
                placeholder="Add a note… (Enter to submit)"
              />
              <select value={noteAuthor} onChange={e => setNoteAuthor(e.target.value)} className="pipeline-filter-select" style={{ minWidth: 90 }}>
                {TEAM_MEMBERS.map(m => <option key={m}>{m}</option>)}
              </select>
              <button className="pipeline-btn-primary" onClick={addNote} disabled={savingNote || !noteInput.trim()} type="button">
                Add
              </button>
            </div>
            {notes.length === 0
              ? <p className="pipeline-muted">No notes yet</p>
              : notes.map(n => (
                <div key={n.id} className="pipeline-note-item">
                  <p className="pipeline-note-text">{n.noteText}</p>
                  <div className="pipeline-note-meta">
                    <span>{n.addedBy} · {new Date(n.createdAt).toLocaleDateString()}</span>
                    <button className="pipeline-note-delete" onClick={() => removeNote(n.id)} type="button">Delete</button>
                  </div>
                </div>
              ))}
          </div>

          {/* Footer */}
          <div className="pipeline-detail-footer">
            <button className="pipeline-btn-danger" onClick={handleDelete} disabled={deleting} type="button">
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <button className="pipeline-btn-primary" onClick={() => { onClose(); onEdit(idea); }} type="button">
              Edit
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ───────────────────────── GUIDANCE TRACKER ─────────────────────────

function GuidanceTracker() {
  const [entries, setEntries] = useState<GuidanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ticker: '', companyName: '', metric: 'Revenue', guidedValue: '', guidedUnit: 'Cr', currentValue: '', timeframe: '', sourceContext: '' });
  const [saving, setSaving] = useState(false);
  const pendingUpdates = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    fetch('/api/pipeline/guidance')
      .then(r => r.json())
      .then(d => setEntries(d.guidance || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ticker || !form.companyName || !form.metric) return;
    setSaving(true);
    try {
      const res = await fetch('/api/pipeline/guidance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          guidedValue: form.guidedValue ? parseFloat(form.guidedValue) : null,
          currentValue: form.currentValue ? parseFloat(form.currentValue) : null,
        }),
      });
      const data = await res.json();
      setEntries(prev => [...prev, data.guidance]);
      setForm({ ticker: '', companyName: '', metric: 'Revenue', guidedValue: '', guidedUnit: 'Cr', currentValue: '', timeframe: '', sourceContext: '' });
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCurrentValueChange = (id: string, value: string) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, currentValue: value === '' ? null : parseFloat(value) } : e));
    clearTimeout(pendingUpdates.current[id]);
    pendingUpdates.current[id] = setTimeout(async () => {
      await fetch(`/api/pipeline/guidance/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentValue: value === '' ? null : parseFloat(value) }),
      });
    }, 800);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this guidance entry?')) return;
    await fetch(`/api/pipeline/guidance/${id}`, { method: 'DELETE' });
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const progressClass = (current: number | null, guided: number | null) => {
    if (!current || !guided) return 'behind';
    const ratio = current / guided;
    if (ratio >= 0.8) return 'good';
    if (ratio >= 0.5) return 'ok';
    return 'behind';
  };

  if (loading) return <div className="pipeline-empty">Loading…</div>;

  return (
    <div>
      {showForm ? (
        <div className="guidance-add-form">
          <form onSubmit={handleAdd}>
            <div className="pipeline-form-grid" style={{ marginBottom: '0.875rem' }}>
              <div className="pipeline-form-group">
                <label>Ticker *</label>
                <input value={form.ticker} onChange={set('ticker')} placeholder="NSE symbol" required style={{ textTransform: 'uppercase' }} />
              </div>
              <div className="pipeline-form-group">
                <label>Company Name *</label>
                <input value={form.companyName} onChange={set('companyName')} placeholder="Company name" required />
              </div>
              <div className="pipeline-form-group">
                <label>Metric *</label>
                <select value={form.metric} onChange={set('metric')}>
                  {GUIDANCE_METRICS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="pipeline-form-group">
                <label>Timeframe</label>
                <input value={form.timeframe} onChange={set('timeframe')} placeholder="e.g. FY27, Q3FY26" />
              </div>
              <div className="pipeline-form-group">
                <label>Guided Value</label>
                <input type="number" step="0.01" value={form.guidedValue} onChange={set('guidedValue')} placeholder="e.g. 5000" />
              </div>
              <div className="pipeline-form-group">
                <label>Unit</label>
                <select value={form.guidedUnit} onChange={set('guidedUnit')}>
                  {['Cr', '%', 'units', 'mn', 'bn', ''].map(u => <option key={u} value={u}>{u || '—'}</option>)}
                </select>
              </div>
              <div className="pipeline-form-group">
                <label>Current Value</label>
                <input type="number" step="0.01" value={form.currentValue} onChange={set('currentValue')} placeholder="Latest actual" />
              </div>
              <div className="pipeline-form-group pipeline-form-full">
                <label>Notes / Context</label>
                <input value={form.sourceContext} onChange={set('sourceContext')} placeholder="When/where guided, any caveats" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="pipeline-btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="pipeline-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add Entry'}</button>
            </div>
          </form>
        </div>
      ) : (
        <button className="guidance-add-btn" onClick={() => setShowForm(true)}>+ Add Guidance Entry</button>
      )}

      {entries.length === 0 ? (
        <div className="pipeline-empty">No guidance entries yet. Add one to start tracking.</div>
      ) : (
        <div className="guidance-table-wrap">
          <table className="guidance-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Metric</th>
                <th>Timeframe</th>
                <th>Guided</th>
                <th>Current</th>
                <th>Gap %</th>
                <th>Progress</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => {
                const gap = e.guidedValue && e.currentValue
                  ? (((e.currentValue - e.guidedValue) / e.guidedValue) * 100)
                  : null;
                const pct = e.guidedValue && e.currentValue
                  ? Math.min(100, (e.currentValue / e.guidedValue) * 100)
                  : 0;
                return (
                  <tr key={e.id}>
                    <td>
                      <div className="guidance-ticker">{e.ticker}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--secondary-text-color)' }}>{e.companyName}</div>
                    </td>
                    <td><span className="guidance-metric-badge">{e.metric}</span></td>
                    <td>{e.timeframe ? <span className="guidance-timeframe">{e.timeframe}</span> : '—'}</td>
                    <td style={{ fontFamily: 'monospace' }}>
                      {e.guidedValue !== null ? `${e.guidedValue.toLocaleString('en-IN')} ${e.guidedUnit || ''}`.trim() : '—'}
                    </td>
                    <td>
                      <input
                        className="guidance-current-input"
                        type="number"
                        step="0.01"
                        value={e.currentValue ?? ''}
                        onChange={ev => handleCurrentValueChange(e.id, ev.target.value)}
                        placeholder="—"
                      />
                    </td>
                    <td>
                      {gap !== null
                        ? <span className={gap >= 0 ? 'guidance-gap-pos' : 'guidance-gap-neg'}>{gap >= 0 ? '+' : ''}{gap.toFixed(1)}%</span>
                        : '—'}
                    </td>
                    <td>
                      {e.guidedValue ? (
                        <div className="guidance-progress-bar-wrap">
                          <div
                            className={`guidance-progress-bar-fill ${progressClass(e.currentValue, e.guidedValue)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      ) : '—'}
                    </td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8125rem', color: 'var(--secondary-text-color)' }}>
                      {e.sourceContext || '—'}
                    </td>
                    <td>
                      <button className="guidance-delete-btn" onClick={() => handleDelete(e.id)} title="Delete" type="button">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── MAIN PAGE ─────────────────────────

type SortKey = 'ticker' | 'priority' | 'pctChange' | 'daysInStatus' | 'dateAdded';
type SortDir = 'asc' | 'desc';

export function PipelinePage() {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'guidance'>('pipeline');
  const [ideas, setIdeas] = useState<PipelineIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<PipelineStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<PipelinePriority | 'all'>('all');
  const [personFilter, setPersonFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('dateAdded');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingIdea, setEditingIdea] = useState<PipelineIdea | null>(null);
  const [detailIdea, setDetailIdea] = useState<PipelineIdea | null>(null);

  const fetchIdeas = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline/ideas');
      const data = await res.json();
      setIdeas(data.ideas || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchIdeas(); }, [fetchIdeas]);

  const handleSaved = (idea: PipelineIdea) => {
    setIdeas(prev => {
      const idx = prev.findIndex(i => i.id === idea.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = idea;
        return next;
      }
      return [idea, ...prev];
    });
  };

  const handleDeleted = (id: string) => setIdeas(prev => prev.filter(i => i.id !== id));

  const handleEdit = (idea: PipelineIdea) => {
    setEditingIdea(idea);
    setShowAddModal(true);
  };

  const counts = STATUSES.reduce((acc, s) => {
    acc[s.value] = s.value === 'all' ? ideas.length : ideas.filter(i => i.status === s.value).length;
    return acc;
  }, {} as Record<string, number>);

  const filtered = ideas.filter(i => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && i.priority !== priorityFilter) return false;
    if (personFilter !== 'all' && i.addedBy !== personFilter && i.assignedTo !== personFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!i.ticker.toLowerCase().includes(q) && !i.companyName.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    let diff = 0;
    if (sortKey === 'ticker') diff = a.ticker.localeCompare(b.ticker);
    else if (sortKey === 'priority') {
      const order: Record<PipelinePriority, number> = { high: 0, medium: 1, low: 2 };
      diff = order[a.priority] - order[b.priority];
    } else if (sortKey === 'pctChange') {
      const pa = a.priceAtAdd && a.currentPrice ? ((a.currentPrice - a.priceAtAdd) / a.priceAtAdd) : 0;
      const pb = b.priceAtAdd && b.currentPrice ? ((b.currentPrice - b.priceAtAdd) / b.priceAtAdd) : 0;
      diff = pa - pb;
    } else if (sortKey === 'daysInStatus') {
      diff = daysSince(a.statusChangedDate) - daysSince(b.statusChangedDate);
    } else if (sortKey === 'dateAdded') {
      diff = new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime();
    }
    return sortDir === 'asc' ? diff : -diff;
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sortIndicator = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const conviction = ideas.filter(i => i.status === 'conviction').length;

  const allPersons = Array.from(new Set(ideas.flatMap(i => [i.addedBy, i.assignedTo].filter(Boolean) as string[])));

  return (
    <div className="pipeline-page">
      {/* Header */}
      <div className="pipeline-header">
        <div className="pipeline-header-left">
          <h1>Investment Pipeline</h1>
          <p className="pipeline-subtitle">{ideas.length} ideas tracked · {conviction} in conviction list</p>
        </div>
        {activeTab === 'pipeline' && (
          <button className="pipeline-add-btn" onClick={() => { setEditingIdea(null); setShowAddModal(true); }}>
            + New Idea
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="pipeline-tabs">
        <button className={`pipeline-tab-btn ${activeTab === 'pipeline' ? 'active' : ''}`} onClick={() => setActiveTab('pipeline')}>
          Pipeline
        </button>
        <button className={`pipeline-tab-btn ${activeTab === 'guidance' ? 'active' : ''}`} onClick={() => setActiveTab('guidance')}>
          Guidance Tracker
        </button>
      </div>

      {activeTab === 'guidance' ? (
        <GuidanceTracker />
      ) : (
        <>
          {/* Status Pills */}
          <div className="pipeline-status-pills">
            {STATUSES.map(s => (
              <button
                key={s.value}
                className={`pipeline-pill ${statusFilter === s.value ? 'active' : ''}`}
                data-status={s.value}
                onClick={() => setStatusFilter(s.value as PipelineStatus | 'all')}
              >
                {s.label} ({counts[s.value] ?? 0})
              </button>
            ))}
          </div>

          {/* Filter Bar */}
          <div className="pipeline-filter-bar">
            <input
              className="pipeline-search"
              placeholder="Search ticker or company…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className="pipeline-filter-select" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as any)}>
              <option value="all">All Priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select className="pipeline-filter-select" value={personFilter} onChange={e => setPersonFilter(e.target.value)}>
              <option value="all">All People</option>
              {allPersons.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>

          {/* Table */}
          {loading ? (
            <div className="pipeline-empty">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="pipeline-empty">
              {ideas.length === 0 ? 'No ideas yet. Click "+ New Idea" to add one.' : 'No ideas match the current filters.'}
            </div>
          ) : (
            <div className="pipeline-table-wrap">
              <table className="pipeline-table">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort('ticker')}>Ticker / Company{sortIndicator('ticker')}</th>
                    <th>Status</th>
                    <th onClick={() => toggleSort('priority')}>Priority{sortIndicator('priority')}</th>
                    <th>Added By</th>
                    <th>Assigned To</th>
                    <th>Source</th>
                    <th>Price at Add</th>
                    <th>Current Price</th>
                    <th onClick={() => toggleSort('pctChange')}>% Change{sortIndicator('pctChange')}</th>
                    <th onClick={() => toggleSort('daysInStatus')}>Days in Status{sortIndicator('daysInStatus')}</th>
                    <th onClick={() => toggleSort('dateAdded')}>Added{sortIndicator('dateAdded')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(idea => {
                    const pct = idea.priceAtAdd && idea.currentPrice
                      ? (((idea.currentPrice - idea.priceAtAdd) / idea.priceAtAdd) * 100)
                      : null;
                    const days = daysSince(idea.statusChangedDate);
                    return (
                      <tr key={idea.id} onClick={() => setDetailIdea(idea)}>
                        <td>
                          <div className="pipeline-ticker">{idea.ticker}</div>
                          <div className="pipeline-company-name">{idea.companyName}</div>
                        </td>
                        <td><span className={`pipeline-status-badge ${idea.status}`}>{STATUS_LABEL[idea.status]}</span></td>
                        <td>
                          <span className="pipeline-priority">
                            <span className={`pipeline-priority-dot ${idea.priority}`} />
                            {idea.priority.charAt(0).toUpperCase()}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8125rem' }}>{idea.addedBy}</td>
                        <td style={{ fontSize: '0.8125rem' }}>{idea.assignedTo || '—'}</td>
                        <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8125rem', color: 'var(--secondary-text-color)' }}>
                          {idea.source || '—'}
                        </td>
                        <td className="pipeline-price">{fmt(idea.priceAtAdd)}</td>
                        <td className="pipeline-price" style={{ fontWeight: 700 }}>{fmt(idea.currentPrice)}</td>
                        <td>
                          {pct !== null
                            ? <span className={pct >= 0 ? 'pipeline-change-pos' : 'pipeline-change-neg'}>{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</span>
                            : '—'}
                        </td>
                        <td className={days > 30 ? 'pipeline-days-warn' : ''}>{days}d</td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--secondary-text-color)', whiteSpace: 'nowrap' }}>
                          {idea.dateAdded?.split('T')[0] || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <IdeaFormModal
        open={showAddModal}
        idea={editingIdea}
        onClose={() => { setShowAddModal(false); setEditingIdea(null); }}
        onSaved={handleSaved}
      />
      <IdeaDetailModal
        open={!!detailIdea}
        idea={detailIdea}
        onClose={() => setDetailIdea(null)}
        onEdit={idea => { setDetailIdea(null); handleEdit(idea); }}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
