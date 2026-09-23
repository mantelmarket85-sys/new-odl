import React from 'react';
import { Link } from 'react-router-dom';
import SiteNav from '../components/landing/SiteNav';
import SiteFooter from '../components/landing/SiteFooter';
import '../styles/landing.css';

const programs = [
  {
    type: 'Associate Degree',
    title: 'Associate Degree in Computer Science (ADCS)',
    duration: '2 Years · 4 Semesters',
    text: 'Programming fundamentals, databases, software engineering, networks, AI and information security — all paced gently across four semesters.',
    icon: 'fa-laptop-code',
    badge: 'Open',
  },
  {
    type: 'Diploma',
    title: 'Professional Diploma Programs',
    duration: '1 Year',
    text: 'Focused academic and applied learning for students and working professionals. Multiple specializations coming online soon.',
    icon: 'fa-certificate',
    badge: 'Coming Soon',
  },
  {
    type: 'Certification',
    title: 'Short Certificate Courses',
    duration: '8–16 Weeks',
    text: 'Short-cycle skill development in practical, career-relevant subjects. Add a credential to your resume in a single semester.',
    icon: 'fa-award',
    badge: 'Coming Soon',
  },
];

const Programs = () => (
  <div className="aust-page">
    <SiteNav />

    <section className="aust-subhero">
      <span className="aust-subhero__crumb"><Link to="/">Home</Link> <i className="fas fa-chevron-right" style={{ fontSize: '0.6rem' }} /> Programs</span>
      <h1>Academic Programs</h1>
      <p>Associate degree, diploma and certificate pathways — built around recognized academic standards and real-world skills.</p>
    </section>

    <section className="aust-section">
      <div className="aust-section__eyebrow">Featured ODL Pathways</div>
      <h2 className="aust-section__title">Choose a pathway that fits your goals</h2>
      <p className="aust-section__sub">
        Whether you want a full degree, a focused diploma or a short certificate —
        AUST ODL has a track designed for working students and rural learners.
      </p>
      <div className="aust-program-grid aust-stagger">
        {programs.map((p) => (
          <article key={p.title} className="aust-program-card aust-slide-up">
            <div className="aust-program-card__top">
              <span className="aust-program-card__type">{p.type}</span>
              <span className={`aust-program-card__badge ${p.badge === 'Open' ? 'is-active' : 'is-soon'}`}>{p.badge}</span>
            </div>
            <div className="aust-program-card__ic"><i className={`fas ${p.icon}`} /></div>
            <h3>{p.title}</h3>
            <div className="aust-program-card__duration"><i className="fas fa-clock" /> {p.duration}</div>
            <p>{p.text}</p>
            <div className="aust-program-card__actions">
              {p.badge === 'Open' ? (
                <>
                  <Link to="/course-scheme" className="aust-mini-btn primary"><i className="fas fa-book" /> Scheme</Link>
                  <Link to="/register" className="aust-mini-btn outline"><i className="fas fa-rocket" /> Apply</Link>
                </>
              ) : (
                <span className="aust-mini-btn ghost"><i className="fas fa-hourglass-half" /> Coming Soon</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>

    <section className="aust-section" id="eligibility">
      <div className="aust-info-split">
        <div>
          <div className="aust-section__eyebrow" style={{ textAlign: 'left' }}>Eligibility</div>
          <h2 className="aust-section__title" style={{ textAlign: 'left', maxWidth: 'none' }}>Eligibility Criteria</h2>
          <ul className="aust-bullet-list">
            <li><i className="fas fa-circle-check" /> Intermediate (FA/FSc/ICS/I.Com/DAE)</li>
            <li><i className="fas fa-circle-check" /> Minimum 45% aggregate marks</li>
            <li><i className="fas fa-circle-check" /> Valid CNIC or B-Form</li>
            <li><i className="fas fa-circle-check" /> Result-awaited applicants accepted</li>
            <li><i className="fas fa-circle-check" /> No age restriction</li>
            <li><i className="fas fa-circle-check" /> Open to students from all provinces</li>
          </ul>
        </div>
        <div>
          <div className="aust-section__eyebrow" style={{ textAlign: 'left' }}>Required Documents</div>
          <h2 className="aust-section__title" style={{ textAlign: 'left', maxWidth: 'none' }}>What you'll need</h2>
          <ul className="aust-bullet-list">
            <li><i className="fas fa-file-circle-check" /> Matric DMC &amp; certificate</li>
            <li><i className="fas fa-file-circle-check" /> FSc Part-I DMC (if available)</li>
            <li><i className="fas fa-file-circle-check" /> FSc Full DMC (or marked Result Awaited)</li>
            <li><i className="fas fa-file-circle-check" /> CNIC or B-Form (front and back)</li>
            <li><i className="fas fa-file-circle-check" /> Passport-size photograph</li>
            <li><i className="fas fa-file-circle-check" /> Processing-fee receipt (Bank deposit or online payment)</li>
          </ul>
        </div>
      </div>
    </section>

    <section className="aust-section">
      <div className="aust-cta-banner">
        <h2>Ready to pick your program?</h2>
        <p>Create your AUST student account and submit your application in under a minute.</p>
        <div className="aust-hero__cta">
          <Link to="/register" className="aust-btn-hero primary"><i className="fas fa-rocket" /> Apply Now</Link>
          <Link to="/fee-structure" className="aust-btn-hero outline"><i className="fas fa-money-bill-wave" /> View Fee Structure</Link>
        </div>
      </div>
    </section>

    <SiteFooter />
  </div>
);

export default Programs;
