'use client';

import React, { useState } from 'react';
import { ThesisHistoryEntry } from '../../../types/thesis';

interface LatestNoteProps {
  note: string | null;
  noteHistory: ThesisHistoryEntry[];
  onSave: (note: string) => void;
  disabled?: boolean;
}

export function LatestNote({ note, noteHistory, onSave, disabled }: LatestNoteProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newNote, setNewNote] = useState('');

  const handleAdd = () => {
    if (!newNote.trim()) return;
    onSave(newNote.trim());
    setNewNote('');
    setIsAdding(false);
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="latest-note">
      {/* Current note display */}
      {note && (
        <p className="latest-note-text">{note}</p>
      )}

      {/* Add note form */}
      {isAdding ? (
        <div className="note-add-form">
          <textarea
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            placeholder="Add a new note..."
            rows={3}
            className="note-textarea"
            autoFocus
          />
          <div className="note-actions">
            <button className="note-cancel-btn" onClick={() => { setIsAdding(false); setNewNote(''); }} disabled={disabled}>
              Cancel
            </button>
            <button className="note-save-btn" onClick={handleAdd} disabled={disabled || !newNote.trim()}>
              Save Note
            </button>
          </div>
        </div>
      ) : (
        <button className="note-add-btn" onClick={() => setIsAdding(true)} disabled={disabled}>
          + Add Note
        </button>
      )}

      {/* Note history */}
      {noteHistory.length > 0 && (
        <div className="note-history">
          {noteHistory.map(entry => (
            <div key={entry.id} className="note-history-item">
              <div className="note-history-text">{entry.newValue}</div>
              <div className="note-history-meta">{formatDate(entry.createdAt)}</div>
            </div>
          ))}
        </div>
      )}

      {!note && !isAdding && noteHistory.length === 0 && (
        <p className="note-empty-text">No notes yet.</p>
      )}
    </div>
  );
}
