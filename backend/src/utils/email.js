const nodemailer = require('nodemailer');

/**
 * Nodemailer Email Service
 *
 * Configure via .env:
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_SECURE=false                 # true for 465, false for 587
 *   SMTP_USER=your-email@gmail.com
 *   SMTP_PASS=your-app-password
 *   SMTP_FROM="AUST ODL <noreply@aust.edu.pk>"
 *   FRONTEND_URL=http://localhost:3000
 *
 * If SMTP creds are not configured, the service falls back to a console
 * "preview" mode and returns success — emails are logged instead of sent
 * so the rest of the system keeps working in dev / sandbox environments.
 */

let transporter = null;
let smtpConfigured = false;

function buildTransporter() {
  if (transporter !== null) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    smtpConfigured = false;
    console.warn('[email] SMTP not configured — emails will be logged to console only.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });
  smtpConfigured = true;
  console.log(`[email] SMTP transporter configured (${host})`);
  return transporter;
}

async function sendMail({ to, subject, html, text }) {
  const t = buildTransporter();
  const from = process.env.SMTP_FROM || 'AUST ODL <noreply@aust.edu.pk>';

  if (!t) {
    // Dev fallback — log to console
    console.log('\n========== EMAIL (dev / no-SMTP) ==========');
    console.log(`From:    ${from}`);
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log('-------------------------------------------');
    console.log(text || html?.replace(/<[^>]+>/g, ''));
    console.log('===========================================\n');
    return { success: true, preview: true };
  }

  try {
    const info = await t.sendMail({ from, to, subject, html, text });
    console.log(`[email] Sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[email] Failed to send to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}

// Common branded layout
function wrap(title, body) {
  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:20px;">
    <div style="background:#1a2744;color:#fff;padding:20px;border-radius:8px 8px 0 0;">
      <h2 style="margin:0;">AUST — ODL Admission Portal</h2>
      <p style="margin:4px 0 0;font-size:12px;color:#cbd5e0;">Abbottabad University of Science & Technology</p>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
      <h3 style="color:#1a2744;margin-top:0;">${title}</h3>
      ${body}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
      <p style="font-size:12px;color:#64748b;margin:0;">This is an automated message from the AUST ODL Admission Portal. Please do not reply directly to this email.</p>
    </div>
  </div>
  `;
}

// ============================================================
// Templates
// ============================================================
const templates = {
  registrationSuccess: (email) => ({
    subject: 'Welcome to AUST ODL — Registration Successful',
    html: wrap('Registration Successful',
      `<p>Hello,</p>
       <p>Your account <b>${email}</b> has been created successfully on the AUST ODL Admission Portal.</p>
       <p>You can now log in, complete your profile, and apply for the <b>Associate Degree in Computer Science (ADCS)</b> programme.</p>
       <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">Sign In</a></p>`),
  }),

  loginAlert: (email, when) => ({
    subject: 'AUST ODL — New sign-in to your account',
    html: wrap('Sign-in Alert',
      `<p>Hello,</p>
       <p>Your account <b>${email}</b> was just signed in at <b>${when}</b>.</p>
       <p>If this was not you, please change your password immediately and contact admissions.</p>`),
  }),

  applicationSubmitted: (program, applicationId) => ({
    subject: 'AUST ODL — Application Submitted Successfully',
    html: wrap('Application Submitted',
      `<p>Your application has been submitted successfully.</p>
       <ul>
         <li><b>Program:</b> ${program}</li>
         <li><b>Application ID:</b> #${applicationId}</li>
       </ul>
       <p>You will receive further notifications as your application progresses through the review pipeline.</p>`),
  }),

  resultAwaitedSubmission: (program, applicationId) => ({
    subject: 'AUST ODL — Application Submitted (Result Awaited)',
    html: wrap('Application Submitted — Result Awaited',
      `<p>Your application <b>#${applicationId}</b> for <b>${program}</b> has been submitted with the status <span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;">Result Awaited</span>.</p>
       <p>You will be required to submit your final FSc Part-II result before final selection. We will notify you when further action is required.</p>`),
  }),

  statusUpdate: (program, status, remarks = '') => ({
    subject: `AUST ODL — Application Status: ${status}`,
    html: wrap(`Application Status Update — ${status}`,
      `<p>Your application for <b>${program}</b> status has been updated to: <b>${status}</b>.</p>
       ${remarks ? `<p><b>Remarks:</b> ${remarks}</p>` : ''}
       <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard">View Dashboard</a></p>`),
  }),

  notification: (title, message, link = null) => ({
    subject: `AUST ODL — ${title}`,
    html: wrap(title,
      `<p>${message}</p>
       ${link ? `<p><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">Open Link</a></p>` : ''}
       <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard">Open Dashboard</a></p>
       <p style="font-size:12px;color:#94a3b8;margin-top:8px;">Sent at: ${new Date().toLocaleString()}</p>`),
  }),

  applicationForwarded: (program, applicationId) => ({
    subject: 'AUST ODL — Application Forwarded to Coordinator',
    html: wrap('Application Forwarded',
      `<p>Good news! Your application <b>#${applicationId}</b> for <b>${program}</b> has been reviewed by the Director of Admissions and forwarded to the Department Coordinator for the next stage.</p>
       <p>You will receive a follow-up email once your interview is scheduled.</p>
       <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">View Application</a></p>
       <p style="font-size:12px;color:#94a3b8;margin-top:8px;">Sent at: ${new Date().toLocaleString()}</p>`),
  }),

  applicationRejected: (program, applicationId, reason) => ({
    subject: 'AUST ODL — Application Decision: Rejected',
    html: wrap('Application Rejected',
      `<p>We regret to inform you that your application <b>#${applicationId}</b> for <b>${program}</b> has been rejected.</p>
       ${reason ? `<p style="background:#fee2e2;border-left:4px solid #dc2626;padding:12px;border-radius:4px;"><b>Reason:</b> ${reason}</p>` : ''}
       <p>If you believe this decision should be reconsidered, you may file an appeal from your dashboard within the appeal window.</p>
       <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">Open Dashboard</a></p>
       <p style="font-size:12px;color:#94a3b8;margin-top:8px;">Sent at: ${new Date().toLocaleString()}</p>`),
  }),

  appealSubmitted: (type, applicationId) => ({
    subject: 'AUST ODL — Appeal Submitted',
    html: wrap('Appeal Submitted',
      `<p>Your appeal (<b>${type.replace(/_/g, ' ')}</b>) for application <b>#${applicationId}</b> has been received and is now under review by the responsible officer.</p>
       <p>You will be notified by email and on your dashboard once a decision is made.</p>
       <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">View Appeal</a></p>
       <p style="font-size:12px;color:#94a3b8;margin-top:8px;">Sent at: ${new Date().toLocaleString()}</p>`),
  }),

  appealDecision: (type, decision, applicationId, remarks) => {
    const accepted = decision === 'ACCEPTED';
    const colour = accepted ? '#059669' : '#dc2626';
    const bg = accepted ? '#d1fae5' : '#fee2e2';
    return {
      subject: `AUST ODL — Appeal ${accepted ? 'Accepted' : 'Rejected'}`,
      html: wrap(`Appeal ${accepted ? 'Accepted' : 'Rejected'}`,
        `<p>Your appeal (<b>${type.replace(/_/g, ' ')}</b>) for application <b>#${applicationId}</b> has been <b style="color:${colour};">${accepted ? 'ACCEPTED' : 'REJECTED'}</b>.</p>
         ${remarks ? `<p style="background:${bg};border-left:4px solid ${colour};padding:12px;border-radius:4px;"><b>Decision Remarks:</b> ${remarks}</p>` : ''}
         ${accepted
           ? '<p>Please check your dashboard for next steps. If a re-interview is required, the Coordinator will schedule it shortly.</p>'
           : '<p>The original decision stands. You may contact admissions if you have any questions.</p>'}
         <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">Open Dashboard</a></p>
         <p style="font-size:12px;color:#94a3b8;margin-top:8px;">Sent at: ${new Date().toLocaleString()}</p>`),
    };
  },

  interviewScheduled: (program, applicationId, date, time, venue, meetingLink) => ({
    subject: `AUST ODL — Interview Scheduled (${date})`,
    html: wrap('Interview Scheduled',
      `<p>Your interview for <b>${program}</b> (Application <b>#${applicationId}</b>) has been scheduled.</p>
       <table style="border-collapse:collapse;width:100%;margin:12px 0;">
         <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;width:120px;">Date</td><td style="padding:8px;background:#fff;border-left:1px solid #e2e8f0;">${date}</td></tr>
         <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;">Time</td><td style="padding:8px;background:#fff;border-left:1px solid #e2e8f0;">${time}</td></tr>
         <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;">Venue</td><td style="padding:8px;background:#fff;border-left:1px solid #e2e8f0;">${venue}</td></tr>
         ${meetingLink ? `<tr><td style="padding:8px;background:#f1f5f9;font-weight:600;">Meeting Link</td><td style="padding:8px;background:#fff;border-left:1px solid #e2e8f0;"><a href="${meetingLink}">${meetingLink}</a></td></tr>` : ''}
       </table>
       <p>Please be available 10 minutes before the scheduled time.</p>
       ${meetingLink ? `<p><a href="${meetingLink}" style="display:inline-block;background:#10b981;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">Join Meeting</a></p>` : ''}
       <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard">View Dashboard</a></p>
       <p style="font-size:12px;color:#94a3b8;margin-top:8px;">Sent at: ${new Date().toLocaleString()}</p>`),
  }),

  interviewDecision: (program, applicationId, decision, marks, remarks) => {
    const qualified = decision === 'QUALIFIED';
    const colour = qualified ? '#059669' : '#dc2626';
    const bg = qualified ? '#d1fae5' : '#fee2e2';
    return {
      subject: `AUST ODL — Interview Result: ${qualified ? 'Qualified' : 'Disqualified'}`,
      html: wrap(`Interview ${qualified ? 'Qualified' : 'Disqualified'}`,
        `<p>The interview decision for your application <b>#${applicationId}</b> (<b>${program}</b>) has been recorded.</p>
         <p style="background:${bg};border-left:4px solid ${colour};padding:12px;border-radius:4px;">
           <b style="color:${colour};">Decision: ${decision}</b>
           ${qualified && marks != null ? `<br/><b>Marks:</b> ${marks}/100` : ''}
           ${remarks ? `<br/><b>Remarks:</b> ${remarks}` : ''}
         </p>
         ${qualified
           ? '<p>You will appear on the merit list. If selected, you will receive instructions for fee payment.</p>'
           : '<p>If you wish to contest this decision, you may file an appeal from your dashboard within the appeal window.</p>'}
         <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">Open Dashboard</a></p>
         <p style="font-size:12px;color:#94a3b8;margin-top:8px;">Sent at: ${new Date().toLocaleString()}</p>`),
    };
  },

  meritListed: (program, applicationId, rank) => ({
    subject: 'AUST ODL — Merit List Published',
    html: wrap('You are on the Merit List',
      `<p>Congratulations! You have been placed on the merit list for <b>${program}</b> (Application <b>#${applicationId}</b>).</p>
       ${rank != null ? `<p><b>Your Rank:</b> ${rank}</p>` : ''}
       <p>Please log in to your dashboard to view full details and follow-up instructions.</p>
       <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">View Merit List</a></p>
       <p style="font-size:12px;color:#94a3b8;margin-top:8px;">Sent at: ${new Date().toLocaleString()}</p>`),
  }),

  feeStatusUpdate: (program, status, remarks) => {
    const map = {
      APPROVED: { colour: '#059669', bg: '#d1fae5', label: 'Confirmed' },
      REJECTED: { colour: '#dc2626', bg: '#fee2e2', label: 'Rejected' },
      NEEDS_INFO: { colour: '#d97706', bg: '#fef3c7', label: 'Needs More Information' },
    };
    const m = map[status] || { colour: '#475569', bg: '#f1f5f9', label: status };
    return {
      subject: `AUST ODL — Fee Payment ${m.label}`,
      html: wrap(`Fee Payment ${m.label}`,
        `<p>Your fee payment for <b>${program}</b> has been <b style="color:${m.colour};">${m.label.toLowerCase()}</b>.</p>
         ${remarks ? `<p style="background:${m.bg};border-left:4px solid ${m.colour};padding:12px;border-radius:4px;"><b>Remarks:</b> ${remarks}</p>` : ''}
         <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">Open Dashboard</a></p>
         <p style="font-size:12px;color:#94a3b8;margin-top:8px;">Sent at: ${new Date().toLocaleString()}</p>`),
    };
  },

  enrollmentConfirmed: (program, rollNumber, registrationNumber, lmsUsername) => ({
    subject: 'AUST ODL — Enrollment Confirmed 🎓',
    html: wrap('Enrollment Confirmed — Welcome to AUST',
      `<p>Congratulations! You are now <b style="color:#059669;">officially enrolled</b> at AUST in the <b>${program}</b> programme.</p>
       <p style="background:#ecfdf5;border-left:4px solid #10b981;padding:12px;border-radius:4px;">
         <b>Save these credentials</b> — you will use them throughout your studies:
       </p>
       <table style="border-collapse:collapse;width:100%;margin:12px 0;">
         ${rollNumber ? `<tr><td style="padding:8px;background:#f1f5f9;font-weight:600;width:200px;">Roll Number</td><td style="padding:8px;background:#fff;border-left:1px solid #e2e8f0;font-family:monospace;font-weight:700;">${rollNumber}</td></tr>` : ''}
         ${registrationNumber ? `<tr><td style="padding:8px;background:#f1f5f9;font-weight:600;">Registration Number</td><td style="padding:8px;background:#fff;border-left:1px solid #e2e8f0;font-family:monospace;font-weight:700;">${registrationNumber}</td></tr>` : ''}
         ${lmsUsername ? `<tr><td style="padding:8px;background:#f1f5f9;font-weight:600;">LMS Username</td><td style="padding:8px;background:#fff;border-left:1px solid #e2e8f0;font-family:monospace;font-weight:700;">${lmsUsername}</td></tr>` : ''}
       </table>
       <p>Use your LMS Username to access the Learning Management System for your courses.</p>
       <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" style="display:inline-block;background:#10b981;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">Open Student Dashboard</a></p>
       <p style="font-size:12px;color:#94a3b8;margin-top:8px;">Sent at: ${new Date().toLocaleString()}</p>`),
  }),

  passwordReset: (resetUrl) => ({
    subject: 'AUST ODL — Reset Your Password',
    html: wrap('Password Reset Requested',
      `<p>We received a request to reset the password for your AUST ODL account.</p>
       <p><a href="${resetUrl}" style="display:inline-block;background:#dc2626;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">Reset Password</a></p>
       <p>This link expires in 30 minutes. If you did not request a reset, please ignore this email.</p>
       <p style="font-size:12px;color:#64748b;">If the button does not work, copy this link into your browser:<br/><span style="word-break:break-all;">${resetUrl}</span></p>`),
  }),
};

// ============================================================
// High-level helpers used by routes
// ============================================================
async function sendRegistrationEmail(toEmail) {
  const t = templates.registrationSuccess(toEmail);
  return sendMail({ to: toEmail, ...t });
}

async function sendLoginAlertEmail(toEmail) {
  const t = templates.loginAlert(toEmail, new Date().toLocaleString());
  return sendMail({ to: toEmail, ...t });
}

async function sendApplicationSubmittedEmail(toEmail, program, applicationId, isResultAwaited = false) {
  const t = isResultAwaited
    ? templates.resultAwaitedSubmission(program, applicationId)
    : templates.applicationSubmitted(program, applicationId);
  return sendMail({ to: toEmail, ...t });
}

async function sendStatusUpdateEmail(toEmail, program, status, remarks) {
  const t = templates.statusUpdate(program, status, remarks);
  return sendMail({ to: toEmail, ...t });
}

async function sendNotificationEmail(toEmail, title, message, link = null) {
  const t = templates.notification(title, message, link);
  return sendMail({ to: toEmail, ...t });
}

async function sendPasswordResetEmail(toEmail, resetUrl) {
  const t = templates.passwordReset(resetUrl);
  return sendMail({ to: toEmail, ...t });
}

async function sendApplicationForwardedEmail(toEmail, program, applicationId) {
  const t = templates.applicationForwarded(program, applicationId);
  return sendMail({ to: toEmail, ...t });
}

async function sendApplicationRejectedEmail(toEmail, program, applicationId, reason) {
  const t = templates.applicationRejected(program, applicationId, reason);
  return sendMail({ to: toEmail, ...t });
}

async function sendAppealSubmittedEmail(toEmail, type, applicationId) {
  const t = templates.appealSubmitted(type, applicationId);
  return sendMail({ to: toEmail, ...t });
}

async function sendAppealDecisionEmail(toEmail, type, decision, applicationId, remarks) {
  const t = templates.appealDecision(type, decision, applicationId, remarks);
  return sendMail({ to: toEmail, ...t });
}

async function sendInterviewScheduledEmail(toEmail, program, applicationId, date, time, venue, meetingLink) {
  const t = templates.interviewScheduled(program, applicationId, date, time, venue, meetingLink);
  return sendMail({ to: toEmail, ...t });
}

async function sendInterviewDecisionEmail(toEmail, program, applicationId, decision, marks, remarks) {
  const t = templates.interviewDecision(program, applicationId, decision, marks, remarks);
  return sendMail({ to: toEmail, ...t });
}

async function sendMeritListedEmail(toEmail, program, applicationId, rank) {
  const t = templates.meritListed(program, applicationId, rank);
  return sendMail({ to: toEmail, ...t });
}

async function sendFeeStatusEmail(toEmail, program, status, remarks) {
  const t = templates.feeStatusUpdate(program, status, remarks);
  return sendMail({ to: toEmail, ...t });
}

async function sendEnrollmentConfirmedEmail(toEmail, program, rollNumber, registrationNumber, lmsUsername) {
  const t = templates.enrollmentConfirmed(program, rollNumber, registrationNumber, lmsUsername);
  return sendMail({ to: toEmail, ...t });
}

module.exports = {
  sendMail,
  sendRegistrationEmail,
  sendLoginAlertEmail,
  sendApplicationSubmittedEmail,
  sendStatusUpdateEmail,
  sendNotificationEmail,
  sendPasswordResetEmail,
  sendApplicationForwardedEmail,
  sendApplicationRejectedEmail,
  sendAppealSubmittedEmail,
  sendAppealDecisionEmail,
  sendInterviewScheduledEmail,
  sendInterviewDecisionEmail,
  sendMeritListedEmail,
  sendFeeStatusEmail,
  sendEnrollmentConfirmedEmail,
  isSmtpConfigured: () => smtpConfigured,
};
