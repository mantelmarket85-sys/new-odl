const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { uploadCNIC, uploadDMC } = require('../middleware/upload');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/documents — user's documents
router.get('/', authenticate, async (req, res) => {
  try {
    const documents = await prisma.document.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ documents });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// POST /api/documents/cnic — upload CNIC front or back
router.post('/cnic', authenticate, uploadCNIC.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { side } = req.body; // front | back
    if (!side || !['front', 'back'].includes(side)) {
      return res.status(400).json({ error: 'Please specify CNIC side (front or back)' });
    }

    const type = `cnic_${side}`;
    const filePath = `/uploads/cnic/${req.file.filename}`;

    // Remove old document of same type
    await prisma.document.deleteMany({ where: { userId: req.user.id, type } });

    await prisma.document.create({
      data: {
        userId: req.user.id,
        type,
        filePath,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      },
    });

    res.json({ message: `CNIC ${side} uploaded successfully`, filePath });
  } catch (error) {
    console.error('CNIC upload error:', error);
    res.status(500).json({ error: 'Failed to upload CNIC' });
  }
});

// POST /api/documents/dmc — upload DMC or character certificate
router.post('/dmc', authenticate, uploadDMC.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { type } = req.body; // dmc_10 | dmc_12 | char_cert_10 | char_cert_12
    const validTypes = ['dmc_10', 'dmc_12', 'char_cert_10', 'char_cert_12'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid document type' });
    }

    const filePath = `/uploads/dmc/${req.file.filename}`;

    // Remove old document of same type
    await prisma.document.deleteMany({ where: { userId: req.user.id, type } });

    await prisma.document.create({
      data: {
        userId: req.user.id,
        type,
        filePath,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      },
    });

    res.json({ message: 'Document uploaded successfully', filePath });
  } catch (error) {
    console.error('DMC upload error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

module.exports = router;
