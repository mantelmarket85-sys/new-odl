import React from 'react';
import { Link } from 'react-router-dom';
import SiteNav from '../components/landing/SiteNav';
import SiteFooter from '../components/landing/SiteFooter';
import '../styles/landing.css';

const About = () => (
  <div className="aust-page">
    <SiteNav />

    <section className="aust-subhero">
      <span className="aust-subhero__crumb"><Link to="/">Home</Link> <i className="fas fa-chevron-right" style={{ fontSize: '0.6rem' }} /> About</span>
      <h1>About Abbottabad University</h1>
      <p>
        A public-sector university nestled in the foothills of Khyber Pakhtunkhwa,
        committed to making quality higher education reachable to every learner
        through its Open &amp; Distance Learning platform.
      </p>
    </section>

    <section className="aust-section">
      <div className="aust-info-split">
        <div>
          <div className="aust-section__eyebrow" style={{ textAlign: 'left' }}>Our Story</div>
          <h2 className="aust-section__title" style={{ textAlign: 'left', maxWidth: 'none' }}>
            University learning shaped for real life
          </h2>
          <p className="aust-info-paragraph">
            Abbottabad University of Science &amp; Technology (AUST) is a chartered
            public-sector university located in Havelian, Abbottabad. Our ODL platform
            connects motivated learners with guided digital classrooms, academic mentoring,
            structured assessments, and practical short-cycle programs designed for students
            who need quality education beyond the campus boundary.
          </p>
          <p className="aust-info-paragraph">
            We focus on associate degree, diploma and certificate pathways — programs
            built around recognized academic standards, measurable outcomes and the
            real-world skills employers are hiring for today.
          </p>
        </div>
        <div className="aust-info-card-stack">
          <div className="aust-info-card">
            <div className="ic"><i className="fas fa-users" /></div>
            <h4>12,500+ Students</h4>
            <p>Learners from every corner of Pakistan studying with us online.</p>
          </div>
          <div className="aust-info-card">
            <div className="ic"><i className="fas fa-graduation-cap" /></div>
            <h4>4,200+ Alumni</h4>
            <p>Graduates working as developers, analysts, IT officers and more.</p>
          </div>
          <div className="aust-info-card">
            <div className="ic"><i className="fas fa-certificate" /></div>
            <h4>Recognized Programs</h4>
            <p>Curriculum mapped to HEC standards and industry expectations.</p>
          </div>
        </div>
      </div>
    </section>

    <section className="aust-section" id="vision">
      <div className="aust-section__eyebrow">Direction</div>
      <h2 className="aust-section__title">Vision &amp; Mission</h2>
      <div className="aust-vm-grid">
        <article className="aust-vm-card">
          <div className="ic"><i className="fas fa-bullseye" /></div>
          <h3>Our Vision</h3>
          <p>
            To be a leading regional university known for accessible, high-quality
            distance learning that opens doors for working students, women, and
            learners from underserved regions of Pakistan.
          </p>
        </article>
        <article className="aust-vm-card">
          <div className="ic"><i className="fas fa-compass" /></div>
          <h3>Our Mission</h3>
          <p>
            To deliver flexible, technology-driven academic programs grounded in
            faculty mentorship, transparent assessment and career-relevant skills —
            so every student can earn a recognized credential without leaving their
            home or job.
          </p>
        </article>
        <article className="aust-vm-card">
          <div className="ic"><i className="fas fa-handshake-angle" /></div>
          <h3>Our Values</h3>
          <p>
            Access, integrity, mentorship and academic rigor. Every decision in the
            ODL platform is filtered through these four values, from admissions to
            enrollment to the last day of a course.
          </p>
        </article>
      </div>
    </section>

    <section className="aust-section" id="accred">
      <div className="aust-section__eyebrow">Recognition</div>
      <h2 className="aust-section__title">Accreditation &amp; Standards</h2>
      <p className="aust-section__sub">
        AUST programs are designed around university standards, guided course plans,
        and measurable academic outcomes — recognized at home and respected by employers.
      </p>
      <div className="aust-accred-grid">
        <div className="aust-accred-card"><i className="fas fa-shield-halved" /><strong>HEC Chartered</strong><span>Public-sector university under the HEC of Pakistan.</span></div>
        <div className="aust-accred-card"><i className="fas fa-award" /><strong>Quality Assured</strong><span>Internal QA cell monitors course delivery and assessment.</span></div>
        <div className="aust-accred-card"><i className="fas fa-stamp" /><strong>Recognized Credentials</strong><span>Degrees, diplomas and certificates accepted nationally.</span></div>
        <div className="aust-accred-card"><i className="fas fa-handshake" /><strong>Industry Aligned</strong><span>Curriculum reviewed with software houses and employers.</span></div>
      </div>
    </section>

    <section className="aust-section">
      <div className="aust-cta-banner">
        <h2>Ready to be part of AUST?</h2>
        <p>Create your student account and start your application in under a minute.</p>
        <div className="aust-hero__cta">
          <Link to="/register" className="aust-btn-hero primary"><i className="fas fa-rocket" /> Apply Now</Link>
          <Link to="/admissions" className="aust-btn-hero outline"><i className="fas fa-list-check" /> See Admission Process</Link>
        </div>
      </div>
    </section>

    <SiteFooter />
  </div>
);

export default About;
