// ============================================================
//  FOCAL PERSON — DEPARTMENT ISOLATION HELPERS (frontend-only)
//  ------------------------------------------------------------
//  A Focal Person must ONLY ever see data belonging to their own
//  department. The backend already department-scopes every focal
//  endpoint (buildDeptScope middleware), so the data reaching the
//  frontend is already isolated. These helpers close the remaining
//  UI gaps WITHOUT touching the backend, API contracts, routes,
//  auth, business logic, styling or any other role:
//
//    - useFocalDepartment()  → the logged-in Focal Person's own
//      department name (dynamic, session-based, never hardcoded).
//      Returns "" for any non-focal role, so shared components used
//      by other roles are completely unaffected.
//
//    - stripCrossDeptFilters(filters) → removes cross-department
//      filter dropdowns (e.g. a "Program" selector that would list
//      other departments' programs) from a shared filter set, but
//      ONLY for the Focal Person role. Other roles keep the full
//      filter set unchanged.
//
//    - filterByDepartment(rows, dept) → defensive frontend fallback
//      that keeps only rows whose department matches, for any list
//      that happens to expose a department field. It is a no-op when
//      no department is provided (so it never hides data for roles
//      that are not department-scoped).
//
//  All of this is additive and isolated: it changes only the data a
//  Focal Person sees, never the layout, components or behaviour.
// ============================================================
import { useAuth } from "../context/AuthContext";

/** The logged-in Focal Person's own department (""; for any other role). */
export function useFocalDepartment() {
  const { user } = useAuth();
  if (!user || user.role !== "focal_person") return "";
  return (user.department || "").trim();
}

/** True when the current session belongs to a Focal Person. */
export function useIsFocalPerson() {
  const { user } = useAuth();
  return !!(user && user.role === "focal_person");
}

/**
 * Remove cross-department filter dropdowns for the Focal Person role.
 * `isFocal` MUST be passed by the caller (from useIsFocalPerson()) so this
 * stays a pure function. For non-focal callers the filters are returned
 * unchanged — other roles are never affected.
 *
 * The "program" filter is stripped because a Focal Person is bound to a
 * single department; letting them pick another department's program would
 * imply cross-department access. (Backend already scopes the data, so this
 * is a UI-consistency measure, not a security boundary.)
 */
export function stripCrossDeptFilters(filters = [], isFocal = false, keys = ["program"]) {
  if (!isFocal) return filters;
  return filters.filter((f) => !keys.includes(f.key));
}

/**
 * Defensive frontend department filter. Keeps only rows whose department
 * matches `dept` (case-insensitive). No-op when `dept` is empty, so it never
 * hides data for non-department-scoped roles.
 *
 * @param {Array} rows
 * @param {string} dept  the focal person's own department
 * @param {string} field the row property that carries the department name
 */
export function filterByDepartment(rows = [], dept = "", field = "department") {
  const target = (dept || "").trim().toLowerCase();
  if (!target) return rows;
  return rows.filter((r) => {
    const v = r && r[field] != null ? String(r[field]).trim().toLowerCase() : "";
    // If a row has no department field at all, keep it — the backend already
    // scoped the dataset, so absence of the field is not evidence of leakage.
    return v === "" || v === target;
  });
}
