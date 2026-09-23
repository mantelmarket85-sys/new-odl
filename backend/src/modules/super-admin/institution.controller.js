// ============================================================
//  SUPER ADMIN — INSTITUTION SETUP CONTROLLER
//  University profile, departments, programs. (Campuses removed §2.)
//  Departments/Programs reuse the EXISTING models so changes reflect
//  across the whole platform; UniversityProfile/Campus are new models.
// ============================================================
const prisma = require('../../utils/prisma');
const { logSaActivity } = require('./superAdmin.service');

// ---- University profile (single row) ------------------------------------
async function getUniversityProfile(req, res) {
  try {
    let profile = await prisma.universityProfile.findFirst();
    if (!profile) profile = await prisma.universityProfile.create({ data: {} });
    res.json({ profile });
  } catch (e) {
    console.error('SA getUniversityProfile error:', e);
    res.status(500).json({ error: 'Failed to load university profile' });
  }
}

async function updateUniversityProfile(req, res) {
  try {
    let profile = await prisma.universityProfile.findFirst();
    const data = {
      name: req.body.name, shortName: req.body.shortName, logoUrl: req.body.logoUrl,
      address: req.body.address, city: req.body.city, province: req.body.province,
      country: req.body.country, phone: req.body.phone, email: req.body.email,
      website: req.body.website, accreditation: req.body.accreditation,
      establishedYear: req.body.establishedYear, visionMission: req.body.visionMission,
      updatedBy: req.user.id,
    };
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
    if (!profile) profile = await prisma.universityProfile.create({ data });
    else profile = await prisma.universityProfile.update({ where: { id: profile.id }, data });
    await logSaActivity({ req, module: 'institution', action: 'update_profile', description: 'Updated university profile' });
    res.json({ profile, message: 'University profile updated.' });
  } catch (e) {
    console.error('SA updateUniversityProfile error:', e);
    res.status(500).json({ error: 'Failed to update university profile' });
  }
}

// ---- Departments (existing model) ---------------------------------------
async function listDepartments(req, res) {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: {
        coordinator: { select: { id: true, email: true, username: true, isActive: true } },
        programs: { select: { id: true, name: true, shortForm: true, code: true, isActive: true } },
      },
    });
    res.json({ departments });
  } catch (e) {
    console.error('SA listDepartments error:', e);
    res.status(500).json({ error: 'Failed to load departments' });
  }
}

async function createDepartment(req, res) {
  try {
    const { name, faculty, code } = req.body;
    if (!name) return res.status(400).json({ error: 'Department name is required.' });
    const dept = await prisma.department.create({ data: { name, faculty: faculty || null, ...(code ? { code } : {}) } });
    await logSaActivity({ req, module: 'institution', action: 'create_department', description: `Created department ${name}` });
    res.status(201).json({ department: dept, message: 'Department created.' });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'A department with this name already exists.' });
    console.error('SA createDepartment error:', e);
    res.status(500).json({ error: 'Failed to create department' });
  }
}

async function updateDepartment(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const data = {};
    ['name', 'faculty'].forEach((k) => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
    if (typeof req.body.isActive === 'boolean') data.isActive = req.body.isActive;
    const dept = await prisma.department.update({ where: { id }, data });
    await logSaActivity({ req, module: 'institution', action: 'update_department', description: `Updated department ${dept.name}` });
    res.json({ department: dept, message: 'Department updated.' });
  } catch (e) {
    console.error('SA updateDepartment error:', e);
    res.status(500).json({ error: 'Failed to update department' });
  }
}

// ---- Programs (existing model) ------------------------------------------
async function listPrograms(req, res) {
  try {
    const programs = await prisma.program.findMany({
      orderBy: { name: 'asc' },
      include: { department: { select: { id: true, name: true } } },
    });
    res.json({ programs });
  } catch (e) {
    console.error('SA listPrograms error:', e);
    res.status(500).json({ error: 'Failed to load programs' });
  }
}

async function updateProgram(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const data = {};
    if (typeof req.body.isActive === 'boolean') data.isActive = req.body.isActive;
    ['name', 'shortForm', 'code'].forEach((k) => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
    const program = await prisma.program.update({ where: { id }, data });
    await logSaActivity({ req, module: 'institution', action: 'update_program', description: `Updated program ${program.name}` });
    res.json({ program, message: 'Program updated.' });
  } catch (e) {
    console.error('SA updateProgram error:', e);
    res.status(500).json({ error: 'Failed to update program' });
  }
}

// ---- Campuses REMOVED (Master Prompt §2) --------------------------------
// This is a single-campus Online Distance Learning (ODL) platform. The
// Campuses & Study Centers CRUD (list/create/update/delete) and its routes
// have been removed. The Campus Prisma model is retained only for migration
// safety but is no longer exposed through any API surface.

module.exports = {
  getUniversityProfile, updateUniversityProfile,
  listDepartments, createDepartment, updateDepartment,
  listPrograms, updateProgram,
};
