const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_BASE = path.join(__dirname, '..', '..', 'uploads');

// Ensure directories exist
const dirs = ['photos', 'cnic', 'dmc', 'receipts', 'education', 'lms-submissions', 'lms-materials', 'lms-library', 'lms-avatars', 'lms-messages', 'exam-papers', 'exam-profiles', 'qec-profiles'];
dirs.forEach(dir => {
  const dirPath = path.join(UPLOAD_BASE, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

const createStorage = (subfolder) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dest = path.join(UPLOAD_BASE, subfolder);
      cb(null, dest);
    },
    filename: (req, file, cb) => {
      // Support both auth systems: legacy admissions (req.user) and LMS (req.lmsUser).
      const uid = req.user?.id || req.lmsUser?.id || 'anon';
      const uniqueSuffix = `${uid}_${Date.now()}${path.extname(file.originalname)}`;
      cb(null, uniqueSuffix);
    },
  });
};

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and PDF files are allowed.'), false);
  }
};

const imageFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid image type. Only JPEG, PNG and WEBP are allowed.'), false);
  }
};

const lmsFileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/jpg', 'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip', 'application/x-zip-compressed',
    'text/plain', 'text/csv',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type for LMS upload.'), false);
  }
};

const uploadPhoto = multer({
  storage: createStorage('photos'),
  fileFilter,
  limits: { fileSize: 512 * 1024 }, // 512KB
});

const uploadCNIC = multer({
  storage: createStorage('cnic'),
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

const uploadDMC = multer({
  storage: createStorage('dmc'),
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

const uploadEducation = multer({
  storage: createStorage('education'),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const uploadReceipt = multer({
  storage: createStorage('receipts'),
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

const uploadLmsSubmission = multer({
  storage: createStorage('lms-submissions'),
  fileFilter: lmsFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Recorded-lecture / material filter — accepts the standard LMS document
// types PLUS common video formats so teachers can upload video lectures.
// (The previous lmsFileFilter rejected every video mimetype, which is why
// uploaded video lectures failed to save and therefore "did not play".)
const lmsVideoFileFilter = (req, file, cb) => {
  const allowedTypes = [
    // documents (kept for non-video materials routed here)
    'image/jpeg', 'image/png', 'image/jpg', 'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    // video formats
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
    'video/x-matroska', 'video/x-msvideo', 'video/mpeg', 'video/3gpp',
    'application/octet-stream', // some browsers send this for .mkv/.mov
  ];
  // Be permissive for any video/* mimetype the browser reports.
  if (allowedTypes.includes(file.mimetype) || (file.mimetype || '').startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Upload a video (mp4, webm, mov, mkv…) or a supported document.'), false);
  }
};

const uploadLmsMaterial = multer({
  storage: createStorage('lms-materials'),
  fileFilter: lmsVideoFileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB — video lectures
});

// RECORDED LECTURES (client requirement 2.2) — recorded lectures are added by
// URL only. Direct file upload is not offered in the UI, but as a defensive
// fallback safeguard any file that still reaches the lecture endpoints is
// strictly capped at 5MB (and the handler additionally requires a URL).
const uploadLmsLectureFallback = multer({
  storage: createStorage('lms-materials'),
  fileFilter: lmsVideoFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB hard cap (fallback safeguard)
});

// Course Library resources — capped at 5MB per the Teacher module spec.
const uploadLmsLibrary = multer({
  storage: createStorage('lms-library'),
  fileFilter: lmsFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Teacher profile photo (avatar) — small image only.
const uploadLmsAvatar = multer({
  storage: createStorage('lms-avatars'),
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

// Message attachments (file/image sharing in chat) — images and documents.
const uploadLmsMessage = multer({
  storage: createStorage('lms-messages'),
  fileFilter: lmsFileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

// Exam papers — secure (PDF/DOC/ZIP), used by the Exam Controller paper
// management module. Stored under uploads/exam-papers and only served
// through the role-guarded download route in the exam router.
const uploadExamPaper = multer({
  storage: createStorage('exam-papers'),
  fileFilter: lmsFileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

// Exam Controller profile photo (avatar) — small image only.
const uploadExamProfilePhoto = multer({
  storage: createStorage('exam-profiles'),
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

// Director QEC profile photo (avatar) — small image only.
const uploadQecProfilePhoto = multer({
  storage: createStorage('qec-profiles'),
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

module.exports = { uploadPhoto, uploadCNIC, uploadDMC, uploadEducation, uploadReceipt, uploadLmsSubmission, uploadLmsMaterial, uploadLmsLectureFallback, uploadLmsLibrary, uploadLmsAvatar, uploadLmsMessage, uploadExamPaper, uploadExamProfilePhoto, uploadQecProfilePhoto };
