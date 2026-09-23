import { useMemo, useState } from "react";
import { Plus, Search, Edit3, Trash2, BookOpen, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../../components/common/PageHeader";
import Badge from "../../components/common/Badge";
import Modal from "../../components/common/Modal";
import { studyScheme } from "../../data/mockData";
import { useToast } from "../../context/ToastContext";

// Build initial seeded subjects from mock studyScheme
const initialSubjects = studyScheme.semesters.flatMap((s) =>
  s.subjects.map((sub, idx) => ({
    id: `${s.semester}-${sub.code || idx}`,
    code: sub.code,
    title: sub.title,
    category: sub.category || "Core",
    subCategory: sub.subCategory || "",
    credits: sub.credits || 3,
    semester: s.semester,
    prerequisite: sub.prerequisite || "—",
    program: "ADCS",
    department: "Computer Science",
  }))
);

const emptyForm = {
  code: "",
  title: "",
  category: "Core",
  subCategory: "",
  credits: 3,
  semester: 1,
  prerequisite: "",
  program: "ADCS",
  department: "Computer Science",
};

const Subjects = () => {
  const { toast } = useToast();
  const [subjects, setSubjects] = useState(initialSubjects);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const filtered = useMemo(() => {
    if (!query.trim()) return subjects;
    const q = query.toLowerCase();
    return subjects.filter(
      (s) =>
        s.code?.toLowerCase().includes(q) ||
        s.title?.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q) ||
        s.program?.toLowerCase().includes(q)
    );
  }, [subjects, query]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (s) => {
    setEditingId(s.id);
    setForm({
      code: s.code || "",
      title: s.title || "",
      category: s.category || "Core",
      subCategory: s.subCategory || "",
      credits: s.credits || 3,
      semester: s.semester || 1,
      prerequisite: s.prerequisite || "",
      program: s.program || "ADCS",
      department: s.department || "Computer Science",
    });
    setModalOpen(true);
  };

  const handleChange = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = (e) => {
    e?.preventDefault?.();
    if (!form.code.trim() || !form.title.trim()) {
      toast("Subject code and title are required", { type: "error" });
      return;
    }
    if (editingId) {
      setSubjects((prev) =>
        prev.map((s) => (s.id === editingId ? { ...s, ...form, credits: Number(form.credits), semester: Number(form.semester) } : s))
      );
      toast("Subject updated successfully", { type: "success" });
    } else {
      const newSubject = {
        ...form,
        id: `new-${Date.now()}`,
        credits: Number(form.credits),
        semester: Number(form.semester),
      };
      setSubjects((prev) => [newSubject, ...prev]);
      toast("Subject added successfully", { type: "success" });
    }
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleDelete = (s) => {
    if (!window.confirm(`Delete subject "${s.code} — ${s.title}"?`)) return;
    setSubjects((prev) => prev.filter((x) => x.id !== s.id));
    toast("Subject deleted", { type: "success" });
  };

  return (
    <div>
      <PageHeader
        title="Subject Management"
        subtitle={`${subjects.length} subjects across all semesters`}
        icon="BookOpen"
        breadcrumb={["Coordinator", "Subjects"]}
        actions={
          <>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search code, title, program..."
                className="pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-app w-56"
              />
            </div>
            <button onClick={openAdd} className="btn-primary text-sm py-2 px-3">
              <Plus size={14} className="inline mr-1" /> Add Subject
            </button>
          </>
        }
      />

      <div className="card-base overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Subject Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Sub Category</th>
                <th className="px-4 py-3 text-center">Sem</th>
                <th className="px-4 py-3 text-center">Credits</th>
                <th className="px-4 py-3">Prerequisite</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {filtered.map((s) => (
                  <motion.tr
                    key={s.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-app hover:bg-slate-50 dark:hover:bg-slate-900 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3 font-mono font-bold text-primary-700 dark:text-primary-400">{s.code}</td>
                    <td className="px-4 py-3 font-semibold text-app">{s.title}</td>
                    <td className="px-4 py-3">
                      <Badge color="blue">{s.category}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-app">{s.subCategory || "—"}</td>
                    <td className="px-4 py-3 text-center text-app">{s.semester}</td>
                    <td className="px-4 py-3 text-center font-bold text-app">{s.credits}</td>
                    <td className="px-4 py-3 text-xs text-muted-app">{s.prerequisite || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(s)}
                          className="p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition"
                          title="Edit"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(s)}
                          className="p-2 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-app">
                    <BookOpen size={28} className="mx-auto mb-2 opacity-40" />
                    <p className="font-semibold">No subjects found</p>
                    <p className="text-xs mt-1">Try a different search or add a new subject.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Subject" : "Add New Subject"}
        subtitle={editingId ? "Update subject details below" : "Fill in the details to add a new subject"}
        icon={BookOpen}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-app uppercase tracking-wide">Subject Code *</label>
              <input
                value={form.code}
                onChange={(e) => handleChange("code", e.target.value)}
                placeholder="e.g. CS-301"
                className="input-base mt-1 w-full"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-app uppercase tracking-wide">Subject / Course Name *</label>
              <input
                value={form.title}
                onChange={(e) => handleChange("title", e.target.value)}
                placeholder="e.g. Software Engineering"
                className="input-base mt-1 w-full"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-app uppercase tracking-wide">Credit Hours *</label>
              <input
                type="number"
                min="1"
                max="6"
                value={form.credits}
                onChange={(e) => handleChange("credits", e.target.value)}
                className="input-base mt-1 w-full"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-app uppercase tracking-wide">Semester *</label>
              <select
                value={form.semester}
                onChange={(e) => handleChange("semester", e.target.value)}
                className="input-base mt-1 w-full"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    Semester {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-app uppercase tracking-wide">Department</label>
              <input
                value={form.department}
                onChange={(e) => handleChange("department", e.target.value)}
                placeholder="e.g. Computer Science"
                className="input-base mt-1 w-full"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-app uppercase tracking-wide">Program</label>
              <select
                value="ADCS"
                onChange={(e) => handleChange("program", e.target.value)}
                className="input-base mt-1 w-full"
                disabled
              >
                <option value="ADCS">ADCS — Associate Degree in Computer Science</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-app uppercase tracking-wide">Category</label>
              <select
                value={form.category}
                onChange={(e) => handleChange("category", e.target.value)}
                className="input-base mt-1 w-full"
              >
                <option>Core</option>
                <option>Elective</option>
                <option>Foundation</option>
                <option>General</option>
                <option>Major</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-app uppercase tracking-wide">Sub Category</label>
              <input
                value={form.subCategory}
                onChange={(e) => handleChange("subCategory", e.target.value)}
                placeholder="e.g. Computing Core"
                className="input-base mt-1 w-full"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-muted-app uppercase tracking-wide">Prerequisite</label>
              <input
                value={form.prerequisite}
                onChange={(e) => handleChange("prerequisite", e.target.value)}
                placeholder="e.g. CS-201 (or leave blank)"
                className="input-base mt-1 w-full"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-app">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="btn-secondary text-sm py-2 px-4"
            >
              <X size={14} className="inline mr-1" /> Cancel
            </button>
            <button type="submit" className="btn-primary text-sm py-2 px-4">
              {editingId ? "Save Changes" : "Add Subject"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Subjects;
