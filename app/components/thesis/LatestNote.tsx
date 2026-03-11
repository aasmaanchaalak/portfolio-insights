'use client';

import React, { useState } from 'react';

interface LatestNoteProps {
  note: string | null;
  onSave: (note: string) => void;
  disabled?: boolean;
}

export function LatestNote({ note, onSave, disabled }: LatestNoteProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedNote, setEditedNote] = useState('');

  const handleEdit = () => {
    setEditedNote(note || '');
    setIsEditing(true);
  };

  const handleSave = () => {
    onSave(editedNote);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedNote('');
  };

  if (isEditing) {
    return (
      <div className="latest-note editing">
        <textarea
          value={editedNote}
          onChange={(e) => setEditedNote(e.target.value)}
          placeholder="Add a note about recent developments, observations, or reminders..."
          rows={4}
          className="note-textarea"
          autoFocus
        />
        <div className="note-actions">
          <button
            className="note-cancel-btn"
            onClick={handleCancel}
            disabled={disabled}
          >
            Cancel
          </button>
          <button
            className="note-save-btn"
            onClick={handleSave}
            disabled={disabled}
          >
            Save Note
          </button>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="latest-note empty">
        <p className="note-empty-text">No recent notes.</p>
        <button
          className="note-add-btn"
          onClick={handleEdit}
          disabled={disabled}
        >
          + Add Note
        </button>
      </div>
    );
  }

  return (
    <div className="latest-note">
      <p className="latest-note-text">{note}</p>
      <button
        className="note-edit-btn"
        onClick={handleEdit}
        disabled={disabled}
      >
        Edit
      </button>
    </div>
  );
}
