const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireAdmin } = require('../middleware/auth');
const cache = require('../utils/cache');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/programs — public list of programs (Phase 2: cached 60s).
// This endpoint is hit on every registration / program-list page load, so a
// short-lived process cache removes a lot of redundant DB round-trips.
router.get('/', async (req, res) => {
  try {
    const programs = await cache.wrap('programs:public', 60_000, () =>
      prisma.program.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      })
    );
    res.json({ programs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch programs' });
  }
});

// GET /api/programs/:id
router.get('/:id', async (req, res) => {
  try {
    const program = await prisma.program.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!program) return res.status(404).json({ error: 'Program not found' });
    res.json({ program });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch program' });
  }
});

module.exports = router;
