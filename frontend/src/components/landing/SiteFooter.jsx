import React from 'react';
import { Link } from 'react-router-dom';

const SiteFooter = () => (
  <footer className="aust-footer aust-footer--rich">
    <div className="aust-footer__inner">
      {/* Brand + about */}
      <div className="aust-footer__col aust-footer__col--brand">
        <div className="aust-footer__brand">
          <img src="/assets/aust-logo.png" alt="AUST" width="38" height="38" loading="lazy" decoding="async" />
          <strong>Abbottabad University of Science &amp; Technology</strong>
        </div>
        <p>
          A modern, fully online portal for Open and Distance Learning. Apply,
          take exams, track results and manage your studies — all in one calm
          place built for real students.
        </p>
        <div className="aust-footer__contact">
          <div><i className="fas fa-location-dot" /> Havelian, Abbottabad, Khyber Pakhtunkhwa</div>
          <div><i className="fas fa-envelope" /> <a href="mailto:director@aust.edu.pk">director@aust.edu.pk</a></div>
          <div><i className="fas fa-phone" /> <a href="tel:+92992123456">+92 992 123456</a></div>
        </div>
        <div className="aust-footer__social" aria-label="Social media">
          <a href="#" aria-label="Facebook"><i className="fab fa-facebook-f" /></a>
          <a href="#" aria-label="Twitter / X"><i className="fab fa-x-twitter" /></a>
          <a href="#" aria-label="LinkedIn"><i className="fab fa-linkedin-in" /></a>
          <a href="#" aria-label="YouTube"><i className="fab fa-youtube" /></a>
          <a href="#" aria-label="Instagram"><i className="fab fa-instagram" /></a>
        </div>
      </div>

      {/* Quick Links */}
      <div className="aust-footer__col">
        <h5>Quick Links</h5>
        <ul>
          <li><Link to="/">Home</Link></li>
          <li><Link to="/about">About AUST</Link></li>
          <li><Link to="/why-choose-us">Why Choose Us</Link></li>
          <li><Link to="/course-scheme">Scheme of Study</Link></li>
          <li><Link to="/alumni">Alumni</Link></li>
          <li><Link to="/news">News &amp; Events</Link></li>
        </ul>
      </div>

      {/* Admissions */}
      <div className="aust-footer__col">
        <h5>Admissions</h5>
        <ul>
          <li><Link to="/admissions">Admission Process</Link></li>
          <li><Link to="/register">Apply Online</Link></li>
          <li><Link to="/fee-structure">Fee Structure</Link></li>
          <li><Link to="/scholarships">Scholarships</Link></li>
          <li><Link to="/programs">Programs</Link></li>
          <li><Link to="/faculties">Faculties</Link></li>
        </ul>
      </div>

      {/* Online Learning */}
      <div className="aust-footer__col">
        <h5>Online Learning</h5>
        <ul>
          <li><Link to="/odl">ODL Overview</Link></li>
          <li><Link to="/lms">Learning Portal (LMS)</Link></li>
          <li><Link to="/odl#virtual">Virtual Classroom</Link></li>
          <li><Link to="/odl#library">Digital Library</Link></li>
          <li><Link to="/odl#exams">Online Examinations</Link></li>
        </ul>
      </div>

      {/* Help / Legal */}
      <div className="aust-footer__col">
        <h5>Help &amp; Legal</h5>
        <ul>
          <li><Link to="/contact">Contact Us</Link></li>
          <li><Link to="/faq">FAQs</Link></li>
          <li><Link to="/downloads">Downloads</Link></li>
          <li><Link to="/terms">Terms &amp; Conditions</Link></li>
          <li><Link to="/privacy">Privacy Policy</Link></li>
          <li><Link to="/forgot-password">Forgot Password</Link></li>
        </ul>
      </div>
    </div>

    <div className="aust-footer__bottom">
      <div className="aust-footer__copy">
        © {new Date().getFullYear()} Abbottabad University of Science &amp; Technology · All rights reserved
      </div>
      <div className="aust-footer__legal">
        <Link to="/terms">Terms</Link>
        <span aria-hidden="true">·</span>
        <Link to="/privacy">Privacy</Link>
        <span aria-hidden="true">·</span>
        <Link to="/contact">Help</Link>
      </div>
    </div>
  </footer>
);

export default SiteFooter;
