const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireStudent } = require('../middleware/auth');
const { uploadPhoto } = require('../middleware/upload');

const router = express.Router();
const prisma = new PrismaClient();

// Validation helpers
const isValidCnic = (s) => !s || /^\d{5}-?\d{7}-?\d{1}$|^\d{13}$/.test(String(s).replace(/[-\s]/g, ''));
const isValidPhone = (s) => !s || /^\+?\d{10,15}$/.test(String(s).replace(/[-\s]/g, ''));
const isValidEmail = (s) => !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Comprehensive country list
const COUNTRIES = [
  'Pakistan', 'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia',
  'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus',
  'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil',
  'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon', 'Canada', 'Cape Verde',
  'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica',
  'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia',
  'Fiji', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada',
  'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India',
  'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast', 'Jamaica', 'Japan', 'Jordan',
  'Kazakhstan', 'Kenya', 'Kiribati', 'Kosovo', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon',
  'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi',
  'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico',
  'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
  'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria',
  'North Korea', 'North Macedonia', 'Norway', 'Oman', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea',
  'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino',
  'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone',
  'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea',
  'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria',
  'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago',
  'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates',
  'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu', 'Vatican City', 'Venezuela',
  'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe', 'Other',
];

// Nationalities (kept for back-compat with existing UI usage)
const NATIONALITIES = [
  'Pakistani', 'Afghan', 'Indian', 'Bangladeshi', 'Chinese', 'British',
  'American', 'Canadian', 'Australian', 'Saudi Arabian', 'Emirati',
  'Turkish', 'Iranian', 'Other',
];

// GET /api/profile
router.get('/', authenticate, async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({
      where: { userId: req.user.id },
    });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    res.json({ profile });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// GET /api/profile/countries
router.get('/countries', (req, res) => {
  res.json({ countries: COUNTRIES });
});

// GET /api/profile/nationalities (legacy alias — same list)
router.get('/nationalities', (req, res) => {
  res.json({ nationalities: NATIONALITIES });
});

// POST /api/profile  — upsert profile
router.post('/', authenticate, requireStudent, async (req, res) => {
  try {
    const {
      firstName, lastName, cnic, fatherName, fatherCnic,
      whatsappNumber, guardianPhone,
      nationality, countryOfResidence, religion,
      dateOfBirth, gender, bloodGroup, maritalStatus, occupation,
      domicileDistrict, domicileProvince,
      phone, address, district, // legacy
      // structured addresses
      presStreet, presPostalCode, presVillage, presTehsil, presDistrict,
      permStreet, permPostalCode, permVillage, permTehsil, permDistrict,
      permSameAsPresent,
    } = req.body;

    // ----- Validation -----
    const errors = [];
    if (!firstName || !firstName.trim()) errors.push('First name is required');
    if (!lastName || !lastName.trim())   errors.push('Last name is required');
    if (!fatherName || !fatherName.trim()) errors.push('Father name is required');
    if (!dateOfBirth) errors.push('Date of birth is required');
    if (!gender) errors.push('Gender is required');
    if (!whatsappNumber) errors.push('WhatsApp contact number is required');

    if (cnic && !isValidCnic(cnic)) errors.push('Invalid CNIC format. Use 13 digits, e.g. 12345-1234567-1');
    if (fatherCnic && !isValidCnic(fatherCnic)) errors.push('Invalid Father CNIC format');
    if (whatsappNumber && !isValidPhone(whatsappNumber)) errors.push('Invalid WhatsApp number format');
    if (guardianPhone && !isValidPhone(guardianPhone)) errors.push('Invalid Guardian phone number format');
    if (phone && !isValidPhone(phone)) errors.push('Invalid phone number format');

    if (errors.length) return res.status(400).json({ error: errors.join('; '), errors });

    // ----- Required for completeness -----
    const requiredFields = [firstName, lastName, cnic, fatherName, dateOfBirth, whatsappNumber, gender];
    const isComplete = requiredFields.every((x) => x && String(x).trim() !== '');

    // Permanent = present (auto-fill if checkbox)
    const sameAsPresent = permSameAsPresent === true || permSameAsPresent === 'true' || permSameAsPresent === '1';
    const finalPerm = sameAsPresent ? {
      permStreet: presStreet || null,
      permPostalCode: presPostalCode || null,
      permVillage: presVillage || null,
      permTehsil: presTehsil || null,
      permDistrict: presDistrict || null,
    } : {
      permStreet: permStreet || null,
      permPostalCode: permPostalCode || null,
      permVillage: permVillage || null,
      permTehsil: permTehsil || null,
      permDistrict: permDistrict || null,
    };

    const data = {
      firstName: firstName?.trim(),
      lastName: lastName?.trim(),
      cnic: cnic?.trim() || null,
      fatherName: fatherName?.trim(),
      fatherCnic: fatherCnic?.trim() || null,
      whatsappNumber: whatsappNumber?.trim() || null,
      guardianPhone: guardianPhone?.trim() || null,
      nationality: nationality || 'Pakistani',
      countryOfResidence: countryOfResidence || 'Pakistan',
      religion: religion || null,
      dateOfBirth: dateOfBirth || null,
      gender,
      bloodGroup: bloodGroup || null,
      maritalStatus: maritalStatus || null,
      occupation: occupation || null,
      domicileProvince: domicileProvince || null,
      domicileDistrict: domicileDistrict || null,
      // legacy
      address: address || null,
      district: district || domicileDistrict || null,
      phone: (phone || whatsappNumber || '').trim() || null,
      // present address
      presStreet: presStreet || null,
      presPostalCode: presPostalCode || null,
      presVillage: presVillage || null,
      presTehsil: presTehsil || null,
      presDistrict: presDistrict || null,
      // permanent
      ...finalPerm,
      permSameAsPresent: sameAsPresent,
      isComplete,
    };

    const profile = await prisma.profile.upsert({
      where: { userId: req.user.id },
      update: data,
      create: { userId: req.user.id, ...data },
    });

    res.json({ message: 'Profile updated successfully', profile });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /api/profile/photo
// IMPORTANT: Each user has EXACTLY ONE photo. We delete any previous
// `photo` Document rows BEFORE creating a new one so that the printable
// form, ZIP package, and document previews always show the CURRENT photo
// — never a stale one. Without this dedup multiple photos accumulated in
// the Document table and the PDF/ZIP could show the wrong file.
router.post('/photo', authenticate, requireStudent, uploadPhoto.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

    const filePath = `/uploads/photos/${req.file.filename}`;

    // 1) Remove any previously-stored photo Document rows for this user
    //    so we never have more than one `type=photo` record.
    await prisma.document.deleteMany({
      where: { userId: req.user.id, type: 'photo' },
    });

    // 2) Insert the new photo
    await prisma.document.create({
      data: {
        userId: req.user.id,
        type: 'photo',
        filePath,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      },
    });

    // 3) Mirror onto Profile.photoPath (single source of truth for the PDF header)
    await prisma.profile.update({
      where: { userId: req.user.id },
      data: { photoPath: filePath },
    });

    res.json({ message: 'Photo uploaded successfully', filePath });
  } catch (error) {
    console.error('Photo upload error:', error);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

// PUT /api/profile/email — change email (with verification token, optional)
router.put('/email', authenticate, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists && exists.id !== req.user.id) {
      return res.status(400).json({ error: 'This email is already in use by another account' });
    }
    const crypto = require('crypto');
    const token = crypto.randomBytes(20).toString('hex');
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { email, emailVerified: false, emailVerifyToken: token },
      select: { id: true, email: true, emailVerified: true },
    });

    try {
      const { sendMail } = require('../utils/email');
      const base = process.env.FRONTEND_URL || 'http://localhost:3000';
      const verifyUrl = `${base}/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
      await sendMail({
        to: email,
        subject: 'AUST ODL — Verify your new email',
        html: `<p>Click the link below to verify your new email address:</p>
               <p><a href="${verifyUrl}">${verifyUrl}</a></p>
               <p>If this was not you, please ignore this email.</p>`,
      });
    } catch (e) { /* ignore */ }

    res.json({ message: 'Email updated. A verification link has been sent to the new address.', user: updated });
  } catch (error) {
    console.error('Update email error:', error);
    res.status(500).json({ error: 'Failed to update email' });
  }
});

// GET /api/profile/verify-email?token=...&email=...
router.get('/verify-email', async (req, res) => {
  try {
    const { token, email } = req.query;
    if (!token || !email) return res.status(400).json({ error: 'Token and email required' });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifyToken !== token) {
      return res.status(400).json({ error: 'Invalid verification link' });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null },
    });
    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

module.exports = router;
