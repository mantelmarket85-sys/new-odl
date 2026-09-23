// ============================================================
// LMS COURSE GROUPS — shared utility to auto-create/sync course
// chat groups. Each active course offering gets exactly ONE group;
// members are the offering's teacher (owner) plus every enrolled
// (registered) student. This is the ONLY messaging channel between
// students and teachers — students cannot message teachers directly.
//
// All functions are idempotent and safe to call on every fetch, so
// groups stay in sync automatically whenever enrollment changes.
// ============================================================
const prisma = require('./prisma');

/**
 * Ensure a single offering's course group exists and its membership
 * exactly matches (teacher + currently enrolled students).
 * - Adds newly enrolled students
 * - Removes members who are no longer enrolled (and are not the owner/teacher)
 * Returns the synced group record.
 */
async function syncOfferingGroup(offering) {
  if (!offering || !offering.course) return null;
  const offeringId = offering.id;
  const teacherId = offering.teacherId || (offering.teacher && offering.teacher.id) || null;
  const groupName = `${offering.course.code} — ${offering.course.title}`;

  // Ensure the group exists (one per offering).
  let group = await prisma.lmsMessageGroup.findUnique({ where: { offeringId } });
  if (!group) {
    // ownerId must be set; fall back to teacherId, else skip if none.
    if (!teacherId) return null;
    group = await prisma.lmsMessageGroup.create({
      data: { name: groupName, offeringId, ownerId: teacherId },
    });
  } else if (group.name !== groupName || (teacherId && group.ownerId !== teacherId)) {
    group = await prisma.lmsMessageGroup.update({
      where: { id: group.id },
      data: { name: groupName, ...(teacherId ? { ownerId: teacherId } : {}) },
    });
  }

  // Desired membership: teacher (owner) + all enrolled students.
  const regs = await prisma.courseRegistration.findMany({
    where: { offeringId },
    select: { studentId: true },
  });
  const desired = new Map();
  if (teacherId) desired.set(teacherId, 'owner');
  for (const r of regs) if (r.studentId) desired.set(r.studentId, 'member');

  const existing = await prisma.lmsMessageGroupMember.findMany({ where: { groupId: group.id } });
  const existingMap = new Map(existing.map((m) => [m.userId, m]));

  // Add missing members.
  const toAdd = [];
  for (const [uid, role] of desired) {
    if (!existingMap.has(uid)) toAdd.push({ groupId: group.id, userId: uid, role });
  }
  if (toAdd.length) {
    await prisma.lmsMessageGroupMember.createMany({ data: toAdd });
  }

  // Remove members who are no longer enrolled (never remove the owner/teacher).
  const toRemove = [];
  for (const m of existing) {
    if (!desired.has(m.userId) && m.userId !== group.ownerId) toRemove.push(m.id);
  }
  if (toRemove.length) {
    await prisma.lmsMessageGroupMember.deleteMany({ where: { id: { in: toRemove } } });
  }

  return group;
}

/**
 * Sync all course groups for the offerings a given STUDENT is enrolled in.
 * Ensures groups exist and the student is a member, so course groups
 * appear for the student even if the teacher has not logged in yet.
 * Returns the list of synced groups.
 */
async function syncGroupsForStudent(studentId) {
  const regs = await prisma.courseRegistration.findMany({
    where: { studentId },
    select: { offeringId: true },
  });
  const offeringIds = [...new Set(regs.map((r) => r.offeringId))];
  if (!offeringIds.length) return [];
  const offerings = await prisma.courseOffering.findMany({
    where: { id: { in: offeringIds } },
    include: { course: true },
  });
  const groups = [];
  for (const o of offerings) {
    const g = await syncOfferingGroup(o);
    if (g) groups.push(g);
  }
  return groups;
}

/**
 * Sync all course groups for the offerings a given TEACHER teaches.
 * Returns [{ group, offering }].
 */
async function syncGroupsForTeacher(teacherId) {
  const offerings = await prisma.courseOffering.findMany({
    where: { teacherId },
    include: { course: true },
  });
  const result = [];
  for (const o of offerings) {
    const g = await syncOfferingGroup(o);
    if (g) result.push({ group: g, offering: o });
  }
  return result;
}

module.exports = {
  syncOfferingGroup,
  syncGroupsForStudent,
  syncGroupsForTeacher,
};
