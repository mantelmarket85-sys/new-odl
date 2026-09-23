// ============================================================
//  SUPER ADMIN — ACADEMIC CONFIGURATION CONTROLLER
//  ------------------------------------------------------------
//  Academic sessions / batches, grading scales, and the academic
//  calendar (reuses the existing AcademicTerm + CalendarEvent models
//  read-side, manages new AcademicSession & SaGradingScale write-side).
//  Every mutation is logged via logSaActivity().
// ============================================================
const prisma = require('../../utils/prisma');
const { logSaActivity } = require('./superAdmin.service');

// ---- Academic sessions / batches (new model) ----------------------------
async function listSessions(req, res) {
  try {
    const sessions = await prisma.academicSession.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ sessions });
  } catch (e) {
    console.error('SA listSessions error:', e);
    res.status(500).json({ error: 'Failed to load academic sessions' });
  }
}

async function createSession(req, res) {
  try {
    const { name, startDate, endDate, isActive } = req.body;
    if (!name) return res.status(400).json({ error: 'Session name is required.' });
    const session = await prisma.academicSession.create({
      data: {
        name: name.trim(),
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        isActive: !!isActive,
        createdBy: req.user.id,
      },
    });
    await logSaActivity({ req, module: 'academic', action: 'create_session', description: `Created academic session ${name}` });
    res.status(201).json({ session, message: 'Academic session created.' });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'A session with this name already exists.' });
    console.error('SA createSession error:', e);
    res.status(500).json({ error: 'Failed to create academic session' });
  }
}

async function updateSession(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const data = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.startDate !== undefined) data.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    if (req.body.endDate !== undefined) data.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
    if (typeof req.body.isActive === 'boolean') data.isActive = req.body.isActive;
    if (typeof req.body.isArchived === 'boolean') data.isArchived = req.body.isArchived;
    const session = await prisma.academicSession.update({ where: { id }, data });
    await logSaActivity({ req, module: 'academic', action: 'update_session', description: `Updated academic session ${session.name}` });
    res.json({ session, message: 'Academic session updated.' });
  } catch (e) {
    console.error('SA updateSession error:', e);
    res.status(500).json({ error: 'Failed to update academic session' });
  }
}

async function archiveSession(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const session = await prisma.academicSession.update({ where: { id }, data: { isArchived: true, isActive: false } });
    await logSaActivity({ req, module: 'academic', action: 'archive_session', description: `Archived academic session ${session.name}` });
    res.json({ session, message: 'Academic session archived.' });
  } catch (e) {
    console.error('SA archiveSession error:', e);
    res.status(500).json({ error: 'Failed to archive academic session' });
  }
}

// ---- Grading scale (new model) ------------------------------------------
async function listGradingScales(req, res) {
  try {
    const programId = req.query.programId ? parseInt(req.query.programId, 10) : undefined;
    const scales = await prisma.saGradingScale.findMany({
      where: programId !== undefined ? { programId } : {},
      orderBy: { gpaPoints: 'desc' },
    });
    res.json({ scales });
  } catch (e) {
    console.error('SA listGradingScales error:', e);
    res.status(500).json({ error: 'Failed to load grading scales' });
  }
}

async function createGradingScale(req, res) {
  try {
    const { grade, gpaPoints, minMarks, maxMarks, programId } = req.body;
    if (!grade || gpaPoints == null || minMarks == null || maxMarks == null) {
      return res.status(400).json({ error: 'grade, gpaPoints, minMarks and maxMarks are required.' });
    }
    const scale = await prisma.saGradingScale.create({
      data: {
        grade: String(grade).trim(),
        gpaPoints: parseFloat(gpaPoints),
        minMarks: parseFloat(minMarks),
        maxMarks: parseFloat(maxMarks),
        programId: programId != null ? parseInt(programId, 10) : null,
        createdBy: req.user.id,
      },
    });
    await logSaActivity({ req, module: 'academic', action: 'create_grade', description: `Added grade ${grade} (${gpaPoints})` });
    res.status(201).json({ scale, message: 'Grade added.' });
  } catch (e) {
    console.error('SA createGradingScale error:', e);
    res.status(500).json({ error: 'Failed to create grade' });
  }
}

async function updateGradingScale(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const data = {};
    if (req.body.grade !== undefined) data.grade = req.body.grade;
    if (req.body.gpaPoints !== undefined) data.gpaPoints = parseFloat(req.body.gpaPoints);
    if (req.body.minMarks !== undefined) data.minMarks = parseFloat(req.body.minMarks);
    if (req.body.maxMarks !== undefined) data.maxMarks = parseFloat(req.body.maxMarks);
    const scale = await prisma.saGradingScale.update({ where: { id }, data });
    await logSaActivity({ req, module: 'academic', action: 'update_grade', description: `Updated grade ${scale.grade}` });
    res.json({ scale, message: 'Grade updated.' });
  } catch (e) {
    console.error('SA updateGradingScale error:', e);
    res.status(500).json({ error: 'Failed to update grade' });
  }
}

async function deleteGradingScale(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.saGradingScale.delete({ where: { id } });
    await logSaActivity({ req, module: 'academic', action: 'delete_grade', description: `Deleted grade #${id}` });
    res.json({ message: 'Grade deleted.' });
  } catch (e) {
    console.error('SA deleteGradingScale error:', e);
    res.status(500).json({ error: 'Failed to delete grade' });
  }
}

// ---- Academic terms (existing model — read-only oversight) --------------
async function listTerms(req, res) {
  try {
    const terms = await prisma.academicTerm.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { offerings: true } } },
    });
    res.json({ terms });
  } catch (e) {
    console.error('SA listTerms error:', e);
    res.status(500).json({ error: 'Failed to load academic terms' });
  }
}

// ---- Academic calendar (existing CalendarEvent model) -------------------
async function listCalendarEvents(req, res) {
  try {
    const events = await prisma.calendarEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    res.json({ events });
  } catch (e) {
    // CalendarEvent fields may vary; fail soft with empty list.
    console.warn('SA listCalendarEvents warning:', e.message);
    res.json({ events: [] });
  }
}

module.exports = {
  listSessions, createSession, updateSession, archiveSession,
  listGradingScales, createGradingScale, updateGradingScale, deleteGradingScale,
  listTerms, listCalendarEvents,
};
