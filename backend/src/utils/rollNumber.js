/**
 * Roll Number Generator
 *
 * Format: <PROGRAM_SHORT_FORM>-<TERM>-<SERIAL>
 * Examples:
 *   ADCS-F26-101  (Associate Degree in Computer Science, Fall 2026, serial 101)
 *   BSCS-F26-101  (BS Computer Science, Fall 2026, serial 101)
 *
 * Term codes:
 *   F26 = Fall 2026,  S27 = Spring 2027,  etc.
 *   Configurable per AdmissionCycle via cycle.termCode.
 *
 * NOTE (Master Prompt Section 1): Roll / Registration numbers are now
 * generated for EVERY program using each program's OWN short form + numbering
 * scheme (stored on the Program row). The serial (student sequence number) is
 * shared between the Roll Number and the Registration Number for the same
 * student and starts at 101 within each (program, term) bucket.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * The roll-number prefix is the program's short form (uppercased, alnum only).
 * Falls back to the program code, then 'PROG'.
 */
function getProgramPrefix(program) {
  if (typeof program === 'string') {
    return String(program).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'PROG';
  }
  const sf = (program?.shortForm || program?.code || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return sf || 'PROG';
}

/**
 * Derive a default term code from an AdmissionCycle row, falling back to
 * "F<YY>" using the cycle.startDate year. Only used if cycle.termCode is unset.
 */
function deriveTermCode(cycle) {
  if (cycle && cycle.termCode && String(cycle.termCode).trim()) {
    return String(cycle.termCode).toUpperCase().trim();
  }
  // startDate format YYYY-MM-DD
  const start = cycle?.startDate || '';
  const year = start.substring(2, 4) || String(new Date().getFullYear()).substring(2, 4);
  const monthNum = parseInt(start.substring(5, 7) || '8', 10);
  // Jan-Jun => Spring, Jul-Dec => Fall
  const season = monthNum <= 6 ? 'S' : 'F';
  return `${season}${year}`;
}

/**
 * Generate the next available roll number for the given program + cycle.
 * The chosen serial is returned alongside so the Registration Number can reuse
 * the exact same student sequence number.
 *
 * @param {{ program: object, cycle: object, serial?: number }} args
 * @returns {Promise<{ rollNumber: string, serial: number, term: string, prefix: string }>}
 */
async function generateRollNumberDetailed({ program, cycle, serial }) {
  const prefix = getProgramPrefix(program);
  const term = deriveTermCode(cycle);
  const matchPrefix = `${prefix}-${term}-`;

  let nextSerial = serial;
  if (nextSerial == null) {
    // Prefer the program's stored regNextSerial counter when available,
    // otherwise scan existing roll numbers for the highest serial.
    const scanMax = async () => {
      const existing = await prisma.enrollment.findMany({
        where: { rollNumber: { startsWith: matchPrefix } },
        select: { rollNumber: true },
      });
      let maxSerial = 100; // start at 101
      for (const e of existing) {
        const m = String(e.rollNumber).match(/-(\d+)$/);
        if (m) {
          const n = parseInt(m[1], 10);
          if (!Number.isNaN(n) && n > maxSerial) maxSerial = n;
        }
      }
      return maxSerial + 1;
    };
    const stored = program?.regNextSerial;
    nextSerial = (typeof stored === 'number' && stored >= 101) ? stored : await scanMax();
  }

  // Ensure uniqueness — walk forward if a clash exists.
  for (let i = 0; i < 5000; i++) {
    const candidate = `${matchPrefix}${nextSerial}`;
    // eslint-disable-next-line no-await-in-loop
    const clash = await prisma.enrollment.findUnique({
      where: { rollNumber: candidate },
      select: { id: true },
    }).catch(() => null);
    if (!clash) {
      return { rollNumber: candidate, serial: nextSerial, term, prefix };
    }
    nextSerial += 1;
  }
  return { rollNumber: `${matchPrefix}${nextSerial}`, serial: nextSerial, term, prefix };
}

/**
 * Backwards-compatible wrapper — returns just the roll number string.
 * Accepts either { program, cycle } (preferred) or legacy { programCode, cycle }.
 */
async function generateRollNumber({ program, programCode, cycle }) {
  const prog = program || { shortForm: programCode, code: programCode };
  const { rollNumber } = await generateRollNumberDetailed({ program: prog, cycle });
  return rollNumber;
}

module.exports = { generateRollNumber, generateRollNumberDetailed, getProgramPrefix, deriveTermCode };
