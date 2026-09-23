import React from 'react';
import { Link } from 'react-router-dom';
import SiteNav from '../components/landing/SiteNav';
import SiteFooter from '../components/landing/SiteFooter';
import '../styles/landing.css';

const faculties = [
  {
    name: 'Faculty of Computing & Information Sciences',
    desc: 'Software engineering, computer science, IT and data foundations for the next generation of Pakistani technologists.',
    icon: 'fa-laptop-code',
    departments: ['Computer Science', 'Software Engineering', 'Information Technology', 'Data Science'],
    badge: 'Active',
  },
  {
    name: 'Faculty of Business & Management',
    desc: 'Business administration and management programs designed for working professionals and aspiring entrepreneurs.',
    icon: 'fa-briefcase',
    departments: ['Business Administration', 'Management Sciences', 'Commerce'],
    badge: 'Coming Soon',
  },
  {
    name: 'Faculty of Basic & Applied Sciences',
    desc: 'Mathematics, physics and applied sciences that ground every technical career in a strong analytical foundation.',
    icon: 'fa-atom',
    departments: ['Mathematics', 'Physics', 'Statistics'],
    badge: 'Coming Soon',
  },
  {
    name: 'Faculty of Arts & Social Sciences',
    desc: 'Languages, education and social sciences for learners who want a broader academic and professional perspective.',
    icon: 'fa-book-open',
    departments: ['English', 'Education', 'Islamic Studies', 'Pakistan Studies'],
    badge: 'Coming Soon',
  },
];

const Faculties = () => (
  <div className="aust-page">
    <SiteNav />

    <section className="aust-subhero">
      <span className="aust-subhero__crumb"><Link to="/">Home</Link> <i className="fas fa-chevron-right" style={{ fontSize: '0.6rem' }} /> Faculties</span>
      <h1>Faculties &amp; Departments</h1>
      <p>Academic units offering programs through the AUST Open &amp; Distance Learning platform.</p>
    </section>

    <section className="aust-section">
      <div className="aust-section__eyebrow">Academic Structure</div>
      <h2 className="aust-section__title">Four faculties, one connected ODL platform</h2>
      <p className="aust-section__sub">
        We start with our flagship Faculty of Computing — and we are progressively
        bringing more faculties online as the ODL platform expands.
      </p>
      <div className="aust-faculty-grid aust-stagger">
        {faculties.map((f) => (
          <article key={f.name} className="aust-faculty-card aust-slide-up">
            <div className="aust-faculty-card__head">
              <div className="ic"><i className={`fas ${f.icon}`} /></div>
              <span className={`aust-faculty-card__badge ${f.badge === 'Active' ? 'is-active' : 'is-soon'}`}>{f.badge}</span>
            </div>
            <h3>{f.name}</h3>
            <p>{f.desc}</p>
            <ul className="aust-faculty-card__list">
              {f.departments.map((d) => (
                <li key={d}><i className="fas fa-building" /> {d}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>

    <section className="aust-section">
      <div className="aust-section__eyebrow">Active Department</div>
      <h2 className="aust-section__title">Department of Computer Science</h2>
      <p className="aust-section__sub">
        The flagship department behind the Associate Degree in Computer Science (ADCS) — our first program
        delivered fully through the AUST ODL platform.
      </p>
      <div className="aust-info-split">
        <div>
          <h3 style={{ fontFamily: 'Fraunces, serif', fontWeight: 600, color: '#0b3c8c', marginTop: 0 }}>What we teach</h3>
          <p className="aust-info-paragraph">
            Programming fundamentals, databases, software engineering, networks,
            data structures, AI and information security — all paced gently across
            four semesters with hands-on assignments and supervised assessments.
          </p>
          <Link to="/course-scheme" className="aust-btn-hero primary" style={{ marginTop: '0.5rem' }}>
            <i className="fas fa-book" /> See full scheme of study
          </Link>
        </div>
        <div>
          <h3 style={{ fontFamily: 'Fraunces, serif', fontWeight: 600, color: '#0b3c8c', marginTop: 0 }}>Who it's for</h3>
          <ul className="aust-bullet-list">
            <li><i className="fas fa-circle-check" /> Intermediate (FA/FSc/ICS/I.Com/DAE) graduates</li>
            <li><i className="fas fa-circle-check" /> Working students who need flexibility</li>
            <li><i className="fas fa-circle-check" /> Career changers moving into tech</li>
            <li><i className="fas fa-circle-check" /> Rural learners without nearby campuses</li>
          </ul>
          <Link to="/admissions" className="aust-btn-hero outline" style={{ marginTop: '0.5rem', color: '#0b3c8c', borderColor: '#0b3c8c', background: '#fff' }}>
            <i className="fas fa-list-check" /> Admission Process
          </Link>
        </div>
      </div>
    </section>

    <SiteFooter />
  </div>
);

export default Faculties;
