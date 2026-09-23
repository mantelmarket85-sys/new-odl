/**
 * Course Coordinator scope — ADCS only.
 *
 * The Course Coordinator role manages a single degree program:
 *   ADCS — Associate Degree in Computer Science
 *
 * This module centralizes that restriction so every page in the
 * Course Coordinator panel (/admin/*) shows ADCS-only data, while
 * Admin/Teacher/Student panels remain unaffected.
 */

import { degreePrograms as ALL_PROGRAMS } from "../data/mockData";

/** Single program code managed by the Course Coordinator. */
export const COORDINATOR_PROGRAM_CODE = "ADCS";
export const COORDINATOR_PROGRAM_NAME = "Associate Degree in Computer Science";

/** Programs available to the coordinator (filtered to ADCS only). */
export const coordinatorPrograms = ALL_PROGRAMS.filter(
  (p) => p.id === COORDINATOR_PROGRAM_CODE
);

/**
 * Returns true if the given program identifier corresponds to ADCS.
 * Accepts either a 2/4/5-letter code (ADCS, BSCS) or a full name.
 */
export const isCoordinatorProgram = (programOrCode) => {
  if (!programOrCode) return false;
  const v = String(programOrCode).toUpperCase();
  return v.includes("ADCS") || v.includes("ASSOCIATE DEGREE");
};

/**
 * Filters an array of records to ADCS-only items.
 * The matcher checks common field names: program, programCode, code, degree.
 */
export const filterToADCS = (records = []) =>
  records.filter((r) => {
    if (!r || typeof r !== "object") return false;
    const fields = [r.program, r.programCode, r.code, r.degree, r.programName];
    return fields.some((f) => isCoordinatorProgram(f));
  });
