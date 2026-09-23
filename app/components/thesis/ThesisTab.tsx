'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ThesisTrackerCard } from './ThesisTrackerCard';
import { AttachmentSection } from '../shared/AttachmentSection';
import {
  Thesis,
  ThesisHistoryEntry,
  ThesisResponse,
  CreateThesisRequest,
  UpdateThesisRequest,
} from '../../../types/thesis';

interface ThesisTabProps {
  stockCode: string;
  stockName: string;
}

// Thesis tracker + attachments for one stock, keyed by stock code. Used by the
// holdings drawer and the pipeline drawer so a stock's thesis follows it after
// it exits the portfolio.
export function ThesisTab({ stockCode, stockName }: ThesisTabProps) {
  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [recentHistory, setRecentHistory] = useState<ThesisHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchThesis = useCallback(async (code: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/thesis/${encodeURIComponent(code)}`);
      if (response.ok) {
        const data: ThesisResponse = await response.json();
        setThesis(data.thesis);
        setRecentHistory(data.recentHistory || []);
      } else if (response.status === 404) {
        setThesis(null);
        setRecentHistory([]);
      } else {
        throw new Error('Failed to fetch thesis');
      }
    } catch (err) {
      console.error('Error fetching thesis:', err);
      setError('Failed to load thesis data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (stockCode) fetchThesis(stockCode);
  }, [stockCode, fetchThesis]);

  const handleCreateThesis = async (data: Omit<CreateThesisRequest, 'stockCode' | 'stockName'>) => {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/thesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockCode, stockName, ...data }),
      });
      if (response.ok) {
        const result = await response.json();
        setThesis(result.thesis);
        setRecentHistory([]);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create thesis');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create thesis');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateThesis = async (data: UpdateThesisRequest) => {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/thesis/${encodeURIComponent(stockCode)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (response.ok) {
        const result = await response.json();
        setThesis(result.thesis);
        setRecentHistory(result.recentHistory || []);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update thesis');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update thesis');
    } finally {
      setIsSaving(false);
    }
  };

  const applyNotes = (notes: Thesis['notes']) => {
    setThesis(prev => (prev ? { ...prev, notes, latestNote: notes[0]?.content ?? null } : prev));
  };

  const handleNoteRequest = async (method: string, path: string, body?: any) => {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (response.ok) {
        const result = await response.json();
        applyNotes(result.notes || []);
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save note');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save note');
    } finally {
      setIsSaving(false);
    }
  };

  const notesPath = `/api/thesis/${encodeURIComponent(stockCode)}/notes`;
  const handleAddNote = (content: string) => handleNoteRequest('POST', notesPath, { content });
  const handleEditNote = (noteId: string, content: string) => handleNoteRequest('PUT', `${notesPath}/${noteId}`, { content });
  const handleDeleteNote = (noteId: string) => handleNoteRequest('DELETE', `${notesPath}/${noteId}`);

  return (
    <>
      <ThesisTrackerCard
        thesis={thesis}
        recentHistory={recentHistory}
        stockCode={stockCode}
        stockName={stockName}
        isLoading={isLoading}
        isSaving={isSaving}
        error={error}
        onCreateThesis={handleCreateThesis}
        onUpdateThesis={handleUpdateThesis}
        onAddNote={handleAddNote}
        onEditNote={handleEditNote}
        onDeleteNote={handleDeleteNote}
        onClearError={() => setError(null)}
      />
      <AttachmentSection module="thesis" entityId={stockCode} />
    </>
  );
}
