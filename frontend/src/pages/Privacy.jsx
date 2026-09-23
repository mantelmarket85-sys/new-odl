import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/auth.css';

const Privacy = () => (
  <>
    <div className="legal-back-bar">
      <Link to="/register">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Back to Registration
      </Link>
    </div>

    <article className="legal-page">
      <h1>Privacy Policy</h1>
      <p className="legal-meta">Effective Date: January 1, 2026 · AUST ODL Admission System</p>

      <h2>1. Introduction</h2>
      <p>
        Abbottabad University of Science &amp; Technology (“AUST”, “we”, “us”) respects your privacy.
        This Privacy Policy explains how we collect, use, disclose, and safeguard your information when
        you use the AUST Open &amp; Distance Learning Admission System.
      </p>

      <h2>2. Information We Collect</h2>
      <ul>
        <li><strong>Identity data:</strong> name, CNIC, date of birth, gender, nationality, photograph.</li>
        <li><strong>Contact data:</strong> email, phone, WhatsApp number, postal address, district, province.</li>
        <li><strong>Account data:</strong> username, hashed password, role, login history.</li>
        <li><strong>Educational data:</strong> Matric / FSc Part-I / FSc Part-II results, board, passing year, marks.</li>
        <li><strong>Document data:</strong> uploaded DMCs, certificates, profile photo, fee receipts.</li>
        <li><strong>Payment data:</strong> bank payment gateway transaction IDs, payment reference numbers, payment status (we do <em>not</em> store your card number, CVV, or banking PIN).</li>
        <li><strong>Consent data:</strong> the timestamp at which you accepted these Terms &amp; Conditions and Privacy Policy.</li>
        <li><strong>Technical data:</strong> IP address, browser type, device information, access logs.</li>
      </ul>

      <h2>3. How We Use Your Information</h2>
      <ul>
        <li>To process your admission application and verify eligibility.</li>
        <li>To compute merit, schedule interviews, and generate Roll &amp; Registration numbers.</li>
        <li>To facilitate fee payment via the online bank payment gateway or bank transfer.</li>
        <li>To send transactional emails and in-app notifications about your application.</li>
        <li>To prevent fraud, secure the system, and comply with legal obligations.</li>
        <li>To improve our services and produce anonymised statistics.</li>
      </ul>

      <h2>4. Data Sharing &amp; Disclosure</h2>
      <p>We do <strong>not</strong> sell your personal data. We may share data only in these circumstances:</p>
      <ul>
        <li><strong>University staff</strong> — Director of Admissions, Department Coordinator, and authorised academic staff.</li>
        <li><strong>Payment processor</strong> — the bank payment gateway provider, strictly for processing transactions.</li>
        <li><strong>Legal authorities</strong> — when required by law, court order, or regulator request.</li>
        <li><strong>Service providers</strong> — email/SMS services, hosting providers (under strict confidentiality).</li>
      </ul>

      <h2>5. Data Retention</h2>
      <ul>
        <li>Admission records are retained for the duration of your studies plus 10 years thereafter.</li>
        <li>Failed/withdrawn applications are retained for 3 years for audit purposes.</li>
        <li>Transaction logs are retained for 7 years to comply with financial regulations.</li>
        <li>You may request deletion of your account at any time before submitting an application.</li>
      </ul>

      <h2>6. Data Security</h2>
      <ul>
        <li>Passwords are stored using one-way bcrypt hashing — even AUST staff cannot read them.</li>
        <li>All authentication uses signed JWT tokens with a 7-day expiry.</li>
        <li>Communication is encrypted in transit via HTTPS / TLS.</li>
        <li>Sensitive payment credentials (e.g. gateway API keys and secrets) are never exposed to the frontend.</li>
        <li>Access to student data is role-restricted (Director / Coordinator / Student).</li>
      </ul>

      <h2>7. Cookies &amp; Local Storage</h2>
      <p>
        We use browser local storage to keep you logged in (your JWT token) and to remember UI
        preferences. We do not use third-party advertising or behavioural-tracking cookies.
      </p>

      <h2>8. Your Rights</h2>
      <ul>
        <li><strong>Access:</strong> view your personal data via the Profile section of your dashboard.</li>
        <li><strong>Rectification:</strong> update incorrect data through Profile / Education tabs.</li>
        <li><strong>Erasure:</strong> request deletion of your account and data (subject to legal retention).</li>
        <li><strong>Objection:</strong> opt out of non-essential email notifications via Account Settings.</li>
        <li><strong>Portability:</strong> request a copy of your data in machine-readable format.</li>
      </ul>

      <h2>9. Children's Privacy</h2>
      <p>
        This portal is intended for applicants 16 years of age or older. We do not knowingly collect
        data from children below this age.
      </p>

      <h2>10. Third-Party Links</h2>
      <p>
        Our portal may contain links to third-party websites (e.g. the bank payment gateway). We are not responsible
        for their privacy practices. Please review their privacy policies separately.
      </p>

      <h2>11. International Transfers</h2>
      <p>
        Your data is primarily stored on servers located within Pakistan. If we ever transfer data
        internationally (e.g. to a cloud provider), we ensure equivalent levels of protection.
      </p>

      <h2>12. Changes to this Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. The “Effective Date” at the top of this
        page reflects the latest revision. Material changes will be communicated via email or in-app
        notification.
      </p>

      <h2>13. Contact &amp; Grievances</h2>
      <p>
        For privacy-related questions or to exercise any of your rights, contact our Data Protection
        Officer at <a href="mailto:privacy@aust.edu.pk">privacy@aust.edu.pk</a> or write to the
        Director of Admissions, AUST Main Campus, Abbottabad, Khyber Pakhtunkhwa, Pakistan.
      </p>
    </article>
  </>
);

export default Privacy;
