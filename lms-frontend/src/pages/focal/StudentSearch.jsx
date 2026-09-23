import { useState } from "react";
import PageHeader from "../../components/common/PageHeader";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import ExportButtons from "../../components/enterprise/ExportButtons";
import Modal from "../../components/common/Modal";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { Search, X, FileText, BookOpen, Loader2, AlertTriangle, CalendarCheck, ClipboardList, HelpCircle, GraduationCap, DollarSign, History, User } from "lucide-react";

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");
const Section = ({ icon: Icon, title, children }) => (
  <div>
    <h3 className="font-bold text-app flex items-center gap-2 mb-2 text-sm">
      <Icon size={16} className="text-primary-600 dark:text-primary-400" /> {title}
    </h3>
    <div className="surface border border-app rounded-lg overflow-hidden">{children}</div>
  </div>
);
const Empty = ({ msg }) => <p className="text-sm text-muted-app text-center py-6">{msg}</p>;
const Th = ({ children }) => <th className="text-left p-2 text-xs font-semibold text-muted-app whitespace-nowrap">{children}</th>;
const Td = ({ children, className = "" }) => <td className={`p-2 text-app ${className}`}>{children}</td>;

const RISK_COLOR = { LOW: "emerald", MEDIUM: "amber", HIGH: "rose", CRITICAL: "rose" };

const StudentSearch = () => {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const { data, loading, error, reload } = useApi(
    () => api.focal.students(query ? `?search=${encodeURIComponent(query)}&pageSize=100` : "?pageSize=100"),
    [query]
  );

  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const results = data?.items || [];

  const openDetail = async (id) => {
    setLoadingDetail(true);
    setDetail({});
    try {
      const r = await api.focal.student(id);
      setDetail(r.student);
    } catch (e) {
      setDetail({ error: e.message });
    } finally {
      setLoadingDetail(false);
    }
  };

  const columns = [
    { key: "roll", label: "Roll No", render: (v) => <span className="font-mono text-xs">{v}</span> },
    { key: "name", label: "Name", render: (v) => <span className="font-bold text-app text-sm">{v}</span> },
    { key: "program", label: "Program" },
    { key: "session", label: "Session" },
    { key: "cnic", label: "CNIC", render: (v) => <span className="font-mono text-xs">{v}</span> },
    { key: "phone", label: "Mobile", render: (v) => <span className="font-mono text-xs">{v}</span> },
    { key: "email", label: "Email", render: (v) => <span className="text-xs">{v}</span> },
    { key: "registrations", label: "Courses", render: (v) => <span className="font-mono text-xs">{v}</span> },
    { key: "isActive", label: "Status", render: (v) => (
      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${v ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>{v ? "Active" : "Inactive"}</span>
    )},
    { key: "actions", label: "Profile", sortable: false, render: (_, r) => (
      <button onClick={() => openDetail(r.id)} className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1">
        <FileText size={12} /> View
      </button>
    )},
  ];

  const t = detail && !detail.error ? detail : null;
  const cgpa = t?.cgpa ?? 0;
  const semGpa = t?.gpa ?? 0;
  // Section is captured per-registration; surface the most recent one.
  const section = t?.enrollmentHistory?.[0]?.section || "—";
  const semester = t?.enrollmentHistory?.[0]?.term || t?.profile?.session || "—";

  return (
    <div>
      <PageHeader
        title="Advanced Student Search"
        subtitle="Search the live student directory and view full academic profiles & results."
        icon="Search"
        breadcrumb={["Focal Person", "Student Search"]}
      />

      <div className="card-base p-5 mb-4">
        <form onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, roll number, CNIC, email…" className="input-base w-full pl-10 text-sm" />
          </div>
          <button type="submit" className="btn-primary text-sm px-5">Search</button>
          <button type="button" onClick={() => { setSearch(""); setQuery(""); }} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-app text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={13} /> Reset
          </button>
        </form>
        {!loading && (
          <p className="text-xs text-muted-app mt-3 inline-flex items-center gap-1">
            <Search size={11} /> <b className="text-app">{results.length}</b> students match your criteria.
          </p>
        )}
      </div>

      {error ? (
        <ErrorState title="Couldn't load students" description={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          <div className="card-base p-3 mb-4 flex justify-end">
            <ExportButtons title="Student Search Results" columns={columns.filter((c) => c.key !== "actions")} rows={results} filename="student_search" />
          </div>
          {results.length === 0 ? (
            <EmptyState icon="Search" title="No students found" description="Try a different search term." />
          ) : (
            <EnterpriseTable columns={columns} rows={results} pageSize={15} />
          )}
        </>
      )}

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={t ? `Profile — ${t.name}` : "Student Profile"}
        subtitle={t ? `${t.roll} • Academic record` : ""}
        icon={FileText}
        maxWidth="max-w-4xl"
      >
        {loadingDetail ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="animate-spin text-primary-600" /></div>
        ) : detail?.error ? (
          <p className="text-sm text-rose-600 text-center py-6">{detail.error}</p>
        ) : t ? (
          <div className="space-y-5">
            {/* ---- Top stat cards: CGPA, Semester GPA, Attendance, Status ---- */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-app">CGPA</p>
                <p className="font-extrabold text-3xl text-primary-600 dark:text-primary-400">{Number(cgpa).toFixed(2)}</p>
                <p className="text-[10px] text-muted-app mt-0.5">Sem GPA {Number(semGpa).toFixed(2)}</p>
              </div>
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-app">Attendance</p>
                <p className="font-extrabold text-3xl text-app">{t.attendance?.pct ?? 0}%</p>
                <p className="text-[10px] text-muted-app mt-0.5">{t.attendance?.present ?? 0}/{t.attendance?.total ?? 0} classes</p>
              </div>
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-app">Academic Status / Risk</p>
                <span className={`inline-block text-[10px] font-bold uppercase px-2 py-1 rounded-full mt-1 bg-${RISK_COLOR[t.risk] || "slate"}-100 text-${RISK_COLOR[t.risk] || "slate"}-700 dark:bg-${RISK_COLOR[t.risk] || "slate"}-950/40 dark:text-${RISK_COLOR[t.risk] || "slate"}-300`}>{t.risk}</span>
                {t.failing > 0 && <p className="text-[10px] text-rose-500 mt-1 inline-flex items-center gap-1"><AlertTriangle size={10} /> {t.failing} failing</p>}
              </div>
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-app">Account Status</p>
                <span className={`inline-block text-[10px] font-bold uppercase px-2 py-1 rounded-full mt-1 ${t.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>{t.isActive ? "Active" : "Inactive"}</span>
              </div>
            </div>

            {/* ---- Identity grid (Req 3: Name, Reg#, Program, Semester, Section, Department …) ---- */}
            <Section icon={User} title="Student Profile">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-app">
                {[
                  ["Name", t.name],
                  ["Reg #", t.profile?.registrationNumber],
                  ["Roll #", t.roll],
                  ["Program", t.profile?.program],
                  ["Semester / Session", semester],
                  ["Section", section],
                  ["Department", t.profile?.department],
                  ["Father", t.profile?.fatherName],
                  ["CNIC", t.profile?.cnic],
                  ["Phone", t.profile?.phone],
                  ["Email", t.profile?.email],
                  ["Gender", t.profile?.gender],
                ].map(([k, v]) => (
                  <div key={k} className="surface p-2.5">
                    <p className="text-[10px] text-muted-app uppercase tracking-wide">{k}</p>
                    <p className="font-semibold text-app break-words text-xs mt-0.5">{v || "—"}</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* ---- Course Performance (full result breakdown w/ real teacher) ---- */}
            <Section icon={BookOpen} title="Course Performance & Published Results">
              {(t.results || []).length === 0 ? <Empty msg="No published results yet." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                      <tr><Th>Code</Th><Th>Course</Th><Th>Teacher</Th><Th>Cr</Th><Th>Asg</Th><Th>Quiz</Th><Th>Mid</Th><Th>Final</Th><Th>%</Th><Th>Grade</Th><Th>GP</Th></tr>
                    </thead>
                    <tbody>
                      {t.results.map((r, i) => (
                        <tr key={i} className="border-t border-app">
                          <Td className="font-mono text-xs">{r.code}</Td>
                          <Td>{r.title}</Td>
                          <Td className="text-xs">{r.teacher}</Td>
                          <Td>{r.creditHours}</Td>
                          <Td className="font-mono text-xs">{r.assignmentMarks ?? "—"}</Td>
                          <Td className="font-mono text-xs">{r.quizMarks ?? "—"}</Td>
                          <Td className="font-mono text-xs">{r.midMarks ?? "—"}</Td>
                          <Td className="font-mono text-xs">{r.finalMarks ?? "—"}</Td>
                          <Td className="font-mono">{r.percent}%</Td>
                          <Td className="font-bold">{r.grade}</Td>
                          <Td className="font-mono">{r.gradePoints}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* ---- Mid-Term & Final-Term side by side ---- */}
            <div className="grid md:grid-cols-2 gap-5">
              <Section icon={GraduationCap} title="Mid-Term Results">
                {(t.midTerm || []).length === 0 ? <Empty msg="No mid-term data." /> : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><Th>Code</Th><Th>Course</Th><Th>Teacher</Th><Th>Marks</Th></tr></thead>
                    <tbody>{t.midTerm.map((r, i) => (
                      <tr key={i} className="border-t border-app"><Td className="font-mono text-xs">{r.code}</Td><Td>{r.title}</Td><Td className="text-xs">{r.teacher}</Td><Td className="font-mono">{r.marks ?? "—"}</Td></tr>
                    ))}</tbody>
                  </table>
                )}
              </Section>
              <Section icon={GraduationCap} title="Final-Term Results">
                {(t.finalTerm || []).length === 0 ? <Empty msg="No final-term data." /> : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><Th>Code</Th><Th>Course</Th><Th>Teacher</Th><Th>Marks</Th></tr></thead>
                    <tbody>{t.finalTerm.map((r, i) => (
                      <tr key={i} className="border-t border-app"><Td className="font-mono text-xs">{r.code}</Td><Td>{r.title}</Td><Td className="text-xs">{r.teacher}</Td><Td className="font-mono">{r.marks ?? "—"}</Td></tr>
                    ))}</tbody>
                  </table>
                )}
              </Section>
            </div>

            {/* ---- Assignment & Quiz summaries side by side ---- */}
            <div className="grid md:grid-cols-2 gap-5">
              <Section icon={ClipboardList} title="Assignment Summary">
                {(t.assignments || []).length === 0 ? <Empty msg="No assignment submissions." /> : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><Th>Assignment</Th><Th>Teacher</Th><Th>Status</Th><Th>Marks</Th></tr></thead>
                    <tbody>{t.assignments.map((a, i) => (
                      <tr key={i} className="border-t border-app"><Td>{a.title}</Td><Td className="text-xs">{a.teacher}</Td><Td className="text-xs">{a.status}</Td><Td className="font-mono">{a.marks != null ? `${a.marks}/${a.total ?? "?"}` : "—"}</Td></tr>
                    ))}</tbody>
                  </table>
                )}
              </Section>
              <Section icon={HelpCircle} title="Quiz Summary">
                {(t.quizzes || []).length === 0 ? <Empty msg="No quiz attempts." /> : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><Th>Quiz</Th><Th>Teacher</Th><Th>Status</Th><Th>Score</Th></tr></thead>
                    <tbody>{t.quizzes.map((q, i) => (
                      <tr key={i} className="border-t border-app"><Td>{q.title}</Td><Td className="text-xs">{q.teacher}</Td><Td className="text-xs">{q.status}</Td><Td className="font-mono">{q.score != null ? `${q.score}/${q.total ?? "?"}` : "—"}</Td></tr>
                    ))}</tbody>
                  </table>
                )}
              </Section>
            </div>

            {/* ---- GPA History (per term) & Attendance summary ---- */}
            <Section icon={History} title="GPA / Academic History">
              {(t.academicHistory || []).length === 0 ? <Empty msg="No academic history." /> : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><Th>Term</Th><Th>Courses</Th><Th>Credits</Th><Th>GPA</Th></tr></thead>
                  <tbody>{t.academicHistory.map((h, i) => (
                    <tr key={i} className="border-t border-app"><Td>{h.term}</Td><Td>{h.courses}</Td><Td>{h.credits}</Td><Td className="font-mono font-bold">{Number(h.gpa).toFixed(2)}</Td></tr>
                  ))}</tbody>
                </table>
              )}
            </Section>

            {/* ---- Fine Record (Req 2/3) — live PAID/UNPAID from Account Book ---- */}
            <Section icon={DollarSign} title="Fine Record">
              {(t.fineRecord || []).length === 0 ? <Empty msg="No fines on record." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><Th>Title</Th><Th>Description</Th><Th>Amount</Th><Th>Issued</Th><Th>Due</Th><Th>Status</Th></tr></thead>
                    <tbody>{t.fineRecord.map((f, i) => (
                      <tr key={i} className="border-t border-app">
                        <Td className="font-semibold">{f.title}</Td>
                        <Td className="text-xs">{f.description || "—"}</Td>
                        <Td className="font-mono">Rs {Number(f.amount).toLocaleString()}</Td>
                        <Td className="text-xs">{fmtDate(f.issueDate)}</Td>
                        <Td className="text-xs">{fmtDate(f.dueDate)}</Td>
                        <Td>
                          <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${f.status === "PAID" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"}`}>{f.status}</span>
                        </Td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* ---- Enrollment History ---- */}
            <Section icon={CalendarCheck} title="Enrollment History">
              {(t.enrollmentHistory || []).length === 0 ? <Empty msg="No enrollment records." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead className="bg-slate-50 dark:bg-slate-800/50"><tr><Th>Course</Th><Th>Section</Th><Th>Term</Th><Th>Type</Th><Th>Status</Th><Th>Registered</Th></tr></thead>
                    <tbody>{t.enrollmentHistory.map((e, i) => (
                      <tr key={i} className="border-t border-app">
                        <Td className="text-xs">{e.course}</Td>
                        <Td>{e.section || "—"}</Td>
                        <Td className="text-xs">{e.term || "—"}</Td>
                        <Td className="text-xs">{e.type}</Td>
                        <Td><span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{e.status}</span></Td>
                        <Td className="text-xs">{fmtDate(e.registeredAt)}</Td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </Section>

            <div className="flex justify-end gap-2 pt-2 border-t border-app">
              <button onClick={() => setDetail(null)} className="btn-secondary">Close</button>
              <button onClick={() => window.print()} className="btn-primary"><FileText size={14} className="mr-2" /> Print / Export PDF</button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default StudentSearch;
