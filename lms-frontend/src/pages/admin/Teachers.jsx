import {
  Search, Mail, UserCog, BookOpen, Users, CheckCircle2, XCircle, Plus, Pencil,
  Trash2, Eye, GraduationCap, Phone, MapPin, IdCard, Layers, Building2,
  KeyRound, Camera, AlertTriangle, Award,
} from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/common/PageHeader";
import Modal from "../../components/common/Modal";
import Badge from "../../components/common/Badge";
import useApi from "../../hooks/useApi";
import api, { fileUrl } from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
];

const EMPTY_FORM = {
  username: "", email: "", password: "",
  fullName: "", fatherName: "", cnic: "", dateOfBirth: "", gender: "",
  maritalStatus: "", designation: "", qualification: "", specialization: "",
  phone: "", whatsapp: "", address: "", department: "Computer Science",
  isActive: true,
};

const avatar = (name) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "Instructor")}&background=2563eb&color=fff&bold=true`;

const Field = ({ label, children, required }) => (
  <div>
    <label className="block text-xs font-bold uppercase tracking-wider text-secondary-app mb-1.5">
      {label} {required && <span className="text-rose-500">*</span>}
    </label>
    {children}
  </div>
);

const StatBox = ({ label, value, icon: Icon }) => (
  <div className="surface p-3 rounded-xl border border-app text-center">
    <div className="flex items-center justify-center gap-1.5 text-muted-app mb-1">
      {Icon && <Icon size={13} />}
      <p className="text-xs">{label}</p>
    </div>
    <p className="font-bold text-app text-lg">{value}</p>
  </div>
);

const Teachers = () => {
  const navigate = useNavigate();
  const [statusTab, setStatusTab] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  // Debounce the search box (drives the server query).
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (debounced) p.set("search", debounced);
    if (statusTab !== "all") p.set("status", statusTab);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [debounced, statusTab]);

  const { data, loading, error, reload } = useApi(
    () => api.coordinator.instructors(query),
    [query]
  );
  const instructors = data?.instructors || [];
  const summary = data?.summary || { total: 0, active: 0, inactive: 0, assigned: 0 };

  // Modals
  const [viewingId, setViewingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = create
  const [deleting, setDeleting] = useState(null);
  const [borrowOpen, setBorrowOpen] = useState(false); // cross-department loan workflow

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formErr, setFormErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target?.type === "checkbox" ? e.target.checked : e.target.value }));

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setFormErr(""); setFormOpen(true); };
  const openEdit = (inst) => {
    setEditing(inst);
    setFormErr("");
    setFormOpen(true);
    // Fetch full profile for accurate field hydration.
    api.coordinator.instructor(inst.id).then((d) => {
      const p = d.instructor.personalInfo || {};
      setForm({
        username: d.instructor.username || "",
        email: d.instructor.email || "",
        password: "",
        fullName: p.fullName || "", fatherName: p.fatherName || "", cnic: p.cnic || "",
        dateOfBirth: p.dateOfBirth || "", gender: p.gender || "", maritalStatus: p.maritalStatus || "",
        designation: p.designation || "", qualification: p.qualification || "", specialization: p.specialization || "",
        phone: p.phone || "", whatsapp: p.whatsapp || "", address: p.address || "",
        department: p.department || "Computer Science", isActive: d.instructor.isActive,
      });
    }).catch(() => {
      setForm({ ...EMPTY_FORM, username: inst.username, email: inst.email || "", fullName: inst.name, isActive: inst.isActive });
    });
  };

  const submit = async () => {
    setFormErr("");
    if (!form.fullName.trim()) return setFormErr("Full name is required.");
    if (!form.department.trim()) return setFormErr("Department is required — every instructor must belong to a department.");
    if (!editing) {
      if (!form.username.trim()) return setFormErr("Username is required.");
      if ((form.password || "").length < 8) return setFormErr("Password must be at least 8 characters.");
    } else if (form.password && form.password.length < 8) {
      return setFormErr("New password must be at least 8 characters.");
    }
    setSaving(true);
    try {
      const payload = { ...form };
      if (editing && !payload.password) delete payload.password;
      if (editing) {
        delete payload.username; // username immutable after creation
        await api.coordinator.updateInstructor(editing.id, payload);
      } else {
        await api.coordinator.createInstructor(payload);
      }
      setFormOpen(false);
      reload();
    } catch (err) {
      setFormErr(err?.data?.error || err?.message || "Failed to save instructor.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (hard) => {
    if (!deleting) return;
    setSaving(true);
    try {
      await api.coordinator.deleteInstructor(deleting.id, hard);
      setDeleting(null);
      if (viewingId === deleting.id) setViewingId(null);
      reload();
    } catch (err) {
      setFormErr(err?.data?.error || err?.message || "Failed to delete.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Course Instructors"
        subtitle="Manage instructor profiles — personal info, assigned subjects, sections & courses. All data is live from the database."
        icon="UserCog"
        breadcrumb={["Coordinator", "Course Instructors"]}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, ID, email, dept…" className="input-base pl-9 py-2 text-sm w-64" />
            </div>
            <button onClick={() => setBorrowOpen(true)} className="btn-secondary flex items-center gap-1.5 whitespace-nowrap" title="Request an instructor from another department">
              <Building2 size={16} /> Borrow Instructor
            </button>
            <button onClick={openCreate} className="btn-primary flex items-center gap-1.5 whitespace-nowrap">
              <Plus size={16} /> Add Instructor
            </button>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatBox label="Total" value={summary.total} icon={Users} />
        <StatBox label="Active" value={summary.active} icon={CheckCircle2} />
        <StatBox label="Inactive" value={summary.inactive} icon={XCircle} />
        <StatBox label="Assigned" value={summary.assigned} icon={BookOpen} />
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1.5 mb-4">
        {STATUS_TABS.map((t) => (
          <button key={t.key} onClick={() => setStatusTab(t.key)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition ${statusTab === t.key ? "bg-primary-600 text-white shadow" : "surface border border-app text-muted-app hover:text-app"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState title="Couldn't load instructors" description={error} onRetry={reload} />
      ) : loading ? (
        <div className="card-base p-5 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : instructors.length === 0 ? (
        <EmptyState icon="UserCog" title="No instructors found" description="Add an instructor or adjust your search / filter." />
      ) : (
        <div className="card-base overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/40 border-b border-app">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-app">Instructor</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-app">Designation</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-app">Department</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-muted-app">Courses</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-muted-app">Sections</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-muted-app">Students</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-muted-app">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted-app">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app">
                {instructors.map((t, i) => (
                  <motion.tr key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer" onClick={() => setViewingId(t.id)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <img src={t.photoUrl ? fileUrl(t.photoUrl) : avatar(t.name)} alt={t.name} className="w-9 h-9 rounded-full object-cover" />
                        <div>
                          <p className="font-semibold text-app">{t.name}</p>
                          <p className="font-mono text-[11px] text-muted-app">{t.username}{t.email ? ` · ${t.email}` : ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-app">{t.designation || <span className="opacity-40">—</span>}</td>
                    <td className="px-4 py-3">{t.department ? <Badge color="violet">{t.department}</Badge> : <span className="opacity-40">—</span>}</td>
                    <td className="px-4 py-3 text-center font-bold text-app">{t.offerings}</td>
                    <td className="px-4 py-3 text-center font-bold text-app">{t.sections}</td>
                    <td className="px-4 py-3 text-center font-bold text-app">{t.students}</td>
                    <td className="px-4 py-3 text-center">
                      {t.isActive ? <Badge color="emerald">Active</Badge> : <Badge color="slate">Inactive</Badge>}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setViewingId(t.id)} className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/30 text-blue-600 rounded-lg" title="View profile"><Eye size={14} /></button>
                        <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-amber-600 rounded-lg" title="Edit"><Pencil size={14} /></button>
                        <button onClick={() => navigate("/admin/quick-messages")} className="p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-600 rounded-lg" title="Message"><Mail size={14} /></button>
                        <button onClick={() => setDeleting(t)} className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 rounded-lg" title="Delete"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW PROFILE */}
      <ViewInstructorModal
        id={viewingId}
        onClose={() => setViewingId(null)}
        onEdit={(inst) => { setViewingId(null); openEdit(inst); }}
        onPhoto={reload}
      />

      {/* CROSS-DEPARTMENT INSTRUCTOR LOAN WORKFLOW (Req 4) */}
      <BorrowInstructorModal open={borrowOpen} onClose={() => setBorrowOpen(false)} />

      {/* CREATE / EDIT FORM */}
      <Modal open={formOpen} onClose={() => !saving && setFormOpen(false)} title={editing ? "Edit Instructor" : "Add Instructor"} subtitle={editing ? editing.username : "Create a new instructor account & profile"} icon={editing ? Pencil : Plus} maxWidth="max-w-3xl">
        <div className="space-y-5">
          {formErr && (
            <div className="flex items-center gap-2 text-sm bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">
              <AlertTriangle size={15} /> {formErr}
            </div>
          )}

          {/* Account */}
          <div>
            <p className="text-xs font-bold uppercase text-secondary-app mb-2 flex items-center gap-1.5"><KeyRound size={13} /> Account</p>
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Username" required>
                <input value={form.username} onChange={set("username")} disabled={!!editing} placeholder="e.g. jdoe" className="input-base w-full disabled:opacity-60" />
              </Field>
              <Field label="Login Email">
                <input value={form.email} onChange={set("email")} type="email" placeholder="instructor@aust.edu" className="input-base w-full" />
              </Field>
              <Field label={editing ? "Reset Password" : "Password"} required={!editing}>
                <input value={form.password} onChange={set("password")} type="password" placeholder={editing ? "Leave blank to keep" : "Min 8 characters"} className="input-base w-full" />
              </Field>
            </div>
            {editing && (
              <label className="flex items-center gap-2 mt-3 text-sm text-app cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={set("isActive")} className="rounded border-slate-300 text-primary-600" />
                Account active
              </label>
            )}
          </div>

          {/* Personal info */}
          <div>
            <p className="text-xs font-bold uppercase text-secondary-app mb-2 flex items-center gap-1.5"><IdCard size={13} /> Personal Information</p>
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Full Name" required>
                <input value={form.fullName} onChange={set("fullName")} placeholder="Dr. Jane Doe" className="input-base w-full" />
              </Field>
              <Field label="Father Name">
                <input value={form.fatherName} onChange={set("fatherName")} className="input-base w-full" />
              </Field>
              <Field label="CNIC">
                <input value={form.cnic} onChange={set("cnic")} placeholder="35201-1234567-8" className="input-base w-full" />
              </Field>
              <Field label="Date of Birth">
                <input value={form.dateOfBirth} onChange={set("dateOfBirth")} type="date" className="input-base w-full" />
              </Field>
              <Field label="Gender">
                <select value={form.gender} onChange={set("gender")} className="input-base w-full">
                  <option value="">Select…</option><option>Male</option><option>Female</option><option>Other</option>
                </select>
              </Field>
              <Field label="Marital Status">
                <select value={form.maritalStatus} onChange={set("maritalStatus")} className="input-base w-full">
                  <option value="">Select…</option><option>Single</option><option>Married</option>
                </select>
              </Field>
            </div>
          </div>

          {/* Professional */}
          <div>
            <p className="text-xs font-bold uppercase text-secondary-app mb-2 flex items-center gap-1.5"><Award size={13} /> Professional</p>
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Designation">
                <input value={form.designation} onChange={set("designation")} placeholder="Assistant Professor" className="input-base w-full" />
              </Field>
              <Field label="Qualification">
                <input value={form.qualification} onChange={set("qualification")} placeholder="PhD Computer Science" className="input-base w-full" />
              </Field>
              <Field label="Specialization">
                <input value={form.specialization} onChange={set("specialization")} placeholder="Machine Learning" className="input-base w-full" />
              </Field>
              <Field label="Department" required>
                <input value={form.department} onChange={set("department")} placeholder="e.g. Computer Science" className="input-base w-full" />
              </Field>
            </div>
          </div>

          {/* Contact */}
          <div>
            <p className="text-xs font-bold uppercase text-secondary-app mb-2 flex items-center gap-1.5"><Phone size={13} /> Contact</p>
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Phone">
                <input value={form.phone} onChange={set("phone")} className="input-base w-full" />
              </Field>
              <Field label="WhatsApp">
                <input value={form.whatsapp} onChange={set("whatsapp")} className="input-base w-full" />
              </Field>
              <Field label="Address">
                <input value={form.address} onChange={set("address")} className="input-base w-full" />
              </Field>
            </div>
          </div>

          <div className="flex gap-2 pt-3 border-t border-app">
            <button onClick={() => setFormOpen(false)} disabled={saving} className="btn-secondary flex-1">Cancel</button>
            <button onClick={submit} disabled={saving} className="btn-primary flex-1">{saving ? "Saving…" : editing ? "Save Changes" : "Create Instructor"}</button>
          </div>
        </div>
      </Modal>

      {/* DELETE CONFIRM */}
      <Modal open={!!deleting} onClose={() => !saving && setDeleting(null)} title="Remove Instructor" subtitle={deleting?.name} icon={Trash2} maxWidth="max-w-md">
        {deleting && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 text-sm bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2.5">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>Choose how to remove <strong>{deleting.name}</strong>. Deactivating is recommended — it keeps all historical records intact.</span>
            </div>
            <div className="space-y-2">
              <button onClick={() => confirmDelete(false)} disabled={saving} className="w-full surface border border-app rounded-xl p-3 text-left hover:border-primary-400 transition">
                <p className="font-semibold text-app flex items-center gap-2"><XCircle size={15} className="text-slate-500" /> Deactivate (soft delete)</p>
                <p className="text-xs text-muted-app mt-0.5">Disables login; preserves offerings, sections & history.</p>
              </button>
              <button onClick={() => confirmDelete(true)} disabled={saving} className="w-full surface border border-rose-200 dark:border-rose-900 rounded-xl p-3 text-left hover:border-rose-400 transition">
                <p className="font-semibold text-rose-600 flex items-center gap-2"><Trash2 size={15} /> Permanently delete</p>
                <p className="text-xs text-muted-app mt-0.5">Unassigns from courses/sections, then removes the account.</p>
              </button>
            </div>
            <button onClick={() => setDeleting(null)} disabled={saving} className="btn-secondary w-full">Cancel</button>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ------------------------------------------------------------
// View Instructor profile modal (loads full detail on open)
// ------------------------------------------------------------
const ViewInstructorModal = ({ id, onClose, onEdit, onPhoto }) => {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!id) { setDetail(null); return; }
    setLoading(true);
    api.coordinator.instructor(id)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [id]);

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await api.coordinator.uploadInstructorPhoto(id, fd);
      setDetail((d) => d ? { ...d, instructor: { ...d.instructor, personalInfo: { ...d.instructor.personalInfo, photoUrl: res.photoUrl } } } : d);
      onPhoto?.();
    } finally {
      setUploading(false);
    }
  };

  const inst = detail?.instructor;
  const pi = inst?.personalInfo || {};
  const w = detail?.workload || {};

  return (
    <Modal open={!!id} onClose={onClose} title={inst?.personalInfo?.fullName || "Instructor Profile"} subtitle={inst?.username} icon={UserCog} maxWidth="max-w-2xl">
      {loading || !detail ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="space-y-5">
          {/* Header card */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <img src={pi.photoUrl ? fileUrl(pi.photoUrl) : avatar(pi.fullName)} alt={pi.fullName} className="w-20 h-20 rounded-2xl object-cover border border-app" />
              <button onClick={() => fileRef.current?.click()} disabled={uploading} className="absolute -bottom-1.5 -right-1.5 p-1.5 bg-primary-600 text-white rounded-lg shadow hover:bg-primary-700" title="Update photo">
                <Camera size={13} />
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePhoto} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg text-app">{pi.fullName || inst.username}</h3>
              <p className="text-sm text-muted-app">{pi.designation || "Instructor"}{pi.department ? ` · ${pi.department}` : ""}</p>
              <div className="mt-1.5 flex items-center gap-2">
                {inst.isActive ? <Badge color="emerald">Active</Badge> : <Badge color="slate">Inactive</Badge>}
                {inst.email && <span className="text-xs text-muted-app flex items-center gap-1"><Mail size={11} /> {inst.email}</span>}
              </div>
            </div>
          </div>

          {/* Workload */}
          <div className="grid grid-cols-4 gap-3">
            <StatBox label="Courses" value={w.offerings ?? 0} icon={BookOpen} />
            <StatBox label="Sections" value={w.sections ?? 0} icon={Layers} />
            <StatBox label="Students" value={w.students ?? 0} icon={Users} />
            <StatBox label="Credits" value={w.totalCredits ?? 0} icon={GraduationCap} />
          </div>

          {/* Personal details */}
          <div>
            <p className="text-xs font-bold uppercase text-secondary-app mb-2">Personal Information</p>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
              <Detail icon={IdCard} label="CNIC" value={pi.cnic} />
              <Detail label="Father Name" value={pi.fatherName} />
              <Detail label="Date of Birth" value={pi.dateOfBirth} />
              <Detail label="Gender" value={pi.gender} />
              <Detail label="Marital Status" value={pi.maritalStatus} />
              <Detail icon={Award} label="Qualification" value={pi.qualification} />
              <Detail label="Specialization" value={pi.specialization} />
              <Detail icon={Phone} label="Phone" value={pi.phone} />
              <Detail label="WhatsApp" value={pi.whatsapp} />
              <Detail icon={Building2} label="Department" value={pi.department} />
              <Detail icon={MapPin} label="Address" value={pi.address} />
            </div>
          </div>

          {/* Assigned subjects / sections / courses */}
          <div>
            <p className="text-xs font-bold uppercase text-secondary-app mb-2">Assigned Subjects, Sections & Courses</p>
            {detail.assignments?.length ? (
              <div className="space-y-2">
                {detail.assignments.map((a) => (
                  <div key={a.offeringId} className="surface border border-app rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-app text-sm">
                        <span className="font-mono text-xs text-primary-600 dark:text-primary-400 mr-2">{a.courseCode}</span>
                        {a.courseTitle}
                      </span>
                      <span className="text-xs text-muted-app flex items-center gap-3">
                        <span className="flex items-center gap-1"><GraduationCap size={12} /> {a.creditHours} cr</span>
                        <span className="flex items-center gap-1"><Users size={12} /> {a.students}</span>
                      </span>
                    </div>
                    {a.sections?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {a.sections.map((s) => (
                          <span key={s.id} className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-muted-app border border-app">
                            Sec {s.name} · {s.enrolled}/{s.capacity}{s.room ? ` · ${s.room}` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-app">No course offerings assigned this term.</p>
            )}
          </div>

          <div className="flex gap-2 pt-3 border-t border-app">
            <button onClick={onClose} className="btn-secondary flex-1">Close</button>
            <button onClick={() => onEdit?.({ id: inst.id, username: inst.username, email: inst.email, name: pi.fullName, isActive: inst.isActive })} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
              <Pencil size={15} /> Edit Profile
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

const Detail = ({ icon: Icon, label, value }) => (
  <div>
    <p className="text-[11px] text-muted-app flex items-center gap-1">{Icon && <Icon size={11} />} {label}</p>
    <p className="text-app font-medium">{value || <span className="opacity-40">—</span>}</p>
  </div>
);

// ============================================================
// CROSS-DEPARTMENT INSTRUCTOR LOAN WORKFLOW  (Req 4)
//  A coordinator can (a) request an instructor from another
//  department, (b) see/approve/reject incoming requests to their
//  own department (choosing the specific instructor to lend).
//  This is the ONLY cross-department mechanism.
// ============================================================
const LOAN_STATUS_COLOR = { PENDING: "amber", APPROVED: "emerald", REJECTED: "rose", CANCELLED: "slate" };

const BorrowInstructorModal = ({ open, onClose }) => {
  const [tab, setTab] = useState("outgoing"); // outgoing | incoming | new
  const [rows, setRows] = useState([]);
  const [depts, setDepts] = useState([]);
  const [ownDept, setOwnDept] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // New-request form
  const [targetDept, setTargetDept] = useState("");
  const [customDept, setCustomDept] = useState("");      // Point 13 — "Other" dept text
  const [targetCourse, setTargetCourse] = useState("");   // offering id | "" | "Other"
  const [customCourse, setCustomCourse] = useState("");   // Point 13 — "Other" course text
  const [ownOfferings, setOwnOfferings] = useState([]);   // requesting dept's courses
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Approve flow (incoming)
  const [approving, setApproving] = useState(null); // request row
  const [approveInstrs, setApproveInstrs] = useState([]);
  const [chosenInstr, setChosenInstr] = useState("");

  const loadDepartments = () => {
    api.coordinator.loanDepartments()
      .then((d) => { setDepts(d.departments || []); setOwnDept(d.ownDepartment || null); })
      .catch(() => {});
  };

  // §3.3 — DEPARTMENT NAMES ONLY. The API row also carries coordinatorId /
  // coordinatorName; we deliberately project to a de-duplicated, sorted list
  // of plain department names so no coordinator (or any other) name can ever
  // leak into the "Request instructor from department" field.
  const deptNames = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const d of depts) {
      const name = String(d?.department || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [depts]);

  // Point 13 — load the requesting coordinator's OWN course offerings so the
  // course dropdown lists real courses (the borrowed instructor is wanted for
  // a course in the requester's department). Falls back gracefully on error.
  const loadOwnOfferings = () => {
    api.coordinator.allocation()
      .then((d) => setOwnOfferings(d.offerings || []))
      .catch(() => setOwnOfferings([]));
  };

  const loadRows = (box) => {
    setLoading(true); setErr("");
    api.coordinator.instructorLoans(`?box=${box}`)
      .then((d) => setRows(d.items || []))
      .catch((e) => setErr(e.message || "Failed to load requests"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    setMsg(""); setErr("");
    loadDepartments();
    if (tab === "new") loadOwnOfferings();
    if (tab === "outgoing" || tab === "incoming") loadRows(tab);
  }, [open, tab]);

  const resetNewForm = () => {
    setTargetDept(""); setCustomDept(""); setTargetCourse("");
    setCustomCourse(""); setReason("");
  };

  const submitRequest = async () => {
    // Point 13 — validation (mirrors the server-side checks).
    if (!targetDept) { setErr("Please choose a department to request from."); return; }
    if (targetDept === "Other" && !customDept.trim()) {
      setErr("Please enter the department name for the \"Other\" option."); return;
    }
    // §3.3 — the course is now MANDATORY.
    if (!targetCourse) {
      setErr("Please select the course this instructor is needed for."); return;
    }
    if (targetCourse === "Other" && !customCourse.trim()) {
      setErr("Please enter the course name for the \"Other\" option."); return;
    }
    setSubmitting(true); setErr(""); setMsg("");
    try {
      await api.coordinator.createInstructorLoan({
        owningDepartment: targetDept,
        customDepartment: targetDept === "Other" ? customDept.trim() : undefined,
        courseOfferingId: targetCourse,                       // offering id | "Other" (now always set)
        customCourse: targetCourse === "Other" ? customCourse.trim() : undefined,
        reason,
      });
      // §3.3 — Send Request works: confirm, clear the form and switch to the
      // outgoing list, which is reloaded so the new row appears immediately.
      setMsg("Request sent to the department coordinator.");
      resetNewForm();
      setTab("outgoing");
      loadRows("outgoing");
    } catch (e) {
      setErr(e?.data?.error || e.message || "Failed to send request.");
    } finally {
      setSubmitting(false);
    }
  };

  const openApprove = (row) => {
    setApproving(row); setChosenInstr(""); setApproveInstrs([]); setErr("");
    api.coordinator.loanDepartmentInstructors(row.owningDepartment)
      .then((d) => setApproveInstrs(d.instructors || []))
      .catch(() => {});
  };

  const doApprove = async () => {
    if (!chosenInstr) { setErr("Select an instructor to approve."); return; }
    try {
      await api.coordinator.approveInstructorLoan(approving.id, { instructorId: chosenInstr });
      setApproving(null); setMsg("Instructor approved and lent to the requesting department.");
      loadRows("incoming");
    } catch (e) { setErr(e.message || "Failed to approve."); }
  };

  const doReject = async (row) => {
    try {
      await api.coordinator.rejectInstructorLoan(row.id, {});
      setMsg("Request rejected."); loadRows("incoming");
    } catch (e) { setErr(e.message || "Failed to reject."); }
  };

  const doCancel = async (row) => {
    try {
      await api.coordinator.cancelInstructorLoan(row.id);
      setMsg("Request cancelled."); loadRows("outgoing");
    } catch (e) { setErr(e.message || "Failed to cancel."); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Cross-Department Instructor Requests" subtitle={ownDept ? `Your department: ${ownDept}` : "Borrow / lend instructors across departments"} icon={Building2} maxWidth="max-w-3xl">
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex items-center gap-1.5">
          {[
            { key: "outgoing", label: "My Requests" },
            { key: "incoming", label: "Incoming Requests" },
            { key: "new", label: "New Request" },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition ${tab === t.key ? "bg-primary-600 text-white shadow" : "surface border border-app text-muted-app hover:text-app"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {err && (
          <div className="flex items-center gap-2 text-sm bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">
            <AlertTriangle size={15} /> {err}
          </div>
        )}
        {msg && (
          <div className="flex items-center gap-2 text-sm bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2">
            <CheckCircle2 size={15} /> {msg}
          </div>
        )}

        {/* NEW REQUEST */}
        {tab === "new" && (
          <div className="space-y-4">
            {/* §3.3 — this field must show ONLY department names. Coordinator
                names (or any other names) are deliberately NOT rendered here. */}
            <Field label="Request instructor from department" required>
              <select
                value={targetDept}
                onChange={(e) => { setTargetDept(e.target.value); if (e.target.value !== "Other") setCustomDept(""); }}
                className="input-base w-full"
              >
                <option value="">— Select a department —</option>
                {deptNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
                {/* Point 13 — "Other" option for a department not in the list */}
                <option value="Other">Other (not listed)…</option>
              </select>
            </Field>

            {/* Point 13 — custom department entry when "Other" is chosen */}
            {targetDept === "Other" && (
              <Field label="Enter department name" required>
                <input
                  value={customDept}
                  onChange={(e) => setCustomDept(e.target.value)}
                  className="input-base w-full"
                  placeholder="e.g. Department of Robotics"
                />
              </Field>
            )}

            {/* §3.3 — the course this instructor is needed for is now MANDATORY
                (it used to be optional). Point 13's dependent dropdown of the
                requester's own offerings is preserved, plus "Other" free text. */}
            <Field label="Course this instructor is needed for" required>
              <select
                value={targetCourse}
                onChange={(e) => { setTargetCourse(e.target.value); if (e.target.value !== "Other") setCustomCourse(""); }}
                className="input-base w-full"
              >
                <option value="">— Select a course —</option>
                {ownOfferings.map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.course?.code} — {o.course?.title}
                  </option>
                ))}
                <option value="Other">Other (not listed)…</option>
              </select>
              <p className="mt-1 text-[11px] text-muted-app">
                Required — the owning department needs to know which course the instructor is for.
              </p>
            </Field>

            {/* Point 13 — custom course entry when "Other" is chosen */}
            {targetCourse === "Other" && (
              <Field label="Enter course name" required>
                <input
                  value={customCourse}
                  onChange={(e) => setCustomCourse(e.target.value)}
                  className="input-base w-full"
                  placeholder="e.g. CS-450 Advanced Robotics"
                />
              </Field>
            )}

            <Field label="Reason (optional)">
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="input-base w-full" placeholder="Why do you need to borrow an instructor?" />
            </Field>
            <button onClick={submitRequest} disabled={submitting} className="btn-primary flex items-center gap-1.5 disabled:opacity-60">
              <Building2 size={16} /> {submitting ? "Sending…" : "Send Request"}
            </button>
          </div>
        )}

        {/* OUTGOING / INCOMING LISTS */}
        {(tab === "outgoing" || tab === "incoming") && (
          loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : rows.length === 0 ? (
            <EmptyState icon="Building2" title="No requests" description={tab === "outgoing" ? "You haven't requested any instructors yet." : "No incoming requests from other departments."} />
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="surface border border-app rounded-xl p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge color={LOAN_STATUS_COLOR[r.status] || "slate"}>{r.status}</Badge>
                      <span className="text-sm font-semibold text-app">
                        {tab === "outgoing" ? `To: ${r.owningDepartment}` : `From: ${r.requestingDepartment}`}
                      </span>
                    </div>
                    <p className="text-xs text-muted-app mt-1">
                      {tab === "outgoing"
                        ? (r.approvedInstructorName ? `Approved instructor: ${r.approvedInstructorName}` : "Awaiting approval")
                        : `Requested by: ${r.requestingCoordinatorName || "—"}`}
                      {r.reason ? ` · ${r.reason}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {tab === "incoming" && r.status === "PENDING" && (
                      <>
                        <button onClick={() => openApprove(r)} className="btn-primary py-1.5 px-3 text-xs flex items-center gap-1"><CheckCircle2 size={13} /> Approve</button>
                        <button onClick={() => doReject(r)} className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1"><XCircle size={13} /> Reject</button>
                      </>
                    )}
                    {tab === "outgoing" && r.status === "PENDING" && (
                      <button onClick={() => doCancel(r)} className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1"><Trash2 size={13} /> Cancel</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* APPROVE — choose specific instructor */}
      <Modal open={!!approving} onClose={() => setApproving(null)} title="Approve & Lend Instructor" subtitle={approving ? `To: ${approving.requestingDepartment}` : ""} icon={CheckCircle2} maxWidth="max-w-md">
        <div className="space-y-4">
          <Field label="Select the instructor to lend" required>
            <select value={chosenInstr} onChange={(e) => setChosenInstr(e.target.value)} className="input-base w-full">
              <option value="">— Select an instructor —</option>
              {approveInstrs.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </Field>
          {approveInstrs.length === 0 && (
            <p className="text-xs text-muted-app">No instructors found in your department to lend.</p>
          )}
          <div className="flex gap-2 pt-2 border-t border-app">
            <button onClick={() => setApproving(null)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={doApprove} disabled={!chosenInstr} className="btn-primary flex-1 disabled:opacity-60">Approve</button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
};

export default Teachers;
