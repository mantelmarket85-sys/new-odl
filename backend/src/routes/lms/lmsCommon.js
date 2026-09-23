const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireLmsRole } = require('../../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/lms/messages — my LMS messages/notifications
router.get('/messages', authenticate, requireLmsRole, async (req, res) => {
  try {
    const messages = await prisma.lmsMessage.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ messages });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// PUT /api/lms/messages/:id/read
router.put('/messages/:id/read', authenticate, requireLmsRole, async (req, res) => {
  try {
    const msg = await prisma.lmsMessage.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!msg || msg.userId !== req.user.id) return res.status(404).json({ error: 'Not found' });
    const updated = await prisma.lmsMessage.update({
      where: { id: msg.id },
      data: { isRead: true },
    });
    res.json({ message: updated });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

// PUT /api/lms/messages/read-all
router.put('/messages/read-all', authenticate, requireLmsRole, async (req, res) => {
  try {
    await prisma.lmsMessage.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true },
    });
    res.json({ message: 'All marked as read' });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/lms/me — current LMS user info
router.get('/me', authenticate, requireLmsRole, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, role: true,
        profile: true,
        teacherProfile: true,
        enrollment: true,
      },
    });
    const unreadMessages = await prisma.lmsMessage.count({
      where: { userId: req.user.id, isRead: false },
    });
    res.json({ user, unreadMessages });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
