import React, { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';

/**
 * Universal Document View + Download component.
 *
 * Props:
 *   documentId   — id of EducationDocument or generic Document
 *   scope        — 'user' (Document table) or 'education' (EducationDocument
 *                  table). REQUIRED whenever documentId is used, to avoid
 *                  cross-table id collisions (both tables have independent
 *                  autoincrement sequences so the same numeric id exists in
 *                  both). When omitted, backend falls back to user-doc-first
 *                  resolution — still safe, but explicit `scope` is preferred.
 *   filePath     — fallback by-path access for legacy documents (e.g. fee receipts)
 *   fileName     — display name
 *   mimeType     — used to choose preview style (image vs pdf vs other)
 *   compact      — if true, render a tiny chip-style row
 */
// Infer a usable mime type from a filename or path when the caller did not
// supply a real one (e.g. when only a filePath is known and the database
// record stores an octet-stream). This keeps the View button useful for fee
// receipts and other legacy uploads.
const inferMime = (mimeType, hint) => {
  const m = (mimeType || '').toLowerCase();
  // Treat wildcard / generic types as "unknown" and fall back to the filename
  // hint. This covers legacy fee-receipt records that store image/* or
  // application/octet-stream and would otherwise refuse to preview inline.
  const isGeneric = !m
    || m === 'application/octet-stream'
    || m === 'application/*'
    || m === 'image/*'
    || m === '*/*';
  if (!isGeneric) return mimeType;
  const name = (hint || '').toLowerCase();
  // Cover .jpg, .jpeg, .jpe AND .jfif (Windows screenshots / receipt scans
  // often save as .jfif and would otherwise be served as octet-stream).
  if (/\.(jpe?g|jfif|jpe)$/.test(name)) return 'image/jpeg';
  if (/\.png$/.test(name)) return 'image/png';
  if (/\.gif$/.test(name)) return 'image/gif';
  if (/\.webp$/.test(name)) return 'image/webp';
  if (/\.bmp$/.test(name)) return 'image/bmp';
  if (/\.svg$/.test(name)) return 'image/svg+xml';
  if (/\.(tiff?|heic|heif)$/.test(name)) return 'image/jpeg'; // best-effort fallback for inline preview
  if (/\.pdf$/.test(name)) return 'application/pdf';
  return mimeType || '';
};

const DocumentPreviewLink = ({ documentId, scope, filePath, fileName, mimeType, compact = false }) => {
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewMime, setPreviewMime] = useState(null); // mime detected from blob
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [iframeLoading, setIframeLoading] = useState(false);

  const inferredMime = inferMime(mimeType, fileName || filePath);
  const effectiveMime = previewMime || inferredMime;
  // Treat the wildcard "image/*" (used by some legacy receipt records) as an image
  const isImage = effectiveMime && (effectiveMime.startsWith('image/') || effectiveMime === 'image/*');
  const isPdf = effectiveMime === 'application/pdf' || /pdf/i.test(effectiveMime || '');

  const fetchAsBlob = async (kind /* preview | download */) => {
    // Pass `scope` to the backend so it queries the right table — this
    // prevents the cross-table ID-collision bug where Document.id=5
    // (cnic_front) and EducationDocument.id=5 (dmc) silently overlap.
    let url;
    if (documentId) {
      const q = scope ? `?scope=${encodeURIComponent(scope)}` : '';
      url = `/files/${kind}/${documentId}${q}`;
    } else {
      url = `/files/${kind}-path?p=${encodeURIComponent(filePath || '')}`;
    }
    const res = await api.get(url, { responseType: 'blob' });
    return res.data; // Blob (with a real Content-Type from backend)
  };

  const handleView = async () => {
    setError(null);
    setLoading(true);
    try {
      const blob = await fetchAsBlob('preview');
      // Trust backend Content-Type only when it is a real, specific type.
      // Generic / wildcard values (octet-stream, image/*, application/*) get
      // discarded — the View button must NEVER hand a generic blob to the
      // browser, because that triggers an automatic download.
      const t = (blob.type || '').toLowerCase();
      const generic = !t
        || t === 'application/octet-stream'
        || t === 'application/*'
        || t === 'image/*'
        || t === '*/*';
      let actualMime = generic ? '' : blob.type;
      if (!actualMime) actualMime = inferMime(mimeType, fileName || filePath);
      // As a last resort default to image/jpeg so the <img> tag still
      // attempts inline rendering (browsers are forgiving on image data).
      if (!actualMime) actualMime = 'image/jpeg';

      // Re-wrap the blob with the corrected MIME type so the iframe/img can
      // render it inline. Browsers refuse to preview blobs whose Content-Type
      // is application/octet-stream — they force a download instead.
      const previewBlob = (actualMime && blob.type !== actualMime)
        ? new Blob([blob], { type: actualMime })
        : blob;
      setPreviewMime(actualMime);
      setPreviewUrl(URL.createObjectURL(previewBlob));
      setZoom(1);
      setIframeLoading(actualMime === 'application/pdf' || /pdf/i.test(actualMime || ''));
      setShowPreview(true);
    } catch (err) {
      // Surface a real error inside the modal-overlay rather than silently
      // falling through to a download — the View button must NEVER trigger a
      // download. Keep the user on this page so they can retry.
      const detail = err.response?.data?.error
        || (err.response?.status === 404 ? 'File not found on the server' : null)
        || (err.response?.status === 403 ? 'You do not have access to this file' : null)
        || err.message
        || 'Failed to load preview';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setError(null);
    setLoading(true);
    try {
      const blob = await fetchAsBlob('download');
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName || (filePath ? filePath.split('/').pop() : 'document');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to download');
    } finally {
      setLoading(false);
    }
  };

  const closePreview = useCallback(() => {
    setShowPreview(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setPreviewMime(null);
    setZoom(1);
    setIframeLoading(false);
  }, [previewUrl]);

  // Lock body scroll + listen for ESC while the modal is open
  useEffect(() => {
    if (!showPreview) return;
    const prevOverflow = document.body.style.overflow;
    document.body.classList.add('dpv-no-scroll');
    const onKey = (e) => {
      if (e.key === 'Escape') closePreview();
      else if (showPreview && isImage) {
        if (e.key === '+' || e.key === '=') setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)));
        else if (e.key === '-' || e.key === '_') setZoom(z => Math.max(0.25, +(z - 0.25).toFixed(2)));
        else if (e.key === '0') setZoom(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('dpv-no-scroll');
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreview, closePreview, isImage]);

  return (
    <>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
      }}>
        {fileName && !compact && (
          <span style={{ fontSize: '0.78rem', color: '#475569', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fileName}>
            {fileName}
          </span>
        )}
        <button
          type="button"
          onClick={handleView}
          disabled={loading}
          className="btn btn-sm"
          style={{
            background: '#0ea5e9',
            color: 'white',
            border: 0,
            padding: '4px 10px',
            fontSize: '0.75rem',
            borderRadius: 6,
            cursor: 'pointer',
          }}
          title="View in browser"
        >
          {loading ? '...' : 'View'}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={loading}
          className="btn btn-sm"
          style={{
            background: '#475569',
            color: 'white',
            border: 0,
            padding: '4px 10px',
            fontSize: '0.75rem',
            borderRadius: 6,
            cursor: 'pointer',
          }}
          title="Download file"
        >
          Download
        </button>
      </div>
      {error && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: 4 }}>{error}</div>}

      {/* Modal preview — responsive, animated, zoomable */}
      {showPreview && previewUrl && (
        <div
          className="dpv-overlay"
          onClick={closePreview}
          role="dialog"
          aria-modal="true"
          aria-label={fileName ? `Preview of ${fileName}` : 'Document preview'}
        >
          <div
            className={`dpv-modal ${isPdf ? 'is-pdf' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dpv-header">
              <div className="dpv-title">
                <i className={`fas ${isImage ? 'fa-image' : isPdf ? 'fa-file-pdf' : 'fa-file'}`} aria-hidden="true"></i>
                <span className="dpv-title-name" title={fileName || 'Document Preview'}>
                  {fileName || 'Document Preview'}
                </span>
              </div>
              <div className="dpv-actions">
                {isImage && (
                  <>
                    <button
                      type="button"
                      className="dpv-btn dpv-btn-zoom"
                      onClick={() => setZoom(z => Math.max(0.25, +(z - 0.25).toFixed(2)))}
                      disabled={zoom <= 0.25}
                      title="Zoom out (−)"
                      aria-label="Zoom out"
                    >
                      <i className="fas fa-minus"></i>
                    </button>
                    <span className="dpv-zoom-label" title="Current zoom">{Math.round(zoom * 100)}%</span>
                    <button
                      type="button"
                      className="dpv-btn dpv-btn-zoom"
                      onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}
                      disabled={zoom >= 4}
                      title="Zoom in (+)"
                      aria-label="Zoom in"
                    >
                      <i className="fas fa-plus"></i>
                    </button>
                    <button
                      type="button"
                      className="dpv-btn dpv-btn-zoom"
                      onClick={() => setZoom(1)}
                      title="Fit to screen (0)"
                      aria-label="Fit to screen"
                    >
                      <i className="fas fa-expand"></i>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="dpv-btn dpv-btn-download"
                  onClick={handleDownload}
                  disabled={loading}
                  title="Download original file"
                >
                  <i className="fas fa-download"></i> Download
                </button>
                <button
                  type="button"
                  className="dpv-btn dpv-btn-close"
                  onClick={closePreview}
                  title="Close (Esc)"
                  aria-label="Close preview"
                >
                  <i className="fas fa-xmark"></i> Close
                </button>
              </div>
            </div>
            <div className={`dpv-body ${isPdf || !isImage ? 'is-light' : ''}`}>
              {isImage ? (
                <div className="dpv-img-wrap">
                  <img
                    src={previewUrl}
                    alt={fileName || 'Preview'}
                    className="dpv-img"
                    style={{ transform: `scale(${zoom})` }}
                    draggable={false}
                  />
                </div>
              ) : isPdf ? (
                <>
                  <iframe
                    src={previewUrl}
                    title={fileName || 'PDF Preview'}
                    className="dpv-iframe"
                    onLoad={() => setIframeLoading(false)}
                  />
                  {iframeLoading && (
                    <div className="dpv-spinner" aria-hidden="true">
                      <span className="dpv-spinner-ring"></span>
                      <span>Loading document…</span>
                    </div>
                  )}
                </>
              ) : (
                // Unknown mime — graceful fallback (never auto-download).
                <div className="dpv-fallback">
                  <div className="dpv-fallback-icon">📄</div>
                  <div style={{ marginBottom: 12 }}>
                    Inline preview is not available for this file type.
                  </div>
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dpv-open-link"
                  >
                    Open in new tab
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DocumentPreviewLink;
