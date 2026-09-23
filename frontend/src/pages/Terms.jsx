import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/auth.css';

const Terms = () => (
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
      <h1>Terms &amp; Conditions</h1>
      <p className="legal-meta">Effective Date: January 1, 2026 · AUST ODL Admission System</p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By creating an account on the Abbottabad University of Science &amp; Technology (AUST) Open &amp;
        Distance Learning Admission System, you agree to abide by these Terms &amp; Conditions and the
        AUST Privacy Policy. If you do not accept these terms, please do not use this portal.
      </p>

      <h2>2. Eligibility &amp; Account Use</h2>
      <ul>
        <li>You must be at least 16 years of age and legally eligible to apply to AUST programmes.</li>
        <li>You must provide accurate, current, and complete information during registration.</li>
        <li>You are solely responsible for maintaining the confidentiality of your username and password.</li>
        <li>One person may hold only one student account. Duplicate or fraudulent accounts will be deleted.</li>
      </ul>

      <h2>3. Admission Policies</h2>
      <ul>
        <li>Admission is subject to verification of academic records, interviews, and merit calculation.</li>
        <li>Submission of an application does not guarantee admission. Final selection rests with the Director of Admissions and the Department.</li>
        <li>The University reserves the right to reject any application at its discretion if the applicant fails to meet minimum eligibility criteria.</li>
        <li>Falsified documents will result in immediate disqualification and possible legal action.</li>
      </ul>

      <h2>4. Application Processing &amp; Admission Fees</h2>
      <ul>
        <li>The application processing fee (PKR 1,200 by default) is non-refundable once paid.</li>
        <li>Payments may be made via the online bank payment gateway or bank deposit. Successful transactions are confirmed by transaction ID.</li>
        <li>The admission/enrollment fee is announced after the merit list is finalised.</li>
        <li>Enrollment is considered complete <strong>only</strong> after the admission fee is paid and confirmed by the Director.</li>
        <li>Roll Numbers are issued only after the admission fee has been paid and approved.</li>
      </ul>

      <h2>5. Refund Policy</h2>
      <ul>
        <li>The application processing fee is strictly non-refundable.</li>
        <li>The admission fee may be refunded — minus a 10% processing charge — only if the request is made before the start of the academic semester and the seat is reassigned to another candidate.</li>
        <li>Refund requests must be submitted in writing to the Director of Admissions.</li>
      </ul>

      <h2>6. Intellectual Property</h2>
      <p>
        All content on this portal — including but not limited to text, images, logos, and source code —
        is the property of Abbottabad University of Science &amp; Technology and is protected by applicable
        intellectual-property laws. Unauthorised copying, reproduction, or distribution is strictly prohibited.
      </p>

      <h2>7. User Conduct</h2>
      <ul>
        <li>Do not attempt to gain unauthorised access to any portion of this system.</li>
        <li>Do not upload malicious software, viruses, or any harmful code.</li>
        <li>Do not impersonate any other person or misrepresent your affiliation.</li>
        <li>Do not use the portal for any unlawful or commercial purpose.</li>
      </ul>

      <h2>8. Disclaimers &amp; Limitation of Liability</h2>
      <p>
        The portal is provided on an "as-is" and "as-available" basis. AUST does not warrant that the
        service will be uninterrupted or error-free. Under no circumstances shall AUST be liable for any
        indirect, incidental, or consequential damages arising from your use of this portal.
      </p>

      <h2>9. Modification of Terms</h2>
      <p>
        AUST reserves the right to update or modify these Terms &amp; Conditions at any time. Continued
        use of the portal after such modifications constitutes acceptance of the new terms.
      </p>

      <h2>10. Governing Law</h2>
      <p>
        These terms are governed by the laws of the Islamic Republic of Pakistan. Any dispute shall be
        subject to the exclusive jurisdiction of the courts of Abbottabad, Khyber Pakhtunkhwa.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions regarding these Terms? Email <a href="mailto:admissions@aust.edu.pk">admissions@aust.edu.pk</a>
        {' '}or visit the AUST main campus during office hours.
      </p>
    </article>
  </>
);

export default Terms;
