'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Attachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
  url: string;
}

interface Props {
  module: 'pe' | 'pipeline' | 'thesis';
  entityId: string;
  drawerWidth?: number;
}

function fileIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📑';
  if (mimeType.includes('word')) return '📝';
  return '📎';
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function StickyNotes({ attachments, drawerWidth }: { attachments: Attachment[]; drawerWidth: number }) {
  if (typeof window === 'undefined' || attachments.length === 0) return null;

  return createPortal(
    <div className="sticky-notes-panel" style={{ right: drawerWidth + 40 }}>
      {attachments.map((a) => (
        <a
          key={a.id}
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className="sticky-note"
          title={a.fileName}
        >
          {a.fileType.startsWith('image/') ? (
            <img src={a.url} alt={a.fileName} className="sticky-note-img" />
          ) : (
            <div className="sticky-note-doc">
              <span className="sticky-note-doc-icon">{fileIcon(a.fileType)}</span>
              <span className="sticky-note-doc-type">{a.fileType.includes('pdf') ? 'PDF' : a.fileType.includes('presentation') || a.fileType.includes('powerpoint') ? 'PPT' : a.fileType.includes('spreadsheet') || a.fileType.includes('excel') ? 'XLS' : a.fileType.includes('word') ? 'DOC' : 'FILE'}</span>
            </div>
          )}
          <span className="sticky-note-label">{a.fileName}</span>
        </a>
      ))}
    </div>,
    document.body
  );
}

export function AttachmentSection({ module, entityId, drawerWidth = 600 }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!entityId) return;
    fetch(`/api/attachments?module=${module}&entityId=${encodeURIComponent(entityId)}`)
      .then(r => r.json())
      .then(data => { setAttachments(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [module, entityId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError('File exceeds 20 MB limit'); return; }

    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append('module', module);
    fd.append('entityId', entityId);
    fd.append('file', file);

    try {
      const res = await fetch('/api/attachments', { method: 'POST', body: fd });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || 'Upload failed');
      } else {
        const newAttachment = await res.json();
        setAttachments(prev => [newAttachment, ...prev]);
      }
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  if (!entityId) return null;

  return (
    <>
      <StickyNotes attachments={attachments} drawerWidth={drawerWidth} />

      <div className="attachment-section">
        <div className="attachment-section-header">
          <span className="attachment-section-title">
            Attachments{attachments.length > 0 ? ` (${attachments.length})` : ''}
          </span>
          <button
            className="attachment-add-btn"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : '+ Add File'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.pptx,.docx,.xlsx,.xls,.doc"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        {error && <div style={{ color: 'var(--error-color)', fontSize: '0.8rem', marginBottom: '0.4rem' }}>{error}</div>}

        {loading ? (
          <div className="attachment-empty">Loading…</div>
        ) : attachments.length === 0 ? (
          <div className="attachment-empty">No attachments yet</div>
        ) : (
          <div className="attachment-list">
            {attachments.map(a => (
              <div key={a.id} className="attachment-row">
                <span className="attachment-icon">{a.fileType.startsWith('image/') ? '🖼️' : fileIcon(a.fileType)}</span>
                <span className="attachment-name" title={a.fileName}>{a.fileName}</span>
                <span className="attachment-meta">{formatSize(a.fileSize)} · {formatDate(a.uploadedAt)}</span>
                <div className="attachment-actions">
                  <button className="attachment-btn" title="Open" onClick={() => window.open(a.url, '_blank')}>↓</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
