const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

/**
 * Simple math CAPTCHA — server-generated and server-verified.
 * Client requests a challenge, gets a question + challengeId,
 * answers it, and submits {captchaId, captchaAnswer} alongside
 * registration / login / password-reset requests.
 */

// Generate a new math captcha challenge
async function generateCaptcha() {
  const ops = ['+', '-', '*'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a = Math.floor(Math.random() * 10) + 1;
  let b = Math.floor(Math.random() * 10) + 1;
  // For subtraction, ensure non-negative
  if (op === '-' && b > a) [a, b] = [b, a];
  let answer;
  if (op === '+') answer = a + b;
  else if (op === '-') answer = a - b;
  else answer = a * b;

  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await prisma.captchaChallenge.create({
    data: {
      id,
      answer: String(answer),
      attemptsLeft: 3,
      expiresAt,
    },
  });

  return {
    captchaId: id,
    question: `What is ${a} ${op} ${b} ?`,
    expiresAt,
  };
}

// Express middleware: verify captcha BEFORE processing the route
async function verifyCaptcha(req, res, next) {
  try {
    // Allow disabling captcha during local automated testing only
    if (process.env.CAPTCHA_DISABLED === 'true') return next();

    const { captchaId, captchaAnswer } = req.body || {};
    if (!captchaId || captchaAnswer === undefined || captchaAnswer === null || captchaAnswer === '') {
      return res.status(400).json({ error: 'Captcha is required. Please solve the captcha.' });
    }

    const challenge = await prisma.captchaChallenge.findUnique({ where: { id: String(captchaId) } });
    if (!challenge) {
      return res.status(400).json({ error: 'Invalid or expired captcha. Please refresh the captcha.' });
    }
    if (challenge.used) {
      return res.status(400).json({ error: 'This captcha has already been used. Please refresh.' });
    }
    if (challenge.expiresAt < new Date()) {
      await prisma.captchaChallenge.delete({ where: { id: challenge.id } }).catch(() => {});
      return res.status(400).json({ error: 'Captcha expired. Please refresh.' });
    }
    if (challenge.attemptsLeft <= 0) {
      await prisma.captchaChallenge.delete({ where: { id: challenge.id } }).catch(() => {});
      return res.status(400).json({ error: 'Too many incorrect attempts. Please refresh the captcha.' });
    }

    if (String(captchaAnswer).trim() !== String(challenge.answer).trim()) {
      await prisma.captchaChallenge.update({
        where: { id: challenge.id },
        data: { attemptsLeft: challenge.attemptsLeft - 1 },
      });
      return res.status(400).json({ error: 'Incorrect captcha answer. Please try again.' });
    }

    // Mark used (single-use)
    await prisma.captchaChallenge.update({
      where: { id: challenge.id },
      data: { used: true },
    });

    next();
  } catch (err) {
    console.error('Captcha verify error:', err);
    return res.status(500).json({ error: 'Captcha verification failed. Please try again.' });
  }
}

// Best-effort cleanup: remove expired captchas occasionally
async function cleanupExpiredCaptchas() {
  try {
    await prisma.captchaChallenge.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { used: true }] },
    });
  } catch (e) { /* ignore */ }
}
// Run cleanup every 30 minutes
setInterval(cleanupExpiredCaptchas, 30 * 60 * 1000);

module.exports = {
  generateCaptcha,
  verifyCaptcha,
};
