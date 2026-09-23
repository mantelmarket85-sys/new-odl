import React, { useEffect, useState } from 'react';
import api, { getFileUrl } from '../utils/api';

/**
 * DocumentViewer — modal preview for images and PDFs.
 *
 * Props:
 *   open         (bool)   — controlled open state
 *   onClose      (fn)     — close handler
 *   doc          (object) — { id, fileName, mimeType, filePath } OR { filePath } only
 *   useIdRoute   (bool)   — if true, uses /api/files/preview/:id (auth header)
 *                          else uses static /uploads/... path (public)
 */
const DocumentViewer = ({ open, onClose, doc, useIdRoute = true }) => {
  const [blobUrl, setBlobUrl] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !doc) return;
    let cancelled = false;
    setError('');
    setLoading(true);

    const load = async () => {
      try {
        if (useIdRoute && doc.id) {
          // Use auth-protected endpoint to fetch as blob
          const res = await api.get(`/files/preview/${doc.id}`, { responseType: 'blob' });
          if (cancelled) return;
          const url = URL.createObjectURL(res.data);
          setBlobUrl(url);
        } else if (doc.filePath) {
          // Try the by-path preview endpoint (auth-protected)
          try {
            const res = await api.get(`/files/preview-path`, {
              params: { p: doc.filePath },
              responseType: 'blob',
            });
            if (cancelled) return;
            const url = URL.createObjectURL(res.data);
            setBlobUrl(url);
          } catch (e) {
            // fall back to direct static URL
            setBlobUrl(getFileUrl(doc.filePath));
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.error || 'Failed to load document');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    return () => {
      cancelled = true;
      if (blobUrl && blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl);
      }
    };
    // eslint-disable-next-line
  }, [open, doc?.id, doc?.filePath]);

  const handleDownload = async () => {
    try {
      if (useIdRoute && doc.id) {
        const res = await api.get(`/files/download/${doc.id}`, { responseType: 'blob' });
        const url = URL.createObjectURL(res.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.fileName || `document-${doc.id}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } else if (doc.filePath) {
        try {
          const res = await api.get(`/files/download-path`, {
            params: { p: doc.filePath },
            responseType: 'blob',
          });
          const url = URL.createObjectURL(res.data);
          const a = document.createElement('a');
          a.href = url;
          a.download = doc.fileName || doc.filePath.split('/').pop();
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } catch {
          window.open(getFileUrl(doc.filePath), '_blank');
        }
      }
    } catch (e) {
      setError('Download failed');
    }
  };

  if (!open || !doc) return null;

  const isPdf = (doc.mimeType || '').includes('pdf') || /\.pdf$/i.test(doc.fileName || doc.filePath || '');
  const isImage = (doc.mimeType || '').startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(doc.fileName || doc.filePath || '');

  return (
    <div className="docviewer-overlay" onClick={onClose}>
      <div className="docviewer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="docviewer-header">
          <div className="docviewer-title">
            <i className={isPdf ? 'icon-pdf' : 'icon-image'}>{isPdf ? '📄' : '🖼️'}</i>
            <span>{doc.fileName || 'Document Preview'}</span>
          </div>
          <div className="docviewer-actions">
            <button className="btn-secondary" onClick={handleDownload} type="button">
              ⬇ Download
            </button>
            <button className="btn-ghost" onClick={onClose} type="button">
              ✕
            </button>
          </div>
        </div>
        <div className="docviewer-body">
          {loading && <div className="docviewer-loading">Loading preview…</div>}
          {error && <div className="docviewer-error">{error}</div>}
          {!loading && !error && blobUrl && isPdf && (
            <iframe
              title="document-pdf"
              src={blobUrl}
              className="docviewer-frame"
            />
          )}
          {!loading && !error && blobUrl && isImage && (
            <div className="docviewer-image-wrap">
              <img src={blobUrl} alt={doc.fileName || 'preview'} />
            </div>
          )}
          {!loading && !error && blobUrl && !isPdf && !isImage && (
            <div className="docviewer-fallback">
              Preview not available for this file type.{' '}
              <button className="btn-link" onClick={handleDownload}>Download instead</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentViewer;
