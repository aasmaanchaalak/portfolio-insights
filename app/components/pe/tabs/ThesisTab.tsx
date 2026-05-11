'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AttachmentSection } from '../../shared/AttachmentSection';
import {
  PECompany,
  PECommunication,
  CommunicationType,
  CreatePECommunicationRequest,
  ThesisStatus,
  UpdatePEThesisRequest,
} from '../../../../types/pe';
import { useAuth } from '../../../contexts/AuthContext';

interface ThesisTabProps {
  companyId: string;
  company: PECompany;
  onCompanyUpdated: (company: PECompany) => void;
}

const COMMUNICATION_TYPES: { value: CommunicationType; label: string; icon: string }[] = [
  { value: 'email', label: 'Email', icon: '📧' },
  { value: 'call', label: 'Call', icon: '📞' },
  { value: 'meeting', label: 'Meeting', icon: '🤝' },
  { value: 'site_visit', label: 'Site Visit', icon: '🏭' },
  { value: 'board_meeting', label: 'Board Meeting', icon: '👔' },
  { value: 'document_received', label: 'Document Received', icon: '📄' },
  { value: 'note', label: 'Note', icon: '📝' },
  { value: 'other', label: 'Other', icon: '💬' },
];

const STATUS_OPTIONS: { value: ThesisStatus; label: string; color: string }[] = [
  { value: 'intact', label: 'Intact', color: 'var(--positive-color)' },
  { value: 'monitor', label: 'Monitor', color: 'var(--warning-color)' },
  { value: 'broken', label: 'Broken', color: 'var(--negative-color)' },
];

export function ThesisTab({ companyId, company, onCompanyUpdated }: ThesisTabProps) {
  const { isAdmin } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<UpdatePEThesisRequest>({
    status: company.thesisStatus || 'intact',
    originalThesis: company.originalThesis || '',
    keyDrivers: company.keyDrivers || '',
    latestNote: company.latestNote || '',
  });
  const [editConditions, setEditConditions] = useState<{
    id?: string;
    condition: string;
    isTriggered: boolean;
    sortOrder: number;
  }[]>([]);

  // Communications state
  const [communications, setCommunications] = useState<PECommunication[]>([]);
  const [isLoadingComms, setIsLoadingComms] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSavingComm, setIsSavingComm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quickNote, setQuickNote] = useState('');
  const [isAddingQuickNote, setIsAddingQuickNote] = useState(false);
  const [newComm, setNewComm] = useState<CreatePECommunicationRequest>({
    communicationType: 'note',
    subject: '',
    summary: '',
    detailedNotes: '',
    communicationDate: new Date().toISOString().split('T')[0],
    participants: '',
    followUpRequired: false,
    followUpDate: '',
    followUpNotes: '',
  });

  const fetchCommunications = useCallback(async () => {
    setIsLoadingComms(true);
    try {
      const response = await fetch(`/api/pe/${companyId}/communications`);
      if (response.ok) {
        const data = await response.json();
        setCommunications(data.communications || []);
      }
    } catch (err) {
      console.error('Error fetching communications:', err);
    } finally {
      setIsLoadingComms(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchCommunications();
  }, [fetchCommunications]);

  const handleEdit = () => {
    setFormData({
      status: company.thesisStatus || 'intact',
      originalThesis: company.originalThesis || '',
      keyDrivers: company.keyDrivers || '',
      latestNote: company.latestNote || '',
    });
    setEditConditions(
      (company.breakConditions ?? []).map(c => ({
        id: c.id,
        condition: c.condition,
        isTriggered: c.isTriggered,
        sortOrder: c.sortOrder,
      }))
    );
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/pe/${companyId}/thesis`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, breakConditions: editConditions }),
      });
      if (!response.ok) throw new Error('Failed to save');
      const data = await response.json();
      onCompanyUpdated(data.company);
      setIsEditing(false);
    } catch (err) {
      console.error('Error saving thesis:', err);
      alert('Failed to save thesis');
    } finally {
      setIsSaving(false);
    }
  };

  const addCondition = () => {
    setEditConditions(prev => [...prev, { condition: '', isTriggered: false, sortOrder: prev.length }]);
  };

  const removeCondition = (index: number) => {
    setEditConditions(prev => prev.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, field: string, value: any) => {
    setEditConditions(prev => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  const getStatusClass = (status: ThesisStatus | null | undefined) => {
    switch (status) {
      case 'intact': return 'pe-thesis-status-intact';
      case 'monitor': return 'pe-thesis-status-monitor';
      case 'broken': return 'pe-thesis-status-broken';
      default: return '';
    }
  };

  const handleAddCommunication = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingComm(true);
    try {
      const response = await fetch(`/api/pe/${companyId}/communications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newComm,
          communicationDate: newComm.communicationDate
            ? new Date(newComm.communicationDate).toISOString()
            : new Date().toISOString(),
        }),
      });
      if (!response.ok) throw new Error('Failed to add communication');
      const data = await response.json();
      setCommunications(prev => [data.communication, ...prev]);
      setShowAddForm(false);
      setNewComm({
        communicationType: 'note', subject: '', summary: '', detailedNotes: '',
        communicationDate: new Date().toISOString().split('T')[0],
        participants: '', followUpRequired: false, followUpDate: '', followUpNotes: '',
      });
    } catch (err) {
      console.error('Error adding communication:', err);
      alert('Failed to add communication');
    } finally {
      setIsSavingComm(false);
    }
  };

  const handleQuickNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickNote.trim()) return;
    setIsAddingQuickNote(true);
    try {
      const response = await fetch(`/api/pe/${companyId}/communications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communicationType: 'note', summary: quickNote.trim(), communicationDate: new Date().toISOString() }),
      });
      if (!response.ok) throw new Error('Failed to add note');
      const data = await response.json();
      setCommunications(prev => [data.communication, ...prev]);
      setQuickNote('');
    } catch (err) {
      console.error('Error adding quick note:', err);
      alert('Failed to add note');
    } finally {
      setIsAddingQuickNote(false);
    }
  };

  const handleDeleteComm = async (communicationId: string) => {
    if (!confirm('Are you sure you want to delete this communication?')) return;
    try {
      const response = await fetch(`/api/pe/${companyId}/communications?communicationId=${communicationId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete communication');
      setCommunications(prev => prev.filter(c => c.id !== communicationId));
    } catch (err) {
      console.error('Error deleting communication:', err);
      alert('Failed to delete communication');
    }
  };

  const getTypeInfo = (type: CommunicationType) => COMMUNICATION_TYPES.find(t => t.value === type) || COMMUNICATION_TYPES[7];

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const hasThesis = !!(company.thesisStatus || company.originalThesis);

  if (!hasThesis && !isEditing) {
    return (
      <div className="pe-thesis-empty">
        <div className="pe-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3>No Thesis Recorded</h3>
        <p>Create an investment thesis to track your conviction and key drivers.</p>
        <button className="pe-btn-primary" onClick={handleEdit} type="button">Create Thesis</button>
        <AttachmentSection module="pe" entityId={companyId} />
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="pe-thesis-edit">
        <div className="pe-form-group">
          <label>Status</label>
          <div className="pe-status-selector">
            {STATUS_OPTIONS.map(opt => (
              <button key={opt.value} type="button"
                className={`pe-status-option ${formData.status === opt.value ? 'selected' : ''}`}
                style={{ '--status-color': opt.color } as React.CSSProperties}
                onClick={() => setFormData(prev => ({ ...prev, status: opt.value }))}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pe-form-group">
          <label>Original Thesis</label>
          <textarea value={formData.originalThesis || ''} onChange={e => setFormData(prev => ({ ...prev, originalThesis: e.target.value }))} placeholder="What is your investment thesis?" rows={4} />
        </div>

        <div className="pe-form-group">
          <label>Key Drivers</label>
          <textarea value={formData.keyDrivers || ''} onChange={e => setFormData(prev => ({ ...prev, keyDrivers: e.target.value }))} placeholder="What are the key value drivers? (one per line)" rows={3} />
        </div>

        <div className="pe-form-group">
          <label>Latest Note</label>
          <textarea value={formData.latestNote || ''} onChange={e => setFormData(prev => ({ ...prev, latestNote: e.target.value }))} placeholder="Any recent observations or updates?" rows={2} />
        </div>

        <div className="pe-break-conditions-section">
          <div className="pe-section-header">
            <label>Break Conditions</label>
            <button type="button" className="pe-add-condition-btn" onClick={addCondition}>+ Add Condition</button>
          </div>
          {editConditions.length === 0 ? (
            <p className="pe-muted">No break conditions defined</p>
          ) : (
            <div className="pe-conditions-list">
              {editConditions.map((condition, index) => (
                <div key={index} className="pe-condition-edit">
                  <input type="checkbox" checked={condition.isTriggered} onChange={e => updateCondition(index, 'isTriggered', e.target.checked)} />
                  <input type="text" value={condition.condition} onChange={e => updateCondition(index, 'condition', e.target.value)} placeholder="Define break condition..." />
                  <button type="button" className="pe-remove-condition-btn" onClick={() => removeCondition(index)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pe-form-actions">
          <button type="button" className="pe-btn-secondary" onClick={() => setIsEditing(false)} disabled={isSaving}>Cancel</button>
          <button type="button" className="pe-btn-primary" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Thesis'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pe-thesis-view">
      <div className="pe-thesis-header">
        <span className={`pe-thesis-status ${getStatusClass(company.thesisStatus)}`}>
          {company.thesisStatus?.toUpperCase() || 'NOT SET'}
        </span>
        <button className="pe-edit-btn" onClick={handleEdit} type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Edit
        </button>
      </div>

      <div className="pe-thesis-section">
        <h4>Investment Thesis</h4>
        <p className="pe-thesis-text">{company.originalThesis || 'No thesis recorded'}</p>
      </div>

      {company.keyDrivers && (
        <div className="pe-thesis-section">
          <h4>Key Drivers</h4>
          <div className="pe-drivers-list">
            {company.keyDrivers.split('\n').filter(d => d.trim()).map((driver, i) => (
              <div key={i} className="pe-driver-item">
                <span className="pe-driver-bullet">•</span>
                {driver.trim()}
              </div>
            ))}
          </div>
        </div>
      )}

      {(company.breakConditions ?? []).length > 0 && (
        <div className="pe-thesis-section">
          <h4>Break Conditions</h4>
          <div className="pe-conditions-view">
            {(company.breakConditions ?? []).map(condition => (
              <div key={condition.id} className={`pe-condition-item ${condition.isTriggered ? 'triggered' : ''}`}>
                <span className="pe-condition-check">{condition.isTriggered ? '⚠️' : '○'}</span>
                <span className="pe-condition-text">{condition.condition}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {company.latestNote && (
        <div className="pe-thesis-section">
          <h4>Latest Note</h4>
          <p className="pe-thesis-note">{company.latestNote}</p>
        </div>
      )}

      {company.lastReviewDate && (
        <p className="pe-last-review">Last reviewed: {new Date(company.lastReviewDate).toLocaleDateString()}</p>
      )}

      <AttachmentSection module="pe" entityId={companyId} />

      {/* Communications Section */}
      <div className="pe-thesis-section pe-communications-section">
        <div className="pe-section-header">
          <h4>Communication Timeline</h4>
          <button className="pe-add-btn-small" onClick={() => setShowAddForm(true)} type="button">+ Detailed Entry</button>
        </div>

        <form onSubmit={handleQuickNote} className="pe-quick-note-form">
          <input type="text" value={quickNote} onChange={e => setQuickNote(e.target.value)} placeholder="Add a quick note..." className="pe-quick-note-input" disabled={isAddingQuickNote} />
          <button type="submit" className="pe-quick-note-btn" disabled={isAddingQuickNote || !quickNote.trim()}>{isAddingQuickNote ? '...' : 'Add'}</button>
        </form>

        {showAddForm && (
          <div className="pe-add-comm-form">
            <form onSubmit={handleAddCommunication}>
              <div className="pe-form-row">
                <div className="pe-form-group">
                  <label>Type</label>
                  <select value={newComm.communicationType} onChange={e => setNewComm(prev => ({ ...prev, communicationType: e.target.value as CommunicationType }))}>
                    {COMMUNICATION_TYPES.map(type => <option key={type.value} value={type.value}>{type.icon} {type.label}</option>)}
                  </select>
                </div>
                <div className="pe-form-group">
                  <label>Date</label>
                  <input type="date" value={newComm.communicationDate} onChange={e => setNewComm(prev => ({ ...prev, communicationDate: e.target.value }))} />
                </div>
              </div>
              <div className="pe-form-group">
                <label>Subject</label>
                <input type="text" value={newComm.subject || ''} onChange={e => setNewComm(prev => ({ ...prev, subject: e.target.value }))} placeholder="Brief subject line" />
              </div>
              <div className="pe-form-group">
                <label>Summary</label>
                <textarea value={newComm.summary || ''} onChange={e => setNewComm(prev => ({ ...prev, summary: e.target.value }))} placeholder="Key points and takeaways" rows={3} />
              </div>
              <div className="pe-form-group">
                <label>Detailed Notes</label>
                <textarea value={newComm.detailedNotes || ''} onChange={e => setNewComm(prev => ({ ...prev, detailedNotes: e.target.value }))} placeholder="Additional details..." rows={3} />
              </div>
              <div className="pe-form-group">
                <label>Participants</label>
                <input type="text" value={newComm.participants || ''} onChange={e => setNewComm(prev => ({ ...prev, participants: e.target.value }))} placeholder="e.g., John (CEO), Jane (CFO)" />
              </div>
              <div className="pe-followup-section">
                <div className="pe-checkbox-group">
                  <input type="checkbox" id="followUpRequired" checked={newComm.followUpRequired || false} onChange={e => setNewComm(prev => ({ ...prev, followUpRequired: e.target.checked }))} />
                  <label htmlFor="followUpRequired">Follow-up Required</label>
                </div>
                {newComm.followUpRequired && (
                  <div className="pe-form-row">
                    <div className="pe-form-group">
                      <label>Follow-up Date</label>
                      <input type="date" value={newComm.followUpDate || ''} onChange={e => setNewComm(prev => ({ ...prev, followUpDate: e.target.value }))} />
                    </div>
                    <div className="pe-form-group">
                      <label>Follow-up Notes</label>
                      <input type="text" value={newComm.followUpNotes || ''} onChange={e => setNewComm(prev => ({ ...prev, followUpNotes: e.target.value }))} placeholder="What needs to be done" />
                    </div>
                  </div>
                )}
              </div>
              <div className="pe-form-actions">
                <button type="button" className="pe-btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
                <button type="submit" className="pe-btn-primary" disabled={isSavingComm}>{isSavingComm ? 'Adding...' : 'Add Entry'}</button>
              </div>
            </form>
          </div>
        )}

        {isLoadingComms ? (
          <p className="pe-muted">Loading communications...</p>
        ) : communications.length === 0 ? (
          <p className="pe-muted pe-centered">No communications recorded yet</p>
        ) : (
          <div className="pe-timeline">
            {communications.map(comm => {
              const typeInfo = getTypeInfo(comm.communicationType);
              const isExpanded = expandedId === comm.id;
              const hasMoreDetails = !!(comm.detailedNotes || comm.participants || comm.followUpNotes || comm.createdBy);
              return (
                <div key={comm.id} className="pe-timeline-item">
                  <div className="pe-timeline-marker">
                    <span className="pe-timeline-icon">{typeInfo.icon}</span>
                    <div className="pe-timeline-line" />
                  </div>
                  <div
                    className={`pe-timeline-content ${hasMoreDetails ? 'pe-timeline-clickable' : ''}`}
                    onClick={hasMoreDetails ? () => setExpandedId(isExpanded ? null : comm.id) : undefined}
                  >
                    <div className="pe-timeline-header">
                      <div className="pe-timeline-main">
                        <span className="pe-timeline-type">{typeInfo.label}</span>
                        {comm.subject && <span className="pe-timeline-subject">{comm.subject}</span>}
                      </div>
                      <span className="pe-timeline-date">{formatDate(comm.communicationDate)}</span>
                    </div>
                    {comm.summary && <p className="pe-timeline-summary">{comm.summary}</p>}
                    {comm.followUpRequired && (
                      <div className="pe-followup-badge">⏰ Follow-up{comm.followUpDate && `: ${formatDate(comm.followUpDate)}`}</div>
                    )}
                    {hasMoreDetails && !isExpanded && (
                      <button
                        type="button"
                        className="pe-timeline-expand-hint"
                        onClick={e => { e.stopPropagation(); setExpandedId(comm.id); }}
                      >
                        ▾ Show more details
                      </button>
                    )}
                    {isExpanded && (
                      <div className="pe-timeline-expanded">
                        {comm.detailedNotes && <div className="pe-timeline-detail"><strong>Details:</strong><p>{comm.detailedNotes}</p></div>}
                        {comm.participants && <div className="pe-timeline-detail"><strong>Participants:</strong> {comm.participants}</div>}
                        {comm.followUpNotes && <div className="pe-timeline-detail"><strong>Follow-up:</strong> {comm.followUpNotes}</div>}
                        {comm.createdBy && <div className="pe-timeline-meta">Added by {comm.createdBy}</div>}
                        <div className="pe-timeline-actions">
                          <button
                            type="button"
                            className="pe-timeline-collapse"
                            onClick={e => { e.stopPropagation(); setExpandedId(null); }}
                          >
                            ▴ Hide
                          </button>
                          {isAdmin && (
                            <button className="pe-delete-btn-small" onClick={e => { e.stopPropagation(); handleDeleteComm(comm.id); }} type="button">Delete</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
