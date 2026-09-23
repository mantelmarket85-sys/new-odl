import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Bell, Tag } from "lucide-react";
import { useState } from "react";
import PageHeader from "../../components/common/PageHeader";
import Modal from "../../components/common/Modal";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";

const colors = ["yellow", "pink", "blue", "green", "purple", "orange"];

const StickyNotes = () => {
  const { data, loading, error, reload } = useApi(() => api.student.notes(), []);
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newNote, setNewNote] = useState({ title: "", content: "", color: "yellow", reminderAt: "", tag: "Personal" });

  const notes = data?.notes || [];

  const addNote = async () => {
    if (!newNote.content.trim()) { toast("Please write something in the note", { type: "error" }); return; }
    setSaving(true);
    try {
      await api.student.createNote({
        title: newNote.title || null,
        content: newNote.content,
        color: newNote.color,
        tag: newNote.tag,
        reminderAt: newNote.reminderAt || null,
      });
      toast("Note saved");
      setNewNote({ title: "", content: "", color: "yellow", reminderAt: "", tag: "Personal" });
      setAdding(false);
      reload();
    } catch (e) {
      toast(e.message || "Failed to save note", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const removeNote = async (id) => {
    try {
      await api.student.deleteNote(id);
      reload();
    } catch (e) {
      toast(e.message || "Failed to delete note", { type: "error" });
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Sticky Notes" subtitle="Keep track of reminders, study goals, and personal tasks" icon="StickyNote" breadcrumb={["Dashboard", "Sticky Notes"]} />
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Sticky Notes"
        subtitle="Keep track of reminders, study goals, and personal tasks"
        icon="StickyNote"
        breadcrumb={["Dashboard", "Sticky Notes"]}
        actions={<button onClick={() => setAdding(true)} className="btn-primary text-sm py-2 px-3"><Plus size={14} className="inline mr-1" /> Add Note</button>}
      />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <AnimatePresence>
              {notes.map((n, i) => (
                <motion.div
                  key={n.id}
                  layout
                  initial={{ opacity: 0, scale: 0.8, rotate: -3 }}
                  animate={{ opacity: 1, scale: 1, rotate: i % 2 === 0 ? -1 : 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileHover={{ scale: 1.05, rotate: 0, zIndex: 10 }}
                  drag
                  dragSnapToOrigin
                  transition={{ type: "spring", stiffness: 300 }}
                  className={`note-${n.color} rounded-2xl p-4 shadow-lg cursor-move relative min-h-[200px] flex flex-col`}
                >
                  <button onClick={() => removeNote(n.id)} className="absolute top-2 right-2 p-1 hover:bg-black/10 rounded-full transition">
                    <X size={14} />
                  </button>
                  {n.tag && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="px-2 py-0.5 bg-white/40 backdrop-blur text-[10px] font-bold uppercase rounded-full text-slate-800 dark:text-slate-200">
                        <Tag size={10} className="inline mr-1" />{n.tag}
                      </span>
                    </div>
                  )}
                  {n.title && <h3 className="font-display font-extrabold text-slate-900 dark:text-slate-100 text-lg leading-tight mb-2">{n.title}</h3>}
                  <p className="text-sm text-slate-700 dark:text-slate-300 flex-1 whitespace-pre-line">{n.content}</p>
                  {n.reminderAt && (
                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-black/10 text-xs text-slate-700 dark:text-slate-300">
                      <Bell size={12} />
                      <span className="font-semibold">{new Date(n.reminderAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            <motion.button
              onClick={() => setAdding(true)}
              whileHover={{ scale: 1.05 }}
              className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl p-4 min-h-[200px] flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 hover:border-primary-400 hover:text-primary-600"
            >
              <Plus size={32} />
              <p className="font-semibold mt-2">Add New Note</p>
              <p className="text-xs">Drag, edit, organize</p>
            </motion.button>
          </div>

          <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-6">💡 Tip: You can drag notes around to organize them visually!</p>
        </>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add Sticky Note">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Title</label>
            <input value={newNote.title} onChange={(e) => setNewNote({ ...newNote, title: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm" placeholder="e.g. Submit Assignment" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Note</label>
            <textarea value={newNote.content} onChange={(e) => setNewNote({ ...newNote, content: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm" rows="3" placeholder="Write your note here..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Category</label>
              <select value={newNote.tag} onChange={(e) => setNewNote({ ...newNote, tag: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm">
                <option>Personal</option><option>Exam</option><option>Assignment</option><option>Quiz</option><option>Finance</option><option>Study</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Reminder Date</label>
              <input type="date" value={newNote.reminderAt} onChange={(e) => setNewNote({ ...newNote, reminderAt: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 block">Color</label>
            <div className="flex gap-2">
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewNote({ ...newNote, color: c })}
                  className={`note-${c} w-10 h-10 rounded-lg shadow-md ${newNote.color === c ? "ring-2 ring-offset-2 ring-primary-600" : ""}`}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setAdding(false)} className="btn-secondary flex-1" disabled={saving}>Cancel</button>
            <button onClick={addNote} className="btn-primary flex-1" disabled={saving}>{saving ? "Saving…" : "Save Note"}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default StickyNotes;
