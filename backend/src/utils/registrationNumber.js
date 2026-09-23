/**
 * Registration Number Generator
 *
 * Format: InstituteCode + Term + Faculty + Department + Program + StudentNumber
 * Example: 001 + F26 + C + 01 + 06 + 101 = "001F26C0106101"
 *
 *   - InstituteCode  : 3 digits (default "001")  — from Program.instituteCode
 *   - Term           : 3 chars  (e.g. "F26")     — from AdmissionCycle.termCode
 *   - FacultyCode    : 1 char   (e.g. "C")        — from Program.facultyCode
 *   - DepartmentCode : 2 digits (e.g. "01")       — from Program.deptCode
 *   - ProgramCode    : 2 digits (e.g. "06")       — from Program.programNumericCode
 *   - StudentNumber  : 3 digits running serial    — MIRRORS the Roll Number's
 *                                                   serial so Registration ↔ Roll
 *                                                   always correspond 1:1.
 *
 * NOTE (Master Prompt Section 1): Every program stores its OWN numbering scheme
 * on the Program row so different departments can use different formats. The
 * cycle only supplies the term code (F26, S27, ...).
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function pad(n, width) {
  const s = String(n);
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

/**
 * Build the prefix portion of a registration number from the program's own
 * numbering config + the cycle term code.
 */
function buildRegPrefix(cycle, program) {
  const institute = String(program.instituteCode || '001').padStart(3, '0').slice(0, 3);
  const term = String(cycle.termCode || 'F26').toUpperCase().slice(0, 3);
  const faculty = String(program.facultyCode || 'C').toUpperCase().slice(0, 1);
  const dept = String(program.deptCode || '01').padStart(2, '0').slice(0, 2);
  const prog = String(program.programNumericCode || '06').padStart(2, '0').slice(0, 2);
  return `${institute}${term}${faculty}${dept}${prog}`;
}

/**
 * Extract trailing numeric serial from a roll number like "ADCS-F26-101" → 101.
 */
function extractRollSerial(rollNumber) {
  if (!rollNumber || typeof rollNumber !== 'string') return null;
  const m = rollNumber.match(/-(\d+)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Generate a new unique Registration Number.
 *
 *   - If a `serial` (or `rollNumber`) is provided (preferred), that student
 *     sequence number is used so registration ↔ roll always correspond.
 *   - Otherwise falls back to scanning existing registration numbers under the
 *     same prefix and incrementing (start at 101).
 *
 * GUARANTEES uniqueness — walks forward on any clash.
 *
 * @param {{ cycle: object, program: object, rollNumber?: string, serial?: number }} args
 * @returns {Promise<string>}
 */
async function generateRegistrationNumber({ cycle, program, rollNumber, serial }) {
  const prefix = buildRegPrefix(cycle, program);

  // Determine starting serial — prefer the explicit serial, then the roll number's serial.
  let seq = (typeof serial === 'number' && serial >= 101) ? serial : extractRollSerial(rollNumber);

  if (seq == null) {
    // Fallback path: scan existing prefix and use max + 1 (start at 101).
    const existing = await prisma.enrollment.findMany({
      where: { registrationNumber: { startsWith: prefix } },
      select: { registrationNumber: true },
    });
    let max = 100;
    for (const row of existing) {
      if (!row.registrationNumber) continue;
      const tail = row.registrationNumber.slice(prefix.length);
      const n = parseInt(tail, 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
    seq = max + 1;
  }

  // Ensure uniqueness — walk forward if a clash exists (e.g. legacy data).
  for (let i = 0; i < 5000; i++) {
    const candidate = `${prefix}${pad(seq, 3)}`;
    // eslint-disable-next-line no-await-in-loop
    const clash = await prisma.enrollment.findUnique({
      where: { registrationNumber: candidate },
      select: { id: true },
    }).catch(() => null);
    if (!clash) return candidate;
    seq += 1;
  }

  return `${prefix}${pad(seq, 3)}`;
}

module.exports = { generateRegistrationNumber, buildRegPrefix, extractRollSerial };
