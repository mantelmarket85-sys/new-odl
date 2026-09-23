const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Safely parse a JSON string column, returning a fallback on any error.
function safeParseJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// GET /api/admission-cycle/active — get active cycle (public for students)
router.get('/active', async (req, res) => {
  try {
    const cycle = await prisma.admissionCycle.findFirst({
      where: { isOpen: true },
      orderBy: { createdAt: 'desc' },
      include: { feeAnnouncement: true },
    });
    // Backward-compatible alias for old clients still reading "applicationFee"
    if (cycle) cycle.applicationFee = cycle.applicationProcessingFee;
    res.json({ cycle });
  } catch (error) {
    console.error('Get active cycle error:', error);
    res.status(500).json({ error: 'Failed to fetch admission cycle' });
  }
});

// GET /api/admission-cycle — all cycles (admin)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const cycles = await prisma.admissionCycle.findMany({
      orderBy: { createdAt: 'desc' },
      include: { feeAnnouncement: true },
    });
    cycles.forEach((c) => { c.applicationFee = c.applicationProcessingFee; });
    res.json({ cycles });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch admission cycles' });
  }
});

// POST /api/admission-cycle — create new cycle
// Bank account information is centralised in PaymentMethodConfig + BankAccount tables.
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const {
      title, startDate, endDate, minMarksPercent,
      matricWeight, fscWeight, interviewWeight,
      applicationProcessingFee, applicationFee, // accept both for back-compat
      allowedPaymentMethods, // CSV of BANK_TRANSFER,BANK_GATEWAY,ONEBILL_VOUCHER
      termCode,
    } = req.body;

    if (!title || !startDate || !endDate) {
      return res.status(400).json({ error: 'Title, start date, and end date are required' });
    }

    const mw = parseFloat(matricWeight) || 30;
    const fw = parseFloat(fscWeight) || 40;
    const iw = parseFloat(interviewWeight) || 30;
    if (Math.abs(mw + fw + iw - 100) > 0.01) {
      return res.status(400).json({ error: 'Merit weightages must sum to 100%' });
    }

    await prisma.admissionCycle.updateMany({
      where: { isOpen: true },
      data: { isOpen: false },
    });

    const procFee = parseFloat(applicationProcessingFee ?? applicationFee) || 1200;

    // Sanitise allowed methods. (Master Prompt §5) EasyPaisa removed — the
    // online method is now BANK_GATEWAY. Legacy EASYPAISA input is accepted and
    // mapped to BANK_GATEWAY for backward compatibility with old clients/data.
    const VALID = ['BANK_TRANSFER', 'BANK_GATEWAY', 'ONEBILL_VOUCHER'];
    let methodsCsv = 'BANK_TRANSFER,BANK_GATEWAY,ONEBILL_VOUCHER';
    if (allowedPaymentMethods) {
      const arr = Array.isArray(allowedPaymentMethods)
        ? allowedPaymentMethods
        : String(allowedPaymentMethods).split(',');
      const filtered = arr
        .map(s => String(s).trim().toUpperCase())
        .map(s => (s === 'EASYPAISA' ? 'BANK_GATEWAY' : s))
        .filter(s => VALID.includes(s));
      if (filtered.length) methodsCsv = [...new Set(filtered)].join(',');
    }

    const cycle = await prisma.admissionCycle.create({
      data: {
        title,
        startDate,
        endDate,
        isOpen: true,
        minMarksPercent: parseFloat(minMarksPercent) || 50,
        matricWeight: mw,
        fscWeight: fw,
        interviewWeight: iw,
        applicationProcessingFee: procFee,
        allowedPaymentMethods: methodsCsv,
        termCode: termCode || 'F26',
      },
    });
    cycle.applicationFee = cycle.applicationProcessingFee;

    res.status(201).json({ message: 'Admission cycle created', cycle });
  } catch (error) {
    console.error('Create cycle error:', error);
    res.status(500).json({ error: 'Failed to create admission cycle' });
  }
});

// PUT /api/admission-cycle/:id
// ------------------------------------------------------------
// Director Admissions edits an already-announced cycle. Updates the cycle
// metadata AND (optionally) the per-program CycleProgram settings (merit
// criteria, min marks, total seats, fee breakdown). Editing a cycle NEVER
// deletes or alters any Application rows already submitted under the cycle —
// only AdmissionCycle + CycleProgram metadata is touched.
//
// Optional body field `programs` — array of:
//   { programId, meritCriteria, minMarksPercent, totalSeats,
//     feeBreakdown:[{label, amount}] }
// When supplied, each entry upserts its matching CycleProgram row. Programs
// not present in the array are left untouched (their applications/merit are
// preserved). The "application processing fee" is the cycle-level
// applicationProcessingFee and is kept separate from per-program fees.
// ------------------------------------------------------------
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      title, startDate, endDate, isOpen, minMarksPercent,
      matricWeight, fscWeight, interviewWeight,
      applicationProcessingFee, applicationFee,
      allowedPaymentMethods, termCode,
      programs,
    } = req.body;

    const existing = await prisma.admissionCycle.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Admission cycle not found' });

    // Validate core fields (same rules as creation).
    if (title !== undefined && !String(title).trim()) {
      return res.status(400).json({ error: 'Session / cycle name cannot be empty', field: 'title' });
    }
    if (startDate !== undefined && !String(startDate).trim()) {
      return res.status(400).json({ error: 'Start date is required', field: 'startDate' });
    }
    if (endDate !== undefined && !String(endDate).trim()) {
      return res.status(400).json({ error: 'End date is required', field: 'endDate' });
    }
    const effStart = startDate !== undefined ? startDate : existing.startDate;
    const effEnd = endDate !== undefined ? endDate : existing.endDate;
    if (effStart && effEnd && String(effEnd) < String(effStart)) {
      return res.status(400).json({ error: 'End date must be on or after the start date', field: 'endDate' });
    }

    if (matricWeight !== undefined && fscWeight !== undefined && interviewWeight !== undefined) {
      const mw = parseFloat(matricWeight);
      const fw = parseFloat(fscWeight);
      const iw = parseFloat(interviewWeight);
      if (Math.abs(mw + fw + iw - 100) > 0.01) {
        return res.status(400).json({ error: 'Merit weightages must sum to 100%' });
      }
    }

    // Validate + normalise per-program payload BEFORE mutating anything.
    let cleanPrograms = null;
    if (programs !== undefined) {
      if (!Array.isArray(programs)) {
        return res.status(400).json({ error: 'programs must be an array', field: 'programs' });
      }
      cleanPrograms = [];
      for (const p of programs) {
        const pid = parseInt(p.programId);
        if (!pid) return res.status(400).json({ error: 'Each program must have a valid programId', field: 'programs' });
        const minMarks = parseFloat(p.minMarksPercent);
        if (p.minMarksPercent !== undefined && p.minMarksPercent !== '' && (isNaN(minMarks) || minMarks < 0 || minMarks > 100)) {
          return res.status(400).json({ error: 'Minimum marks must be between 0 and 100', field: 'minMarksPercent' });
        }
        const seats = parseInt(p.totalSeats);
        if (p.totalSeats !== undefined && p.totalSeats !== '' && (isNaN(seats) || seats < 0)) {
          return res.status(400).json({ error: 'Total seats must be a non-negative number', field: 'totalSeats' });
        }
        // Phase 2: Semester fee (feeBreakdown) is managed in Fee Management, not
        // the Admission Cycle. If the caller omits feeBreakdown, we PRESERVE any
        // existing value instead of wiping it. Only when explicitly supplied do
        // we overwrite it (backward-compat for older clients).
        const feeProvided = Array.isArray(p.feeBreakdown);
        const breakdown = feeProvided
          ? p.feeBreakdown
              .map((li) => ({ label: String(li.label || '').trim(), amount: parseFloat(li.amount) || 0 }))
              .filter((li) => li.label)
          : null;
        cleanPrograms.push({
          programId: pid,
          meritCriteria: p.meritCriteria != null ? String(p.meritCriteria) : null,
          minMarksPercent: isNaN(minMarks) ? 50 : minMarks,
          totalSeats: isNaN(seats) ? 0 : seats,
          feeBreakdown: feeProvided ? JSON.stringify(breakdown) : undefined,
          totalFee: feeProvided ? breakdown.reduce((s, li) => s + li.amount, 0) : undefined,
        });
      }
    }

    if (isOpen === true) {
      await prisma.admissionCycle.updateMany({
        where: { isOpen: true, NOT: { id } },
        data: { isOpen: false },
      });
    }

    const procFeeProvided = applicationProcessingFee !== undefined ? applicationProcessingFee : applicationFee;

    let methodsCsv;
    if (allowedPaymentMethods !== undefined) {
      // EasyPaisa removed (Phase 2). BANK_GATEWAY is the online method.
      const VALID = ['BANK_TRANSFER', 'BANK_GATEWAY', 'ONEBILL_VOUCHER'];
      const arr = Array.isArray(allowedPaymentMethods)
        ? allowedPaymentMethods
        : String(allowedPaymentMethods).split(',');
      const filtered = arr
        .map(s => String(s).trim().toUpperCase())
        // Map legacy EASYPAISA → BANK_GATEWAY for backward compatibility.
        .map(s => (s === 'EASYPAISA' ? 'BANK_GATEWAY' : s))
        .filter(s => VALID.includes(s));
      methodsCsv = filtered.length ? [...new Set(filtered)].join(',') : 'BANK_TRANSFER,BANK_GATEWAY,ONEBILL_VOUCHER';
    }

    const cycle = await prisma.admissionCycle.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: String(title).trim() }),
        ...(startDate !== undefined && { startDate }),
        ...(endDate !== undefined && { endDate }),
        ...(isOpen !== undefined && { isOpen }),
        ...(minMarksPercent !== undefined && { minMarksPercent: parseFloat(minMarksPercent) }),
        ...(matricWeight !== undefined && { matricWeight: parseFloat(matricWeight) }),
        ...(fscWeight !== undefined && { fscWeight: parseFloat(fscWeight) }),
        ...(interviewWeight !== undefined && { interviewWeight: parseFloat(interviewWeight) }),
        ...(procFeeProvided !== undefined && { applicationProcessingFee: parseFloat(procFeeProvided) }),
        ...(methodsCsv !== undefined && { allowedPaymentMethods: methodsCsv }),
        ...(termCode !== undefined && { termCode }),
      },
    });

    // Upsert per-program rows. We update existing CycleProgram rows in place
    // (preserving their id and any linkage) so applications already submitted
    // under this cycle/program are never affected.
    if (cleanPrograms) {
      const selectedProgramIds = cleanPrograms.map((cp) => cp.programId);
      for (const cp of cleanPrograms) {
        await prisma.cycleProgram.upsert({
          where: { admissionCycleId_programId: { admissionCycleId: id, programId: cp.programId } },
          update: {
            meritCriteria: cp.meritCriteria,
            minMarksPercent: cp.minMarksPercent,
            totalSeats: cp.totalSeats,
            // Re-selecting a previously-deselected program must re-open it so it
            // becomes visible/selectable to students again.
            isOpen: true,
            // Only overwrite fee fields when explicitly provided (else preserve).
            ...(cp.feeBreakdown !== undefined && { feeBreakdown: cp.feeBreakdown }),
            ...(cp.totalFee !== undefined && { totalFee: cp.totalFee }),
          },
          create: {
            admissionCycleId: id,
            programId: cp.programId,
            meritCriteria: cp.meritCriteria,
            minMarksPercent: cp.minMarksPercent,
            totalSeats: cp.totalSeats,
            feeBreakdown: cp.feeBreakdown !== undefined ? cp.feeBreakdown : '[]',
            totalFee: cp.totalFee !== undefined ? cp.totalFee : 0,
            isOpen: true,
          },
        });
      }

      // ------------------------------------------------------------
      // DESELECTION FIX (§1.1): any CycleProgram for this cycle that the
      // Director removed from the selection must STAY deselected after the
      // page refreshes. We close (isOpen=false) — instead of deleting — every
      // program not present in the submitted list so that:
      //   • already-submitted Application rows keep their FK intact, and
      //   • students no longer see/select the deselected program, and
      //   • the edit screen no longer auto-reselects it on reload.
      // ------------------------------------------------------------
      await prisma.cycleProgram.updateMany({
        where: {
          admissionCycleId: id,
          isOpen: true,
          programId: { notIn: selectedProgramIds.length ? selectedProgramIds : [-1] },
        },
        data: { isOpen: false },
      });
    }

    cycle.applicationFee = cycle.applicationProcessingFee;

    res.json({ message: 'Admission cycle updated', cycle });
  } catch (error) {
    console.error('Update cycle error:', error);
    res.status(500).json({ error: 'Failed to update admission cycle' });
  }
});

// ============================================================
// GET /api/admission-cycle/:id/programs — per-program config for a cycle
// Public (students need to see which programs are open). Returns the
// CycleProgram rows joined with program + department names.
// ============================================================
router.get('/:id/programs', async (req, res) => {
  try {
    const cycleId = parseInt(req.params.id);
    // §1.1 Student-facing rule: when activeOnly=1 (or true) only currently
    // announced/active programs (isOpen) are returned, so students can never
    // see or select a program the Director has deselected.
    const activeOnly = ['1', 'true', 'yes'].includes(String(req.query.activeOnly || '').toLowerCase());
    const where = { admissionCycleId: cycleId };
    if (activeOnly) where.isOpen = true;
    const rows = await prisma.cycleProgram.findMany({
      where,
      include: { program: { include: { department: true } } },
      orderBy: { id: 'asc' },
    });
    const programs = rows.map((cp) => ({
      id: cp.id,
      programId: cp.programId,
      programName: cp.program?.name,
      programShortForm: cp.program?.shortForm || cp.program?.code,
      department: cp.program?.department?.name || null,
      meritCriteria: cp.meritCriteria,
      minMarksPercent: cp.minMarksPercent,
      totalSeats: cp.totalSeats,
      feeBreakdown: safeParseJson(cp.feeBreakdown, []),
      totalFee: cp.totalFee,
      isOpen: cp.isOpen,
    }));
    res.json({ programs });
  } catch (error) {
    console.error('Get cycle programs error:', error);
    res.status(500).json({ error: 'Failed to fetch cycle programs' });
  }
});

// ============================================================
// POST /api/admission-cycle/announce — UNIFIED admissions cycle announce
// (Section 5/6). Creates (or reuses) a cycle and writes one CycleProgram
// per selected program with its own merit criteria / min marks / seats /
// fee breakdown. Announcing opens the cycle and all selected programs.
//
// Body: {
//   title, startDate, endDate, termCode?,
//   matricWeight?, fscWeight?, interviewWeight?,
//   applicationProcessingFee?, allowedPaymentMethods?,
//   programs: [{ programId, meritCriteria, minMarksPercent, totalSeats,
//                feeBreakdown:[{label,amount}] }]
// }
// ============================================================
router.post('/announce', authenticate, requireAdmin, async (req, res) => {
  try {
    const {
      title, startDate, endDate, termCode,
      matricWeight, fscWeight, interviewWeight,
      applicationProcessingFee, applicationFee,
      allowedPaymentMethods,
      programs,
    } = req.body;

    if (!title || !startDate || !endDate) {
      return res.status(400).json({ error: 'Session name, start date and end date are required' });
    }
    if (!Array.isArray(programs) || programs.length === 0) {
      return res.status(400).json({ error: 'Select at least one program for this cycle' });
    }

    const mw = parseFloat(matricWeight) || 30;
    const fw = parseFloat(fscWeight) || 40;
    const iw = parseFloat(interviewWeight) || 30;
    if (Math.abs(mw + fw + iw - 100) > 0.01) {
      return res.status(400).json({ error: 'Merit weightages must sum to 100%' });
    }

    // Validate program payload + compute fee totals.
    const cleanPrograms = [];
    for (const p of programs) {
      const pid = parseInt(p.programId);
      if (!pid) return res.status(400).json({ error: 'Each selected program must have a valid programId' });
      const breakdown = Array.isArray(p.feeBreakdown)
        ? p.feeBreakdown
            .map((li) => ({ label: String(li.label || '').trim(), amount: parseFloat(li.amount) || 0 }))
            .filter((li) => li.label)
        : [];
      const totalFee = breakdown.reduce((s, li) => s + li.amount, 0);
      cleanPrograms.push({
        programId: pid,
        meritCriteria: p.meritCriteria ? String(p.meritCriteria) : null,
        minMarksPercent: parseFloat(p.minMarksPercent) || 50,
        totalSeats: parseInt(p.totalSeats) || 0,
        feeBreakdown: JSON.stringify(breakdown),
        totalFee,
      });
    }

    // Close any other open cycle (single active cycle policy).
    await prisma.admissionCycle.updateMany({ where: { isOpen: true }, data: { isOpen: false } });

    const procFee = parseFloat(applicationProcessingFee ?? applicationFee) || 1200;
    // (Master Prompt §5) EasyPaisa removed — BANK_GATEWAY is the online method.
    const VALID = ['BANK_TRANSFER', 'BANK_GATEWAY', 'ONEBILL_VOUCHER'];
    let methodsCsv = 'BANK_TRANSFER,BANK_GATEWAY,ONEBILL_VOUCHER';
    if (allowedPaymentMethods) {
      const arr = Array.isArray(allowedPaymentMethods) ? allowedPaymentMethods : String(allowedPaymentMethods).split(',');
      const filtered = arr
        .map((s) => String(s).trim().toUpperCase())
        .map((s) => (s === 'EASYPAISA' ? 'BANK_GATEWAY' : s))
        .filter((s) => VALID.includes(s));
      if (filtered.length) methodsCsv = [...new Set(filtered)].join(',');
    }

    const cycle = await prisma.admissionCycle.create({
      data: {
        title, startDate, endDate, isOpen: true,
        minMarksPercent: 50,
        matricWeight: mw, fscWeight: fw, interviewWeight: iw,
        applicationProcessingFee: procFee,
        allowedPaymentMethods: methodsCsv,
        termCode: termCode || 'F26',
      },
    });

    // Create one CycleProgram per selected program.
    for (const cp of cleanPrograms) {
      await prisma.cycleProgram.create({
        data: { admissionCycleId: cycle.id, ...cp, isOpen: true },
      });
    }

    cycle.applicationFee = cycle.applicationProcessingFee;
    res.status(201).json({
      message: `Admissions cycle "${title}" announced with ${cleanPrograms.length} program(s).`,
      cycle,
      programCount: cleanPrograms.length,
    });
  } catch (error) {
    console.error('Announce cycle error:', error);
    res.status(500).json({ error: 'Failed to announce admissions cycle' });
  }
});

// PUT /api/admission-cycle/:id/toggle — open/close
router.put('/:id/toggle', authenticate, requireAdmin, async (req, res) => {
  try {
    const cycle = await prisma.admissionCycle.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!cycle) return res.status(404).json({ error: 'Cycle not found' });

    if (!cycle.isOpen) {
      await prisma.admissionCycle.updateMany({
        where: { isOpen: true },
        data: { isOpen: false },
      });
    }

    const updated = await prisma.admissionCycle.update({
      where: { id: parseInt(req.params.id) },
      data: { isOpen: !cycle.isOpen },
    });
    updated.applicationFee = updated.applicationProcessingFee;

    res.json({ message: `Admissions ${updated.isOpen ? 'opened' : 'closed'}`, cycle: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle admission cycle' });
  }
});

module.exports = router;
