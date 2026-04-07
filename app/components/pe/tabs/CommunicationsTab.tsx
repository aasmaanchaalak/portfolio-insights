'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { PECommunication, CommunicationType, CreatePECommunicationRequest } from '../../../../types/pe';

interface CommunicationsTabProps {
  companyId: string;
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

export function CommunicationsTab({ companyId }: CommunicationsTabProps) {
  const [communications, setCommunications] = useState<PECommunication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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
    setIsLoading(true);
    try {
      const response = await fetch(`/api/pe/${companyId}/communications`);
      if (response.ok) {
        const data = await response.json();
        setCommunications(data.communications || []);
      }
    } catch (err) {
      console.error('Error fetching communications:', err);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchCommunications();
  }, [fetchCommunications]);

  const handleAddCommunication = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSaving(true);
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
    } catch (err) {
      console.error('Error adding communication:', err);
      alert('Failed to add communication');
    } finally {
      setIsSaving(false);
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
        body: JSON.stringify({
          communicationType: 'note',
          summary: quickNote.trim(),
          communicationDate: new Date().toISOString(),
        }),
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

  const handleDelete = async (communicationId: string) => {
    if (!confirm('Are you sure you want to delete this communication?')) return;

    try {
      const response = await fetch(
        `/api/pe/${companyId}/communications?communicationId=${communicationId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) throw new Error('Failed to delete communication');

      setCommunications(prev => prev.filter(c => c.id !== communicationId));
    } catch (err) {
      console.error('Error deleting communication:', err);
      alert('Failed to delete communication');
    }
  };

  const getTypeInfo = (type: CommunicationType) => {
    return COMMUNICATION_TYPES.find(t => t.value === type) || COMMUNICATION_TYPES[7];
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return <div className="pe-communications-loading">Loading communications...</div>;
  }

  return (
    <div className="pe-communications-tab">
      <div className="pe-section-header">
        <h3>Communication Timeline</h3>
        <button
          className="pe-add-btn-small"
          onClick={() => setShowAddForm(true)}
          type="button"
        >
          + Detailed Entry
        </button>
      </div>

      {/* Quick Note Input */}
      <form onSubmit={handleQuickNote} className="pe-quick-note-form">
        <input
          type="text"
          value={quickNote}
          onChange={e => setQuickNote(e.target.value)}
          placeholder="Add a quick note..."
          className="pe-quick-note-input"
          disabled={isAddingQuickNote}
        />
        <button
          type="submit"
          className="pe-quick-note-btn"
          disabled={isAddingQuickNote || !quickNote.trim()}
        >
          {isAddingQuickNote ? '...' : 'Add'}
        </button>
      </form>

      {/* Add Communication Form */}
      {showAddForm && (
        <div className="pe-add-comm-form">
          <form onSubmit={handleAddCommunication}>
            <div className="pe-form-row">
              <div className="pe-form-group">
                <label>Type</label>
                <select
                  value={newComm.communicationType}
                  onChange={e => setNewComm(prev => ({ ...prev, communicationType: e.target.value as CommunicationType }))}
                >
                  {COMMUNICATION_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.icon} {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pe-form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={newComm.communicationDate}
                  onChange={e => setNewComm(prev => ({ ...prev, communicationDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="pe-form-group">
              <label>Subject</label>
              <input
                type="text"
                value={newComm.subject || ''}
                onChange={e => setNewComm(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Brief subject line"
              />
            </div>

            <div className="pe-form-group">
              <label>Summary</label>
              <textarea
                value={newComm.summary || ''}
                onChange={e => setNewComm(prev => ({ ...prev, summary: e.target.value }))}
                placeholder="Key points and takeaways"
                rows={3}
              />
            </div>

            <div className="pe-form-group">
              <label>Detailed Notes</label>
              <textarea
                value={newComm.detailedNotes || ''}
                onChange={e => setNewComm(prev => ({ ...prev, detailedNotes: e.target.value }))}
                placeholder="Additional details..."
                rows={3}
              />
            </div>

            <div className="pe-form-group">
              <label>Participants</label>
              <input
                type="text"
                value={newComm.participants || ''}
                onChange={e => setNewComm(prev => ({ ...prev, participants: e.target.value }))}
                placeholder="e.g., John (CEO), Jane (CFO)"
              />
            </div>

            <div className="pe-followup-section">
              <div className="pe-checkbox-group">
                <input
                  type="checkbox"
                  id="followUpRequired"
                  checked={newComm.followUpRequired || false}
                  onChange={e => setNewComm(prev => ({ ...prev, followUpRequired: e.target.checked }))}
                />
                <label htmlFor="followUpRequired">Follow-up Required</label>
              </div>

              {newComm.followUpRequired && (
                <div className="pe-form-row">
                  <div className="pe-form-group">
                    <label>Follow-up Date</label>
                    <input
                      type="date"
                      value={newComm.followUpDate || ''}
                      onChange={e => setNewComm(prev => ({ ...prev, followUpDate: e.target.value }))}
                    />
                  </div>
                  <div className="pe-form-group">
                    <label>Follow-up Notes</label>
                    <input
                      type="text"
                      value={newComm.followUpNotes || ''}
                      onChange={e => setNewComm(prev => ({ ...prev, followUpNotes: e.target.value }))}
                      placeholder="What needs to be done"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="pe-form-actions">
              <button type="button" className="pe-btn-secondary" onClick={() => setShowAddForm(false)}>
                Cancel
              </button>
              <button type="submit" className="pe-btn-primary" disabled={isSaving}>
                {isSaving ? 'Adding...' : 'Add Entry'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Communications Timeline */}
      {communications.length === 0 ? (
        <p className="pe-muted pe-centered">No communications recorded yet</p>
      ) : (
        <div className="pe-timeline">
          {communications.map(comm => {
            const typeInfo = getTypeInfo(comm.communicationType);
            const isExpanded = expandedId === comm.id;

            return (
              <div key={comm.id} className="pe-timeline-item">
                <div className="pe-timeline-marker">
                  <span className="pe-timeline-icon">{typeInfo.icon}</span>
                  <div className="pe-timeline-line" />
                </div>
                <div className="pe-timeline-content">
                  <div
                    className="pe-timeline-header"
                    onClick={() => setExpandedId(isExpanded ? null : comm.id)}
                  >
                    <div className="pe-timeline-main">
                      <span className="pe-timeline-type">{typeInfo.label}</span>
                      {comm.subject && (
                        <span className="pe-timeline-subject">{comm.subject}</span>
                      )}
                    </div>
                    <span className="pe-timeline-date">{formatDate(comm.communicationDate)}</span>
                  </div>

                  {comm.summary && (
                    <p className="pe-timeline-summary">{comm.summary}</p>
                  )}

                  {comm.followUpRequired && (
                    <div className="pe-followup-badge">
                      ⏰ Follow-up
                      {comm.followUpDate && `: ${formatDate(comm.followUpDate)}`}
                    </div>
                  )}

                  {isExpanded && (
                    <div className="pe-timeline-expanded">
                      {comm.detailedNotes && (
                        <div className="pe-timeline-detail">
                          <strong>Details:</strong>
                          <p>{comm.detailedNotes}</p>
                        </div>
                      )}
                      {comm.participants && (
                        <div className="pe-timeline-detail">
                          <strong>Participants:</strong> {comm.participants}
                        </div>
                      )}
                      {comm.followUpNotes && (
                        <div className="pe-timeline-detail">
                          <strong>Follow-up:</strong> {comm.followUpNotes}
                        </div>
                      )}
                      {comm.createdBy && (
                        <div className="pe-timeline-meta">
                          Added by {comm.createdBy}
                        </div>
                      )}
                      <button
                        className="pe-delete-btn-small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(comm.id);
                        }}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
