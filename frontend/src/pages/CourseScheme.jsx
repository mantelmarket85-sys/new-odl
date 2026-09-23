import React from 'react';
import { Link } from 'react-router-dom';
import SiteNav from '../components/landing/SiteNav';
import SiteFooter from '../components/landing/SiteFooter';
import { courseScheme } from '../data/courseScheme';
import '../styles/landing.css';

const SemesterRing = () => (
  <>
    <svg viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="46" stroke="rgba(29,93,209,0.18)" strokeWidth="1.6" strokeDasharray="3 6" />
    </svg>
    <svg viewBox="0 0 100 100" fill="none" className="rev">
      <circle cx="50" cy="50" r="38" stroke="rgba(56,189,248,0.30)" strokeWidth="1.4" strokeDasharray="2 8" />
    </svg>
  </>
);

const totalCredits = (courses) =>
  courses.reduce((sum, c) => {
    const m = (c.credits || '').match(/(\d+)(?:\+(\d+))?/);
    if (!m) return sum;
    return sum + Number(m[1] || 0) + Number(m[2] || 0);
  }, 0);

const CourseScheme = () => {
  const grandTotal = courseScheme.reduce((s, sem) => s + totalCredits(sem.courses), 0);
  const totalCourses = courseScheme.reduce((s, sem) => s + sem.courses.length, 0);

  return (
    <div className="aust-page">
      <SiteNav />

      <section className="aust-subhero">
        <div className="aust-subhero__crumb">
          <Link to="/">Home</Link> <span>/</span> <span style={{ color: '#fff' }}>Course Scheme</span>
        </div>
        <h1>Associate Degree in Computer Science · Scheme of Study</h1>
        <p>
          The full course-by-course map of the Associate Degree in
          Computer Science. Two academic years, four semesters, paced for
          online and distance learners.
        </p>
      </section>

      {/* Quick summary */}
      <section className="aust-section" style={{ paddingTop: '3rem' }}>
        <div className="aust-stats aust-stagger" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))' }}>
          <div className="aust-stat-card aust-slide-up">
            <div className="ic"><i className="fas fa-calendar-days" /></div>
            <div className="num">2</div>
            <div className="lbl">Years of Study</div>
          </div>
          <div className="aust-stat-card aust-slide-up">
            <div className="ic"><i className="fas fa-layer-group" /></div>
            <div className="num">{courseScheme.length}</div>
            <div className="lbl">Semesters</div>
          </div>
          <div className="aust-stat-card aust-slide-up">
            <div className="ic"><i className="fas fa-book" /></div>
            <div className="num">{totalCourses}</div>
            <div className="lbl">Total Courses</div>
          </div>
          <div className="aust-stat-card aust-slide-up">
            <div className="ic"><i className="fas fa-graduation-cap" /></div>
            <div className="num">{grandTotal}</div>
            <div className="lbl">Total Credit Hours</div>
          </div>
        </div>
      </section>

      {/* Cards */}
      <section className="aust-section">
        <div className="aust-section__eyebrow">Semester Breakdown</div>
        <h2 className="aust-section__title">Courses, semester by semester</h2>
        <p className="aust-section__sub">
          Each card lists the courses with their credit format. The number after
          a plus sign means a lab is bundled in.
        </p>

        <div className="aust-scheme-wrap aust-stagger">
          {courseScheme.map((s) => (
            <article key={s.sem} className="aust-sem-card aust-slide-up">
              <div className="aust-sem-card__ring">
                <SemesterRing />
                <div className="aust-sem-card__num">{s.sem}</div>
              </div>
              <h3 className="aust-sem-card__title">{s.title}</h3>
              <div className="aust-sem-card__hint" dangerouslySetInnerHTML={{ __html: s.hint }} />
              <ul className="aust-sem-card__list">
                {s.courses.map((c) => (
                  <li key={c.name}>
                    <span className="ic"><i className={`fas ${c.icon}`} /></span>
                    <span>{c.name}</span>
                    <span className="credits">{c.credits}</span>
                  </li>
                ))}
              </ul>
              <div style={{
                marginTop: '0.85rem',
                textAlign: 'center',
                fontSize: '0.78rem',
                color: '#475569',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}>
                {totalCredits(s.courses)} credit hours · {s.courses.length} courses
              </div>
            </article>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
          <Link to="/register" className="aust-btn-hero primary" style={{ background: 'linear-gradient(135deg, #0b3c8c, #1d5dd1)' }}>
            <i className="fas fa-user-plus" /> Apply for ADCS
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};

export default CourseScheme;
