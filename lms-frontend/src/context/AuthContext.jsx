import { createContext, useContext, useState, useEffect } from "react";
import authService from "../services/authService";
import { fileUrl } from "../services/api";

const AuthContext = createContext();

/* =========================================================================
 * BACKEND ↔ FRONTEND ROLE MAPPING
 * --------------------------------------------------------------------------
 * The backend LmsUser.role uses canonical names; the LMS frontend uses its
 * own internal role keys (the ones in ROLE_PROFILES below). Keep these two
 * maps in sync with backend/src/utils/lmsRoles.js.
 * ======================================================================= */
export const BACKEND_ROLE_TO_FRONTEND = {
  Student: "student",
  Teacher: "teacher",
  CourseCoordinator: "admin",
  FocalPerson: "focal_person",
  ExamController: "exam_coordinator",
  QECCoordinator: "director_qec",
  Provost: "provost",
};
export const FRONTEND_ROLE_TO_BACKEND = Object.fromEntries(
  Object.entries(BACKEND_ROLE_TO_FRONTEND).map(([k, v]) => [v, k])
);

/* =========================================================================
 * ENTERPRISE ROLE PROFILES
 * --------------------------------------------------------------------------
 * Existing roles: student, teacher, admin (Course Coordinator).
 * NEW enterprise roles added without touching existing ones:
 *   - exam_coordinator (Exam Controller)
 *   - focal_person
 *   - director_qec
 *   - provost (also handles finance coordination)
 * Each new role has its own dashboard, sidebar, controls and analytics.
 * ======================================================================= */
const ROLE_PROFILES = {
  // STUDENT — intentionally NO hardcoded identity. The real name / program /
  // semester / photo are ALWAYS sourced from the authenticated DB record via
  // GET /api/lms/auth/me (profile). We keep only neutral, non-identifying
  // fallbacks so the UI never renders a fake placeholder student name.
  student: {
    name: "",
    email: "",
    studentId: "",
    program: "",
    semester: "",
  },
  teacher: {
    name: "Dr. Muhammad Naeem",
    email: "naeem@aust.edu.pk",
    employeeId: "FAC-AUST-211",
    designation: "Chairman, Department of Computer Science",
    department: "Department of Computer Science",
    avatar: "https://ui-avatars.com/api/?name=Muhammad+Naeem&background=1e3a8a&color=fff&bold=true&size=128",
  },
  admin: {
    name: "Prof. Sarah Ahmed",
    email: "sarah.ahmed@aust.edu.pk",
    employeeId: "ADMIN-AUST-001",
    designation: "Course Coordinator",
    department: "Open & Distance Learning Wing",
    avatar: "https://ui-avatars.com/api/?name=Sarah+Ahmed&background=7c3aed&color=fff&bold=true&size=128",
  },
  /* ========== NEW ENTERPRISE ROLES ========== */
  exam_coordinator: {
    name: "Dr. Imran Hashmi",
    email: "imran.hashmi@aust.edu.pk",
    employeeId: "EXM-AUST-101",
    designation: "Exam Coordinator",
    department: "Examination Department",
    avatar: "https://ui-avatars.com/api/?name=Imran+Hashmi&background=dc2626&color=fff&bold=true&size=128",
  },
  focal_person: {
    name: "Dr. Saima Riaz",
    email: "saima.riaz@aust.edu.pk",
    employeeId: "FP-AUST-101",
    designation: "Focal Person — Department of Computer Science",
    department: "Department of Computer Science",
    avatar: "https://ui-avatars.com/api/?name=Saima+Riaz&background=0891b2&color=fff&bold=true&size=128",
  },
  director_qec: {
    name: "Prof. Dr. Nadia Aslam",
    email: "nadia.aslam@aust.edu.pk",
    employeeId: "QEC-AUST-101",
    designation: "Director — Quality Enhancement Cell",
    department: "Quality Enhancement Cell",
    avatar: "https://ui-avatars.com/api/?name=Nadia+Aslam&background=9333ea&color=fff&bold=true&size=128",
  },
  provost: {
    name: "Prof. Dr. Khalid Mehmood",
    email: "provost@aust.edu.pk",
    employeeId: "PRV-AUST-001",
    designation: "Provost & Finance Coordinator — AUST",
    department: "Office of the Provost",
    avatar: "https://ui-avatars.com/api/?name=Khalid+Mehmood&background=b45309&color=fff&bold=true&size=128",
  },
};

/* Role meta-data used for label / theme / display across the system. */
export const ROLE_META = {
  student:              { label: "Student",              color: "from-blue-500 to-indigo-600",   accent: "blue"    },
  teacher:              { label: "Teacher",              color: "from-emerald-500 to-teal-600",  accent: "emerald" },
  admin:                { label: "Course Coordinator",   color: "from-violet-500 to-purple-600", accent: "violet"  },
  exam_coordinator:     { label: "Exam Controller",      color: "from-rose-500 to-red-600",      accent: "rose"    },
  focal_person:         { label: "Focal Person",         color: "from-cyan-500 to-sky-600",      accent: "cyan"    },
  director_qec:         { label: "QEC Coordinator",      color: "from-purple-500 to-fuchsia-600",accent: "purple"  },
  provost:              { label: "Provost",              color: "from-amber-500 to-orange-600",  accent: "amber"   },
};

export const ALL_ROLES = Object.keys(ROLE_PROFILES);

/* =========================================================================
 * buildProfileFromMe(me)
 * --------------------------------------------------------------------------
 * SINGLE SOURCE OF TRUTH for the authenticated user identity. Given the
 * `/api/lms/auth/me` response it returns the unified `user` object used
 * everywhere (sidebar, navbar, dashboard, profile). For students the REAL
 * database record (me.profile) overrides every identity field — there is no
 * hardcoded / cached / localStorage-derived name. Non-student roles use the
 * static role descriptor (designation/department) which is org metadata, not
 * a fabricated person.
 * ======================================================================= */
export function buildProfileFromMe(me) {
  const frontendRole = BACKEND_ROLE_TO_FRONTEND[me.role] || "student";
  const base = ROLE_PROFILES[frontendRole] || ROLE_PROFILES.student;

  // Phase 1 §6 — DYNAMIC USER INFO. The person's identity (name / email /
  // username / department) ALWAYS comes from the authenticated DB record
  // (me + me.profile). ROLE_PROFILES is treated as ORG METADATA ONLY
  // (default designation label + avatar theme) and its hardcoded `name` /
  // `email` are NEVER rendered as the logged-in person. This kills the old
  // bug where e.g. a Course Coordinator "Irfan" showed as "Prof. Sarah Ahmed".
  const p = me.profile || {};

  const profile = {
    role: frontendRole,
    backendRole: me.role,
    username: me.username,
    userId: me.userId,
    mustChangePassword: me.mustChangePassword,
    // Org metadata (safe, non-identifying) from the role descriptor.
    designation: p.designation || base.designation || "",
    employeeId: base.employeeId || "",
  };

  if (frontendRole === "student") {
    // Students: identity comes ONLY from the DB profile returned by /me.
    profile.name = p.fullName || me.username || "";
    profile.studentId = p.rollNumber || p.registrationNumber || me.username || "";
    profile.registrationNumber = p.registrationNumber || null;
    profile.rollNumber = p.rollNumber || null;
    profile.program = p.program || p.programShortForm || "";
    profile.programShortForm = p.programShortForm || null;
    profile.department = p.department || null;
    profile.session = p.session || null;
    profile.semester = p.semester != null ? p.semester : "";
    profile.email = p.email || me.email || "";
    profile.phone = p.phone || null;
    profile.verificationStatus = p.verificationStatus || null;
    profile.enrollmentStatus = p.enrollmentStatus || null;
    // Real photo only — no fake ui-avatars placeholder for students.
    if (p.photoUrl) profile.avatar = fileUrl(p.photoUrl);
  } else {
    // Staff roles (Teacher, Course Coordinator, Focal Person, …): the name,
    // email and department are ALWAYS the DB values — real profile first,
    // then the authenticated LmsUser fields, then the username. We never fall
    // back to the fabricated ROLE_PROFILES person name.
    profile.name = p.fullName || me.fullName || me.username || "";
    profile.email = p.email || me.email || "";
    profile.phone = p.phone || null;
    // Department drives LMS isolation — always the DB value (no hardcoded dept).
    profile.department = p.department || me.department || "";
    if (p.designation) profile.designation = p.designation;
    // Photo: real uploaded photo if present, else a themed avatar generated
    // from the REAL name (not a hardcoded placeholder identity).
    if (p.photoUrl) {
      profile.avatar = fileUrl(p.photoUrl);
    } else if (profile.name) {
      const seed = encodeURIComponent(profile.name);
      profile.avatar = `https://ui-avatars.com/api/?name=${seed}&background=1e3a8a&color=fff&bold=true&size=128`;
    }
  }

  return profile;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  /* On mount: if an LMS session token exists, verify it with the backend
   * (GET /api/lms/auth/me). On success, hydrate `user` with the correct
   * frontend role profile. On failure (invalid/expired), clear the session.
   * If no LMS token exists we still honor a previously cached `aust_user`
   * so the existing mock/demo behavior is preserved for local browsing. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = authService.getToken();
      if (token) {
        try {
          const me = await authService.getMe();
          if (cancelled) return;
          // SINGLE SOURCE OF TRUTH — build the identity from the live /me
          // response (real DB record for students). Never trust a stale
          // cached name.
          const profile = buildProfileFromMe(me);
          localStorage.setItem("aust_user", JSON.stringify(profile));
          setUser(profile);
        } catch (e) {
          // Token invalid/expired → clear the LMS session (no redirect here;
          // the protected route wrapper handles navigation to /login).
          authService.logout(false);
          localStorage.removeItem("aust_user");
          if (!cancelled) setUser(null);
        } finally {
          if (!cancelled) setLoading(false);
        }
      } else {
        const stored = localStorage.getItem("aust_user");
        if (stored) {
          try { setUser(JSON.parse(stored)); } catch (_) { /* ignore */ }
        }
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* login(role, data)
   * Backwards-compatible signature kept intact for existing callers.
   * `role` here is the FRONTEND role key (e.g. "student", "admin").
   *
   * CRITICAL FIX (student name consistency): immediately after a successful
   * backend login we fetch the authoritative /api/lms/auth/me record and
   * hydrate the user from the REAL database profile. This guarantees the
   * sidebar + dashboard show the correct student name from the very first
   * render — not the (now-removed) hardcoded placeholder. We seed an interim
   * object first so the protected route can render without a flash, then
   * overwrite it with the live DB identity. */
  const login = async (role, data = {}) => {
    const base = ROLE_PROFILES[role] || ROLE_PROFILES.student;
    // Interim object (no fabricated name) used only until /me resolves.
    const interim = { role, ...base, ...data, name: data.name || base.name || "" };
    localStorage.setItem("aust_user", JSON.stringify(interim));
    setUser(interim);
    try {
      const me = await authService.getMe();
      const profile = buildProfileFromMe(me);
      localStorage.setItem("aust_user", JSON.stringify(profile));
      setUser(profile);
      return profile;
    } catch (_) {
      // If /me fails for any reason, keep the interim object (route guard /
      // mount effect will retry hydration). Never invent a name.
      return interim;
    }
  };

  const logout = () => {
    localStorage.removeItem("aust_user");
    setUser(null);
    // Clear the backend LMS session + redirect to the LMS login page.
    authService.logout(true);
  };

  /* refreshUser()
   * Re-fetch the authoritative /api/lms/auth/me record and rebuild the
   * global identity. Used after a profile update (e.g. a Course Coordinator
   * changing their name in Settings) so the new name propagates in real time
   * to the header, sidebar, dashboard and everywhere `useAuth().user` is read. */
  const refreshUser = async () => {
    try {
      const me = await authService.getMe();
      const profile = buildProfileFromMe(me);
      localStorage.setItem("aust_user", JSON.stringify(profile));
      setUser(profile);
      return profile;
    } catch (_) {
      return user;
    }
  };

  /* updateUser(patch)
   * Optimistically merge fields into the current user so UI updates instantly
   * (before/while refreshUser confirms against the backend). */
  const updateUser = (patch = {}) => {
    setUser((prev) => {
      const next = { ...(prev || {}), ...patch };
      try { localStorage.setItem("aust_user", JSON.stringify(next)); } catch (_) { /* ignore */ }
      return next;
    });
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
