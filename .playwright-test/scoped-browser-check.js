const { chromium } = require('playwright');
const jwt = require('../backend/node_modules/jsonwebtoken');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
require('../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '../backend/.env') });

const prisma = new PrismaClient();

async function admissionCheck(executablePath, browserName) {
  const director = await prisma.user.findFirst({ where: { role: 'director_admissions', isActive: true } });
  if (!director) throw new Error('Director Admissions account missing');
  const token = jwt.sign({ userId: director.id, role: director.role }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage();
  const errors = [];
  const failedFeeResponses = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.url().includes('/api/fee-management') && response.status() >= 400) {
      failedFeeResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.addInitScript(({ token, director }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({ id: director.id, email: director.email, username: director.username, role: director.role }));
  }, { token, director });
  await page.goto('http://127.0.0.1:3000/admin', { waitUntil: 'domcontentloaded', timeout: 45000 });
  const feeButton = page.getByText('Fee Management', { exact: true }).first();
  await feeButton.waitFor({ state: 'visible', timeout: 20000 });
  await feeButton.click();
  await page.waitForTimeout(3000);
  const text = await page.locator('body').innerText();
  const required = ['Fee Management', 'Pending Payments', 'Processed Payments'];
  const missing = required.filter((label) => !text.includes(label));
  if (missing.length) throw new Error(`${browserName} Fee Management missing: ${missing.join(', ')}`);
  if (errors.length) throw new Error(`${browserName} Fee Management console errors: ${errors.join(' | ')}`);
  if (failedFeeResponses.length) throw new Error(`${browserName} Fee Management API failures: ${failedFeeResponses.join(' | ')}`);
  await browser.close();
  return { browser: browserName, module: 'Director Admission Fee Management', rendered: true, consoleErrors: 0, failedFeeResponses: 0 };
}

async function lmsCheck(executablePath, browserName) {
  const student = await prisma.lmsUser.findFirst({ where: { username: 'ADCS-001', role: 'Student', isActive: true } });
  if (!student) throw new Error('ADCS-001 LMS student missing');
  const token = jwt.sign({ userId: student.id, role: student.role, system: 'lms' }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage();
  const errors = [];
  const failedResultResponses = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.url().includes('/api/lms/academic/student/results') && response.status() >= 400) {
      failedResultResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.addInitScript(({ token }) => {
    localStorage.setItem('lms_token', token);
    localStorage.setItem('lms_role', 'Student');
    localStorage.setItem('aust_user', JSON.stringify({ role: 'student' }));
  }, { token });
  await page.goto('http://127.0.0.1:3001/student/results', { waitUntil: 'domcontentloaded', timeout: 45000 });
  const breakdownButton = page.getByText('View Marks Breakdown', { exact: true }).first();
  await breakdownButton.waitFor({ state: 'visible', timeout: 20000 });
  await breakdownButton.click();
  await page.waitForTimeout(2000);
  const text = await page.locator('body').innerText();
  const required = ['S.NO.', 'COURSE', 'WEIGHTED TOTAL'];
  const missing = required.filter((label) => !text.toUpperCase().includes(label));
  if (missing.length) throw new Error(`${browserName} Results breakdown missing: ${missing.join(', ')}`);
  if (text.includes('Raw Performance')) throw new Error(`${browserName} Results breakdown still displays raw performance`);
  if (errors.length) throw new Error(`${browserName} Results console errors: ${errors.join(' | ')}`);
  if (failedResultResponses.length) throw new Error(`${browserName} Results API failures: ${failedResultResponses.join(' | ')}`);
  await browser.close();
  return { browser: browserName, module: 'Student Results Marks Breakdown', rendered: true, weightedTable: true, consoleErrors: 0, failedResultResponses: 0 };
}

(async () => {
  const chromiumPath = '/home/user/.cache/ms-playwright/chromium-1187/chrome-linux/chrome';
  const edgePath = '/usr/bin/microsoft-edge-stable';
  const checks = [];
  checks.push(await admissionCheck(chromiumPath, 'Chromium/Chrome engine'));
  checks.push(await lmsCheck(chromiumPath, 'Chromium/Chrome engine'));
  checks.push(await admissionCheck(edgePath, 'Microsoft Edge'));
  checks.push(await lmsCheck(edgePath, 'Microsoft Edge'));
  console.log(JSON.stringify(checks, null, 2));
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
