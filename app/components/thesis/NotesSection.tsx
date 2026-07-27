'use client';

import React, { useState } from 'react';
import { ThesisNote } from '../../../types/thesis';

interface NotesSectionProps {
  notes: ThesisNote[];
  onAdd: (content: string) => Promise<void>;
  onEdit: (noteId: string, content: string) => Promise<void>;
  onDelete: (noteId: string) => Promise<void>;
  disabled?: boolean;
}

export function NotesSection({ notes, onAdd, onEdit, onDelete, disabled }: NotesSectionProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const handleAdd = async () => {
    if (!newNote.trim()) return;
    await onAdd(newNote.trim());
    setNewNote('');
    setIsAdding(false);
  };

  const startEdit = (note: ThesisNote) => {
    setEditingId(note.id);
    setEditValue(note.content);
  };

  const handleEditSave = async (noteId: string) => {
    if (!editValue.trim()) return;
    await onEdit(noteId, editValue.trim());
    setEditingId(null);
    setEditValue('');
  };

  const wasEdited = (note: ThesisNote) =>
    note.updatedAt && note.createdAt && new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 1000;

  return (
    <div className="notes-section-list">
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

      {/* Stacked notes — newest first */}
      {notes.length > 0 ? (
        <div className="notes-stack">
          {notes.map(note => (
            <div key={note.id} className="note-item">
              {editingId === note.id ? (
                <div className="note-add-form">
                  <textarea
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    rows={3}
                    className="note-textarea"
                    autoFocus
                  />
                  <div className="note-actions">
                    <button className="note-cancel-btn" onClick={() => { setEditingId(null); setEditValue(''); }} disabled={disabled}>
                      Cancel
                    </button>
                    <button className="note-save-btn" onClick={() => handleEditSave(note.id)} disabled={disabled || !editValue.trim()}>
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="note-item-text">{note.content}</div>
                  <div className="note-item-footer">
                    <span className="note-item-meta">
                      {formatDate(note.createdAt)}{wasEdited(note) ? ' · edited' : ''}
                    </span>
                    <div className="note-item-actions">
                      <button className="note-edit-btn" onClick={() => startEdit(note)} disabled={disabled}>
                        Edit
                      </button>
                      <button className="note-delete-btn" onClick={() => onDelete(note.id)} disabled={disabled}>
                        Delete
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        !isAdding && <p className="note-empty-text">No notes yet.</p>
      )}
    </div>
  );
}
