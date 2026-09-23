import { motion, AnimatePresence } from "framer-motion";
import { X, Download, ExternalLink, FileText, Image as ImageIcon, File } from "lucide-react";

/* =========================================================================
 * ResourceViewer — in-browser preview for library resources.
 * Supports:
 *   • PDFs           → native <iframe> (browser PDF viewer, scroll/zoom/print)
 *   • Images         → <img> preview
 *   • Office docs     → Microsoft Office Online / Google Docs viewer iframe
 *                       (only works for publicly reachable URLs; for local
 *                       dev files we fall back to a download prompt)
 *   • Plain text/code → <iframe>
 *   • Other           → graceful "open / download" fallback
 * ======================================================================= */

const extOf = (src = "", name = "") => {
  const s = (name || src).split("?")[0];
  const m = s.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "";
};

const KIND = {
  pdf: "pdf",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image", bmp: "image",
  txt: "text", md: "text", csv: "text", json: "text", log: "text",
  doc: "office", docx: "office", ppt: "office", pptx: "office", xls: "office", xlsx: "office",
};

const isPublic = (u = "") => /^https?:\/\//i.test(u) && !/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(u);

export default function ResourceViewer({ open, onClose, resource }) {
  if (!resource) return null;
  const { url, title, fileName } = resource;
  const ext = extOf(url || "", fileName || "");
  const kind = KIND[ext] || "other";

  const renderBody = () => {
    if (!url) {
      return <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2"><File size={40} /><p>No preview source available.</p></div>;
    }
    if (kind === "pdf") {
      return <iframe src={`${url}#view=FitH`} title={title} className="w-full h-full bg-white" />;
    }
    if (kind === "image") {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-900 overflow-auto p-4">
          <img src={url} alt={title} className="max-w-full max-h-full object-contain" />
        </div>
      );
    }
    if (kind === "text") {
      return <iframe src={url} title={title} className="w-full h-full bg-white" />;
    }
    if (kind === "office") {
      // Office Online / Google viewers require a publicly accessible URL.
      if (isPublic(url)) {
        const viewer = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
        return <iframe src={viewer} title={title} className="w-full h-full bg-white" />;
      }
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-3 px-6 text-center">
          <FileText size={42} className="text-primary-400" />
          <p className="font-semibold">In-browser preview for Office documents needs a public URL.</p>
          <p className="text-sm text-slate-400">This file is hosted locally — open or download it to view.</p>
          <div className="flex gap-2 mt-2">
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700"><ExternalLink size={14} /> Open</a>
            <a href={url} download className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700 text-white text-sm font-semibold hover:bg-slate-600"><Download size={14} /> Download</a>
          </div>
        </div>
      );
    }
    // Unknown — try a plain iframe, with an obvious fallback.
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-3 px-6 text-center">
        <File size={42} className="text-slate-400" />
        <p className="font-semibold">Preview not available for this file type.</p>
        <div className="flex gap-2 mt-1">
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700"><ExternalLink size={14} /> Open</a>
          <a href={url} download className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700 text-white text-sm font-semibold hover:bg-slate-600"><Download size={14} /> Download</a>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-3 sm:p-6" onClick={onClose}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="bg-slate-950 rounded-2xl overflow-hidden w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {kind === "image" ? <ImageIcon size={16} className="text-primary-400 shrink-0" /> : <FileText size={16} className="text-primary-400 shrink-0" />}
                <p className="font-semibold text-white text-sm truncate">{title || fileName || "Resource"}</p>
                {ext && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0">{ext}</span>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {url && (
                  <>
                    <a href={url} target="_blank" rel="noreferrer" title="Open in new tab" className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-200"><ExternalLink size={16} /></a>
                    <a href={url} download title="Download" className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-200"><Download size={16} /></a>
                  </>
                )}
                <button onClick={onClose} title="Close" className="p-1.5 rounded-lg hover:bg-slate-800 text-white"><X size={18} /></button>
              </div>
            </div>
            <div className="flex-1 min-h-0">{renderBody()}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
