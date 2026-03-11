'use client';

import React, { useState, useEffect } from 'react';
import { ThesisHistoryEntry, ThesisHistoryResponse } from '../../../types/thesis';

interface ThesisHistoryTimelineProps {
  history: ThesisHistoryEntry[];
  stockCode: string;
}

const ACTION_LABELS: Record<string, string> = {
  thesis_created: 'Thesis created',
  status_changed: 'Status changed',
  thesis_updated: 'Thesis updated',
  note_added: 'Note added',
  kpi_added: 'KPI added',
  kpi_removed: 'KPI removed',
  kpi_updated: 'KPIs updated',
  break_condition_added: 'Break condition added',
  break_condition_removed: 'Break condition removed',
  break_condition_triggered: 'Break condition triggered',
  signal_added: 'Signal added',
  signal_removed: 'Signal removed',
  review_completed: 'Review completed',
};

export function ThesisHistoryTimeline({
  history: initialHistory,
  stockCode,
}: ThesisHistoryTimelineProps) {
  const [history, setHistory] = useState<ThesisHistoryEntry[]>(initialHistory);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialHistory.length >= 5);

  useEffect(() => {
    setHistory(initialHistory);
    setHasMore(initialHistory.length >= 5);
  }, [initialHistory]);

  const loadMore = async () => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/thesis/history/${encodeURIComponent(stockCode)}?limit=20&offset=${history.length}`
      );
      if (response.ok) {
        const data: ThesisHistoryResponse = await response.json();
        setHistory([...history, ...data.history]);
        setHasMore(data.hasMore);
      }
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      });
    }
  };

  const getActionLabel = (entry: ThesisHistoryEntry) => {
    const baseLabel = ACTION_LABELS[entry.actionType] || entry.actionType;

    if (entry.actionType === 'status_changed' && entry.oldValue && entry.newValue) {
      return `${baseLabel}: ${entry.oldValue} → ${entry.newValue}`;
    }

    if (entry.fieldChanged && entry.actionType === 'thesis_updated') {
      return `Updated ${entry.fieldChanged}`;
    }

    return baseLabel;
  };

  if (history.length === 0) {
    return (
      <div className="history-empty">
        <p>No history recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="history-timeline">
      {history.map((entry, index) => (
        <div key={entry.id} className="history-entry">
          <div className="history-entry-marker" />
          <div className="history-entry-content">
            <div className="history-entry-header">
              <span className="history-entry-action">{getActionLabel(entry)}</span>
              <span className="history-entry-date">{formatDate(entry.createdAt)}</span>
            </div>
            {entry.note && (
              <p className="history-entry-note">{entry.note}</p>
            )}
          </div>
        </div>
      ))}

      {hasMore && (
        <button
          className="history-load-more"
          onClick={loadMore}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
}
